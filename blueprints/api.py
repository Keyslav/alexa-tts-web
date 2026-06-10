from flask import Blueprint, request, jsonify
import database
import alexa_client
from services.auth_service import start_login, complete_login
from services.settings_service import get_settings, update_settings

api_bp = Blueprint("api", __name__)


# --- Status / Devices ---

@api_bp.route("/status")
def status():
    return jsonify(alexa_client.check_auth())


@api_bp.route("/devices")
def devices():
    try:
        return jsonify({"devices": alexa_client.list_devices()})
    except alexa_client.AlexaError as e:
        return jsonify({"error": str(e), "devices": []}), 502


# --- Speak ---

@api_bp.route("/speak", methods=["POST"])
def speak():
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    device = (data.get("device") or "").strip() or None
    try:
        rate = int(data.get("rate", 100))
    except (TypeError, ValueError):
        rate = 100
    rate = max(20, min(150, rate))
    if not text:
        return jsonify({"error": "Texto vazio"}), 400
    try:
        alexa_client.speak(text, device, rate=rate)
    except alexa_client.AlexaError as e:
        return jsonify({"error": str(e)}), 502
    database.add_history(text, device, rate=rate)
    return jsonify({"ok": True})


# --- History ---

@api_bp.route("/history")
def history():
    settings = get_settings()
    limit = int(settings.get("history_limit", 20))
    return jsonify({"items": database.get_history(limit)})


# --- Saved messages ---

@api_bp.route("/saved", methods=["GET", "POST"])
def saved_collection():
    if request.method == "GET":
        return jsonify({"items": database.get_saved()})
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "").strip()
    text = (data.get("text") or "").strip()
    if not label or not text:
        return jsonify({"error": "Label e texto são obrigatórios"}), 400
    new_id = database.add_saved(label, text)
    return jsonify({"id": new_id})


@api_bp.route("/saved/<int:saved_id>", methods=["PUT", "DELETE"])
def saved_item(saved_id):
    if request.method == "DELETE":
        database.delete_saved(saved_id)
        return jsonify({"ok": True})
    data = request.get_json(silent=True) or {}
    label = (data.get("label") or "").strip()
    text = (data.get("text") or "").strip()
    if not label or not text:
        return jsonify({"error": "Label e texto são obrigatórios"}), 400
    database.update_saved(saved_id, label, text)
    return jsonify({"ok": True})


# --- Auth (login via web) ---

@api_bp.route("/auth/start", methods=["POST"])
def auth_start():
    result = start_login()
    return jsonify(result)


@api_bp.route("/auth/complete", methods=["POST"])
def auth_complete():
    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()
    redirect_url = (data.get("redirect_url") or "").strip()
    if not session_id or not redirect_url:
        return jsonify({"error": "session_id e redirect_url são obrigatórios"}), 400
    try:
        complete_login(session_id, redirect_url)
        return jsonify({"ok": True})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


# --- Settings ---

@api_bp.route("/settings", methods=["GET", "POST"])
def settings():
    if request.method == "GET":
        return jsonify(get_settings())
    data = request.get_json(silent=True) or {}
    saved = update_settings(data)
    return jsonify({"ok": True, "saved": saved})
