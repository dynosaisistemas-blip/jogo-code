#!/usr/bin/env node
/**
 * Rumo à Receita — sincronizador com a área do aluno do Estratégia Concursos.
 *
 * Abre um navegador (Playwright/Chromium) com um perfil local persistente, deixa VOCÊ
 * fazer login na primeira vez (a senha nunca passa por este script), percorre seus cursos
 * e baixa o material de cada aula — PDF completo, resumo/simplificado, mapa mental, slides,
 * áudio (podcast), caderno de questões — e cataloga os vídeos (link de streaming) em
 * ./material/<Disciplina>/... + manifest.json. Depois, no sistema de estudos, use
 * "Importar pasta sincronizada" e aponte para ./material.
 *
 * Uso:
 *   npm install            (uma vez)
 *   npm run login          abre o navegador para você entrar na conta
 *   npm run sync           baixa o que ainda não foi baixado
 *   npm run inspecionar    mostra o que o script enxerga (para ajustar seletores)
 *
 * Variáveis opcionais:
 *   ESTRATEGIA_URL_CURSOS   página "Meus cursos" (padrão abaixo)
 *   FILTRO_CURSO            só cursos cujo nome contenha este texto (padrão: "receita federal")
 *   TIPOS                   tipos a baixar, separados por vírgula (padrão: todos)
 *                           pdf,resumo,mapa,slides,audio,questoes,video
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const PERFIL = path.join(RAIZ, '.perfil-navegador');
const SAIDA = path.join(RAIZ, 'material');
const MANIFEST = path.join(SAIDA, 'manifest.json');
const URL_CURSOS = process.env.ESTRATEGIA_URL_CURSOS || 'https://www.estrategiaconcursos.com.br/app/dashboard/cursos';
const FILTRO = (process.env.FILTRO_CURSO ?? 'receita federal').toLowerCase();
const TIPOS = new Set((process.env.TIPOS || 'pdf,resumo,mapa,slides,audio,questoes,video').split(',').map(s => s.trim()));
const modo = process.argv[2] || 'sync';

// Mapeia o nome do curso para a disciplina do edital usada no sistema de estudos.
const DISCIPLINAS = [
  ['portugu', 'Língua Portuguesa'], ['ingl', 'Língua Inglesa'],
  ['raciocinio', 'Raciocínio Lógico-Matemático'], ['estatistica', 'Estatística'],
  ['econom', 'Economia e Finanças Públicas'], ['financas publicas', 'Economia e Finanças Públicas'],
  ['administracao geral', 'Administração Geral e Pública'], ['administracao publica', 'Administração Geral e Pública'],
  ['constitucional', 'Direito Constitucional'], ['administrativo', 'Direito Administrativo'],
  ['legislacao tributaria', 'Legislação Tributária'], ['tributario', 'Direito Tributário'],
  ['contabilidade', 'Contabilidade Geral e Avançada'], ['auditoria', 'Auditoria'],
  ['aduaneir', 'Legislação Aduaneira'], ['comercio internacional', 'Comércio Internacional'],
];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function disciplinaDe(curso) {
  const n = norm(curso);
  for (const [chave, disc] of DISCIPLINAS) if (n.includes(chave)) return disc;
  return curso.replace(/\s*(p\/|para)\s+.*$/i, '').trim() || 'Outros';
}
const limpaNome = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

// Classifica um link pelo rótulo/URL. Retorna {tipo, ext} ou null se não interessa.
function classificar(url, rotulo, classe) {
  const r = norm(rotulo + ' ' + classe), u = norm(url);
  if (/\.(mp3|m4a|ogg)(\?|$)/.test(u) || /audio|podcast|ouvir/.test(r)) return { tipo: 'audio', ext: u.match(/\.(m4a|ogg)(\?|$)/)?.[1] || 'mp3' };
  if (/\.(mp4|webm)(\?|$)/.test(u)) return { tipo: 'video', ext: u.match(/\.(mp4|webm)/)[1] };
  if (/vimeo|youtube|youtu\.be|pandavideo|player|assistir|video/.test(u + ' ' + r)) return { tipo: 'video', ext: 'url' };
  if (/mapa mental|mapa-mental/.test(r + u)) return { tipo: 'mapa', ext: 'pdf' };
  if (/slide/.test(r + u)) return { tipo: 'slides', ext: 'pdf' };
  if (/resum|simplificad|grifad|esquematizad/.test(r + u)) return { tipo: 'resumo', ext: 'pdf' };
  if (/quest|caderno|exerc/.test(r + u)) return { tipo: 'questoes', ext: 'pdf' };
  if (/\.pdf(\?|$)/.test(u) || /pdf|livro eletr|baixar|download/.test(r)) return { tipo: 'pdf', ext: 'pdf' };
  return null;
}

async function abrir(headless) {
  fs.mkdirSync(PERFIL, { recursive: true });
  return chromium.launchPersistentContext(PERFIL, {
    headless, acceptDownloads: true, viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
}

async function logado(page) {
  await page.goto(URL_CURSOS, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  return !/login|entrar|auth|perfil\.estrategia/i.test(page.url());
}

async function login() {
  const ctx = await abrir(false);
  const page = ctx.pages()[0] || await ctx.newPage();
  console.log('➡  Faça o login na janela do navegador. Quando a lista de cursos aparecer, pode fechar a janela.');
  await page.goto(URL_CURSOS);
  await new Promise(res => ctx.on('close', res));
  console.log('✔ Sessão salva em', PERFIL);
}

// Coleta cursos da página "Meus cursos": qualquer link cujo texto pareça nome de curso.
async function listarCursos(page) {
  return page.evaluate(() => {
    const vistos = new Map();
    document.querySelectorAll('a[href]').forEach(a => {
      const t = (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim();
      const h = a.href;
      if (t.length < 8 || t.length > 160) return;
      if (!/curso|aula|\/app\//i.test(h) || /login|sair|logout|ajuda|suporte/i.test(h)) return;
      if (!vistos.has(h)) vistos.set(h, t);
    });
    return [...vistos].map(([url, nome]) => ({ url, nome }));
  });
}

// Dentro de um curso: todos os links de material, com o nome da aula a que pertencem.
async function listarMateriais(page) {
  return page.evaluate(() => {
    const out = [];
    const nomeAula = el => {
      let n = el;
      for (let i = 0; i < 8 && n; i++, n = n.parentElement) {
        const h = n.querySelector && n.querySelector('h1,h2,h3,h4,h5,strong,[class*="title"],[class*="titulo"],[class*="name"]');
        const t = h && (h.innerText || '').replace(/\s+/g, ' ').trim();
        if (t && t.length > 3) return t;
      }
      return '';
    };
    const seen = new Set();
    document.querySelectorAll('a[href], [data-src], video source, audio source, iframe[src]').forEach(el => {
      const url = el.href || el.src || el.dataset.src;
      if (!url || seen.has(url)) return; seen.add(url);
      out.push({ url, rotulo: (el.innerText || el.title || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim(), classe: el.className || '', aula: nomeAula(el) });
    });
    return out;
  });
}

async function baixar(page, url, destino) {
  if (fs.existsSync(destino)) return 'existente';
  try {
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 45000 }),
      page.evaluate(u => { const a = document.createElement('a'); a.href = u; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); }, url),
    ]);
    await download.saveAs(destino);
  } catch {
    // fallback: baixa direto com os cookies da sessão
    const r = await page.request.get(url);
    if (!r.ok()) throw new Error('HTTP ' + r.status());
    fs.writeFileSync(destino, await r.body());
  }
  return 'baixado';
}

async function sync(inspecionar) {
  const ctx = await abrir(!inspecionar);
  const page = ctx.pages()[0] || await ctx.newPage();
  if (!(await logado(page))) { console.error('✖ Não está logado. Rode: npm run login'); await ctx.close(); process.exit(1); }

  const cursos = (await listarCursos(page)).filter(c => !FILTRO || norm(c.nome).includes(norm(FILTRO)));
  console.log(`Cursos encontrados (filtro "${FILTRO}"): ${cursos.length}`);
  cursos.forEach(c => console.log('  •', c.nome, inspecionar ? '→ ' + c.url : ''));
  if (!cursos.length) {
    console.log('\nNenhum curso bateu. Rode "npm run inspecionar" e, se preciso, defina ESTRATEGIA_URL_CURSOS ou FILTRO_CURSO.');
    if (inspecionar) fs.writeFileSync(path.join(RAIZ, 'inspecao-cursos.html'), await page.content());
  }

  fs.mkdirSync(SAIDA, { recursive: true });
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { fonte: 'Estratégia Concursos', materiais: [] };
  const cont = {};

  for (const curso of cursos) {
    const disciplina = disciplinaDe(curso.nome);
    console.log(`\n📚 ${curso.nome}  →  ${disciplina}`);
    await page.goto(curso.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    for (const b of await page.$$('button:has-text("Ver aulas"), button:has-text("Expandir"), [aria-expanded="false"]')) { try { await b.click({ timeout: 500 }); } catch {} }
    await page.waitForTimeout(800);

    const itens = (await listarMateriais(page)).map(m => ({ ...m, c: classificar(m.url, m.rotulo, m.classe) })).filter(m => m.c && TIPOS.has(m.c.tipo));
    console.log(`   ${itens.length} item(ns): ` + Object.entries(itens.reduce((a, m) => (a[m.c.tipo] = (a[m.c.tipo] || 0) + 1, a), {})).map(([k, v]) => `${k} ${v}`).join(', '));
    if (inspecionar) { itens.forEach(m => console.log(`     - [${m.c.tipo}] ${m.aula} | ${m.rotulo} | ${m.url}`)); continue; }

    const pasta = path.join(SAIDA, limpaNome(disciplina));
    fs.mkdirSync(pasta, { recursive: true });
    for (const [i, m] of itens.entries()) {
      const aula = limpaNome(m.aula || `Aula ${String(i + 1).padStart(2, '0')}`);
      const titulo = m.c.tipo === 'pdf' ? aula : `${aula} (${m.c.tipo})`;
      const chave = `${disciplina}/${titulo}`;
      if (manifest.materiais.some(x => x.chave === chave)) continue;
      const entrada = { chave, disciplina, curso: curso.nome, titulo, tipo: m.c.tipo };
      try {
        if (m.c.ext === 'url') { entrada.url = m.url; }                              // vídeo em streaming: só o link
        else {
          const arq = path.join(pasta, `${titulo}.${m.c.ext}`);
          await baixar(page, m.url, arq);
          entrada.arquivo = path.relative(SAIDA, arq).split(path.sep).join('/');
        }
        manifest.materiais.push(entrada); cont[m.c.tipo] = (cont[m.c.tipo] || 0) + 1;
        console.log('   ✔', titulo);
      } catch (e) { console.log('   ✖', titulo, '-', e.message); }
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    }
  }
  if (!inspecionar) console.log(`\n✔ Concluído. Novos: ${JSON.stringify(cont)}\n   Pasta: ${SAIDA}\n→ No sistema: Importar / Backup → "Importar pasta sincronizada" → escolha a pasta material.`);
  await ctx.close();
}

(modo === 'login' ? login() : sync(modo === 'inspecionar')).catch(e => { console.error('Erro:', e.message); process.exit(1); });
