// Generates self-contained HTML doc sites from markdown chapters.
// Builds the main tutorial (tutorial/) and the "aller plus loin" set (tutorial/aller-plus-loin/).
// Usage: node tutorial/build-tutorial.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const here = dirname(fileURLToPath(import.meta.url))
const HLJS = '11.9.0'

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').trim()
}

const CSS = `
:root{
  --bg:#0b1020;--panel:#121a2e;--panel-2:#0e1626;--border:#26324a;--text:#e6ebf5;
  --muted:#94a3b8;--accent:#6366f1;--accent-2:#818cf8;--code-bg:#0d1117;
}
:root[data-theme='light']{
  --bg:#f6f7fb;--panel:#ffffff;--panel-2:#f1f3f9;--border:#e2e8f0;--text:#0f172a;
  --muted:#64748b;--accent:#4f46e5;--accent-2:#4338ca;--code-bg:#0d1117;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);display:flex;min-height:100vh}
a{color:var(--accent-2)}
/* Sidebar */
.sidebar{width:300px;flex:0 0 300px;background:var(--panel-2);border-right:1px solid var(--border);height:100vh;position:sticky;top:0;overflow-y:auto;overflow-x:hidden;padding:18px 14px}
/* Subtle, theme-integrated scrollbars */
.sidebar,.main,pre{scrollbar-width:thin;scrollbar-color:var(--border) transparent}
.sidebar::-webkit-scrollbar,.main::-webkit-scrollbar{width:10px;height:10px}
.sidebar::-webkit-scrollbar-thumb,.main::-webkit-scrollbar-thumb{background:var(--border);border-radius:999px;border:3px solid transparent;background-clip:padding-box}
.sidebar::-webkit-scrollbar-thumb:hover,.main::-webkit-scrollbar-thumb:hover{background:var(--muted);background-clip:padding-box;border:3px solid transparent}
.sidebar::-webkit-scrollbar-track,.main::-webkit-scrollbar-track{background:transparent}
pre::-webkit-scrollbar{height:10px;width:10px}
pre::-webkit-scrollbar-thumb{background:#30363d;border-radius:999px;border:3px solid transparent;background-clip:padding-box}
pre::-webkit-scrollbar-thumb:hover{background:#444c56;background-clip:padding-box}
pre::-webkit-scrollbar-track{background:transparent}
.brand{font-weight:700;font-size:1.05rem;padding:6px 10px 14px;display:flex;align-items:center;gap:8px}
.nav-back{display:block;text-decoration:none;color:var(--muted);font-size:.82rem;padding:6px 10px;margin-bottom:8px;border:1px solid var(--border);border-radius:8px}
.nav-back:hover{color:var(--text);border-color:var(--accent)}
/* Search box */
.nav-search-wrap{position:relative;margin:0 6px 12px}
.nav-search{width:100%;padding:8px 30px 8px 32px;background:var(--panel);border:1px solid var(--border);border-radius:9px;color:var(--text);font-size:.85rem}
.nav-search:focus{outline:none;border-color:var(--accent)}
.nav-search-wrap::before{content:'🔎';position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:.8rem;opacity:.7;pointer-events:none}
.nav-clear{position:absolute;right:6px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;font-size:1rem;line-height:1;padding:2px 6px;display:none}
.nav-search-wrap.has-value .nav-clear{display:block}
.nav-empty{display:none;color:var(--muted);font-size:.82rem;padding:8px 12px}
.nav.searching .nav-empty.show{display:block}
.nav.searching .nav-subs{display:block}
mark{background:color-mix(in srgb,var(--accent) 40%,transparent);color:inherit;border-radius:3px;padding:0 1px}
.brand .dot{width:10px;height:10px;border-radius:50%;background:var(--accent)}
.nav-group{margin-bottom:4px}
.nav-chapter{display:block;text-decoration:none;color:var(--text);padding:8px 10px;border-radius:8px;font-weight:600;font-size:.9rem}
.nav-chapter:hover{background:var(--panel)}
.nav-chapter.active{background:var(--accent);color:#fff}
.nav-subs{margin:2px 0 6px 8px;border-left:1px solid var(--border);padding-left:6px;display:none}
.nav-group.active .nav-subs{display:block}
.nav-sub{display:block;text-decoration:none;color:var(--muted);padding:5px 10px;border-radius:6px;font-size:.82rem}
.nav-sub:hover{color:var(--text);background:var(--panel)}
.nav-sub.current{color:var(--accent-2);font-weight:600}
/* Main */
.main{flex:1;min-width:0;display:flex;flex-direction:column;height:100vh;overflow:auto}
.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 28px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(6px);border-bottom:1px solid var(--border)}
.topbar .menu{display:none}
.iconbtn{background:transparent;border:1px solid var(--border);color:var(--text);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:.9rem;text-decoration:none;display:inline-block}
.iconbtn:hover{border-color:var(--accent)}
.content{padding:24px 36px 64px;max-width:920px;width:100%;margin:0 auto}
.chapter{display:none;animation:fade .25s ease}
@keyframes fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
/* Home / table of contents */
.home-hero{padding:8px 0 6px}
.home-hero .badge{display:inline-block;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent-2);border:1px solid var(--accent);border-radius:999px;padding:3px 12px;font-size:.74rem;font-weight:600}
.home-hero h1{border:none;margin:.4em 0 .2em;font-size:2rem}
.home-sub{color:var(--muted);font-size:1rem;max-width:680px}
.toc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin-top:24px}
.toc-card{display:flex;gap:14px;align-items:flex-start;text-decoration:none;color:var(--text);background:var(--panel);border:1px solid var(--border);border-radius:14px;padding:18px;transition:border-color .15s,transform .15s,box-shadow .15s}
.toc-card:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.18)}
.toc-num{flex:0 0 auto;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--accent);color:#fff;font-weight:700}
.toc-body{display:flex;flex-direction:column;gap:4px;min-width:0}
.toc-title{font-weight:600;font-size:.98rem}
.toc-blurb{color:var(--muted);font-size:.83rem;line-height:1.45}
.nav-home{margin-bottom:8px}
h1,h2,h3{line-height:1.25;scroll-margin-top:70px}
h1{font-size:1.7rem;margin:.2em 0 .6em;border-bottom:1px solid var(--border);padding-bottom:.3em}
h2{font-size:1.3rem;margin:1.6em 0 .5em}
h3{font-size:1.08rem;margin:1.3em 0 .4em}
p,li{line-height:1.65}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.86em;background:color-mix(in srgb,var(--accent) 16%,transparent);padding:.1em .35em;border-radius:5px}
pre{position:relative;background:var(--code-bg);border:1px solid var(--border);border-radius:12px;padding:16px 16px;overflow:auto}
pre code{background:none;padding:0;font-size:.84rem;color:#e6edf3}
.copy-btn{position:absolute;top:8px;right:8px;background:#1f2937;color:#e5e7eb;border:1px solid #374151;border-radius:7px;padding:4px 10px;font-size:.74rem;cursor:pointer;opacity:.55;transition:opacity .15s}
pre:hover .copy-btn,.copy-btn:focus-visible{opacity:1}
.copy-btn:hover{background:#374151}
blockquote{margin:1em 0;padding:12px 16px;border-left:4px solid var(--accent);background:var(--panel);border-radius:0 10px 10px 0;color:var(--text)}
blockquote p{margin:.3em 0}
table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.9rem}
th,td{border:1px solid var(--border);padding:8px 10px;text-align:left}
th{background:var(--panel)}
tr:nth-child(even) td{background:color-mix(in srgb,var(--panel) 50%,transparent)}
hr{border:none;border-top:1px solid var(--border);margin:2em 0}
.pager{display:flex;justify-content:space-between;gap:12px;margin-top:40px;border-top:1px solid var(--border);padding-top:20px}
.pager button{background:var(--panel);border:1px solid var(--border);color:var(--text);border-radius:10px;padding:12px 16px;cursor:pointer;font-size:.9rem;max-width:48%;text-align:left}
.pager button:hover:not(:disabled){border-color:var(--accent)}
.pager button:disabled{opacity:.4;cursor:not-allowed}
.pager .lbl{display:block;font-size:.72rem;color:var(--muted)}
.pager .ttl{display:block;font-weight:600}
.pager .next{text-align:right}
@media (max-width:860px){
  .sidebar{position:fixed;left:0;top:0;z-index:20;transform:translateX(-100%);transition:transform .25s}
  body.nav-open .sidebar{transform:translateX(0)}
  .topbar .menu{display:inline-block}
}
`

