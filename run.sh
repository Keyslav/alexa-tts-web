#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d venv ]; then
  echo "Erro: rode ./setup.sh primeiro."
  exit 1
fi

PORT="${PORT:-5000}"
HOST="${HOST:-0.0.0.0}"

echo "==> Servindo em http://${HOST}:${PORT}"
exec ./venv/bin/gunicorn --bind "${HOST}:${PORT}" --workers 1 --threads 4 --timeout 60 app:app
