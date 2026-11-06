/* ==========================================================================
 * server/index.js · 白标本地服务（零第三方依赖，纯 Node 内置模块）
 *   职责（客户自部署、自维护，我方不参与运行）：
 *     1) 静态托管 dist/（公开站 + 管理端 SPA 产物）；
 *     2) 内容 JSON 读写 API（articles/tools/navs/posts/ads/settings，管理端 CRUD 用）；
 *     3) POST /track 公开埋点：把展示/点击事件按行写入 data/stats/events.jsonl（只落本地，绝不外发）；
 *     4) 本地统计聚合 GET /admin/api/stats（读回 jsonl 汇总，无我方看板）；
 *     5) 发布构建 POST /admin/api/publish：软校验 License（不阻断）后 spawn 构建脚本；
 *     6) 单管理员登录（打包时随机密码，见 credentials 说明）——登录时也做一次软校验；
 *     7) AI 助手（WO-151）：POST /api/ai/chat 零依赖代理转发客户自配 OpenAI 兼容端点
 *        （密钥只存本地 data/ai-config.json，失败 fail-soft 回落预置 FAQ），配
 *        GET /api/ai/status（公开状态探测，不含凭据）、GET/POST /admin/api/aiConfig、
 *        POST /admin/api/aiTest（鉴权）。
 *
 *   刻意不引 Express：交付包保持零 node_modules，解压即跑，也便于逐字节脱敏扫描。
 * ========================================================================== */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const STATS_DIR = path.join(DATA, 'stats');
const EVENTS_FILE = path.join(STATS_DIR, 'events.jsonl');
const DIST = path.join(ROOT, 'dist');
const CREDS_FILE = path.join(__dirname, 'admin-credentials.json');

const PORT = process.env.PORT || 8787;
const licenseClient = require(path.join(ROOT, 'scripts', 'license-client.js'));

/* --------------------------- 管理员凭据 --------------------------- */
// 打包时（pack-whitelabel.js）写入随机密码；本地 dev 无文件时用默认口令并告警。
function loadCreds() {
  try {
    const c = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
    return { user: String(c.user || 'admin'), pass: String(c.pass || '') };
  } catch (e) {
    return { user: 'admin', pass: 'admin123' };
  }
}
const creds = loadCreds();
if (!fs.existsSync(CREDS_FILE)) {
  console.warn('[server] 未找到 server/admin-credentials.json，使用默认口令 admin/admin123（仅本地开发，正式交付由打包脚本注入随机口令）');
}

// 内存会话令牌（重启即失效，符合单管理员轻量场景）
const sessions = new Set();
function newToken() { const t = crypto.randomBytes(24).toString('hex'); sessions.add(t); return t; }
function isAuthed(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return !!(m && sessions.has(m[1]));
}
function safeEqual(a, b) {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* --------------------------- 数据文件读写 --------------------------- */
const EDITABLE = [ 'articles', 'tools', 'navs', 'posts', 'ads', 'settings' ];
function dataFile(name) { return path.join(DATA, name + '.json'); }
function readData(name) { try { return JSON.parse(fs.readFileSync(dataFile(name), 'utf8')); } catch (e) { return null; } }
function writeData(name, obj) { fs.writeFileSync(dataFile(name), JSON.stringify(obj, null, 2)); }

/* --------------------------- AI 助手（WO-151） --------------------------- */
// data/ai-config.json 为客户真实配置（含密钥，.gitignore 已排除、绝不入库）；
// data/ai-config.example.json 为随包模板：本地配置缺失时回退读模板（enable 默认 false）。
const AI_CONFIG_FILE = path.join(DATA, 'ai-config.json');
const AI_EXAMPLE_FILE = path.join(DATA, 'ai-config.example.json');

function normalizeAiConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
  const faqs = Array.isArray(src.faqs) ? src.faqs.slice(0, 50).map(f => ({
    q: str(f && f.q, 200), a: str(f && f.a, 2000),
    kw: Array.isArray(f && f.kw) ? f.kw.slice(0, 20).map(k => str(k, 50)).filter(Boolean) : [],
  })).filter(f => f.q && f.a) : [];
  let rate = Number(src.rateLimitPerMinute);
  if (!Number.isFinite(rate) || rate < 1) rate = 12;
  if (rate > 120) rate = 120;
  return {
    enable: !!src.enable,
    baseURL: str(src.baseURL, 300),
    apiKey: str(src.apiKey, 300),
    model: str(src.model, 120),
    systemPrompt: str(src.systemPrompt, 4000),
    fallbackAnswer: str(src.fallbackAnswer, 1000) || 'AI 助手暂时不可用，欢迎访问站内文章。',
    faqs,
    rateLimitPerMinute: rate,
  };
}

