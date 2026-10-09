# Sincronizador Estratégia → Rumo à Receita

Baixa automaticamente o material das aulas (PDF completo, resumo, mapa mental, slides, áudio/podcast, caderno de questões e link dos vídeos) da **sua conta** do Estratégia Concursos e organiza por disciplina do edital, prontos para importar no sistema de estudos.

> Por que roda no computador e não no site? O sistema de estudos é uma página estática (GitHub Pages): ela não tem servidor e o navegador não permite que um site leia outro. Rodando aqui, sua sessão e seus PDFs ficam só na sua máquina — nada sobe para o GitHub (a pasta `material/` e o perfil do navegador estão no `.gitignore`).

## Requisitos
- [Node.js](https://nodejs.org) 18 ou superior

## Passo a passo

```bash
cd sync
npm install          # instala o Playwright e o Chromium (uma vez)
npm run login        # abre o navegador: faça login na sua conta e feche a janela
npm run sync         # baixa o material (só o que falta) para ./material/<Disciplina>/
```

Depois abra o sistema de estudos → **Importar / Backup** → **Importar pasta sincronizada** → selecione a pasta `material`. Cada item entra na disciplina certa: PDFs com texto pesquisável e leitor integrado, áudios com player, vídeos abrindo no player do Estratégia.

Rode `npm run sync` sempre que o Estratégia liberar aulas novas — ele pula o que já foi baixado.

## Ajustes

| Variável | Para quê | Padrão |
|---|---|---|
| `FILTRO_CURSO` | só cursos cujo nome contenha o texto | `receita federal` |
| `ESTRATEGIA_URL_CURSOS` | URL da página "Meus cursos" | `https://www.estrategiaconcursos.com.br/app/dashboard/cursos` |
| `TIPOS` | tipos a baixar (`pdf,resumo,mapa,slides,audio,questoes,video`) | todos |

Exemplo: `FILTRO_CURSO="Auditor Fiscal" npm run sync`

### Se não encontrar cursos ou PDFs
O site do Estratégia muda de tempos em tempos. Rode `npm run inspecionar`: o navegador abre visível e o script lista os cursos e links que está enxergando (e salva `inspecao-cursos.html` se não achar nada). Com isso dá para ajustar as funções `listarCursos` / `listarMateriais` no `sync.js` — ou me mandar a saída que eu ajusto.

## Boas práticas
- O script baixa **apenas o material que a sua conta já tem acesso**, para seu uso pessoal de estudo. Não compartilhe os PDFs: o conteúdo é do Estratégia.
- Nunca coloque sua senha no script ou em arquivos do repositório. O login é feito por você, na janela do navegador.
