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
// Página do pacote na plataforma nova (concursos.estrategia.com). Pode ser trocada por ESTRATEGIA_URL_PACOTE.
const URL_PACOTE = process.env.ESTRATEGIA_URL_PACOTE || 'https://concursos.estrategia.com/todos-os-cursos?view=goal&goalId=cab00bd8-6b1b-4eff-bf0e-4911783b6dde';
const NOME_PACOTE = process.env.NOME_PACOTE || 'Auditor Fiscal da Receita Federal do Brasil (RFB)';
const FILTRO = (process.env.FILTRO_CURSO ?? 'receita federal|rfb|auditor').toLowerCase();
const bateFiltro = nome => !FILTRO || FILTRO.split('|').some(f => f.trim() && norm(nome).includes(norm(f.trim())));
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
  ['contabilidade publica', 'Contabilidade Pública'], ['contabilidade', 'Contabilidade Geral e Avançada'], ['auditoria', 'Auditoria'],
  ['legislacao previdenciaria', 'Legislação Previdenciária'], ['discursiva', 'Discursiva'], ['fluencia', 'Fluência em Dados'], ['politica', 'Políticas Públicas'], ['etica', 'Ética'],
  ['aduaneir', 'Legislação Aduaneira'], ['comercio internacional', 'Comércio Internacional'],
];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
// Só navegamos dentro do Estratégia; mídia só de players/CDNs conhecidos.
const HOST_OK = /(^|\.)(estrategia\.com|estrategiaconcursos\.com\.br|estrategiaeducacional\.com\.br)$|^localhost$/i;
const HOST_MIDIA = /vimeo\.com|youtube\.com|youtu\.be|pandavideo|cloudfront\.net|amazonaws\.com|estrategia|^localhost$/i;
const hostDe = u => { try { return new URL(u).hostname; } catch { return ''; } };
const FORMATO_MANIFEST = 2;
function disciplinaDe(curso) {
  const n = norm(curso);
  for (const [chave, disc] of DISCIPLINAS) if (n.includes(chave)) return disc;
  return curso.replace(/\s*(p\/|para)\s+.*$/i, '').trim() || 'Outros';
}
const limpaNome = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120);

// Classifica um link pelo rótulo/URL. Retorna {tipo, ext} ou null se não interessa.
function classificar(url, rotulo, classe) {
  const r = norm(rotulo + ' ' + classe), u = norm(url), h = hostDe(url);
  if (!u || /^(javascript|mailto|tel):/.test(u)) return null;
  if (/skip to|cookie|politica|termos|privacidade|ajuda|suporte|whatsapp|facebook|instagram|linkedin|twitter|t\.me/.test(r + ' ' + u)) return null;
  const arqPdf = /\.pdf(\?|$)/.test(u), arqAudio = /\.(mp3|m4a|ogg)(\?|$)/.test(u), arqVideo = /\.(mp4|webm|m3u8)(\?|$)/.test(u);
  if (arqAudio) return { tipo: 'audio', ext: u.match(/\.(mp3|m4a|ogg)/)[1] };
  if (arqVideo && HOST_MIDIA.test(h)) return { tipo: 'video', ext: u.match(/\.(mp4|webm)/)?.[1] || 'url' };
  if (/vimeo\.com\/(video\/)?\d+|youtube\.com\/(watch|embed)|youtu\.be\/|pandavideo/.test(u)) return { tipo: 'video', ext: 'url' };
  if (!HOST_OK.test(h) && !HOST_MIDIA.test(h)) return null;            // fora do Estratégia: ignora
  if (/audio|podcast|ouvir/.test(r) && HOST_OK.test(h) && /download|baixar|audio/.test(u + ' ' + r)) return { tipo: 'audio', ext: 'mp3' };
  const pareceDoc = arqPdf || /\b(pdf|livro eletr|baixar|download)\b/.test(r) || /download|\/pdf/.test(u);
  if (!pareceDoc) return null;
  if (/mapa mental|mapa-mental/.test(r + u)) return { tipo: 'mapa', ext: 'pdf' };
  if (/slide/.test(r + u)) return { tipo: 'slides', ext: 'pdf' };
  if (/resum|simplificad|grifad|esquematizad/.test(r + u)) return { tipo: 'resumo', ext: 'pdf' };
  if (/quest|caderno|exerc/.test(r + u)) return { tipo: 'questoes', ext: 'pdf' };
  return { tipo: 'pdf', ext: 'pdf' };
}

