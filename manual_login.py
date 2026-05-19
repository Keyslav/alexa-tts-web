#!/usr/bin/env python3
"""Login manual para Amazon Brasil — obtém refresh_token via OAuth /ap/register.

Replica o fluxo que o alexapy (Home Assistant) usa, que funciona com qualquer
região porque /ap/register é o endpoint global de device-registration. Não
depende do proxy do alexa-cookie-cli.
"""
import base64
import hashlib
import json
import os
import secrets
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid as uuid_lib
from pathlib import Path

DOMAIN = "amazon.com.br"
LANGUAGE = "pt_BR"
ACCEPT_LANGUAGE = "pt-BR"
APP_NAME = "Alexa TTS Web"
CALL_VERSION = "2.2.556530.0"
USER_AGENT = f"AmazonWebView/Amazon Alexa/{CALL_VERSION}/iOS/16.6/iPhone"
PROJECT_DIR = Path(__file__).parent


def b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def build_oauth_url(deviceid: str, code_challenge: str) -> str:
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
        "language": LANGUAGE,
    }
    return "https://www.amazon.com/ap/register?" + urllib.parse.urlencode(params)


def post_register(host: str, payload: dict) -> dict:
    req = urllib.request.Request(
        f"https://api.{host}/auth/register",
        data=json.dumps(payload).encode(),
        headers={
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "Accept-Language": ACCEPT_LANGUAGE,
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


def main():
    device_uuid = uuid_lib.uuid4().hex.upper()
    deviceid = (device_uuid.encode() + b"23413249564c5635564d32573831").hex()
    code_verifier = b64url(secrets.token_bytes(32))
    code_challenge = b64url(hashlib.sha256(code_verifier.encode()).digest())
    frc = b64url(secrets.token_bytes(313))

    oauth_url = build_oauth_url(deviceid, code_challenge)

    print("=" * 72)
    print("LOGIN MANUAL — AMAZON BRASIL (sem proxy)")
    print("=" * 72)
    print()
    print("1. ABRA a URL abaixo no seu navegador (selecione e copie):")
    print()
    print(oauth_url)
    print()
    print("2. Faça login com sua conta Amazon Brasil (email/senha + 2FA se tiver).")
    print()
    print("3. Após login, o navegador vai redirecionar pra uma página em branco")
    print("   ou de erro em www.amazon.com/ap/maplanding?... — ISSO É ESPERADO.")
    print("   O importante é o URL na barra de endereço, que contém o auth_code.")
    print()
    print("4. COPIE o URL COMPLETO da barra de endereços e cole abaixo.")
    print()
    final_url = input("URL final (Enter pra cancelar): ").strip()
    if not final_url:
        print("Cancelado.")
        sys.exit(1)

    qs = urllib.parse.parse_qs(urllib.parse.urlparse(final_url).query)
    auth_code = qs.get("openid.oa2.authorization_code", [None])[0]
    if not auth_code:
        print()
        print("✗ Não encontrei 'openid.oa2.authorization_code' no URL.")
        print("  Verifique se colou o URL completo da página de erro/sucesso após o login.")
        print(f"  URL recebida: {final_url[:120]}...")
        sys.exit(1)

    print(f"✓ auth_code capturado ({len(auth_code)} chars)")
    print()

    payload = {
        "requested_extensions": ["device_info", "customer_info"],
        "cookies": {"website_cookies": [], "domain": f".{DOMAIN}"},
        "registration_data": {
            "domain": "Device",
            "app_version": CALL_VERSION,
            "device_type": "A2IVLV5VM2W81",
            "device_name": f"%FIRST_NAME%'s%DUPE_STRATEGY_1ST%{APP_NAME}",
            "os_version": "16.6",
            "device_serial": device_uuid,
            "device_model": "iPhone",
            "app_name": APP_NAME,
            "software_version": "1",
        },
        "auth_data": {
            "client_id": deviceid,
            "authorization_code": auth_code,
            "code_verifier": code_verifier,
            "code_algorithm": "SHA-256",
            "client_domain": "DeviceLegacy",
        },
        "user_context_map": {"frc": frc},
        "requested_token_type": ["bearer", "mac_dms", "website_cookies"],
    }

    print("==> Registrando dispositivo em api.amazon.com.br...")
    result = post_register(DOMAIN, payload)
    success = result.get("response", {}).get("success")

    if not success:
        print(f"  Falhou em api.{DOMAIN}, tentando api.amazon.com...")
        # Atualiza domain dos cookies para o fallback
        payload["cookies"]["domain"] = ".amazon.com"
        result = post_register("amazon.com", payload)
        success = result.get("response", {}).get("success")

    if not success:
        print()
        print("✗ Falha no registro. Resposta da Amazon:")
        print(json.dumps(result, indent=2, ensure_ascii=False)[:1000])
        sys.exit(1)

    refresh_token = success["tokens"]["bearer"]["refresh_token"]
    token_path = PROJECT_DIR / ".refresh-token"
    token_path.write_text(refresh_token)
    token_path.chmod(0o600)
    print(f"✓ refresh_token salvo em .refresh-token ({refresh_token[:25]}...)")
    print()

    print("==> Testando com alexa-remote-control.sh -a (listar dispositivos)...")
    script = PROJECT_DIR / "alexa-remote-control.sh"
    if not script.exists():
        print("  (alexa-remote-control.sh não encontrado — pule este teste)")
        return
    env = {**os.environ, "REFRESH_TOKEN": refresh_token}
    r = subprocess.run(
        ["bash", str(script), "-a"],
        env=env, capture_output=True, text=True, timeout=30, cwd=PROJECT_DIR,
    )
    print(r.stdout)
    if r.returncode == 0:
        print("✓ Login funcionando! Agora pode rodar o servidor: python3 app.py")
    else:
        print(f"✗ alexa-remote-control retornou {r.returncode}")
        print(r.stderr[:400])


if __name__ == "__main__":
    main()
