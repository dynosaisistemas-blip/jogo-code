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
const limpaNome = s => String(s).replace(/[\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 120);

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

const NAV_IGNORAR = /conhecer o ldi|n[aã]o mostrar novamente|^fechar$|^close|share|tweet|^todos os cursos$|^meus cursos$|^in[ií]cio$|^dashboard$|^painel$|^voltar|^ver mais$|^carregar mais$|organiza[çc][aã]o de estudos|passo estrat|bizu estrat|cursos b[oô]nus|^\d*\s*disciplinas$|^\d*\s*discursivas$|pr[eé]-edital|p[oó]s-edital|favoritos|conclu[ií]dos|^todos$|visualizar|^t[ií]tulo$|precisa de ajuda|pedir ao|baixar notalink|cat[aá]logo|trilha|simulado|sala vip|comunidade|monitoria|alerta|perfil|meus dados|prefer[eê]ncia|sair|logout|ajuda|suporte|assinatura|compra|pagamento|caderno de quest|monitor de perf|estude em grupo|cursos exclusivos|minhas matr[ií]culas|in[ií]cio|home|voltar|pr[oó]xim|anterior|ver todos|mais informa/i;

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
  try { await el.scrollIntoViewIfNeeded(); await el.click({ timeout: 3000 }); await page.waitForURL(u => u.toString() !== base, { timeout: 2500 }); }
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
  let inspecoesFeitas = 0;

  // Na lista do pacote, cada disciplina tem um ícone de download (⬇). Clica nele, registra o que abre e tenta baixar.
  let diagDownloadFeito = 0;
  async function baixarPeloIcone(card, disciplina, cursoNome) {
    const info = await page.evaluate(idx => {
      const el = document.querySelector(`[data-rr-card="${idx}"]`); if (!el) return null;
      let linha = el; for (let i = 0; i < 6 && linha && linha.parentElement; i++) { if (linha.querySelector('button[aria-label], a[download], [class*="download" i], svg')) break; linha = linha.parentElement; }
      const cands = [...linha.querySelectorAll('button, a, [role="button"]')].filter(b => !el.contains(b) || b !== el);
      const txt = b => ((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + (b.innerText || '') + ' ' + (b.className || '') + ' ' + (b.querySelector('svg')?.getAttribute('aria-label') || '') + ' ' + (b.querySelector('svg')?.getAttribute('data-icon') || '')).toLowerCase();
      let alvo = cands.find(b => /baixar|download|descarregar/.test(txt(b))) || cands.find(b => b.querySelector('svg') && !/favorit|menu|op[çc][õo]es|mais/.test(txt(b)));
      if (!alvo) return { achou: false, botoes: cands.map(txt).map(t => t.trim().slice(0, 50)) };
      alvo.setAttribute('data-rr-dl', '1'); return { achou: true };
    }, card.idx);
    if (!info || !info.achou) { if (diagDownloadFeito < 1) { diagDownloadFeito++; console.log(`   (sem ícone de download reconhecível na linha; botões da linha: ${JSON.stringify((info || {}).botoes || [])})`); } return 0; }
    const btn = await page.$('[data-rr-dl="1"]'); if (!btn) return 0;
    const downloads = [];
    const onDl = d => downloads.push(d); page.on('download', onDl);
    try { await btn.click({ timeout: 3000 }); } catch { page.off('download', onDl); return 0; }
    await page.waitForTimeout(2000);
    // o que abriu? (modal/menu)
    const modal = await page.evaluate(() => {
      const m = document.querySelector('[role="dialog"], [role="menu"], [class*="modal" i], [class*="dialog" i], [class*="drawer" i], [class*="popover" i], [class*="dropdown" i]');
      if (!m) return null;
      return { texto: (m.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600),
        itens: [...m.querySelectorAll('a[href], button, [role="button"], [role="menuitem"], input[type="checkbox"], label')].map((el, i) => { el.setAttribute('data-rr-mi', String(i)); return { i, tag: el.tagName.toLowerCase(), t: (el.innerText || el.getAttribute('aria-label') || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 60), href: el.href || '' }; }) };
    });
    if (diagDownloadFeito < 2) { diagDownloadFeito++;
      await salvarInspecao(page, `download-${limpaNome(disciplina).slice(0, 25)}`);
      console.log(`   ⬇ Cliquei no ícone de download. ${modal ? 'Abriu uma janela com: ' + modal.texto.slice(0, 300) : 'Nada visível abriu'}. Foto: inspecao-download-….png`);
      if (modal) modal.itens.forEach(x => console.log(`       · ${x.tag} | ${x.t} | ${x.href}`)); }
    let n = 0;
    if (modal) {
      // 1) links diretos de PDF/arquivo dentro da janela
      for (const x of modal.itens) if (x.href && classificar(x.href, x.t, '')) { try { const arq = path.join(SAIDA, limpaNome(disciplina), limpaNome(x.t || 'arquivo') + (/\.pdf/i.test(x.href) ? '.pdf' : '')); fs.mkdirSync(path.dirname(arq), { recursive: true }); if (!fs.existsSync(arq)) { await baixar(page, x.href, arq); n++; console.log('      ✔', path.basename(arq)); } } catch (e) {} }
      // 2) botões "selecionar todos" e depois "baixar/download"
      for (const re of [/selecionar tod|marcar tod|todos/i, /baixar|download|confirmar|gerar/i]) {
        const alvo = modal.itens.find(x => re.test(x.t) && x.tag !== 'a'); if (!alvo) continue;
        try { await (await page.$(`[data-rr-mi="${alvo.i}"]`)).click({ timeout: 2000 }); await page.waitForTimeout(2500); } catch {}
      }
    }
    // downloads disparados (zip/pdf) durante o processo
    await page.waitForTimeout(3000); page.off('download', onDl);
    for (const d of downloads) { try { const nome = d.suggestedFilename() || 'arquivo'; const arq = path.join(SAIDA, limpaNome(disciplina), limpaNome(nome)); fs.mkdirSync(path.dirname(arq), { recursive: true }); await d.saveAs(arq); n++; console.log('      ✔', nome, '(pelo ícone de download)');
      if (/\.zip$/i.test(nome)) { // ZIP com os PDFs: extrai na pasta da disciplina (Windows: PowerShell; Mac/Linux: unzip)
        try { const { execSync } = require('child_process'); const dest = path.dirname(arq);
          if (process.platform === 'win32') execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${arq.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force"`, { stdio: 'ignore' });
          else execSync(`unzip -o -q "${arq}" -d "${dest}"`, { stdio: 'ignore' });
          fs.unlinkSync(arq); console.log('      ✔ ZIP extraído em', path.basename(dest));
          for (const f of fs.readdirSync(dest)) if (/\.pdf$/i.test(f) && !manifest.materiais.some(m => m.arquivo === path.posix.join(limpaNome(disciplina), f)))
            manifest.materiais.push({ chave: `${disciplina}/${f}`, disciplina, curso: cursoNome, titulo: f.replace(/\.pdf$/i, ''), tipo: 'pdf', arquivo: path.posix.join(limpaNome(disciplina), f) });
          continue; } catch (e) { console.log('      (não consegui extrair o ZIP; fica salvo como está)'); } }
      manifest.materiais.push({ chave: `${disciplina}/${nome}`, disciplina, curso: cursoNome, titulo: nome.replace(/\.(pdf|zip)$/i, ''), tipo: /\.zip$/i.test(nome) ? 'zip' : 'pdf', arquivo: path.relative(SAIDA, arq).split(path.sep).join('/') }); } catch (e) {} }
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    try { await page.keyboard.press('Escape'); } catch {}
    return n;
  }

  // Plataforma nova: na página da disciplina → "Conhecer o LDI" (Livro Digital) → "Baixar curso em PDF ou vídeo".
  let diagLdiFeito = 0;
  async function baixarPeloLDI(disciplina, cursoNome) {
    // Clica por texto/aria-label mesmo que o botão esteja recolhido (barra lateral fechada): tenta clique normal, depois via JavaScript.
    const clicar = async (re, timeout = 12000) => {
      const fim = Date.now() + timeout;
      while (Date.now() < fim) {
        const ok = await page.evaluate(src => {
          const r = new RegExp(src, 'i');
          const el = [...document.querySelectorAll('button, a, [role="button"], [role="menuitem"]')].find(b => r.test(((b.innerText || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.title || '')).replace(/\s+/g, ' ')));
          if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true;
        }, re.source);
        if (ok) return true;
        await page.waitForTimeout(700);
      }
      return false;
    };
    const urlDisc = page.url();
    // Fecha o aviso de boas-vindas do LDI ("Conheça o seu novo jeito de estudar") e pesquisas, se aparecerem.
    const fecharAvisos = async () => {
      for (let i = 0; i < 3; i++) {
        const fechou = await page.evaluate(() => {
          let agiu = false;
          for (const l of document.querySelectorAll('label, button, [role="checkbox"]')) if (/n[aã]o mostrar novamente/i.test(l.innerText || '')) { l.click(); agiu = true; }
          for (const b of document.querySelectorAll('button, [role="button"], div')) { const t = (b.innerText || b.getAttribute('aria-label') || '').trim(); if (/^(fechar|close|close survey|dispensar|agora n[aã]o|entendi|ok)$/i.test(t) && b.offsetParent !== null) { b.click(); agiu = true; break; } }
          return agiu;
        }).catch(() => false);
        if (!fechou) break; await page.waitForTimeout(700);
      }
    };
    await fecharAvisos();
    const dialogosAntes = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="dialog" i], [class*="drawer" i]')].map(m => (m.innerText || '').slice(0, 80)));
    if (!(await clicar(/baixar curso|baixar em pdf|baixar pdf|download do curso/i, 15000))) {
      if (diagLdiFeito < 2) { diagLdiFeito++; await salvarInspecao(page, `ldi-${limpaNome(disciplina).slice(0, 25)}`); console.log(`      (LDI aberto, mas não achei "Baixar curso em PDF ou vídeo" — foto inspecao-ldi-….png)`); }
      return 0;
    }
    await page.waitForTimeout(2500);
    await fecharAvisos();                       // o aviso de boas-vindas reaparece sobre a tela "Baixar curso"
    await fecharAvisoX();
    // Tela "Baixar curso": lista de aulas, cada uma com botões "COMPLETO" e "SEM SOLUÇÕES". Baixa o COMPLETO de cada aula.
    const nLista = await baixarListaDeAulas(disciplina, cursoNome);
    if (nLista) { try { await page.keyboard.press('Escape'); } catch {} for (const p2 of ctx.pages()) if (p2 !== page) { try { await p2.close(); } catch {} } try { await page.goto(urlDisc, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); } catch {} return nLista; }
    const downloads = []; const onDl = d => downloads.push(d); page.on('download', onDl);
    // o que a janela de download mostra
    const modal = await page.evaluate(antes => {
      let cands = [...document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="dialog" i], [class*="drawer" i], [class*="sheet" i]')]
        .filter(m => (m.innerText || '').trim() && !/conhe[çc]a o seu novo jeito|guia r[aá]pido/i.test(m.innerText));
      const novos = cands.filter(m => !antes.includes((m.innerText || '').slice(0, 80)));
      if (novos.length) cands = novos;
      const m = cands.sort((a, b) => b.innerText.length - a.innerText.length)[0] || document.body;
      return { texto: (m.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 800),
        itens: [...m.querySelectorAll('a[href], button, [role="button"], [role="menuitem"], [role="tab"], [role="radio"], [role="checkbox"], input, label')].map((el, i) => { el.setAttribute('data-rr-mi', String(i)); return { i, tag: el.tagName.toLowerCase(), type: el.type || '', t: (el.innerText || el.getAttribute('aria-label') || el.title || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 70), href: el.href || '' }; }).filter(x => x.t || x.href) };
    }, dialogosAntes);
    if (diagLdiFeito < 2) { diagLdiFeito++; await salvarInspecao(page, `download-${limpaNome(disciplina).slice(0, 25)}`);
      console.log(`      ⬇ Janela "Baixar curso": ${modal.texto.slice(0, 400)}`); modal.itens.slice(0, 60).forEach(x => console.log(`         · ${x.tag}${x.type ? '[' + x.type + ']' : ''} | ${x.t} | ${x.href}`)); }
    let n = 0;
    const clicarItem = async re => { const x = modal.itens.find(x => re.test(x.t)); if (!x) return false; try { await (await page.$(`[data-rr-mi="${x.i}"]`)).click({ timeout: 2500 }); await page.waitForTimeout(1200); return true; } catch { return false; } };
    // 1) links diretos para PDF dentro da janela
    for (const x of modal.itens) if (x.href && /\.pdf(\?|$)/i.test(x.href)) { try { const arq = path.join(SAIDA, limpaNome(disciplina), limpaNome(x.t || 'arquivo') + '.pdf'); fs.mkdirSync(path.dirname(arq), { recursive: true }); if (!fs.existsSync(arq)) { const r = await page.request.get(x.href); if (r.ok()) { fs.writeFileSync(arq, await r.body()); n++; console.log('      ✔', path.basename(arq)); } } } catch {} }
    // 2) fluxo com seleção: PDF → selecionar todos → baixar
    await clicarItem(/^pdf$|em pdf|\bpdf\b/i);
    await clicarItem(/selecionar tod|marcar tod|^todos$|todas as aulas/i);
    await clicarItem(/^baixar$|^download$|baixar selecionad|baixar agora|confirmar|gerar/i);
    // espera os downloads (ZIP ou vários PDFs): enquanto chegarem novos, continua esperando
    let ultimo = downloads.length, quieto = 0;
    for (let t = 0; t < 120 && quieto < 4; t++) { await page.waitForTimeout(1000); if (downloads.length !== ultimo) { ultimo = downloads.length; quieto = 0; } else if (downloads.length) quieto++; else if (t > 20) break; }
    page.off('download', onDl);
    for (const d of downloads) { try { const nome = d.suggestedFilename() || 'arquivo'; const dest = path.join(SAIDA, limpaNome(disciplina)); const arq = path.join(dest, limpaNome(nome)); fs.mkdirSync(dest, { recursive: true }); await d.saveAs(arq); n++; console.log('      ✔', nome);
      if (/\.zip$/i.test(nome)) { try { const { execSync } = require('child_process');
          if (process.platform === 'win32') execSync(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${arq.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force"`, { stdio: 'ignore' }); else execSync(`unzip -o -q "${arq}" -d "${dest}"`, { stdio: 'ignore' });
          fs.unlinkSync(arq); console.log('      ✔ ZIP extraído'); } catch { console.log('      (não consegui extrair o ZIP; fica salvo como está)'); } }
      for (const f of fs.readdirSync(dest)) if (/\.(pdf|mp4|mp3)$/i.test(f) && !manifest.materiais.some(m => m.arquivo === path.posix.join(limpaNome(disciplina), f)))
        manifest.materiais.push({ chave: `${disciplina}/${f}`, disciplina, curso: cursoNome, titulo: f.replace(/\.(pdf|mp4|mp3)$/i, ''), tipo: /\.mp4$/i.test(f) ? 'video' : /\.mp3$/i.test(f) ? 'audio' : tipoDeNome(f), arquivo: path.posix.join(limpaNome(disciplina), f) });
    } catch (e) {} }
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
    try { await page.keyboard.press('Escape'); } catch {}
    for (const p2 of ctx.pages()) if (p2 !== page) { try { await p2.close(); } catch {} }   // fecha abas extras (guia do LDI etc.)
    try { await page.goto(urlDisc, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); } catch {}
    return n;
  }
  // Fecha o aviso de boas-vindas pelo "X" (botão sem texto no canto do diálogo) e marca "Não mostrar novamente".
  async function fecharAvisoX() {
    for (let i = 0; i < 3; i++) {
      const fechou = await page.evaluate(() => {
        const dlg = [...document.querySelectorAll('[role="dialog"], [class*="modal" i], [class*="dialog" i]')].find(m => /conhe[çc]a o seu novo jeito|guia r[aá]pido/i.test(m.innerText || ''));
        if (!dlg) return false;
        const cb = [...dlg.querySelectorAll('input[type="checkbox"], [role="checkbox"], label')].find(l => /n[aã]o mostrar/i.test((l.innerText || '') + (l.parentElement?.innerText || ''))); if (cb) cb.click();
        const x = [...dlg.querySelectorAll('button, [role="button"]')].find(b => /^(×|✕|x|fechar|close)$/i.test((b.innerText || '').trim()) || /fechar|close/i.test(b.getAttribute('aria-label') || ''));
        if (x) { x.click(); return true; }
        const btns = [...dlg.querySelectorAll('button')]; if (btns.length) { btns[0].click(); return true; }   // em geral o X é o primeiro botão
        return false;
      }).catch(() => false);
      await page.waitForTimeout(600);
      if (!fechou) break;
    }
  }

  // Lista "Baixar curso": cada linha tem o título da aula + botões COMPLETO / SEM SOLUÇÕES. Baixa o COMPLETO de cada uma.
  let diagListaFeito = 0;
  async function baixarListaDeAulas(disciplina, cursoNome) {
    // rola para carregar toda a lista
    for (let i = 0; i < 8; i++) { try { await page.mouse.wheel(0, 3000); } catch {} await page.waitForTimeout(300); }
    try { await page.evaluate(() => window.scrollTo(0, 0)); } catch {}
    const linhas = await page.evaluate(() => {
      const limpa = t => (t || '').replace(/\s+/g, ' ').trim();
      const out = []; let k = 0;
      const botoes = [...document.querySelectorAll('button, a, [role="button"]')].filter(b => /^\s*completo\s*$/i.test(limpa(b.innerText)) );
      for (const b of botoes) {
        let row = b; let semSol = null;
        for (let i = 0; i < 6 && row && row !== document.body; i++, row = row.parentElement) {
          semSol = [...row.querySelectorAll('button, a, [role="button"]')].find(x => /sem solu/i.test(limpa(x.innerText)));
          if (semSol) break;
        }
        if (!semSol || !row) continue;                                   // é o botão COMPLETO do cabeçalho (alternador), não da lista
        // título = texto da linha sem os botões e sem as legendas deles
        const clone = row.cloneNode(true);
        clone.querySelectorAll('button, a, [role="button"], input, small').forEach(x => x.remove());
        let titulo = limpa(clone.textContent).replace(/(completo|sem solu[çc][õo]es|com solu[çc][aã]o e coment[aá]rio|gabarito ao final)/gi, ' ').replace(/\s+/g, ' ').trim();
        if (!titulo) titulo = 'Aula ' + (k + 1);
        b.setAttribute('data-rr-dlrow', String(k)); out.push({ k, titulo: titulo.slice(0, 120) }); k++;
      }
      return out;
    });
    if (!linhas.length) { if (diagListaFeito < 2) { diagListaFeito++; await salvarInspecao(page, `baixar-curso-${limpaNome(disciplina).slice(0, 25)}`); console.log('      (tela "Baixar curso" sem linhas COMPLETO/SEM SOLUÇÕES reconhecíveis — foto inspecao-baixar-curso-….png)'); } return 0; }
    console.log(`      ⬇ ${linhas.length} aula(s) na tela "Baixar curso"`);
    const dest = path.join(SAIDA, limpaNome(disciplina)); fs.mkdirSync(dest, { recursive: true });
    let n = 0;
    for (const l of linhas) {
      const arq = path.join(dest, limpaNome(l.titulo) + '.pdf');
      const chave = `${disciplina}/${l.titulo}`;
      if (fs.existsSync(arq) || manifest.materiais.some(m => m.chave === chave)) continue;
      const btn = await page.$(`[data-rr-dlrow="${l.k}"]`); if (!btn) continue;
      try {
        await btn.scrollIntoViewIfNeeded();
        const [dl, novaAba] = await Promise.all([
          page.waitForEvent('download', { timeout: 60000 }).catch(() => null),
          ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null),
          btn.click({ timeout: 3000 }),
        ]);
        if (dl) { await dl.saveAs(arq); }
        else if (novaAba) {        // abriu o PDF numa aba: baixa pela URL com os cookies da sessão
          try { await novaAba.waitForLoadState('domcontentloaded', { timeout: 15000 }); } catch {}
          const u = novaAba.url(); let ok = false;
          if (/^https?:/.test(u)) { const r = await page.request.get(u).catch(() => null); if (r && r.ok() && /pdf|octet/i.test(r.headers()['content-type'] || '')) { fs.writeFileSync(arq, await r.body()); ok = true; } }
          try { await novaAba.close(); } catch {}
          if (!ok) { console.log('      ✖', l.titulo.slice(0, 70), '- abriu em aba mas não veio PDF:', u.slice(0, 80)); continue; }
        } else { console.log('      ✖', l.titulo.slice(0, 70), '- nenhum download iniciou'); continue; }
        n++; cont.pdf = (cont.pdf || 0) + 1; console.log('      ✔', l.titulo.slice(0, 80));
        manifest.materiais.push({ chave, disciplina, curso: cursoNome, titulo: l.titulo, tipo: 'pdf', arquivo: path.relative(SAIDA, arq).split(path.sep).join('/') });
        fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
      } catch (e) { console.log('      ✖', l.titulo.slice(0, 70), '-', e.message.slice(0, 60)); }
      await fecharAvisoX();
    }
    return n;
  }

  const tipoDeNome = f => /resum|simplificad/i.test(f) ? 'resumo' : /mapa/i.test(f) ? 'mapa' : /slide/i.test(f) ? 'slides' : /quest|exerc/i.test(f) ? 'questoes' : 'pdf';

  // Pacote → disciplinas → aulas → materiais (até 3 níveis). `rotulo` = nome do nível acima.
  async function explorar(url, nivel, cursoNome, disciplina, aula) {
    if (visitadas.has(url) || nivel > 3 || !HOST_OK.test(hostDe(url))) return; visitadas.add(url);
    if (page.url() !== url) { try { await page.goto(url, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); } catch { return; } }
    try { await page.waitForFunction(() => document.body.innerText.trim().length > 200, null, { timeout: 6000 }); } catch {}
    for (const b of await page.$$('button:has-text("Ver aulas"), button:has-text("Expandir"), button:has-text("Aulas"), [aria-expanded="false"]')) { try { await b.click({ timeout: 500 }); } catch {} }
    const ind = '   '.repeat(nivel);
    if (nivel === 1 && !inspecionar) {
      let k = 0; try { k = await baixarPeloLDI(disciplina || disciplinaDe(cursoNome), cursoNome); } catch (e) { console.log(`${ind}   (LDI: ${e.message.slice(0, 80)})`); }
      if (k) { cont.pdf = (cont.pdf || 0) + k; console.log(`${ind}   ${k} arquivo(s) pelo Livro Digital`); return; }
    }
    const itens = await materiaisDaPagina();
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
    const urlsVistas = new Set(itens.map(m => m.url));
    let n = 0;
    for (const c of cartoes) {
      n++; if (nivel <= 1) process.stdout.write(`${ind}   (${n}/${cartoes.length}) ${c.nome.slice(0, 70)}\r`);
      if (nivel === 0 && !inspecionar) { try { const k = await baixarPeloIcone(c, disciplinaDe(c.nome), cursoNome); if (k) { cont.pdf = (cont.pdf || 0) + k; } await listarCartoes(page); } catch (e) {} }
      if (page.url() !== base) { try { await page.goto(base, { waitUntil: 'domcontentloaded' }); await esperarPagina(page); await listarCartoes(page); } catch { continue; } }
      let dest = null; try { dest = await abrirCartao(page, c, base); } catch (e) { dest = null; }
      if (!dest || dest === base) {
        // Não navegou: em muitas páginas o clique EXPANDE a aula ali mesmo e revela os botões de material.
        if (nivel >= 1) {
          try { await page.waitForTimeout(600); } catch {}
          const novos = (await materiaisDaPagina()).filter(m => !urlsVistas.has(m.url));
          if (!novos.length && nivel === 1 && n <= 2 && inspecoesFeitas < 3) {   // nada apareceu: registra o que a página mostra para diagnóstico
            inspecoesFeitas++;
            const nomeArq = `aula-${limpaNome(disciplina || cursoNome).slice(0, 25)}-${n}`;
            await salvarInspecao(page, nomeArq);
            const vistos = await page.evaluate(() => { const seen = new Set(); const out = [];
              const ctrl = /^(tocar( v[ií]deo)?|pausar|voltar \d+ segundos|avan[çc]ar \d+ segundos|mudo|legendas|picture-in-picture|configura[çc][õo]es do v[ií]deo|tela cheia|alternar modo escuro|notifica[çc][õo]es)$/i;
              for (const el of document.querySelectorAll('a[href], button, [role="button"], [role="menuitem"]')) {
                const t = (el.innerText || el.getAttribute('aria-label') || el.title || '').replace(/\s+/g, ' ').trim();
                if (!t || ctrl.test(t)) continue;
                const k = el.tagName.toLowerCase() + '|' + t.toLowerCase().slice(0, 60) + '|' + (el.href || ''); if (seen.has(k)) continue; seen.add(k);
                out.push(`${el.tagName.toLowerCase()} | ${t.slice(0, 60)} | ${el.href || el.getAttribute('data-href') || ''}`);
              } return out.slice(0, 80); });
            process.stdout.write(' '.repeat(100) + '\r');
            console.log(`${ind}   ⚠ Não achei material ao clicar em "${c.nome.slice(0, 60)}". Foto salva: inspecao-${nomeArq}.png`);
            console.log(`${ind}     Botões/links visíveis na página (${vistos.length}):`);
            vistos.forEach(v => console.log(`${ind}       · ${v}`));
          }
          if (novos.length) {
            novos.forEach(m => urlsVistas.add(m.url));
            process.stdout.write(' '.repeat(100) + '\r');
            console.log(`${ind}   📖 ${c.nome.slice(0, 80)}  (${novos.length} item(ns))`);
            if (inspecionar) novos.forEach(m => console.log(`${ind}      - [${m.c.tipo}] ${m.rotulo} | ${m.url}`));
            else await baixarItens(novos, disciplina || disciplinaDe(cursoNome), c.nome, cursoNome);
          }
        }
        continue;
      }
      if (visitadas.has(dest)) continue;
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