const JS = `
(function(){
  var root=document.documentElement;
  var chapters=[].slice.call(document.querySelectorAll('.chapter'));
  var realCount=document.querySelectorAll('.chapter:not(.home)').length;
  var chapterLinks=[].slice.call(document.querySelectorAll('.nav-chapter'));
  var groups=[].slice.call(document.querySelectorAll('.nav-group'));
  var current=0;

  function setActive(idx){
    chapterLinks.forEach(function(a){
      var on=Number(a.getAttribute('data-chapter'))===idx;
      a.classList.toggle('active',on);
    });
    groups.forEach(function(g){
      var a=g.querySelector('.nav-chapter');
      g.classList.toggle('active', a && Number(a.getAttribute('data-chapter'))===idx);
    });
    var hash=location.hash.replace('#','');
    [].slice.call(document.querySelectorAll('.nav-sub')).forEach(function(a){
      a.classList.toggle('current', a.getAttribute('href')==='#'+hash);
    });
  }

  function updatePager(idx){
    var prev=document.getElementById('prevBtn'), next=document.getElementById('nextBtn');
    prev.disabled = idx<=-1; next.disabled = idx>=realCount-1;
    prev.dataset.idx = idx-1; next.dataset.idx = idx+1;
    prev.querySelector('.ttl').textContent = idx>-1 ? chapterTitle(idx-1) : '';
    next.querySelector('.ttl').textContent = idx<realCount-1 ? chapterTitle(idx+1) : '';
  }

  function chapterTitle(idx){
    if(idx===-1) return 'Accueil';
    var a=document.querySelector('.nav-chapter[data-chapter="'+idx+'"]');
    return a? a.textContent : '';
  }

  function show(idx, targetId){
    current=idx;
    chapters.forEach(function(c){
      c.style.display = (Number(c.getAttribute('data-index'))===idx)?'block':'none';
    });
    setActive(idx); updatePager(idx);
    document.body.classList.remove('nav-open');
    var main=document.querySelector('.main');
    if(targetId){
      var el=document.getElementById(targetId);
      if(el){ el.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    }
    if(main){ main.scrollTo({top:0,behavior:'smooth'}); }
  }

  function chapterOf(id){
    var el=document.getElementById(id);
    if(!el) return null;
    var sec=el.closest('.chapter');
    return sec? Number(sec.getAttribute('data-index')) : null;
  }

  function route(){
    var hash=location.hash.replace('#','');
    if(!hash||hash==='home'){ show(-1,null); return; }
    var m=hash.match(/^chapter-(\\d+)$/);
    if(m){ show(Number(m[1]),null); return; }
    var idx=chapterOf(hash);
    show(idx===null?-1:idx, idx===null?null:hash);
  }

  window.addEventListener('hashchange', route);

  document.getElementById('prevBtn').addEventListener('click', function(){
    var i=Number(this.dataset.idx); if(i>=-1){ location.hash = i===-1?'#home':'#chapter-'+i; }
  });
  document.getElementById('nextBtn').addEventListener('click', function(){
    var i=Number(this.dataset.idx); if(i<realCount){ location.hash = i===-1?'#home':'#chapter-'+i; }
  });
  document.getElementById('menuBtn').addEventListener('click', function(){
    document.body.classList.toggle('nav-open');
  });

  // Theme toggle
  var themeBtn=document.getElementById('themeBtn');
  function syncThemeLabel(){ themeBtn.textContent = root.getAttribute('data-theme')==='light'?'🌙 Sombre':'☀️ Clair'; }
  syncThemeLabel();
  themeBtn.addEventListener('click', function(){
    var t=root.getAttribute('data-theme')==='light'?'dark':'light';
    root.setAttribute('data-theme',t);
    try{ localStorage.setItem('tuto-theme',t); }catch(e){}
    syncThemeLabel();
  });

  // Copy buttons
  [].slice.call(document.querySelectorAll('pre')).forEach(function(pre){
    var btn=document.createElement('button');
    btn.className='copy-btn'; btn.type='button'; btn.textContent='Copier';
    btn.addEventListener('click', function(){
      var code=pre.querySelector('code');
      var text=code? code.innerText : pre.innerText;
      navigator.clipboard.writeText(text).then(function(){
        btn.textContent='Copié !'; setTimeout(function(){btn.textContent='Copier';},1500);
      }).catch(function(){ btn.textContent='Échec'; });
    });
    pre.appendChild(btn);
  });

  // Sidebar search / filter (chapters + sub-sections), with match highlighting.
  var search=document.getElementById('navSearch');
  var clearBtn=document.getElementById('navClear');
  var navEl=document.querySelector('.nav');
  var emptyEl=document.querySelector('.nav-empty');
  var homeLink=document.querySelector('.nav-home');
  var searchWrap=document.querySelector('.nav-search-wrap');
  function orig(el){ return el.dataset.orig!==undefined?el.dataset.orig:el.textContent; }
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function hl(el,q){
    if(el.dataset.orig===undefined) el.dataset.orig=el.textContent;
    var t=el.dataset.orig;
    if(!q){ el.textContent=t; return; }
    var i=t.toLowerCase().indexOf(q);
    if(i<0){ el.textContent=t; return; }
    el.innerHTML=esc(t.slice(0,i))+'<mark>'+esc(t.slice(i,i+q.length))+'</mark>'+esc(t.slice(i+q.length));
  }
  function filter(){
    var q=search.value.trim().toLowerCase();
    var on=q.length>0;
    navEl.classList.toggle('searching',on);
    searchWrap.classList.toggle('has-value', search.value.length>0);
    var visible=0;
    groups.forEach(function(g){
      var chap=g.querySelector('.nav-chapter');
      var chapMatch=orig(chap).toLowerCase().indexOf(q)>=0;
      var subs=[].slice.call(g.querySelectorAll('.nav-sub'));
      var anySub=false;
      subs.forEach(function(s){
        var m=!on||chapMatch||orig(s).toLowerCase().indexOf(q)>=0;
        s.style.display=m?'':'none';
        hl(s,(on&&!chapMatch&&m)?q:'');
        if(m&&on) anySub=true;
      });
      var show=!on||chapMatch||anySub;
      g.style.display=show?'':'none';
      hl(chap,(on&&chapMatch)?q:'');
      if(show) visible++;
    });
    if(homeLink){
      var hs=!on||'accueil'.indexOf(q)>=0;
      homeLink.style.display=hs?'':'none';
      if(hs&&on) visible++;
    }
    emptyEl.classList.toggle('show', on&&visible===0);
  }
  if(search){
    search.addEventListener('input', filter);
    search.addEventListener('keydown', function(e){ if(e.key==='Escape'){ search.value=''; filter(); } });
    clearBtn.addEventListener('click', function(){ search.value=''; filter(); search.focus(); });
  }

  // Syntax highlighting (map tsx/jsx, then highlight)
  if(window.hljs){
    [].slice.call(document.querySelectorAll('code[class*="language-"]')).forEach(function(code){
      code.className=code.className.replace('language-tsx','language-typescript').replace('language-jsx','language-javascript');
    });
    try{ window.hljs.highlightAll(); }catch(e){}
  }

  route();
})();
`

