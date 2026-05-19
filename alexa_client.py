import html
import os
import subprocess
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
SCRIPT_PATH = SCRIPT_DIR / "alexa-remote-control.sh"
TOKEN_PATH = SCRIPT_DIR / ".refresh-token"
COOKIE_PATH = SCRIPT_DIR / ".alexa.cookie"


class AlexaError(Exception):
    pass


def _load_token() -> str | None:
    if not TOKEN_PATH.exists():
        return None
    return TOKEN_PATH.read_text().strip() or None


def _run(args: list[str], timeout: int = 30) -> str:
    if not SCRIPT_PATH.exists():
        raise AlexaError(f"Script não encontrado. Rode ./setup.sh primeiro.")

    token = _load_token()
    env = os.environ.copy()
    if token:
        env["REFRESH_TOKEN"] = token

    try:
        result = subprocess.run(
            ["bash", str(SCRIPT_PATH), *args],
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=SCRIPT_DIR,
            env=env,
        )
    except subprocess.TimeoutExpired:
        raise AlexaError("Timeout ao executar alexa-remote-control.sh")

    if result.returncode != 0:
        stderr = (result.stderr or result.stdout or "").strip()
        raise AlexaError(stderr or f"falha (code {result.returncode})")
    return result.stdout


def speak(text: str, device: str | None = None, rate: int = 100) -> None:
    args = []
    if device:
        args += ["-d", device]
    rate = max(20, min(200, int(rate)))
    if rate != 100:
        payload = f'<speak><prosody rate="{rate}%">{html.escape(text, quote=False)}</prosody></speak>'
    else:
        payload = text
    args += ["-e", f"speak:{payload}"]
    _run(args, timeout=45)


_SKIP_PHRASES = (
    "cookie does not exist",
    "device list does not exist",
    "the following devices",
    "logging in",
    "downloading",
)


def list_devices() -> list[dict]:
    output = _run(["-a"], timeout=25)
    devices = []
    for line in output.splitlines():
        line = line.strip()
        if not line:
            continue
        low = line.lower()
        if any(p in low for p in _SKIP_PHRASES):
            continue
        devices.append({"name": line, "type": "", "online": True, "raw": line})
    return devices


def check_auth() -> dict:
    if not _load_token():
        return {"authenticated": False, "message": "Sem refresh token. Rode ./login.sh"}
    try:
        output = _run(["-a"], timeout=20)
        if not output.strip():
            return {"authenticated": False, "message": "Resposta vazia da Amazon"}
        return {"authenticated": True, "message": "Conectado"}
    except AlexaError as e:
        msg = str(e)
        lower = msg.lower()
        if any(k in lower for k in ("login", "auth", "cookie", "token", "401", "403")):
            return {"authenticated": False, "message": "Token expirado. Rode ./login.sh"}
        return {"authenticated": False, "message": msg[:200]}
