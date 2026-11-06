#!/usr/bin/env node
/* ==========================================================================
 * build.js · 白标静态站构建器（WO-122 交付物核心）
 *   读 data/*.json → 按所选模板预渲染 → 注入 SEO(head/canonical/hreflang/JSON-LD) →
 *   生成 sitemap.xml / robots.txt → 注入三层水印 → 产出到 dist/。零第三方依赖，纯 Node。
 *
 * 三层水印（均不对终端访客可见，且不含明文 PII）：
 *   ① 管理端页脚固定 `Licensee: {sha256 前12位} · {orderNo}`（dist/admin/index.html）；
 *   ② 每个产出 HTML 头部注释 `<!-- build-licensee: {hash} · order: {orderNo} · built: {ISO} -->`；
 *   ③ assets/license.js 把 licensee 指纹以 base64 写入 window.__bl（与域名校验同文件，不可单独剥离）。
 *   说明：水印主体一律存「licensee 哈希」而非邮箱明文——取证时用订单表反查即可，
 *   但客户站源码（尤其注释/公开页）被任何人看到都不会泄露个人信息。
 *
 * 用法：
 *   node scripts/build.js                 默认读 license.json / settings.template
 *   node scripts/build.js --template=nav  指定模板
 *   node scripts/build.js --lang=en       出英文站（build-en.js 的别名）
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const SITE = path.join(ROOT, 'site');
const OUT = path.join(ROOT, 'dist');

/* ------------------------------ 数据加载 ------------------------------ */

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

const license = readJson(path.join(ROOT, 'license.json'), {});
const settings = readJson(path.join(DATA, 'settings.json'), {});
const ads = readJson(path.join(DATA, 'ads.json'), { slots: [] });
const promo = readJson(path.join(DATA, 'promo.json'), { examples: [] });

// AI 助手引导区（WO-151）：示例演示站矩阵 + 数据服务/赏赞致谢链接，均为 <a> 链接、不产生运行时请求
const AI_GUIDE = (promo.examples || []).slice(0, 4).map(e => ({ label: e.label || e.url, url: e.url }))
  .concat([
    { label: '数据 MCP 服务', url: 'https://xuliming.com/mcp.html' },
    { label: '赏赞致谢', url: promo.brandUrl || 'https://xuliming.com/white-label.html' },
  ]);

const argv = process.argv.slice(2);
const argOf = name => {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : null;
};
if (argOf('template')) settings.template = argOf('template');
if (argOf('lang')) settings.language = argOf('lang');

const TEMPLATE = settings.template || license.template || 'content';
const SITE_NAME = settings.siteName || 'My Site';
const BUILT_AT = new Date().toISOString();
// 水印主体：优先 license.licensee，其次 settings.contactEmail（本地 dev 兜底，绝不写我方信息）
const LICENSEE = license.licensee || settings.contactEmail || 'site-owner';
const ORDER_NO = license.orderNo || 'LOCAL';
const DOMAIN = license.domain || settings.domain || 'your-domain.com';
// 水印指纹：sha256(licensee) 前 12 位。既能反查订单，又不把邮箱明文写进客户站源码
const LICENSEE_HASH = crypto.createHash('sha256').update(String(LICENSEE)).digest('hex').slice(0, 12);

// 英文词典（lang=zh-en / en 时用于 i18n）
const enDict = readJson(path.join(DATA, 'i18n', 'en.json'), { ui: {}, site: {}, articles: {} });

/* ------------------------------ 小工具 ------------------------------ */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function attr(s) { return esc(s).replace(/\n/g, ' '); }
function base() { return `https://${DOMAIN}`; }
function joinUrl(...parts) { return (base() + '/' + parts.filter(Boolean).join('/')).replace(/([^:]\/)+/g, '$1'); }
// 当前构建语言的路径前缀：双语站的英文页在 en/ 下，单语站（中或英）一律在根路径。
let CURRENT_PREFIX = '';
function siteUrl(...segs) { return (base() + '/' + CURRENT_PREFIX + segs.filter(Boolean).join('/')).replace(/([^:]\/)+/g, '$1'); }
function rootUrl() { return base() + '/' + CURRENT_PREFIX; }

