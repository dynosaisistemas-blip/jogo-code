---
name: editar-video
description: Pipeline de edição de vídeo deste projeto. Use sempre que o usuário enviar um vídeo ou pedir para editar/cortar/animar um vídeo. Etapa 1 - video-use corta silêncios, hesitações e repetições guiado pela transcrição. Etapa 2 - HyperFrames gera visualizações e animações sincronizadas com o que é dito no vídeo (ou com o que o usuário pedir) e as compõe como overlays no corte final.
---

# Pipeline de edição de vídeo (video-use → HyperFrames)

O usuário envia vídeos pela conversa. O fluxo é sempre em duas etapas, nesta ordem:

1. **video-use** — transcreve, corta silêncios e repetições, gera o corte limpo.
2. **HyperFrames** — cria animações/visualizações relacionadas ao conteúdo falado
   (ou ao que o usuário pedir) e as aplica como overlays sobre o corte da etapa 1.

## Antes de começar (toda sessão)

1. Rode `bash scripts/setup-video-tools.sh` (idempotente; instala ffmpeg,
   video-use e hyperframes se ainda não estiverem no container).
2. Confirme que `tools/video-use/.env` tem `ELEVENLABS_API_KEY`. Sem ela a
   transcrição não roda — peça a chave ao usuário e grave nesse arquivo.
3. Mova/copie o vídeo enviado pelo usuário para `videos/`. Todas as saídas vão
   para `videos/edit/` (regra do video-use: nunca escrever dentro de `tools/`).

## Etapa 1 — corte (video-use)

Leia `tools/video-use/SKILL.md` e siga o processo dele. Resumo operacional:

- Helpers em `tools/video-use/helpers/`; execute com
  `cd tools/video-use && uv run python helpers/<nome>.py ...`.
- `transcribe.py <video> --edit-dir <repo>/videos/edit` — transcrição
  word-level via ElevenLabs Scribe (cacheada em `videos/edit/transcripts/`).
  O conteúdo costuma ser em português; Scribe detecta o idioma sozinho, mas
  `--language por` está disponível se a detecção falhar.
- `pack_transcripts.py --edit-dir <repo>/videos/edit` — gera `takes_packed.md`.
- Decida os cortes lendo `takes_packed.md`: remova silêncios ≥ 400ms,
  preenchimentos ("ééé", "hum", "tipo"), falsos começos e frases repetidas
  (quando o usuário regrava a mesma fala, mantenha a melhor tomada).
- Escreva `videos/edit/edl.json` e renderize com
  `render.py edl.json -o <repo>/videos/edit/corte.mp4` (use `--preview` para
  validação rápida e `--build-subtitles` se o usuário quiser legendas).
- Respeite as Hard Rules do SKILL.md do video-use (cortes em limite de
  palavra, padding 30–200ms, fades de 30ms, legendas por último etc.).
- **Confirme a estratégia de corte com o usuário antes de renderizar o final**,
  a menos que ele já tenha dito para seguir direto.

## Etapa 2 — visualizações e animações (HyperFrames)

Só começa depois que o corte da etapa 1 estiver pronto. Leia a skill
`hyperframes` (e `hyperframes-animation` / `hyperframes-core` conforme
necessário) — elas ficam disponíveis quando `tools/hyperframes` está clonado.

- Escolha 2–5 momentos do corte onde uma visualização reforça o que está sendo
  dito (número citado → contador animado; lista de passos → cards; conceito →
  diagrama; título/CTA → tipografia cinética). Se o usuário pediu algo
  específico, isso tem prioridade.
- Cada animação vive em `videos/edit/animations/slot_<id>/`:
  scaffold com `node tools/hf/node_modules/hyperframes/dist/cli.js init . --example blank --non-interactive --skip-skills`,
  componha o HTML e renderize com
  `PUPPETEER_EXECUTABLE_PATH=/opt/pw-browsers/chromium/chrome-linux/chrome node tools/hf/node_modules/hyperframes/dist/cli.js render . -o render.mp4`
  (`--format webm -o render.webm` quando precisar de fundo transparente).
- Múltiplas animações: sub-agentes em paralelo, um por slot (regra do video-use).
- Sincronize cada overlay com o timestamp da palavra-chave na timeline DE SAÍDA
  (pós-corte), e registre-os no bloco `overlays` do `edl.json`.
- Re-renderize com `render.py` — overlays antes, legendas por último.

## Entrega

- Resultado final em `videos/edit/final.mp4`. Envie ao usuário com
  `SendUserFile`.
- Rode a auto-avaliação do video-use (timeline_view nas bordas de corte) antes
  de apresentar.
- Registre a sessão em `videos/edit/project.md`.
- Arquivos em `videos/` não são versionados; se o usuário quiser guardar o
  resultado, ele baixa o arquivo enviado.
