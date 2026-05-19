#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "==> Baixando alexa-remote-control.sh..."
if [ ! -f alexa-remote-control.sh ]; then
  curl -fsSL -o alexa-remote-control.sh \
    https://raw.githubusercontent.com/thorsten-gehrig/alexa-remote-control/master/alexa_remote_control.sh
  chmod +x alexa-remote-control.sh
fi

echo "==> Configurando para Amazon Brasil..."
PROJECT_DIR="$(pwd)"
sed -i "s|^SET_TTS_LOCALE=.*|SET_TTS_LOCALE='pt-BR'|" alexa-remote-control.sh
sed -i "s|^SET_AMAZON=.*|SET_AMAZON='amazon.com.br'|" alexa-remote-control.sh
sed -i "s|^SET_ALEXA=.*|SET_ALEXA='alexa.amazon.com.br'|" alexa-remote-control.sh
sed -i "s|^SET_TMP=.*|SET_TMP='${PROJECT_DIR}'|" alexa-remote-control.sh

if ! grep -q "^SET_AMAZON='amazon.com.br'" alexa-remote-control.sh; then
  echo "AVISO: não consegui patchear SET_AMAZON. Edite alexa-remote-control.sh manualmente."
fi

echo "==> Instalando dependências de sistema..."
if command -v apt-get >/dev/null; then
  sudo apt-get update
  sudo apt-get install -y curl jq oathtool python3-venv python3-pip nodejs npm
fi

echo "==> Criando virtualenv Python..."
if [ ! -d venv ]; then
  python3 -m venv venv
fi
./venv/bin/pip install --upgrade pip
./venv/bin/pip install -r requirements.txt

echo ""
echo "✓ Setup concluído."
echo ""
echo "Próximos passos:"
echo "  1. ./login.sh   (obter refresh token da Amazon)"
echo "  2. ./run.sh     (iniciar o servidor web)"
echo ""