function writeOut(rel, content) {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

/* ------------------------------ SEO head 生成 ------------------------------ */

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

function breadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: it.url,
    })),
  };
}

/* ------------------------------ 布局渲染 ------------------------------ */

function loadLayout(tpl) {
  const p = path.join(SITE, 'templates', tpl, 'layout.html');
  const fallback = path.join(SITE, 'templates', 'content', 'layout.html');
  const target = fs.existsSync(p) ? p : fallback;
  return fs.readFileSync(target, 'utf8');
}

// 主题内联：读 data-theme，避免首屏闪烁
const THEME_INLINE = "(function(){try{var k=localStorage.getItem('wl-theme');if(k==='light'||k==='dark')document.documentElement.setAttribute('data-theme',k);}catch(e){}})();";

function renderLayout(layout, ctx) {
  const html = layout
    .replace(/{{LANG}}/g, attr(ctx.lang))
    .replace(/{{THEME}}/g, attr(settings.theme || 'auto'))
    .replace(/{{THEME_INLINE}}/g, THEME_INLINE)
    .replace(/{{TITLE}}/g, attr(ctx.title))
    .replace(/{{DESCRIPTION}}/g, attr(ctx.description))
    .replace(/{{CANONICAL}}/g, attr(ctx.canonical))
    .replace(/{{HREFLANG}}/g, ctx.hreflang || '')
    .replace(/{{OG_TYPE}}/g, attr(ctx.ogType || 'website'))
    .replace(/{{SITENAME}}/g, attr(ctx.siteName))
    .replace(/{{NAV}}/g, ctx.nav || '')
    .replace(/{{BODY}}/g, ctx.body)
    .replace(/{{FOOTER_NOTE}}/g, attr(ctx.footerNote || ''))
    .replace(/{{ICP}}/g, settings.icp ? ' · ' + attr(settings.icp) : '')
    .replace(/{{ADS_JSON}}/g, JSON.stringify(ads.slots || []).replace(/</g, '\\u003c'))
    .replace(/{{AI_GUIDE}}/g, JSON.stringify(AI_GUIDE).replace(/</g, '\\u003c'))
    .replace(/{{JSONLD}}/g, (ctx.jsonld || []).join('\n  '));
  // 水印层②：head 首个注释（只写指纹 + 订单号，不写邮箱明文）
  return html.replace('<head>', `<head>\n  <!-- build-licensee: ${LICENSEE_HASH} · order: ${ORDER_NO} · built: ${BUILT_AT} -->`);
}

/* ------------------------------ 导航 ------------------------------ */

function buildNav(lang) {
  const L = lang === 'en' ? enDict.ui : {};
  const nav = settings.nav || [];
  return nav.map(n => `<a href="${attr(n.href)}">${esc(lang === 'en' ? (L.home && n.href === '/' ? L.home : n.title) : n.title)}</a>`).join('');
}

/* ------------------------------ 各模板渲染 ------------------------------ */

const contentItems = readJson(path.join(DATA, 'articles.json'), []);
const toolsData = readJson(path.join(DATA, 'tools.json'), { tools: [] });
const navsData = readJson(path.join(DATA, 'navs.json'), { groups: [] });
const postData = readJson(path.join(DATA, 'posts.json'), []);

const RENDERERS = {
  content: renderContent,
  tool: renderTool,
  nav: renderNav,
  blog: renderBlog,
};

function adSlot(id, page) {
  return `<div class="ad-slot" data-ad-slot="${attr(id)}" data-ad-page="${attr(page)}"></div>`;
}