function readAiConfig() {
  if (fs.existsSync(AI_CONFIG_FILE)) {
    try { return normalizeAiConfig(JSON.parse(fs.readFileSync(AI_CONFIG_FILE, 'utf8'))); } catch (e) { /* 损坏时回退模板 */ }
  }
  return normalizeAiConfig(readDataSafe(AI_EXAMPLE_FILE));
}

// 朴素 FAQ 命中：关键词包含计分，零依赖、语义下限兑底。
function matchFaq(faqs, question) {
  const q = String(question || '').toLowerCase();
  let best = null; let bestScore = 0;
  (faqs || []).forEach(f => {
    const keys = (f.kw && f.kw.length ? f.kw : [ f.q ]).map(k => String(k).toLowerCase());
    let score = 0;
    keys.forEach(k => { if (k && q.indexOf(k) >= 0) score++; });
    if (score > bestScore) { bestScore = score; best = f; }
  });
  return bestScore > 0 ? best : null;
}

// 轻量 IP 滑动窗口限流（防访客狂刷烧客户 token；重启即清零，符合单进程轻场景）。
const aiHits = new Map();
function aiRateLimited(ip, limitPerMin) {
  const now = Date.now();
  const arr = (aiHits.get(ip) || []).filter(t => now - t < 60000);
  if (arr.length >= limitPerMin) { aiHits.set(ip, arr); return true; }
  arr.push(now); aiHits.set(ip, arr);
  return false;
}

// 转发 OpenAI 兼容 /chat/completions（非流式）。baseURL 已含完整路径时不重复拼接。
function requestOpenAiChat(cfg, messages) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(cfg.baseURL); } catch (e) { return reject(new Error('invalid baseURL')); }
    let pth = u.pathname.replace(/\/+$/, '');
    if (!/\/chat\/completions$/.test(pth)) pth += '/chat/completions';
    const payload = JSON.stringify({ model: cfg.model, messages, stream: false });
    const mod = u.protocol === 'http:' ? http : https;
    const preq = mod.request({
      method: 'POST', hostname: u.hostname, port: u.port || (u.protocol === 'http:' ? 80 : 443), path: pth,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey, 'Content-Length': Buffer.byteLength(payload) },
      timeout: 15000,
    }, pres => {
      let raw = '';
      pres.setEncoding('utf8');
      pres.on('data', c => { raw += c; if (raw.length > 2e6) preq.destroy(); });
      pres.on('end', () => {
        if (pres.statusCode < 200 || pres.statusCode >= 300) return reject(new Error('upstream http ' + pres.statusCode));
        try {
          const j = JSON.parse(raw);
          const ans = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
          if (!ans) return reject(new Error('empty upstream answer'));
          resolve(String(ans));
        } catch (e) { reject(new Error('bad upstream json')); }
      });
    });
    preq.on('timeout', () => preq.destroy(new Error('upstream timeout')));
    preq.on('error', err => reject(err));
    preq.end(payload);
  });
}

function aiFallbackAnswer(cfg, question) {
  const faq = matchFaq(cfg.faqs, question);
  return faq ? faq.a : cfg.fallbackAnswer;
}

/* --------------------------- 埋点写盘 --------------------------- */
function appendEvent(evt) {
  try {
    fs.mkdirSync(STATS_DIR, { recursive: true });
    fs.appendFileSync(EVENTS_FILE, JSON.stringify(evt) + '\n');
    return true;
  } catch (e) { return false; }
}

