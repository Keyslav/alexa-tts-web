/**
 * AlexaApp — Module Pattern (IIFE)
 * Organizado em: state, api, ui, render, handlers, init
 */
const AlexaApp = (() => {
  // ===== STATE =====
  const state = {
    authenticated: false,
    devices: [],
    settings: {},
    loginSessionId: null,
    editingSavedId: null,
    activeTab: "history",
  };

  // ===== DOM REFS (lazy) =====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // ===== API LAYER =====
  const api = {
    async call(path, opts = {}) {
      const { body, method = "GET", ...rest } = opts;
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        ...rest,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    },

    status:  ()                       => api.call("/api/status"),
    devices: ()                       => api.call("/api/devices"),
    speak:   (text, device, rate)     => api.call("/api/speak", { method: "POST", body: { text, device, rate } }),
    history: ()                       => api.call("/api/history"),

    saved: {
      list:   ()                          => api.call("/api/saved"),
      create: (label, text)               => api.call("/api/saved", { method: "POST", body: { label, text } }),
      update: (id, label, text)           => api.call(`/api/saved/${id}`, { method: "PUT",  body: { label, text } }),
      remove: (id)                        => api.call(`/api/saved/${id}`, { method: "DELETE" }),
    },

    auth: {
      start:    ()                         => api.call("/api/auth/start", { method: "POST" }),
      complete: (session_id, redirect_url) => api.call("/api/auth/complete", { method: "POST", body: { session_id, redirect_url } }),
    },

    settings: {
      get:    ()     => api.call("/api/settings"),
      update: (data) => api.call("/api/settings", { method: "POST", body: data }),
    },
  };

  // ===== UI UTILITIES =====
  const ui = {
    toast(msg, kind = "") {
      const el = $("#toast");
      el.textContent = msg;
      el.className = `toast show ${kind}`;
      clearTimeout(ui._toastTimer);
      ui._toastTimer = setTimeout(() => { el.className = "toast"; }, 2600);
    },

    setComposerStatus(msg, kind = "") {
      const el = $("#composerStatus");
      el.textContent = msg;
      el.className = `composer-feedback ${kind}`;
    },

    setStatus({ authenticated, message }) {
      state.authenticated = authenticated;
      const dot  = $(".status-dot");
      const text = $("#statusText");
      dot.dataset.state = authenticated ? "ok" : "error";
      text.textContent = message;
      // Mostra/oculta banner de login
      $("#loginBanner").classList.toggle("hidden", authenticated);
    },

    openModal(id) {
      $(id).classList.remove("hidden");
      $(id).querySelector("button, input, textarea, select")?.focus();
    },

    closeModal(id) {
      $(id).classList.add("hidden");
    },

    setLoading(btn, loading) {
      btn.disabled = loading;
      if (loading) {
        btn._originalText = btn.innerHTML;
        btn.innerHTML = `<span class="spin">⟳</span> Aguarde…`;
      } else if (btn._originalText) {
        btn.innerHTML = btn._originalText;
      }
    },

    applyTheme(theme) {
      const html = document.documentElement;
      if (theme === "auto") {
        html.removeAttribute("data-theme");
      } else {
        html.dataset.theme = theme;
      }
      $$(".theme-opt").forEach((b) => {
        b.classList.toggle("active", b.dataset.themeVal === theme);
      });
    },
  };

  // ===== RENDER =====
  const render = {
    history(items) {
      const list = $("#historyList");
      if (!items.length) {
        list.innerHTML = `
          <li class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span>Nenhuma mensagem enviada ainda</span>
          </li>`;
        return;
      }
      list.innerHTML = "";
      items.forEach((it) => {
        const rate = it.rate ?? 100;
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `
          <div class="item-main">
            <div class="item-text"></div>
            <div class="item-meta">
              <span>${_fmt(it.sent_at)}</span>
              ${it.device ? `<span>· ${_esc(it.device)}</span>` : ""}
              ${rate !== 100 ? `<span class="rate-badge">${rate}%</span>` : ""}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn sm ghost" data-action="fill">↩</button>
            <button class="btn sm primary" data-action="resend">Reenviar</button>
          </div>`;
        li.querySelector(".item-text").textContent = it.text;
        li.querySelector('[data-action="fill"]').addEventListener("click", (e) => {
          e.stopPropagation();
          _fillCompose(it.text, it.device, rate);
        });
        li.querySelector('[data-action="resend"]').addEventListener("click", (e) => {
          e.stopPropagation();
          handlers.send(it.text, it.device, rate);
        });
        li.querySelector(".item-main").addEventListener("click", () => _fillCompose(it.text, it.device, rate));
        list.appendChild(li);
      });
    },

    saved(items) {
      const list = $("#savedList");
      if (!items.length) {
        list.innerHTML = `
          <li class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>Nenhuma mensagem salva</span>
          </li>`;
        return;
      }
      list.innerHTML = "";
      items.forEach((it) => {
        const li = document.createElement("li");
        li.className = "list-item";
        li.innerHTML = `
          <div class="item-main">
            <div class="item-label"></div>
            <div class="item-text"></div>
          </div>
          <div class="item-actions">
            <button class="btn sm primary"  data-action="send">Enviar</button>
            <button class="btn sm ghost"    data-action="edit">Editar</button>
            <button class="btn sm danger-btn" data-action="del">×</button>
          </div>`;
        li.querySelector(".item-label").textContent = it.label;
        li.querySelector(".item-text").textContent  = it.text;
        li.querySelector('[data-action="send"]').addEventListener("click", (e) => {
          e.stopPropagation();
          handlers.send(it.text, null, null);
        });
        li.querySelector('[data-action="edit"]').addEventListener("click", (e) => {
          e.stopPropagation();
          handlers.openSaveModal(it);
        });
        li.querySelector('[data-action="del"]').addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!confirm(`Excluir "${it.label}"?`)) return;
          try {
            await api.saved.remove(it.id);
            ui.toast("Excluído", "success");
            _loadSaved();
          } catch (err) { ui.toast(err.message, "error"); }
        });
        li.querySelector(".item-main").addEventListener("click", () => _fillCompose(it.text));
        list.appendChild(li);
      });
    },

    devices(devices) {
      const list = $("#devicesList");
      if (!devices.length) {
        list.innerHTML = `<li class="empty-state"><span>Nenhum dispositivo encontrado</span></li>`;
        return;
      }
      list.innerHTML = "";
      devices.forEach((d) => {
        const li = document.createElement("li");
        li.className = "device-item";
        li.innerHTML = `
          <div class="device-indicator ${d.online ? "" : "offline"}"></div>
          <div class="device-info">
            <div class="device-name"></div>
            ${d.type ? `<div class="device-type"></div>` : ""}
          </div>`;
        li.querySelector(".device-name").textContent = d.name;
        if (d.type) li.querySelector(".device-type").textContent = d.type;
        list.appendChild(li);
      });
    },
  };

  // ===== HELPERS =====
  function _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  }

  function _fmt(iso) {
    try {
      return new Date(iso.replace(" ", "T") + "Z").toLocaleString("pt-BR", {
        dateStyle: "short", timeStyle: "short",
      });
    } catch { return iso; }
  }

  function _fillCompose(text, device, rate) {
    if (text)   $("#text").value = text;
    if (device) $("#device").value = device;
    if (rate)   _setRate(rate);
    $("#text").focus();
  }

  function _setRate(v) {
    const val = Math.max(20, Math.min(150, parseInt(v, 10) || 100));
    $("#rate").value = val;
    $("#rateValue").textContent = val;
    $("#rateReset").classList.toggle("hidden", val === 100);
  }

  // ===== DATA LOADERS =====
  async function _loadStatus() {
    try {
      const s = await api.status();
      ui.setStatus(s);
    } catch (e) {
      ui.setStatus({ authenticated: false, message: e.message });
    }
  }

  async function _loadDevices() {
    try {
      const { devices } = await api.devices();
      state.devices = devices;
      render.devices(devices);
      // Preenche selects de dispositivo
      const opts = '<option value="">— Dispositivo padrão —</option>' +
        devices.map((d) => `<option value="${_esc(d.name)}">${_esc(d.name)}</option>`).join("");
      ["#device", "#settingDevice"].forEach((sel) => {
        const el = $(sel);
        if (el) { el.innerHTML = opts; }
      });
    } catch (e) {
      $("#devicesList").innerHTML = `<li class="empty-state"><span>Erro: ${_esc(e.message)}</span></li>`;
    }
  }

  async function _loadHistory() {
    try {
      const { items } = await api.history();
      render.history(items);
    } catch (e) { render.history([]); }
  }

  async function _loadSaved() {
    try {
      const { items } = await api.saved.list();
      render.saved(items);
    } catch (e) { render.saved([]); }
  }

  async function _loadSettings() {
    try {
      state.settings = await api.settings.get();
      const s = state.settings;
      if (s.default_device) $("#device").value = s.default_device;
      if (s.default_rate)   _setRate(s.default_rate);
      if (s.history_limit) {
        const opt = $(`#settingHistoryLimit option[value="${s.history_limit}"]`);
        if (opt) opt.selected = true;
      }
      if (s.default_rate) {
        $("#settingRate").value = s.default_rate;
        $("#settingRateValue").textContent = s.default_rate;
      }
      ui.applyTheme(s.theme || "dark");
    } catch (e) { /* usa defaults */ }
  }

  // ===== HANDLERS =====
  const handlers = {
    async send(textOverride, deviceOverride, rateOverride) {
      const text   = (textOverride   ?? $("#text").value).trim();
      const device = (deviceOverride ?? $("#device").value) || null;
      const rate   = rateOverride    ?? parseInt($("#rate").value, 10);

      if (!text) { ui.setComposerStatus("Digite uma mensagem", "error"); return; }

      const btn = $("#sendBtn");
      ui.setLoading(btn, true);
      ui.setComposerStatus("Enviando…");
      try {
        await api.speak(text, device, rate);
        ui.setComposerStatus("Enviado ✓", "success");
        ui.toast("Mensagem enviada", "success");
        _loadHistory();
      } catch (e) {
        ui.setComposerStatus(e.message, "error");
        ui.toast(e.message, "error");
      } finally {
        ui.setLoading(btn, false);
      }
    },

    async loginStart() {
      const btn = $("#generateUrlBtn");
      ui.setLoading(btn, true);
      try {
        const { url, session_id } = await api.auth.start();
        state.loginSessionId = session_id;
        $("#loginUrlDisplay").textContent = url;
        $("#loginStep1").classList.add("hidden");
        $("#loginStep2").classList.remove("hidden");
      } catch (e) {
        ui.toast(e.message, "error");
      } finally {
        ui.setLoading(btn, false);
      }
    },

    async loginComplete() {
      const redirectUrl = $("#redirectUrl").value.trim();
      if (!redirectUrl) { ui.toast("Cole o URL de redirecionamento", "error"); return; }

      const btn = $("#loginConfirm");
      ui.setLoading(btn, true);
      try {
        await api.auth.complete(state.loginSessionId, redirectUrl);
        ui.toast("Login realizado com sucesso!", "success");
        ui.closeModal("#loginModal");
        _resetLoginModal();
        _loadStatus();
        _loadDevices();
      } catch (e) {
        ui.toast(e.message, "error");
      } finally {
        ui.setLoading(btn, false);
      }
    },

    openSaveModal(item = null) {
      state.editingSavedId = item ? item.id : null;
      $("#saveModalTitle").textContent = item ? "Editar mensagem" : "Salvar mensagem";
      $("#saveLabel").value = item ? item.label : "";
      $("#saveText").value  = item ? item.text  : $("#text").value;
      ui.openModal("#saveModal");
    },

    async confirmSave() {
      const label = $("#saveLabel").value.trim();
      const text  = $("#saveText").value.trim();
      if (!label || !text) { ui.toast("Preencha nome e texto", "error"); return; }
      try {
        if (state.editingSavedId) {
          await api.saved.update(state.editingSavedId, label, text);
        } else {
          await api.saved.create(label, text);
        }
        ui.toast("Salvo", "success");
        ui.closeModal("#saveModal");
        state.editingSavedId = null;
        _loadSaved();
        switchTab("saved");
      } catch (e) { ui.toast(e.message, "error"); }
    },

    async openSettings() {
      // Preenche dispositivo padrão salvo
      if (state.settings.default_device) {
        $("#settingDevice").value = state.settings.default_device;
      }
      ui.applyTheme(state.settings.theme || "dark");
      ui.openModal("#settingsModal");
    },

    async saveSettings() {
      const data = {
        default_device:  $("#settingDevice").value,
        default_rate:    $("#settingRate").value,
        history_limit:   $("#settingHistoryLimit").value,
        theme:           document.querySelector(".theme-opt.active")?.dataset.themeVal || "dark",
      };
      const btn = $("#settingsSave");
      ui.setLoading(btn, true);
      try {
        await api.settings.update(data);
        state.settings = { ...state.settings, ...data };
        ui.applyTheme(data.theme);
        ui.toast("Configurações salvas", "success");
        ui.closeModal("#settingsModal");
        _loadHistory();
      } catch (e) {
        ui.toast(e.message, "error");
      } finally {
        ui.setLoading(btn, false);
      }
    },
  };

  // ===== TAB SWITCHING =====
  function switchTab(name) {
    state.activeTab = name;
    $$(".tab").forEach((t) => {
      const active = t.dataset.tab === name;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", String(active));
    });
    $$(".panel").forEach((p) => {
      p.classList.toggle("hidden", p.id !== `panel-${name}`);
    });
    if (name === "devices") _loadDevices();
    if (name === "history")  _loadHistory();
    if (name === "saved")    _loadSaved();
  }

  function _resetLoginModal() {
    state.loginSessionId = null;
    $("#redirectUrl").value = "";
    $("#loginUrlDisplay").textContent = "";
    $("#loginStep2").classList.add("hidden");
    $("#loginStep1").classList.remove("hidden");
  }

  // ===== INIT =====
  function init() {
    // Rate slider — compose
    $("#rate").addEventListener("input", () => _setRate($("#rate").value));
    $("#rateReset").addEventListener("click", () => _setRate(100));

    // Enviar
    $("#sendBtn").addEventListener("click", () => handlers.send());
    $("#text").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handlers.send();
    });

    // Salvar mensagem
    $("#saveBtn").addEventListener("click", () => handlers.openSaveModal());
    $("#saveConfirm").addEventListener("click", () => handlers.confirmSave());
    $("#saveCancel").addEventListener("click", () => { ui.closeModal("#saveModal"); state.editingSavedId = null; });
    $("#saveClose").addEventListener("click", () => { ui.closeModal("#saveModal"); state.editingSavedId = null; });

    // Tabs
    $$(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));

    // Status / refresh
    $("#refreshBtn").addEventListener("click", () => { _loadStatus(); _loadDevices(); });

    // Login banner + modal
    $("#loginBannerBtn").addEventListener("click", () => ui.openModal("#loginModal"));
    $("#loginClose").addEventListener("click", () => { ui.closeModal("#loginModal"); _resetLoginModal(); });
    $("#generateUrlBtn").addEventListener("click", () => handlers.loginStart());
    $("#loginBack").addEventListener("click", () => {
      $("#loginStep2").classList.add("hidden");
      $("#loginStep1").classList.remove("hidden");
    });
    $("#loginConfirm").addEventListener("click", () => handlers.loginComplete());
    $("#copyUrlBtn").addEventListener("click", () => {
      const url = $("#loginUrlDisplay").textContent;
      navigator.clipboard.writeText(url).then(() => ui.toast("URL copiado!", "success"));
    });

    // Settings modal
    $("#settingsBtn").addEventListener("click", () => handlers.openSettings());
    $("#settingsClose").addEventListener("click", () => ui.closeModal("#settingsModal"));
    $("#settingsCancel").addEventListener("click", () => ui.closeModal("#settingsModal"));
    $("#settingsSave").addEventListener("click", () => handlers.saveSettings());
    $("#settingRate").addEventListener("input", () => {
      $("#settingRateValue").textContent = $("#settingRate").value;
    });
    $$(".theme-opt").forEach((btn) =>
      btn.addEventListener("click", () => {
        $$(".theme-opt").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        ui.applyTheme(btn.dataset.themeVal);
      })
    );

    // Refazer login a partir de configurações
    $("#reloginBtn").addEventListener("click", () => {
      ui.closeModal("#settingsModal");
      ui.openModal("#loginModal");
    });

    // Fechar modais clicando no backdrop
    ["#loginModal", "#settingsModal", "#saveModal"].forEach((id) => {
      $(id).addEventListener("click", (e) => {
        if (e.target === $(id)) {
          ui.closeModal(id);
          if (id === "#loginModal") _resetLoginModal();
          if (id === "#saveModal")  state.editingSavedId = null;
        }
      });
    });

    // Carga inicial
    _loadSettings().then(() => {
      _loadStatus();
      _loadDevices();
      _loadHistory();
      _loadSaved();
    });

    // Atualiza status automaticamente a cada 60s
    setInterval(_loadStatus, 60_000);
  }

  return { init };
})();

document.addEventListener("DOMContentLoaded", () => AlexaApp.init());
