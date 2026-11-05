/* ==========================================================================
 * server/index.js · 白标本地服务（零第三方依赖，纯 Node 内置模块）
 *   职责（客户自部署、自维护，我方不参与运行）：
 *     1) 静态托管 dist/（公开站 + 管理端 SPA 产物）；
 *     2) 内容 JSON 读写 API（articles/tools/navs/posts/ads/settings，管理端 CRUD 用）；
 *     3) POST /track 公开埋点：把展示/点击事件按行写入 data/stats/events.jsonl（只落本地，绝不外发）；
 *     4) 本地统计聚合 GET /admin/api/stats（读回 jsonl 汇总，无我方看板）；
 *     5) 发布构建 POST /admin/api/publish：软校验 License（不阻断）后 spawn 构建脚本；
 *     6) 单管理员登录（打包时随机密码，见 credentials 说明）——登录时也做一次软校验。
 *
 *   刻意不引 Express：交付包保持零 node_modules，解压即跑，也便于逐字节脱敏扫描。
 * ========================================================================== */

'use strict';

const http = require('http');
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
