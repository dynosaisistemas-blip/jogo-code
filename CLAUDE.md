# jogo-code

Este repositório contém dois projetos independentes:

1. **Jogo** — `index.html` e `historia.html` (jogo em HTML puro; ver PROMPT.md).
2. **Editor de vídeo** — pipeline de edição automatizada descrito abaixo.

## Projeto de edição de vídeo

Quando o usuário enviar um vídeo ou pedir edição de vídeo, use a skill
`editar-video` (`.claude/skills/editar-video/SKILL.md`). Fluxo fixo:

1. `bash scripts/setup-video-tools.sh` — instala ffmpeg, video-use e
   hyperframes no container (idempotente; o ambiente é efêmero, então isso
   precisa rodar a cada sessão nova).
2. **Etapa 1 — video-use** (`tools/video-use/SKILL.md`): transcrição via
   ElevenLabs Scribe + corte de silêncios, hesitações e repetições.
3. **Etapa 2 — HyperFrames** (skills `hyperframes*`, disponíveis após o clone
   em `tools/hyperframes`): animações e visualizações sincronizadas com a fala,
   compostas como overlays no corte final.

Detalhes importantes:

- `ELEVENLABS_API_KEY` precisa existir em `tools/video-use/.env` (o setup copia
  do ambiente ou do `.env` da raiz). Sem ela, peça a chave ao usuário.
- CLI do hyperframes: `node tools/hf/node_modules/hyperframes/dist/cli.js`.
  Para renderizar, exporte
  `PUPPETEER_EXECUTABLE_PATH=/opt/pw-browsers/chromium/chrome-linux/chrome`.
- Vídeos do usuário em `videos/`, saídas em `videos/edit/` — nunca dentro de
  `tools/`. Nada disso é versionado.
- Entregue o `final.mp4` ao usuário via `SendUserFile`.
