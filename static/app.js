const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  text: $("#text"),
  device: $("#device"),
  rate: $("#rate"),
  rateValue: $("#rateValue"),
  rateReset: $("#rateReset"),
  sendBtn: $("#sendBtn"),
  saveBtn: $("#saveBtn"),
  composerStatus: $("#composerStatus"),
  status: $("#status"),
  statusDot: $("#status .status-dot"),
  statusText: $("#status .status-text"),
  refreshStatus: $("#refreshStatus"),
  historyList: $("#historyList"),
  savedList: $("#savedList"),
  devicesList: $("#devicesList"),
  saveModal: $("#saveModal"),
  saveLabel: $("#saveLabel"),
  saveText: $("#saveText"),
  saveConfirm: $("#saveConfirm"),
  saveCancel: $("#saveCancel"),
  saveModalTitle: $("#saveModalTitle"),
  toast: $("#toast"),
};

let editingSavedId = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, kind = "") {
  els.toast.textContent = msg;
  els.toast.className = `toast show ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    els.toast.className = "toast";
  }, 2400);
}

function setComposerStatus(msg, kind = "") {
  els.composerStatus.textContent = msg;
  els.composerStatus.className = `composer-status ${kind}`;
}

function formatDate(iso) {
  try {
    const d = new Date(iso.replace(" ", "T") + "Z");
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

async function refreshStatus() {
  els.statusDot.dataset.state = "unknown";
  els.statusText.textContent = "verificando…";
  try {
    const s = await api("/api/status");
    els.statusDot.dataset.state = s.authenticated ? "ok" : "error";
    els.statusText.textContent = s.message;
  } catch (e) {
    els.statusDot.dataset.state = "error";
    els.statusText.textContent = e.message;
  }
}

async function refreshDevices() {
  try {
    const { devices } = await api("/api/devices");
    els.device.innerHTML = '<option value="">— Dispositivo padrão —</option>';
    devices.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.textContent = d.name + (d.type ? ` (${d.type})` : "");
      els.device.appendChild(opt);
    });
    els.devicesList.innerHTML = "";
    if (devices.length === 0) {
      els.devicesList.innerHTML = '<li class="empty">Nenhum dispositivo encontrado.</li>';
      return;
    }
    devices.forEach((d) => {
      const li = document.createElement("li");
      li.className = "device-item";
      li.innerHTML = `
        <span class="online-dot ${d.online ? "" : "offline"}"></span>
        <div class="device-name">${escapeHtml(d.name)}</div>
        <span class="device-type">${escapeHtml(d.type || "")}</span>
      `;
      els.devicesList.appendChild(li);
    });
  } catch (e) {
    els.devicesList.innerHTML = `<li class="empty">Erro: ${escapeHtml(e.message)}</li>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function refreshHistory() {
  const { items } = await api("/api/history");
  if (items.length === 0) {
    els.historyList.innerHTML = '<li class="empty">Nada por aqui ainda.</li>';
    return;
  }
  els.historyList.innerHTML = "";
  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "item";
    const rate = it.rate ?? 100;
    const rateMeta = rate !== 100 ? ` <span class="rate-badge">${rate}%</span>` : "";
    li.innerHTML = `
      <div class="item-main">
        <div class="item-text"></div>
        <div class="item-meta">${formatDate(it.sent_at)}${it.device ? " · " + escapeHtml(it.device) : ""}${rateMeta}</div>
      </div>
      <div class="item-actions">
        <button class="btn sm" data-action="resend">Reenviar</button>
      </div>
    `;
    li.querySelector(".item-text").textContent = it.text;
    li.querySelector(".item-main").addEventListener("click", () => {
      els.text.value = it.text;
      if (it.device) els.device.value = it.device;
      setRate(rate);
      els.text.focus();
    });
    li.querySelector('[data-action="resend"]').addEventListener("click", (ev) => {
      ev.stopPropagation();
      sendText(it.text, it.device, rate);
    });
    els.historyList.appendChild(li);
  });
}