function renderContent(lang) {
  const L = lang === 'en' ? enDict.ui : {};
  const list = (contentItems || []).map(a => {
    const en = lang === 'en' && enDict.articles && enDict.articles[a.slug];
    const title = en ? en.title : a.title;
    const summary = en ? en.summary : a.summary;
    return `<a class="card" href="/article/${a.slug}.html"><h3>${esc(title)}</h3><p>${esc(summary)}</p><p class="meta">${esc(a.date)}</p></a>`;
  }).join('');

  const pages = [];
  // 首页
  pages.push({
    rel: 'index.html',
    canonical: rootUrl(),
    title: lang === 'en' ? (enDict.site.siteName || SITE_NAME) : `${SITE_NAME} · ${settings.tagline || ''}`,
    description: lang === 'en' ? enDict.site.description : settings.description,
    ogType: 'website',
    body: `<section class="hero"><h1>${esc(lang === 'en' ? enDict.site.tagline : settings.tagline)}</h1><p class="lead">${esc(lang === 'en' ? enDict.site.description : settings.description)}</p></section>
      ${adSlot('top-banner', 'home')}
      <ul class="features">${(settings.features || []).map(f => `<li>${esc(lang === 'en' ? f : f)}</li>`).join('')}</ul>
      ${promo.examples && promo.examples.length ? `<section class="promo-sites"><h2>示例演示站</h2><ul class="grid">${promo.examples.map(e => `<li class="card"><a href="${attr(e.url)}" target="_blank" rel="noopener"><h3>${esc(e.label)}</h3><p>${esc(e.url)}</p></a></li>`).join('')}</ul></section>` : ''}
      <h2>${esc(L.articles || '文章')}</h2><div class="grid">${list}</div>`,
    jsonld: [ jsonLd({
      '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url: base(),
    }) ],
  });

  // 文章列表页
  pages.push({
    rel: 'articles.html',
    canonical: siteUrl('articles.html'),
    title: `${L.articles || '文章'} · ${SITE_NAME}`,
    description: lang === 'en' ? enDict.site.description : settings.description,
    body: `<h1>${esc(L.articles || '文章')}</h1><div class="grid">${list}</div>${adSlot('top-banner', 'list')}`,
    jsonld: [ jsonLd(breadcrumb([ { name: 'Home', url: base() }, { name: L.articles || '文章', url: siteUrl('articles.html') }])) ],
  });

  // 详情页
  (contentItems || []).forEach(a => {
    const en = lang === 'en' && enDict.articles && enDict.articles[a.slug];
    const title = en ? en.title : a.title;
    const url = siteUrl('article', a.slug + '.html');
    const paras = String(a.content || '').split(/\n\n+/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    pages.push({
      rel: `article/${a.slug}.html`,
      canonical: url,
      title: `${title} · ${SITE_NAME}`,
      description: en ? en.summary : a.summary,
      ogType: 'article',
      body: `<article class="article"><h1>${esc(title)}</h1>
        <div class="meta">${esc(L.publishedOn || '发布于')} ${esc(a.date)} ${esc((a.tags || []).map(t => '#' + t).join(' '))}</div>
        ${adSlot('article-inline', 'article')}
        <div class="body">${paras}</div>
        ${a.promoUrl ? `<p class="promo" style="margin-top:1.4rem;font-size:.9rem;color:var(--text-soft)">示例演示站：<a href="${attr(a.promoUrl)}" target="_blank" rel="noopener">${esc(a.promoLabel || a.promoUrl)}</a></p>` : ''}
        <p><a href="/articles.html">← ${esc(L.backToArticles || '返回文章列表')}</a></p></article>`,
      jsonld: [
        jsonLd({
          '@context': 'https://schema.org', '@type': 'Article', headline: title,
          datePublished: a.date, author: { '@type': 'Person', name: settings.author || SITE_NAME }, url,
        }),
        jsonLd(breadcrumb([ { name: 'Home', url: base() }, { name: title, url }])),
      ],
    });
  });

  // 关于页
  pages.push({
    rel: 'about.html',
    canonical: siteUrl('about.html'),
    title: `${L.about || '关于'} · ${SITE_NAME}`,
    description: `About ${SITE_NAME}`,
    body: `<h1>${esc(L.about || '关于')}</h1><p>${esc(settings.description || '')}</p><p>${esc(settings.contactEmail || '')}</p>`,
    jsonld: [ jsonLd(breadcrumb([ { name: 'Home', url: base() }, { name: L.about || '关于', url: siteUrl('about.html') }])) ],
  });

  return pages;
}

function renderTool(lang) {
  const tools = toolsData.tools || [];
  const cards = tools.map(t => `<a class="card" href="/tool/${t.slug}.html"><h3>${esc(t.name)}</h3><p>${esc(t.desc)}</p></a>`).join('');
  const pages = [ {
    rel: 'index.html',
    canonical: rootUrl(),
    title: `${SITE_NAME} · ${settings.tagline || ''}`,
    description: settings.description,
    body: `<section class="hero"><h1>${esc(settings.siteName)}</h1><p class="lead">${esc(settings.description)}</p></section>${adSlot('top-banner', 'home')}<div class="grid">${cards}</div>`,
    jsonld: [ jsonLd({ '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: tools.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, url: siteUrl('tool', t.slug + '.html') })) }) ],
  } ];
  tools.forEach(t => {
    const url = siteUrl('tool', t.slug + '.html');
    pages.push({
      rel: `tool/${t.slug}.html`,
      canonical: url,
      title: `${t.name} · ${SITE_NAME}`,
      description: t.desc,
      body: `<article class="article"><h1>${esc(t.name)}</h1><p>${esc(t.desc)}</p>
        <div class="card"><p>在此实现「${esc(t.name)}」的工具逻辑（纯前端，输入不出本机）。编辑模板 <code>site/templates/tool</code> 与 <code>data/tools.json</code> 即可。</p></div>
        ${adSlot('article-inline', 'tool')}
        <p><a href="/">← 返回工具列表</a></p></article>`,
      jsonld: [ jsonLd(breadcrumb([ { name: 'Home', url: base() }, { name: t.name, url }])) ],
    });
  });
  return pages;
}

function renderNav(lang) {
  const groups = navsData.groups || [];
  const blocks = groups.map(g => `<h2>${esc(g.name)}</h2><div class="grid">${g.items.map(it => `<a class="card" href="${attr(it.url)}" rel="nofollow noopener" target="_blank"><h3>${esc(it.icon || '')} ${esc(it.title)}</h3><p>${esc(it.desc || '')}</p></a>`).join('')}</div>`).join('');
  return [ {
    rel: 'index.html',
    canonical: rootUrl(),
    title: `${SITE_NAME} · 导航`,
    description: settings.description,
    body: `<section class="hero"><h1>${esc(settings.siteName)}</h1><p class="lead">${esc(settings.description)}</p></section>${adSlot('top-banner', 'home')}${blocks}`,
    jsonld: [ jsonLd({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: SITE_NAME, url: base() }) ],
  } ];
}

function renderBlog(lang) {
  const posts = postData || [];
  const list = posts.map(p => `<a class="card" href="/post/${p.slug}.html"><h3>${esc(p.title)}</h3><p>${esc(p.summary)}</p><p class="meta">${esc(p.date)}</p></a>`).join('');
  const pages = [ {
    rel: 'index.html',
    canonical: rootUrl(),
    title: `${SITE_NAME} · 博客`,
    description: settings.description,
    body: `<section class="hero"><h1>${esc(settings.siteName)}</h1></section>${adSlot('top-banner', 'blog')}<div class="grid">${list}</div>`,
    jsonld: [ jsonLd({ '@context': 'https://schema.org', '@type': 'Blog', name: SITE_NAME, url: base() }) ],
  } ];
  posts.forEach(p => {
    const url = siteUrl('post', p.slug + '.html');
    const paras = String(p.content || '').split(/\n\n+/).map(x => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join('');
    pages.push({
      rel: `post/${p.slug}.html`,
      canonical: url,
      title: `${p.title} · ${SITE_NAME}`,
      description: p.summary,
      ogType: 'article',
      body: `<article class="article"><h1>${esc(p.title)}</h1><div class="meta">${esc(p.date)} · ${esc(p.author || '')}</div><div class="body">${paras}</div>${adSlot('article-inline', 'post')}<p><a href="/">← 返回</a></p></article>`,
      jsonld: [ jsonLd({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, datePublished: p.date, url }) ],
    });
  });
  return pages;
}

/* ------------------------------ hreflang（双语时互指） ------------------------------ */

function hreflangFor(canonical, bilingual) {
  if (!bilingual) return '';
  // zh 页与 en 页互指 + x-default
  const isEn = /\/en\//.test(canonical) || canonical.endsWith('/en/');
  const zh = isEn ? canonical.replace('/en/', '/') : canonical.replace(base() + '/', base() + '/en/');
  return `<link rel="alternate" hreflang="zh" href="${attr(isEn ? zh : canonical)}">
  <link rel="alternate" hreflang="en" href="${attr(isEn ? canonical : zh)}">
  <link rel="alternate" hreflang="x-default" href="${attr(isEn ? zh : canonical)}">`;
}

/* ------------------------------ 资源与水印 ------------------------------ */

function copyAssets() {
  const src = path.join(SITE, 'assets');
  const dst = path.join(OUT, 'assets');
  fs.mkdirSync(dst, { recursive: true });
  fs.readdirSync(src).forEach(name => {
    const from = path.join(src, name);
    const to = path.join(dst, name);
    if (name === 'license.js') {
      // 水印层③：注入 licensee 指纹(base64) + domain（全局替换，源码注释里也含同名令牌）
      const code = fs.readFileSync(from, 'utf8')
        .replace(/__LICENSEE_B64__/g, Buffer.from(LICENSEE_HASH, 'utf8').toString('base64'))
        .replace(/__LICENSE_DOMAIN__/g, DOMAIN);
      fs.writeFileSync(to, code);
    } else {
      fs.copyFileSync(from, to);
    }
  });
}

/**
 * 水印层① + 管理端交付：把 site/admin 的零构建管理端（index.html + admin.css + admin.js）拷到 dist/admin。
 * 交付后 `node server/index.js` 直接可登录使用，**无需 npm install / 无需 vite 构建**。
 * settings.adminBuild==='vite' 时保留外部 vite 产物（二次开发场景）。
 * 兜底：site/admin 缺失时写占位页，保证交付包里始终有可访问的管理端入口与水印①。
 */
function renderAdminWatermark() {
  const srcDir = path.join(SITE, 'admin');
  const dstDir = path.join(OUT, 'admin');
  if (settings.adminBuild === 'vite' && fs.existsSync(path.join(dstDir, 'index.html'))) return;
  if (fs.existsSync(srcDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
    [ 'index.html', 'admin.css', 'admin.js' ].forEach(name => {
      const from = path.join(srcDir, name);
      if (!fs.existsSync(from)) return;
      let code = fs.readFileSync(from, 'utf8');
      if (name === 'index.html') {
        // 水印层①：只写指纹 + 订单号（页面本身无邮箱明文）
        code = code.replace('<!--WL_FOOTER-->', `<span>Licensee: ${esc(LICENSEE_HASH)} · 订单 ${esc(ORDER_NO)}</span>`);
      }
      fs.writeFileSync(path.join(dstDir, name), code);
    });
    return;
  }
  const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>站点管理端</title><meta name="robots" content="noindex,nofollow"></head><body><h1>站点管理端</h1><p>未找到 site/admin 源文件，请检查交付包完整性。</p><footer>Licensee: ${esc(LICENSEE_HASH)} · ${esc(ORDER_NO)}</footer></body></html>`;
  writeOut('admin/index.html', html);
}

function writeSitemap(locs) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${locs.map(l => `  <url><loc>${attr(l)}</loc></url>`).join('\n')}\n</urlset>\n`;
  writeOut('sitemap.xml', xml);
}

function writeRobots() {
  // GEO：默认放行主流 AI 爬虫 UA（对齐 WO-96 基线），sitemap 指向本站域名
  const robots = `User-agent: *\nAllow: /\nDisallow: /admin/\n\n# AI 爬虫（GEO 收录）\nUser-agent: GPTBot\nAllow: /\nUser-agent: Claude-Web\nAllow: /\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: ${base()}/sitemap.xml\n`;
  writeOut('robots.txt', robots);
}

/* ------------------------------ 主流程 ------------------------------ */

function build(lang) {
  const bilingual = settings.language === 'zh-en';
  // 双语站的英文页落 en/ 子目录；单语站（无论中/英）一律落根路径。
  CURRENT_PREFIX = (lang === 'en' && bilingual) ? 'en/' : '';
  const layout = loadLayout(TEMPLATE);
  const renderer = RENDERERS[TEMPLATE] || RENDERERS.content;
  const pages = renderer(lang);

  pages.forEach(p => {
    const html = renderLayout(layout, {
      lang,
      title: p.title,
      description: p.description,
      canonical: p.canonical,
      hreflang: bilingual ? hreflangFor(p.canonical, bilingual) : '',
      ogType: p.ogType,
      siteName: lang === 'en' ? (enDict.site.siteName || SITE_NAME) : SITE_NAME,
      nav: buildNav(lang),
      body: p.body,
      footerNote: lang === 'en' ? enDict.ui.footerNote : '本站为纯静态站点。',
      jsonld: p.jsonld,
      ads,
    });
    const rel = CURRENT_PREFIX ? path.posix.join(CURRENT_PREFIX.replace(/\/$/, ''), p.rel) : p.rel;
    writeOut(rel, html);
  });

  // 汇总 sitemap（zh 页 + en 页）
  const locs = pages.map(p => p.canonical);
  return locs;
}

/**
 * 主流程。opt.lang 指定只构建某语言（build-en.js 复用口），缺省按 settings.language 决定单语/双语。
 * @param {{ lang?: 'zh'|'en' }} [opt]
 */
function main(opt) {
  opt = opt || {};
  // 清空 dist/：默认连 admin/ 一起重建（零构建管理端）；settings.adminBuild==='vite' 时保留外部产物。
  if (fs.existsSync(OUT)) {
    fs.readdirSync(OUT).forEach(name => {
      if (name === 'admin' && settings.adminBuild === 'vite') return;
      fs.rmSync(path.join(OUT, name), { recursive: true, force: true });
    });
  }
  fs.mkdirSync(OUT, { recursive: true });
  copyAssets();
  renderAdminWatermark();

  const allLocs = [];
  if (opt.lang) {
    // 显式单语言构建（build-en.js 走这里，只出指定语言）
    allLocs.push(...build(opt.lang));
  } else {
    const lang = settings.language === 'en' ? 'en' : 'zh';
    allLocs.push(...build(lang));
    if (settings.language === 'zh-en') {
      // 双语：zh 已建，再建 en
      allLocs.push(...build('en'));
    }
  }

  writeSitemap(allLocs);
  writeRobots();
  // GEO：生成 llms.txt（同进程调 gen-llms 的核心逻辑，避免重复起进程）
  try { require('./gen-llms').generate({ domain: DOMAIN, siteName: SITE_NAME, description: settings.description, outDir: OUT }); } catch (e) { /* llms 失败不阻断构建 */ }

  const shown = opt.lang || settings.language;
  console.log(`[build] 模板=${TEMPLATE} 语言=${shown} → dist/ 产出完成`);
  console.log(`[build] 三层水印：①admin 页脚 ②每页 HTML 注释 ③assets/license.js(base64) 已注入 fingerprint=${LICENSEE_HASH}`);
  return allLocs;
}

// 仅在直接 `node scripts/build.js` 时执行；被 require（如 build-en.js）时不触发整包构建
if (require.main === module) {
  main();
}

module.exports = { build, main, esc, base, renderLayout, copyAssets, writeSitemap, writeRobots };
