"""Serviço de autenticação OAuth com Amazon — fluxo via web sem proxy."""
import base64
import hashlib
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
import uuid as uuid_lib
from pathlib import Path

_DOMAIN = "amazon.com.br"
_LANGUAGE = "pt_BR"
_ACCEPT_LANGUAGE = "pt-BR"
_APP_NAME = "Alexa TTS Web"
_CALL_VERSION = "2.2.556530.0"
_USER_AGENT = f"AmazonWebView/Amazon Alexa/{_CALL_VERSION}/iOS/16.6/iPhone"
_PROJECT_DIR = Path(__file__).parent.parent
_TOKEN_PATH = _PROJECT_DIR / ".refresh-token"

# Sessões de login pendentes (em memória — suficiente para uso doméstico)
_pending: dict[str, dict] = {}


def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def start_login() -> dict:
    """Gera URL OAuth e retorna {url, session_id}."""
    device_uuid = uuid_lib.uuid4().hex.upper()
    deviceid = (device_uuid.encode() + b"23413249564c5635564d32573831").hex()
    code_verifier = _b64url(secrets.token_bytes(32))
    code_challenge = _b64url(hashlib.sha256(code_verifier.encode()).digest())
    frc = _b64url(secrets.token_bytes(313))
    session_id = secrets.token_hex(16)

    _pending[session_id] = {
        "device_uuid": device_uuid,
        "deviceid": deviceid,
        "code_verifier": code_verifier,
        "frc": frc,
    }

    params = {
        "openid.return_to": "https://www.amazon.com/ap/maplanding",
        "openid.assoc_handle": "amzn_dp_project_dee_ios",
        "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
        "pageId": "amzn_dp_project_dee_ios",
        "accountStatusPolicy": "P1",
        "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
        "openid.mode": "checkid_setup",
        "openid.ns.oa2": "http://www.amazon.com/ap/ext/oauth/2",
        "openid.oa2.client_id": f"device:{deviceid}",
        "openid.ns.pape": "http://specs.openid.net/extensions/pape/1.0",
        "openid.oa2.response_type": "code",
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.pape.max_auth_age": "0",
        "openid.oa2.scope": "device_auth_access offline_access",
        "openid.oa2.code_challenge_method": "S256",
        "openid.oa2.code_challenge": code_challenge,
        "language": _LANGUAGE,
    }
    url = "https://www.amazon.com/ap/register?" + urllib.parse.urlencode(params)
    return {"url": url, "session_id": session_id}


def complete_login(session_id: str, redirect_url: str) -> dict:
    """Troca auth_code pelo refresh_token e salva em .refresh-token.

    Lança ValueError em caso de erro.
    """
    session = _pending.pop(session_id, None)
    if not session:
        raise ValueError("Sessão expirada ou inválida. Inicie o login novamente.")

    qs = urllib.parse.parse_qs(urllib.parse.urlparse(redirect_url).query)
    auth_code = qs.get("openid.oa2.authorization_code", [None])[0]
    if not auth_code:
        raise ValueError(
            "URL inválida — código de autorização não encontrado. "
            "Cole o URL completo da barra de endereços após o login."
        )

    payload = {
        "requested_extensions": ["device_info", "customer_info"],
        "cookies": {"website_cookies": [], "domain": f".{_DOMAIN}"},
        "registration_data": {
            "domain": "Device",
            "app_version": _CALL_VERSION,
            "device_type": "A2IVLV5VM2W81",
            "device_name": f"%FIRST_NAME%'s%DUPE_STRATEGY_1ST%{_APP_NAME}",
            "os_version": "16.6",
            "device_serial": session["device_uuid"],
            "device_model": "iPhone",
            "app_name": _APP_NAME,
            "software_version": "1",
        },
        "auth_data": {
            "client_id": session["deviceid"],
            "authorization_code": auth_code,
            "code_verifier": session["code_verifier"],
            "code_algorithm": "SHA-256",
            "client_domain": "DeviceLegacy",
        },
        "user_context_map": {"frc": session["frc"]},
        "requested_token_type": ["bearer", "mac_dms", "website_cookies"],
    }

    result = _post_register(_DOMAIN, payload)
    success = result.get("response", {}).get("success")

    if not success:
        payload["cookies"]["domain"] = ".amazon.com"
        result = _post_register("amazon.com", payload)
        success = result.get("response", {}).get("success")

    if not success:
        raise ValueError(
            f"Falha no registro Amazon: {json.dumps(result, ensure_ascii=False)[:300]}"
        )

    refresh_token = success["tokens"]["bearer"]["refresh_token"]
    _TOKEN_PATH.write_text(refresh_token)
    _TOKEN_PATH.chmod(0o600)
    return {"ok": True}


def _post_register(host: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"https://api.{host}/auth/register",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "User-Agent": _USER_AGENT,
            "Accept-Language": _ACCEPT_LANGUAGE,
            "Accept-Charset": "utf-8",
            "x-amzn-identity-auth-domain": f"api.{host}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            return {"_error": f"HTTP {e.code}: {body[:400]}"}