function buildSite(opts) {
  const { dir, out } = opts
  const files = readdirSync(dir)
    .filter((f) => /^\d+-.*\.md$/.test(f))
    .sort()

  const chapters = files.map((file, index) => {
    const md = readFileSync(join(dir, file), 'utf8')
    let html = marked.parse(md)
    const headings = []
    const seen = new Set()

    html = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
      const text = stripTags(inner)
      let slug = `c${index}-${slugify(text)}`
      while (seen.has(slug)) slug += '-x'
      seen.add(slug)
      headings.push({ level: Number(level), text, id: slug })
      return `<h${level} id="${slug}">${inner}</h${level}>`
    })

    const h1 = headings.find((h) => h.level === 1)
    const pm = html.match(/<p>([\s\S]*?)<\/p>/)
    let blurb = pm ? stripTags(pm[1]) : ''
    if (blurb.length > 150)
      blurb = blurb.slice(0, 150).replace(/\s+\S*$/, '') + '…'
    const cleanTitle = (h1 ? h1.text : file)
      .replace(/^\d+\.\s*/, '')
      .replace(/\.md$/, '')
    return {
      index,
      title: h1 ? h1.text : file.replace(/\.md$/, ''),
      cleanTitle,
      blurb,
      anchor: h1 ? h1.id : `chapter-${index}`,
      subs: headings.filter((h) => h.level === 2),
      html,
    }
  })

  const navHomeHtml = `<a class="nav-chapter nav-home" data-chapter="-1" href="#home">🏠 Accueil</a>`
  const navHtml = chapters
    .map((c) => {
      const subs = c.subs
        .map(
          (s) =>
            `<a class="nav-sub" data-chapter="${c.index}" href="#${s.id}">${s.text}</a>`,
        )
        .join('')
      return (
        `<div class="nav-group">` +
        `<a class="nav-chapter" data-chapter="${c.index}" href="#${c.anchor}">${c.title}</a>` +
        (subs ? `<div class="nav-subs">${subs}</div>` : '') +
        `</div>`
      )
    })
    .join('')

  const tocCards = chapters
    .map(
      (c) =>
        `<a class="toc-card" href="#${c.anchor}">` +
        `<span class="toc-num">${c.index + 1}</span>` +
        `<span class="toc-body"><span class="toc-title">${c.cleanTitle}</span>` +
        `<span class="toc-blurb">${c.blurb}</span></span>` +
        `</a>`,
    )
    .join('')

  const homeHtml =
    `<section class="chapter home" id="home" data-index="-1">` +
    `<div class="home-hero">` +
    `<span class="badge">${opts.heroBadge}</span>` +
    `<h1>${opts.heroTitle}</h1>` +
    `<p class="home-sub">${opts.heroSub}</p>` +
    `</div>` +
    `<div class="toc-grid">${tocCards}</div>` +
    `</section>`

  const chaptersHtml =
    homeHtml +
    '\n' +
    chapters
      .map(
        (c) =>
          `<section class="chapter" id="chapter-${c.index}" data-index="${c.index}">${c.html}</section>`,
      )
      .join('\n')

  const backHtml = opts.backHref
    ? `<a class="nav-back" href="${opts.backHref}">← ${opts.backLabel}</a>`
    : ''

  const html = `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.docTitle}</title>
<script>(function(){try{var t=localStorage.getItem('tuto-theme');if(t){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${HLJS}/build/styles/atom-one-dark.min.css">
<style>${CSS}</style>
</head>
<body>
<aside class="sidebar">
  <div class="brand"><span class="dot"></span> ${opts.brand}</div>
  ${backHtml}
  <div class="nav-search-wrap">
    <input id="navSearch" class="nav-search" type="search" placeholder="Rechercher…" aria-label="Rechercher" autocomplete="off">
    <button id="navClear" class="nav-clear" type="button" aria-label="Effacer">×</button>
  </div>
  <nav class="nav">${navHomeHtml}${navHtml}<div class="nav-empty">Aucun résultat.</div></nav>
</aside>
<div class="main">
  <div class="topbar">
    <button class="iconbtn menu" id="menuBtn">☰ Sommaire</button>
    <div style="flex:1"></div>
    <button class="iconbtn" id="themeBtn">☀️ Clair</button>
  </div>
  <div class="content">
    ${chaptersHtml}
    <nav class="pager">
      <button id="prevBtn"><span class="lbl">← Précédent</span><span class="ttl"></span></button>
      <button id="nextBtn" class="next"><span class="lbl">Suivant →</span><span class="ttl"></span></button>
    </nav>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@${HLJS}/build/highlight.min.js"></script>
<script>${JS}</script>
</body>
</html>`

  writeFileSync(out, html, 'utf8')
  console.log(
    'Wrote ' + out + ' (' + chapters.length + ' chapters, ' + html.length + ' bytes)',
  )
}

// 1) Main tutorial
buildSite({
  dir: here,
  out: join(here, 'index.html'),
  brand: 'Tutoriel Sinequa',
  docTitle: 'Tutoriel — App Sinequa avec TanStack Start',
  heroBadge: 'Tutoriel',
  heroTitle: 'Construire une application Sinequa avec TanStack Start',
  heroSub:
    "De la création du projet à l'authentification multi-méthode, aux routes protégées, à la recherche paginée, à la preview de documents et au thème clair/sombre. Choisissez un chapitre pour commencer.",
})

// 2) "Aller plus loin" set (optional folder)
const advDir = join(here, 'aller-plus-loin')
if (existsSync(advDir)) {
  buildSite({
    dir: advDir,
    out: join(advDir, 'index.html'),
    brand: 'Aller plus loin',
    docTitle: 'Aller plus loin — App Sinequa',
    heroBadge: 'Aller plus loin',
    heroTitle: 'Aller plus loin',
    heroSub:
      'Sujets avancés autour de l\'application Sinequa : approfondissements et techniques au-delà du tutoriel principal.',
    backHref: '../index.html',
    backLabel: 'Retour au tutoriel',
  })
}
