# Alexa TTS Web

Interface web (Python + Flask) para mandar mensagens TTS pros seus dispositivos Alexa. Roda em Raspberry Pi, configurada pra contas Amazon Brasil.

Usa o [thorsten-gehrig/alexa-remote-control](https://github.com/thorsten-gehrig/alexa-remote-control) por baixo dos panos.

## Recursos

- Caixa de texto + botão "Enviar" → Alexa fala
- Seletor de dispositivo (ou usa o padrão)
- Histórico das últimas 20 mensagens (clique pra preencher / reenviar)
- Mensagens salvas com nome, edição e exclusão
- Indicador de status no header (conectado / token expirado)
- Aba "Dispositivos" mostra os Echos da conta com status online/offline

## Instalação no Raspberry Pi OS

```bash
# 1. Copie a pasta inteira para o Pi, ex: ~/alexa-tts-web
cd ~/alexa-tts-web

# 2. Setup (deps de sistema, venv, baixa o script, configura Brasil)
chmod +x setup.sh login.sh run.sh
./setup.sh

# 3. Autenticar (gera o refresh token)
./login.sh

# 4. Subir o servidor
./run.sh                    # porta padrão 5000
./run.sh -p 8080            # porta customizada
./run.sh --port 8080 --host 127.0.0.1
# Acesse http://<ip-do-pi>:<porta>
```

## Como funciona a autenticação

A Amazon não permite mais login via senha pelos scripts (2FA + captcha quebraram esse fluxo). O método atual é:

1. Você faz login pelo `alexa-cookie-cli` (Node.js), que abre um servidor local na porta 8080.
2. Você abre `http://localhost:8080` no navegador, loga normalmente na sua conta `amazon.com.br`.
3. O CLI captura um **refresh token** (string longa que começa com `Atnr|...`).
4. Salvamos esse token em `.refresh-token` (gitignored, permissão 600).
5. O `alexa-remote-control.sh` troca o refresh token por cookies de sessão automaticamente toda vez que precisa. Os cookies ficam em `.alexa.cookie` no diretório do projeto.

Refresh tokens duram **muito tempo** (meses). Se o status mudar pra "Token expirado", rode `./login.sh` de novo.

### Se você não está no Pi (SSH headless)

O `alexa-cookie-cli` quer um navegador local. Pra resolver via SSH:

```bash
# Na sua máquina, faça SSH com port-forward:
ssh -L 8080:localhost:8080 pi@<ip-do-pi>

# Em outro terminal SSH, rode login.sh.
# Depois abra http://localhost:8080 no navegador da sua máquina (não do Pi).
```

### Fallback manual (sem Node.js)

Se não quiser instalar Node, dá pra extrair o refresh token de outras formas:
- Use a extensão de navegador [alexa_remote_control_helper](https://github.com/adn77/alexa-cookie-cli#alternative-extraction-methods)
- Ou faça em outro PC e copie o token pro Pi: `echo 'Atnr|...' > .refresh-token && chmod 600 .refresh-token`

## Rodar como serviço (systemd)

```bash
# Ajuste WorkingDirectory e User dentro do .service primeiro
sudo cp alexa-tts.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now alexa-tts
sudo systemctl status alexa-tts
journalctl -u alexa-tts -f      # ver logs
```

## Estrutura

```
alexa-tts-web/
├── app.py                  # Flask: rotas / e /api/*
├── alexa_client.py         # subprocess wrapper, passa REFRESH_TOKEN
├── database.py             # SQLite (histórico + salvos)
├── setup.sh                # baixa script, instala deps, patch Brasil
├── login.sh                # roda alexa-cookie-cli, salva .refresh-token
├── run.sh                  # sobe gunicorn em 0.0.0.0:5000
├── alexa-tts.service       # unit do systemd
├── requirements.txt
├── templates/index.html
└── static/{style.css, app.js}
```

## API

| Método | Rota             | Faz                                  |
|--------|------------------|--------------------------------------|
| GET    | /                | UI                                   |
| GET    | /api/status      | Auth OK? + mensagem                  |
| GET    | /api/devices     | Lista dispositivos                   |
| POST   | /api/speak       | `{text, device?}` → Alexa fala       |
| GET    | /api/history     | Últimas 20 enviadas                  |
| GET    | /api/saved       | Mensagens salvas                     |
| POST   | /api/saved       | `{label, text}` → cria               |
| PUT    | /api/saved/<id>  | `{label, text}` → atualiza           |
| DELETE | /api/saved/<id>  | Remove                               |

## Troubleshooting

- **Status fica "Token expirado"** → rode `./login.sh` de novo.
- **Sem dispositivos na lista** → rode `REFRESH_TOKEN=$(cat .refresh-token) ./alexa-remote-control.sh -a` no terminal e veja o erro real.
- **Alexa fala em inglês** → confirme idioma do dispositivo no app Alexa (não dá pra forçar via script).
- **Erro 502 ao enviar** → teste no terminal: `REFRESH_TOKEN=$(cat .refresh-token) ./alexa-remote-control.sh -e 'speak:teste de áudio'`
- **Porta 5000 ocupada** → `./run.sh -p 8080` (ou `PORT=8080 ./run.sh`)
- **`speak:` lê o texto rápido demais ou erra acento** → tente envolver com SSML: `<speak><prosody rate="slow">olá pessoal</prosody></speak>`

## Segurança

A UI **não tem autenticação**. Não exponha na internet sem proxy reverso (nginx + basic auth, Tailscale, Cloudflare Tunnel, etc.). Pra rede local atrás de NAT está OK.

O `.refresh-token` dá acesso completo à sua conta Amazon. Está gitignored e com permissão 600, mas backup com cuidado.
