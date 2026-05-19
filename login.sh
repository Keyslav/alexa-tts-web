#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -f alexa-remote-control.sh ]; then
  echo "Erro: rode ./setup.sh primeiro."
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  BIN="alexa-cookie-cli-linux-x64" ;;
  *)
    cat <<EOF
✗ Não há binário pré-compilado do alexa-cookie-cli pra '$ARCH'.

Pegue o refresh token em outra máquina (ex: laptop x86_64):
  1. Lá, rode este mesmo ./login.sh
  2. Copie o valor de '.refresh-token' pro Pi:
       scp .refresh-token pi@<ip-do-pi>:~/alexa-tts-web/
       ssh pi@<ip-do-pi> 'chmod 600 ~/alexa-tts-web/.refresh-token'
EOF
    exit 1
    ;;
esac

if [ ! -f "$BIN" ]; then
  echo "==> Baixando $BIN..."
  curl -fsSL -o "$BIN" \
    "https://github.com/adn77/alexa-cookie-cli/releases/download/v5.0.1/$BIN"
  chmod +x "$BIN"
fi

PROXY_PORT="${PROXY_PORT:-8090}"

cat <<EOF

=================================================================
Login Amazon Brasil
=================================================================
O CLI vai iniciar um servidor local em http://localhost:${PROXY_PORT}
Abra essa URL no navegador, faça login normalmente (2FA OK).
Quando voltar pro terminal você verá o refresh_token (Atnr|...).

(Se a porta ${PROXY_PORT} estiver ocupada, rode com:
   PROXY_PORT=8091 ./login.sh)

EOF

read -rp "Pressione ENTER para iniciar... "

OUTPUT="$(./"$BIN" -q -P "$PROXY_PORT" -p amazon.com -a en_US -L en-US 2>&1 | tee /dev/tty)"

# Extrai o refresh token da saída (linha que começa com Atnr|)
TOKEN="$(echo "$OUTPUT" | grep -oE 'Atnr\|[^"]*' | head -1)"

if [ -z "$TOKEN" ]; then
  echo ""
  echo "Não consegui extrair o token automaticamente."
  read -rp "Cole aqui o refresh token (Atnr|...): " TOKEN
fi

if [ -z "$TOKEN" ] || [[ "$TOKEN" != Atnr* ]]; then
  echo "✗ Refresh token inválido."
  exit 1
fi

echo "$TOKEN" > .refresh-token
chmod 600 .refresh-token

echo ""
echo "==> Testando autenticação (listar dispositivos)..."
if REFRESH_TOKEN="$TOKEN" ./alexa-remote-control.sh -a; then
  echo ""
  echo "✓ Login OK. Token salvo em .refresh-token"
else
  echo ""
  echo "✗ Falha. Token salvo, mas listagem deu erro. Veja a saída acima."
  exit 1
fi
