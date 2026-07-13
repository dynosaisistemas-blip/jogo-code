#!/usr/bin/env bash
# Setup idempotente das ferramentas de edição de vídeo.
# Instala: ffmpeg, video-use (browser-use), hyperframes (heygen).
# Seguro rodar mais de uma vez — pula o que já estiver instalado.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$REPO_ROOT/tools"
mkdir -p "$TOOLS_DIR"

echo "==> ffmpeg"
if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get install -y ffmpeg >/dev/null 2>&1 || {
    apt-get update -qq && apt-get install -y ffmpeg
  }
fi
ffmpeg -version | head -1

echo "==> video-use (cortes de silêncio/repetições via transcrição)"
if [ ! -d "$TOOLS_DIR/video-use" ]; then
  git clone --depth 1 https://github.com/browser-use/video-use "$TOOLS_DIR/video-use"
fi
(cd "$TOOLS_DIR/video-use" && uv sync --quiet)

# A chave da ElevenLabs (transcrição Scribe) deve morar em tools/video-use/.env.
# Fonte: variável de ambiente ELEVENLABS_API_KEY ou .env na raiz do repositório.
if [ ! -f "$TOOLS_DIR/video-use/.env" ]; then
  if [ -n "${ELEVENLABS_API_KEY:-}" ]; then
    echo "ELEVENLABS_API_KEY=$ELEVENLABS_API_KEY" > "$TOOLS_DIR/video-use/.env"
  elif [ -f "$REPO_ROOT/.env" ] && grep -q '^ELEVENLABS_API_KEY=' "$REPO_ROOT/.env"; then
    grep '^ELEVENLABS_API_KEY=' "$REPO_ROOT/.env" > "$TOOLS_DIR/video-use/.env"
  else
    echo "AVISO: ELEVENLABS_API_KEY não encontrada (env ou .env na raiz)."
    echo "       A transcrição do video-use não funcionará sem ela."
  fi
fi

echo "==> hyperframes (repositório com as skills do agente)"
if [ ! -d "$TOOLS_DIR/hyperframes" ]; then
  git clone --depth 1 https://github.com/heygen-com/hyperframes "$TOOLS_DIR/hyperframes"
fi

echo "==> hyperframes CLI (pacote npm)"
if [ ! -x "$TOOLS_DIR/hf/node_modules/.bin/hyperframes" ] && [ ! -f "$TOOLS_DIR/hf/node_modules/hyperframes/dist/cli.js" ]; then
  mkdir -p "$TOOLS_DIR/hf"
  (cd "$TOOLS_DIR/hf" && npm init -y >/dev/null && \
    (npm install hyperframes 2>/dev/null || npm install hyperframes --ignore-scripts))
fi
node "$TOOLS_DIR/hf/node_modules/hyperframes/dist/cli.js" --version

echo
echo "Setup concluído."
echo "CLI do hyperframes: node $TOOLS_DIR/hf/node_modules/hyperframes/dist/cli.js"
echo "Chromium para render: PUPPETEER_EXECUTABLE_PATH=/opt/pw-browsers/chromium/chrome-linux/chrome"