async function abrir(headless) {
  fs.mkdirSync(PERFIL, { recursive: true });
  const opts = {
    headless, acceptDownloads: true, viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'], ignoreDefaultArgs: ['--enable-automation'],
  };
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { return await chromium.launchPersistentContext(PERFIL, channel ? { ...opts, channel } : opts); }
    catch (e) { if (channel === undefined) throw e; }
  }
}

const URLS_CANDIDATAS = [URL_CURSOS, 'https://www.estrategiaconcursos.com.br/app/dashboard/cursos', 'https://www.estrategiaconcursos.com.br/app/dashboard/cursos-exclusivos', 'https://www.estrategiaconcursos.com.br/app/dashboard/meus-cursos', 'https://www.estrategiaconcursos.com.br/app/dashboard', 'https://www.estrategiaconcursos.com.br/app'];

async function esperarPagina(page) {
  try { await page.waitForLoadState('networkidle', { timeout: 5000 }); } catch {}
  for (let i = 0; i < 4; i++) { try { await page.mouse.wheel(0, 2000); } catch {} await page.waitForTimeout(250); }   // carrega listas "infinitas"
  await page.waitForTimeout(700);
}

// Abre uma URL tentando de novo em caso de queda de conexão (ERR_CONNECTION_RESET, timeout etc.).
async function irCom(page, url, tentativas = 3) {
  let erro;
  for (let i = 1; i <= tentativas; i++) {
    try { return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    catch (e) { erro = e; if (i < tentativas) { console.log(`   (sem resposta de ${hostDe(url)} — tentativa ${i}/${tentativas}; aguardando ${5 * i}s)`); await page.waitForTimeout(5000 * i); } }
  }
  if (/CONNECTION_RESET|CONNECTION_REFUSED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|TIMED_OUT|Timeout/i.test(String(erro)))
    console.error(`\n✖ Não consegui conectar em ${hostDe(url)}.\n  Verifique a internet, desligue VPN/proxy, confira se o antivírus não bloqueia o Chrome e abra ${url} no seu navegador para testar. Depois rode de novo.`);
  throw erro;
}

const URL_PERFIL = process.env.ESTRATEGIA_URL_PERFIL || 'https://perfil.estrategia.com/';

// Área do aluno (perfil.estrategia.com) → "Estratégia Concursos Novo" → Acessar. Devolve a aba da plataforma nova.
async function entrarPlataformaNova(ctx, page) {
  await irCom(page, URL_PERFIL);
  await esperarPagina(page);
  if (/login/i.test(page.url()) || await page.$('input[type="password"]')) return null;   // não logado
  const card = page.locator('text=/Estrat[ée]gia Concursos\\s*Novo/i').first();
  if (!(await card.count())) { console.log('   (não achei o cartão "Estratégia Concursos Novo" na Área do aluno)'); await salvarInspecao(page, 'perfil'); return page; }
  // o botão "Acessar" fica no mesmo cartão: sobe até o contêiner que tem um link/botão "Acessar"
  const botao = card.locator('xpath=ancestor::*[.//a[contains(.,"Acessar")] or .//button[contains(.,"Acessar")]][1]').locator('a:has-text("Acessar"), button:has-text("Acessar")').first();
  const [nova] = await Promise.all([ctx.waitForEvent('page', { timeout: 6000 }).catch(() => null), botao.click({ timeout: 5000 }).catch(() => null)]);
  const alvo = nova || page;
  try { await alvo.waitForLoadState('domcontentloaded', { timeout: 20000 }); } catch {}
  await esperarPagina(alvo);
  console.log('Plataforma nova aberta em:', alvo.url());
  return alvo;
}

async function salvarInspecao(page, nome) {
  try { await page.screenshot({ path: path.join(RAIZ, `inspecao-${nome}.png`), fullPage: true }); } catch {}
  try { fs.writeFileSync(path.join(RAIZ, `inspecao-${nome}.html`), await page.content()); } catch {}
}

async function login() {
  const ctx = await abrir(false);
  const page = ctx.pages()[0] || await ctx.newPage();
  console.log('➡  Faça o login na janela do navegador (pode usar "Entrar com Google"). Quando aparecer a Área do aluno, feche a janela.');
  try { await irCom(page, URL_PERFIL); } catch { console.log('   A janela fica aberta: quando a internet voltar, digite perfil.estrategia.com na barra de endereço, faça o login e feche a janela.'); }
  await new Promise(res => ctx.on('close', res));
  console.log('✔ Sessão salva em', PERFIL);
}

// Coleta cursos da página "Meus cursos": links e cartões clicáveis com texto que pareça nome de curso.
async function listarCursos(page) {
  return page.evaluate(() => {
    const vistos = new Map();
    const limpa = t => (t || '').replace(/\s+/g, ' ').trim();
    document.querySelectorAll('a[href]').forEach(a => {
      const t = limpa(a.innerText || a.textContent), h = a.href;
      if (t.length < 8 || t.length > 200) return;
      if (!/estrategia/i.test(h) || /login|logout|sair|ajuda|suporte|termos|privacidade|facebook|instagram|youtube|whatsapp|t\.me|mailto/i.test(h)) return;
      if (!vistos.has(h)) vistos.set(h, t);
    });
    // cartões que navegam via JavaScript (sem <a>): guardam a URL em data-* ou onclick
    document.querySelectorAll('[data-href],[data-url],[data-link],[onclick*="location"]').forEach(el => {
      const h = el.dataset.href || el.dataset.url || el.dataset.link || ((el.getAttribute('onclick') || '').match(/['"](https?:[^'"]+|\/[^'"]+)['"]/) || [])[1];
      const t = limpa(el.innerText); if (!h || t.length < 8 || t.length > 200) return;
      const abs = h.startsWith('http') ? h : location.origin + h; if (!vistos.has(abs)) vistos.set(abs, t);
    });
    return [...vistos].map(([url, nome]) => ({ url, nome }));
  });
}

// Fallback para páginas em que os cursos são cartões sem <a>: acha o TEXTO do curso, clica e anota a URL aberta.
async function descobrirClicando(page) {
  const achados = [], vistos = new Set();
  const padrao = new RegExp(FILTRO.split('|').map(f => f.trim()).filter(Boolean).join('|'), 'i');
  const base = page.url();
  const alvos = await page.evaluate(re => {
    const r = new RegExp(re, 'i'), out = [], seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) {
      const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t.length < 8 || !r.test(t)) continue;
      let el = n.parentElement; for (let i = 0; i < 6 && el && el !== document.body; i++, el = el.parentElement)
        if (el.matches('a,button,[role="button"],[class*="card" i],[class*="curso" i],[class*="item" i],li')) break;
      el = el || n.parentElement; const key = (el.innerText || t).slice(0, 120); if (seen.has(key)) continue; seen.add(key);
      el.setAttribute('data-rr-alvo', String(out.length)); out.push(key);
    }
    return out;
  }, padrao.source);
  for (let i = 0; i < alvos.length; i++) {
    const nome = alvos[i].replace(/\s+/g, ' ').trim(); if (vistos.has(nome)) continue; vistos.add(nome);
    try {
      const el = await page.$(`[data-rr-alvo="${i}"]`); if (!el) continue;
      await el.scrollIntoViewIfNeeded(); await el.click({ timeout: 3000 });
      await page.waitForURL(u => u.toString() !== base, { timeout: 8000 });
      achados.push({ nome, url: page.url() });
      await page.goto(base, { waitUntil: 'domcontentloaded' }); await esperarPagina(page);
      await page.evaluate(() => {}); // re-marca os alvos após recarregar
      await page.evaluate(re => { const r = new RegExp(re, 'i'); let k = 0; const seen = new Set();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
        while ((n = walker.nextNode())) { const t = n.textContent.replace(/\s+/g, ' ').trim(); if (t.length < 8 || !r.test(t)) continue;
          let el = n.parentElement; for (let i = 0; i < 6 && el && el !== document.body; i++, el = el.parentElement)
            if (el.matches('a,button,[role="button"],[class*="card" i],[class*="curso" i],[class*="item" i],li')) break;
          el = el || n.parentElement; const key = (el.innerText || t).slice(0, 120); if (seen.has(key)) continue; seen.add(key); el.setAttribute('data-rr-alvo', String(k++)); } }, padrao.source);
    } catch (e) { /* alvo não navegou: segue para o próximo */ try { await page.goto(base, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); } catch {} }
  }
  return achados;
}

const NAV_IGNORAR = /^todos os cursos$|^meus cursos$|^in[ií]cio$|^dashboard$|^painel$|^voltar|^ver mais$|^carregar mais$|organiza[çc][aã]o de estudos|passo estrat|bizu estrat|cursos b[oô]nus|^\d*\s*disciplinas$|^\d*\s*discursivas$|pr[eé]-edital|p[oó]s-edital|favoritos|conclu[ií]dos|^todos$|visualizar|^t[ií]tulo$|precisa de ajuda|pedir ao|baixar notalink|cat[aá]logo|trilha|simulado|sala vip|comunidade|monitoria|alerta|perfil|meus dados|prefer[eê]ncia|sair|logout|ajuda|suporte|assinatura|compra|pagamento|caderno de quest|monitor de perf|estude em grupo|cursos exclusivos|minhas matr[ií]culas|in[ií]cio|home|voltar|pr[oó]xim|anterior|ver todos|mais informa/i;

// Cartões/itens clicáveis da página (disciplinas, aulas): devolve [{nome, url|null, idx}] — url null = precisa clicar.
async function listarCartoes(page) {
  return page.evaluate(() => {
    const limpa = t => (t || '').replace(/\s+/g, ' ').trim();
    const out = [], seen = new Set(); let k = 0;
    const cands = document.querySelectorAll('a[href], button, [role="button"], [role="link"], [class*="card" i], [class*="item" i], li');
    cands.forEach(el => {
      if (el.closest('nav, header, footer, aside, [role="navigation"], [class*="menu" i], [class*="sidebar" i], [class*="navbar" i]')) return;
      const t = limpa(el.innerText); if (t.length < 4 || t.length > 160) return;
      if (el.querySelector('a[href], button, [role="button"]') && el.tagName !== 'A' && el.tagName !== 'BUTTON') return; // prefere o filho clicável
      const key = t.toLowerCase(); if (seen.has(key)) return; seen.add(key);
      const url = el.tagName === 'A' ? el.href : (el.closest('a[href]') || {}).href || null;
      if (url && !/^https?:/.test(url)) return;
      if (url && !/(^|\.)(estrategia\.com|estrategiaconcursos\.com\.br|estrategiaeducacional\.com\.br)$|^localhost$/i.test(new URL(url).hostname)) return;
      el.setAttribute('data-rr-card', String(k)); out.push({ nome: t, url, idx: k++ });
    });
    return out;
  });
}

// Abre um cartão (por link ou clique) e devolve a URL resultante; volta para `base` depois se `voltar`.
async function abrirCartao(page, card, base) {
  if (card.url && card.url !== base && !/^javascript:|#$/.test(card.url)) { await page.goto(card.url, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); return page.url(); }
  const el = await page.$(`[data-rr-card="${card.idx}"]`); if (!el) return null;
  try { await el.scrollIntoViewIfNeeded(); await el.click({ timeout: 3000 }); await page.waitForURL(u => u.toString() !== base, { timeout: 4000 }); }
  catch { return null; }
  if (!HOST_OK.test(hostDe(page.url()))) { try { await page.goto(base, { waitUntil: 'domcontentloaded' }); } catch {} return null; }   // saiu do Estratégia: volta
  await esperarPagina(page); return page.url();
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
  let page = ctx.pages()[0] || await ctx.newPage();
  page = await entrarPlataformaNova(ctx, page);
  if (!page) { console.error('✖ Não está logado. Rode: npm run login (ou apague a pasta .perfil-navegador e rode de novo)'); await ctx.close(); process.exit(1); }

  let todos = [], cursos = [];
  // 1) Tenta o pacote pelo endereço conhecido
  try {
    await irCom(page, URL_PACOTE);
    // a página é montada por JavaScript: espera o nome do pacote ou a aba "Disciplinas" aparecer
    try { await page.waitForSelector('text=/Disciplinas|Auditor Fiscal|Receita Federal/i', { timeout: 25000 }); } catch {}
    await esperarPagina(page);
    const corpo = await page.evaluate(() => document.body.innerText.slice(0, 4000));
    if (/login/i.test(page.url())) console.log('   Redirecionado para login — rode npm run login de novo.');
    else if (/auditor|receita|rfb|disciplinas/i.test(corpo)) { cursos = [{ nome: NOME_PACOTE, url: URL_PACOTE }]; }
    else { console.log('   Pacote não confirmado nesse endereço; procurando na lista de cursos…'); await salvarInspecao(page, 'pacote'); }
  } catch (e) { console.log('   Não consegui abrir a página do pacote:', e.message); }
  // 2) Senão, procura o pacote na lista de cursos
  if (!cursos.length) {
    const urlsBusca = ['https://concursos.estrategia.com/todos-os-cursos', 'https://concursos.estrategia.com/', ...URLS_CANDIDATAS.filter(u => u !== URL_CURSOS || process.env.ESTRATEGIA_URL_CURSOS)];
    for (const u of [...new Set(urlsBusca)]) {
      try { await page.goto(u, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); } catch { continue; }
      todos = await listarCursos(page);
      cursos = todos.filter(c => bateFiltro(c.nome));
      console.log(`Página ${page.url()} → ${todos.length} link(s), ${cursos.length} curso(s) com o filtro "${FILTRO}"`);
      if (!cursos.length) { cursos = await descobrirClicando(page); if (cursos.length) console.log(`   (encontrados clicando nos cartões: ${cursos.length})`); }
      if (cursos.length) break;
    }
  }
  cursos.forEach(c => console.log('  •', c.nome, '→', c.url));
  if (!cursos.length) {
    console.log('\nNenhum pacote encontrado. Links que a página mostra (primeiros 40):');
    todos.slice(0, 40).forEach(c => console.log('   -', c.nome.slice(0, 90), '|', c.url));
    await salvarInspecao(page, 'cursos');
    console.log(`\n→ Salvei uma foto da página em: ${path.join(RAIZ, 'inspecao-cursos.png')}`);
  }

  fs.mkdirSync(SAIDA, { recursive: true });
  let manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : null;
  if (manifest && manifest.formato !== FORMATO_MANIFEST) {   // pasta de uma versão antiga (com itens errados): arquiva e recomeça
    const antigo = SAIDA + '-antigo-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    fs.renameSync(SAIDA, antigo); fs.mkdirSync(SAIDA, { recursive: true }); manifest = null;
    console.log(`(pasta anterior movida para ${path.basename(antigo)} — pode apagar depois)`);
  }
  manifest = manifest || { fonte: 'Estratégia Concursos', formato: FORMATO_MANIFEST, materiais: [] };
  const cont = {};

  const baixarItens = async (itens, disciplina, aula, cursoNome) => {
    const pasta = path.join(SAIDA, limpaNome(disciplina)); fs.mkdirSync(pasta, { recursive: true });
    for (const [i, m] of itens.entries()) {
      const nomeAula = limpaNome(aula || m.aula || `Aula ${String(i + 1).padStart(2, '0')}`);
      const titulo = m.c.tipo === 'pdf' ? nomeAula : `${nomeAula} (${m.c.tipo})`;
      const chave = `${disciplina}/${titulo}`;
      if (manifest.materiais.some(x => x.chave === chave)) continue;
      const entrada = { chave, disciplina, curso: cursoNome, titulo, tipo: m.c.tipo };
      try {
        if (m.c.ext === 'url') entrada.url = m.url;
        else { const arq = path.join(pasta, `${titulo}.${m.c.ext}`); await baixar(page, m.url, arq); entrada.arquivo = path.relative(SAIDA, arq).split(path.sep).join('/'); }
        manifest.materiais.push(entrada); cont[m.c.tipo] = (cont[m.c.tipo] || 0) + 1; console.log('      ✔', titulo);
      } catch (e) { console.log('      ✖', titulo, '-', e.message); }
      fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    }
  };
  const materiaisDaPagina = async () => (await listarMateriais(page)).map(m => ({ ...m, c: classificar(m.url, m.rotulo, m.classe) })).filter(m => m.c && TIPOS.has(m.c.tipo));
  const visitadas = new Set();

  // Pacote → disciplinas → aulas → materiais (até 3 níveis). `rotulo` = nome do nível acima.
  async function explorar(url, nivel, cursoNome, disciplina, aula) {
    if (visitadas.has(url) || nivel > 3 || !HOST_OK.test(hostDe(url))) return; visitadas.add(url);
    if (page.url() !== url) { try { await page.goto(url, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); } catch { return; } }
    try { await page.waitForFunction(() => document.body.innerText.trim().length > 200, null, { timeout: 6000 }); } catch {}
    for (const b of await page.$$('button:has-text("Ver aulas"), button:has-text("Expandir"), button:has-text("Aulas"), [aria-expanded="false"]')) { try { await b.click({ timeout: 500 }); } catch {} }
    const itens = await materiaisDaPagina();
    const ind = '   '.repeat(nivel);
    if (itens.length) {
      console.log(`${ind}${itens.length} item(ns) em "${aula || disciplina || cursoNome}"`);
      if (inspecionar) itens.forEach(m => console.log(`${ind}   - [${m.c.tipo}] ${m.aula} | ${m.rotulo} | ${m.url}`));
      else await baixarItens(itens, disciplina || disciplinaDe(cursoNome), aula, cursoNome);
    }
    if (nivel >= 3 || (itens.length && nivel >= 2)) return;   // página de aula com material: não desce mais
    const ehMaterial = c => c.url && (classificar(c.url, c.nome, '') || /\.(pdf|mp3|m4a|mp4|zip)(\?|$)/i.test(c.url));
    // páginas gerais da plataforma que não são do pacote: catálogo, painel, perfil…
    const urlForaDoPacote = u => !!u && (/estudos-em-andamento|\/perfil|\/conta|\/configura|\/ajuda|\/suporte|\/notifica|\/favoritos|\/busca|\/pesquisa/i.test(u)
      || (/\/todos-os-cursos/i.test(u) && !u.includes('goalId=')) || (nivel >= 1 && /view=goal/i.test(u)) || /^https?:\/\/[^/]+\/?$/.test(u));
    const cartoes = (await listarCartoes(page)).filter(c => !NAV_IGNORAR.test(c.nome) && !(c.url && visitadas.has(c.url)) && !ehMaterial(c)
      && !urlForaDoPacote(c.url) && (nivel !== 0 || bateFiltro(c.nome)));   // no pacote, só cartões de disciplina (nome com Receita Federal/RFB/Auditor)
    if (!itens.length && !cartoes.length) { await salvarInspecao(page, `nivel${nivel}-${limpaNome(aula || disciplina || cursoNome).slice(0, 30)}`); return; }
    if (!itens.length) console.log(`${ind}${cartoes.length} subitem(ns) em "${aula || disciplina || cursoNome}"`);
    const base = page.url();
    let n = 0;
    for (const c of cartoes) {
      n++; if (nivel <= 1) process.stdout.write(`${ind}   (${n}/${cartoes.length}) ${c.nome.slice(0, 70)}\r`);
      if (page.url() !== base) { try { await page.goto(base, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); await listarCartoes(page); } catch { continue; } }
      let dest = null; try { dest = await abrirCartao(page, c, base); } catch (e) { continue; }
      if (!dest || dest === base || visitadas.has(dest)) continue;
      const nomeNivel = c.nome.replace(/\s+/g, ' ').trim();
      process.stdout.write(' '.repeat(100) + '\r');
      if (nivel === 0) { console.log(`\n📚 ${nomeNivel}  →  ${disciplinaDe(nomeNivel)}`); await explorar(dest, 1, cursoNome, disciplinaDe(nomeNivel), null); }
      else if (nivel === 1) { console.log(`${ind}   📖 ${nomeNivel}`); await explorar(dest, 2, cursoNome, disciplina, nomeNivel); }
      else await explorar(dest, 3, cursoNome, disciplina, aula || nomeNivel);
    }
  }

  for (const curso of cursos) {
    console.log(`\n🎓 Pacote: ${curso.nome}`);
    await explorar(curso.url, 0, curso.nome, null, null);
  }

  // Passada extra: cursos avulsos da plataforma antiga (ex.: "Direto ao Ponto") que batem com o filtro.
  if (process.env.SEM_BONUS !== '1') {
    const vistosBonus = new Set();
    for (const u of ['https://www.estrategiaconcursos.com.br/app/dashboard/cursos-exclusivos', 'https://www.estrategiaconcursos.com.br/app/dashboard/cursos']) {
      try { await page.goto(u, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); } catch { continue; }
      const lista = (await listarCursos(page)).filter(c => bateFiltro(c.nome) && /\/cursos\/\d+\/aulas\/?$/.test(c.url));
      for (const c of lista) {
        if (vistosBonus.has(c.url)) continue; vistosBonus.add(c.url);
        const nome = c.nome.replace(/^Cursos Exclusivos\s*/i, '').replace(/\s*Dispon[ií]vel em.*$/i, '').trim();
        console.log(`\n🎁 Curso avulso: ${nome}  →  ${disciplinaDe(nome)}`);
        await explorar(c.url, 1, nome, disciplinaDe(nome), null);
      }
    }
  }
  if (!inspecionar) console.log(`\n✔ Concluído. Novos: ${JSON.stringify(cont)}\n   Pasta: ${SAIDA}\n→ No sistema: Importar / Backup → "Importar pasta sincronizada" → escolha a pasta material.`);
  await ctx.close();
}

(modo === 'login' ? login() : sync(modo === 'inspecionar')).catch(e => { console.error('Erro:', e.message); process.exit(1); });