async function refreshSaved() {
  const { items } = await api("/api/saved");
  if (items.length === 0) {
    els.savedList.innerHTML = '<li class="empty">Nenhum texto salvo.</li>';
    return;
  }
  els.savedList.innerHTML = "";
  items.forEach((it) => {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="item-main">
        <div class="item-label"></div>
        <div class="item-text"></div>
      </div>
      <div class="item-actions">
        <button class="btn sm primary" data-action="send">Enviar</button>
        <button class="btn sm" data-action="edit">Editar</button>
        <button class="btn sm danger" data-action="delete">×</button>
      </div>
    `;
    li.querySelector(".item-label").textContent = it.label;
    li.querySelector(".item-text").textContent = it.text;
    li.querySelector(".item-main").addEventListener("click", () => {
      els.text.value = it.text;
      els.text.focus();
    });
    li.querySelector('[data-action="send"]').addEventListener("click", (ev) => {
      ev.stopPropagation();
      sendText(it.text);
    });
    li.querySelector('[data-action="edit"]').addEventListener("click", (ev) => {
      ev.stopPropagation();
      openSaveModal(it);
    });
    li.querySelector('[data-action="delete"]').addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (!confirm(`Excluir "${it.label}"?`)) return;
      try {
        await api(`/api/saved/${it.id}`, { method: "DELETE" });
        toast("Excluído", "success");
        refreshSaved();
      } catch (e) {
        toast(e.message, "error");
      }
    });
    els.savedList.appendChild(li);
  });
}

function setRate(value) {
  const v = Math.max(20, Math.min(150, parseInt(value, 10) || 100));
  els.rate.value = v;
  els.rateValue.textContent = v;
  els.rateReset.classList.toggle("hidden", v === 100);
}

async function sendText(text, device, rate) {
  if (!text || !text.trim()) {
    setComposerStatus("Digite uma mensagem", "error");
    return;
  }
  if (rate === undefined) rate = parseInt(els.rate.value, 10);
  els.sendBtn.disabled = true;
  setComposerStatus("Enviando…");
  try {
    await api("/api/speak", {
      method: "POST",
      body: JSON.stringify({ text, device: device || els.device.value, rate }),
    });
    setComposerStatus("Enviado ✓", "success");
    toast("Mensagem enviada", "success");
    refreshHistory();
  } catch (e) {
    setComposerStatus(e.message, "error");
    toast(e.message, "error");
  } finally {
    els.sendBtn.disabled = false;
  }
}

function openSaveModal(item = null) {
  editingSavedId = item ? item.id : null;
  els.saveModalTitle.textContent = item ? "Editar mensagem" : "Salvar mensagem";
  els.saveLabel.value = item ? item.label : "";
  els.saveText.value = item ? item.text : els.text.value;
  els.saveModal.classList.remove("hidden");
  els.saveLabel.focus();
}

function closeSaveModal() {
  els.saveModal.classList.add("hidden");
  editingSavedId = null;
}

async function confirmSave() {
  const label = els.saveLabel.value.trim();
  const text = els.saveText.value.trim();
  if (!label || !text) {
    toast("Preencha nome e texto", "error");
    return;
  }
  try {
    if (editingSavedId) {
      await api(`/api/saved/${editingSavedId}`, {
        method: "PUT",
        body: JSON.stringify({ label, text }),
      });
    } else {
      await api("/api/saved", {
        method: "POST",
        body: JSON.stringify({ label, text }),
      });
    }
    toast("Salvo", "success");
    closeSaveModal();
    refreshSaved();
    switchTab("saved");
  } catch (e) {
    toast(e.message, "error");
  }
}

function switchTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".panel").forEach((p) => p.classList.toggle("hidden", p.id !== `panel-${name}`));
  if (name === "devices") refreshDevices();
}

els.sendBtn.addEventListener("click", () => sendText(els.text.value));
els.saveBtn.addEventListener("click", () => openSaveModal());
els.refreshStatus.addEventListener("click", () => {
  refreshStatus();
  refreshDevices();
});
els.saveCancel.addEventListener("click", closeSaveModal);
els.saveConfirm.addEventListener("click", confirmSave);
els.saveModal.addEventListener("click", (e) => {
  if (e.target === els.saveModal) closeSaveModal();
});
$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});
els.text.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendText(els.text.value);
});
els.rate.addEventListener("input", () => setRate(els.rate.value));
els.rateReset.addEventListener("click", () => setRate(100));

setRate(100);
refreshStatus();
refreshDevices();
refreshHistory();
refreshSaved();
setInterval(refreshStatus, 60000);
