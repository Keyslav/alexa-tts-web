#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

PORT="${PORT:-5000}"
HOST="${HOST:-0.0.0.0}"

usage() {
  cat <<EOF
Uso: $0 [-p|--port PORTA] [-H|--host HOST] [-h|--help]

Opções:
  -p, --port PORTA   Porta TCP (padrão: 5000, ou \$PORT)
  -H, --host HOST    Endereço de bind (padrão: 0.0.0.0, ou \$HOST)
  -h, --help         Mostra esta ajuda

Exemplo:
  $0 --port 8080
  $0 -p 8080 -H 127.0.0.1
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -p|--port)
      [ -n "$2" ] || { echo "Erro: $1 requer um valor."; exit 1; }
      PORT="$2"; shift 2 ;;
    -H|--host)
      [ -n "$2" ] || { echo "Erro: $1 requer um valor."; exit 1; }
      HOST="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Argumento desconhecido: $1"; usage; exit 1 ;;
  esac
done

if ! [[ "$PORT" =~ ^[0-9]+$ ]] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
  echo "Erro: porta inválida '$PORT' (use 1-65535)."
  exit 1
fi

if [ ! -d venv ]; then
  echo "Erro: rode ./setup.sh primeiro."
  exit 1
fi

echo "==> Servindo em http://${HOST}:${PORT}"
exec ./venv/bin/gunicorn --bind "${HOST}:${PORT}" --workers 1 --threads 4 --timeout 60 app:app