/* --------------------------- 静态文件 --------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
};
function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { return send(res, 400, 'bad path'); }
  if (urlPath === '/') urlPath = '/index.html';
  // 只允许 DIST 内路径，防目录穿越
  const filePath = path.join(DIST, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(DIST)) return send(res, 403, 'forbidden');
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      // SPA 兜底：admin 子路由回落到 admin/index.html
      if (/^\/admin(\/|$)/.test(urlPath)) {
        return fs.readFile(path.join(DIST, 'admin', 'index.html'), (e2, b2) => {
          if (e2) return send(res, 404, 'not found');
          res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(b2);
        });
      }
      return send(res, 404, 'not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(buf);
  });
}

function send(res, code, text) { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(text); }
function json(res, code, obj) { res.writeHead(code, { 'Content-Type': MIME['.json'] }); res.end(JSON.stringify(obj)); }
function readBody(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 5e6) { req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { resolve({}); } });
  });
}

/* --------------------------- 路由 --------------------------- */
async function handle(req, res) {
  const p = (req.url || '/').split('?')[0];
  const method = req.method;

  // 公开埋点：无需鉴权，接受任意事件，只落本地
  if (p === '/track' && method === 'POST') {
    const b = await readBody(req);
    const ok = appendEvent({ event: String(b.event || 'unknown'), page: String(b.page || ''), props: b.props || {}, ts: Date.now(), ref: String(b.ref || ''), ua: String(req.headers['user-agent'] || '').slice(0, 200) });
    return json(res, ok ? 202 : 500, { ok });
  }

  // AI 助手公开路由：状态探测只回开关态、不含任何凭据；纯静态托管下 404，组件自行隐藏
  if (p === '/api/ai/status' && method === 'GET') {
    const cfg = readAiConfig();
    return json(res, 200, { enable: cfg.enable, configured: !!(cfg.baseURL && cfg.apiKey && cfg.model) });
  }
  if (p === '/api/ai/chat' && method === 'POST') {
    const cfg = readAiConfig();
    if (!cfg.enable) return json(res, 200, { answer: '', disabled: true });
    if (aiRateLimited(req.socket && req.socket.remoteAddress || 'unknown', cfg.rateLimitPerMinute)) {
      return json(res, 200, { answer: '提问太频繁啦，稍后再试～', fallback: true, limited: true });
    }
    const b = await readBody(req);
    const question = String(b.question || '').slice(0, 500);
    if (!question.trim()) return json(res, 400, { error: 'missing question' });
    // 可选多轮：前端传 messages 时取最近 10 条合法 user/assistant 文本
    const history = Array.isArray(b.messages)
      ? b.messages.slice(-10).filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map(m => ({ role: m.role, content: m.content.slice(0, 1000) }))
      : [];
    if (!cfg.baseURL || !cfg.apiKey || !cfg.model) {
      return json(res, 200, { answer: aiFallbackAnswer(cfg, question), fallback: true });
    }
    const messages = [];
    if (cfg.systemPrompt) messages.push({ role: 'system', content: cfg.systemPrompt });
    messages.push(...history, { role: 'user', content: question });
    try {
      const answer = await requestOpenAiChat(cfg, messages);
      return json(res, 200, { answer });
    } catch (e) {
      // fail-soft：上游异常一律降级 FAQ/模板回答，绝不 5xx 炸前端
      return json(res, 200, { answer: aiFallbackAnswer(cfg, question), fallback: true, reason: e.message });
    }
  }

  // 管理端登录
  if (p === '/admin/api/login' && method === 'POST') {
    const b = await readBody(req);
    if (String(b.user) === creds.user && safeEqual(String(b.pass), creds.pass)) {
      const token = newToken();
      // 登录软校验（不阻断，仅把结果回给前端展示）
      const lic = await licenseClient.verify().catch(() => ({ valid: true, checked: false, reason: 'skipped' }));
      return json(res, 200, { token, license: lic });
    }
    return json(res, 401, { error: 'invalid credentials' });
  }
  if (p === '/admin/api/logout' && method === 'POST') {
    const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (m) sessions.delete(m[1]);
    return json(res, 200, { ok: true });
  }

  // 以下均需鉴权
  if (p.startsWith('/admin/api/')) {
    if (!isAuthed(req)) return json(res, 401, { error: 'unauthorized' });

    if (p === '/admin/api/license' && method === 'GET') {
      const lic = await licenseClient.verify().catch(() => ({ valid: true, checked: false, reason: 'skipped' }));
      const l = readDataSafe(path.join(ROOT, 'license.json'));
      return json(res, 200, { license: l, check: lic });
    }

    // AI 助手配置读写（本地单管理员场景，apiKey 只在回显给本人时出现）与连通测试
    if (p === '/admin/api/aiConfig' && method === 'GET') {
      return json(res, 200, { data: readAiConfig(), source: fs.existsSync(AI_CONFIG_FILE) ? 'local' : 'example' });
    }
    if (p === '/admin/api/aiConfig' && (method === 'POST' || method === 'PUT')) {
      const b = await readBody(req);
      if (!b || !Object.prototype.hasOwnProperty.call(b, 'data')) return json(res, 400, { error: 'missing data' });
      fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(normalizeAiConfig(b.data), null, 2));
      return json(res, 200, { ok: true });
    }
    if (p === '/admin/api/aiTest' && method === 'POST') {
      const cfg = readAiConfig();
      if (!cfg.baseURL || !cfg.apiKey || !cfg.model) return json(res, 200, { ok: false, error: 'baseURL / apiKey / model 未配置完整' });
      try {
        const answer = await requestOpenAiChat(cfg, [ { role: 'user', content: '请只回答两个字：已通' } ]);
        return json(res, 200, { ok: true, echo: String(answer).slice(0, 100) });
      } catch (e) {
        return json(res, 200, { ok: false, error: e.message });
      }
    }

    // 内容 CRUD
    const seg = p.replace('/admin/api/', '').split('/'); // [name] 或 [name, key]
    const name = seg[0];
    if (EDITABLE.includes(name)) {
      if (method === 'GET') return json(res, 200, { data: readData(name) });
      if (method === 'PUT' || method === 'POST') {
        const b = await readBody(req);
        if (b && Object.prototype.hasOwnProperty.call(b, 'data')) { writeData(name, b.data); return json(res, 200, { ok: true }); }
        return json(res, 400, { error: 'missing data' });
      }
    }

    // 本地统计聚合
    if (p === '/admin/api/stats' && method === 'GET') {
      return json(res, 200, aggregateStats());
    }

    // 发布构建（先软校验，不阻断，再触发）
    if (p === '/admin/api/publish' && method === 'POST') {
      const lic = await licenseClient.verify().catch(() => ({ valid: true, checked: false }));
      const token = crypto.randomBytes(8).toString('hex');
      publishState.running = true; publishState.token = token;
      runBuild(token);
      return json(res, 202, { ok: true, license: lic, buildToken: token, message: '构建已触发' });
    }
    if (p === '/admin/api/publish/status' && method === 'GET') {
      return json(res, 200, { running: publishState.running, log: publishState.log.slice(-4000) });
    }

    return json(res, 404, { error: 'not found' });
  }

  // 其余走静态（dist）
  return serveStatic(req, res);
}

function readDataSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; } }

/* --------------------------- 统计聚合 --------------------------- */
function aggregateStats() {
  const out = { total: 0, byEvent: {}, byPage: {}, bySlot: {}, days: {} };
  let lines = [];
  try { lines = fs.readFileSync(EVENTS_FILE, 'utf8').split('\n').filter(Boolean); } catch (e) { return out; }
  lines.forEach(l => {
    let e; try { e = JSON.parse(l); } catch (x) { return; }
    out.total++;
    out.byEvent[e.event] = (out.byEvent[e.event] || 0) + 1;
    if (e.page) out.byPage[e.page] = (out.byPage[e.page] || 0) + 1;
    if (e.props && e.props.slot) out.bySlot[e.props.slot] = (out.bySlot[e.props.slot] || 0) + 1;
    const d = new Date(e.ts || Date.now()).toISOString().slice(0, 10);
    out.days[d] = (out.days[d] || 0) + 1;
  });
  return out;
}

/* --------------------------- 构建执行（带状态回显） --------------------------- */
const publishState = { running: false, token: null, log: '' };
function runBuild(token) {
  publishState.log = `[${new Date().toISOString()}] 触发构建 token=${token}\n`;
  const child = spawn(process.execPath, [ path.join(ROOT, 'scripts', 'build.js') ], { cwd: ROOT });
  const cap = d => { publishState.log += d.toString(); if (publishState.log.length > 20000) publishState.log = publishState.log.slice(-16000); };
  child.stdout.on('data', cap);
  child.stderr.on('data', cap);
  child.on('close', code => {
    publishState.log += `\n[exit ${code}] ${new Date().toISOString()}\n`;
    publishState.running = false;
  });
  child.on('error', err => { publishState.log += 'spawn error: ' + err.message + '\n'; publishState.running = false; });
  // 兜底超时，避免子进程挂死导致 running 永真
  setTimeout(() => { if (publishState.running && publishState.token === token) { try { child.kill(); } catch (e) {} publishState.running = false; publishState.log += '\n[timeout] 构建超时被终止\n'; } }, 120000);
}

/* --------------------------- 启动 --------------------------- */
const server = http.createServer((req, res) => {
  handle(req, res).catch(err => { console.error('[server] handler error:', err && err.message); json(res, 500, { error: 'internal' }); });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`[server] 白标本地服务已启动 http://localhost:${PORT}`);
    console.log(`[server] 管理端登录口令来源：${fs.existsSync(CREDS_FILE) ? 'server/admin-credentials.json' : '默认（本地开发）'}`);
  });
}

module.exports = { server, handle, aggregateStats, EDITABLE };
