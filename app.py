from flask import Flask, render_template, request, jsonify
import database
import alexa_client

app = Flask(__name__)
database.init_db()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/status")
def status():
    return jsonify(alexa_client.check_auth())


@app.route("/api/devices")
def devices():
    try:
        return jsonify({"devices": alexa_client.list_devices()})
    except alexa_client.AlexaError as e:
        return jsonify({"error": str(e), "devices": []}), 502


@app.route("/api/speak", methods=["POST"])
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


@app.route("/api/history")
def history():
    return jsonify({"items": database.get_history()})


@app.route("/api/saved", methods=["GET", "POST"])
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


@app.route("/api/saved/<int:saved_id>", methods=["PUT", "DELETE"])
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
