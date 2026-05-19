# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Flask web UI that sends TTS messages to Amazon Echo devices on an `amazon.com.br` account. Targets Raspberry Pi deployment. Comments, UI strings, and error messages are in Portuguese (Brasil) — keep that convention when editing.

## Common commands

```bash
./setup.sh                 # one-time: deps, venv, download alexa-remote-control.sh, patch for Brasil
./login.sh                 # obtain refresh token via alexa-cookie-cli (needs browser at localhost:8090)
./run.sh                   # serve via gunicorn on 0.0.0.0:5000
./run.sh -p 8080 -H 127.0.0.1   # override via flags (also accepts $PORT / $HOST env vars)
./venv/bin/python app.py   # Flask dev server (no gunicorn, debug=False)
```

Manual sanity check against the underlying shell wrapper (often more informative than the API error):
```bash
REFRESH_TOKEN=$(cat .refresh-token) ./alexa-remote-control.sh -a              # list devices
REFRESH_TOKEN=$(cat .refresh-token) ./alexa-remote-control.sh -e 'speak:oi'   # speak on default device
```

There are no tests, linter, or build step.

## Architecture

Three-layer stack — a Flask app that shells out to a third-party bash script:

1. **`app.py`** — Flask routes under `/api/*` (status, devices, speak, history, saved CRUD). Thin: validates input, delegates to `alexa_client`, persists to `database`. Returns `502` on `AlexaError`.

2. **`alexa_client.py`** — `subprocess.run` wrapper around `alexa-remote-control.sh`. Loads the refresh token from `.refresh-token` and injects it as the `REFRESH_TOKEN` env var on every call (the shell script handles cookie refresh from that). Raises `AlexaError` on non-zero exit. `speak()` wraps text in `<speak><prosody rate="X%">…</prosody></speak>` SSML when `rate != 100`, HTML-escaping the inner text. `list_devices()` parses stdout line-by-line, filtering known banner phrases in `_SKIP_PHRASES`.

3. **`database.py`** — SQLite at `messages.db` with `history` (auto-trimmed to 50 rows) and `saved` tables. `init_db()` runs idempotent `ALTER TABLE` migrations for the `slow`/`rate` columns — preserve that pattern when adding columns instead of using a migration framework.

### Auth model — critical to understand

Amazon password login is broken (2FA + captcha). The only working flow is:
- `login.sh` runs the prebuilt `alexa-cookie-cli-linux-x64` binary, which opens a local browser-facing server on `PROXY_PORT` (default 8090, **not** 8080 as the README says).
- User logs in via browser; CLI extracts a long-lived refresh token (`Atnr|...`), saved to `.refresh-token` (chmod 600, gitignored).
- `alexa-remote-control.sh` trades that token for session cookies (`.alexa.cookie`) on each invocation.
- Refresh tokens last months. When `/api/status` reports "Token expirado", re-run `./login.sh`.

Never log or echo the refresh token value. Never commit `.refresh-token`, `.alexa.cookie`, or `.alexa.*` files (already gitignored).

### Brasil-specific patches

`setup.sh` sed-patches `alexa-remote-control.sh` after download:
- `SET_TTS_LOCALE='pt-BR'`
- `SET_AMAZON='amazon.com.br'`
- `SET_ALEXA='alexa.amazon.com.br'`
- `SET_TMP='<project dir>'` (so the script's cookie/device cache lives next to the repo)

If `alexa-remote-control.sh` is re-downloaded, these patches must be re-applied — re-run `./setup.sh`.

### Frontend

Single-page UI in `templates/index.html` + `static/app.js` + `static/style.css`. Pure vanilla JS hitting the `/api/*` endpoints — no build pipeline, no framework. Tabs: send (with device selector + rate slider), history, saved, devices.

## Security note

UI has no authentication. The `.refresh-token` grants full Amazon account access. Don't expose port 5000 to the internet without a reverse proxy + auth in front.
