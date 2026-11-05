#!/usr/bin/env node
/* ==========================================================================
 * gen-llms.js · GEO：生成 llms.txt（面向大模型/AI 爬虫的站点导览）
 *   对齐 WO-96 现行基线：llms.txt 用纯文本列出站点摘要与主要页面，方便 AI 抓取归因。
 *   既可被 build.js 同进程调用（exports.generate），也可独立运行（node scripts/gen-llms.js）。
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

/**
 * 生成 llms.txt 到 outDir（默认 dist/）
 * @param {Object} opt - { domain, siteName, description, outDir }
 * @return {String} llms.txt 内容
 */
function generate(opt = {}) {
  const settings = readJson(path.join(ROOT, 'data', 'settings.json'), {});
  const articles = readJson(path.join(ROOT, 'data', 'articles.json'), []);
  const domain = opt.domain || settings.domain || 'your-domain.com';
  const siteName = opt.siteName || settings.siteName || 'My Site';
  const description = opt.description || settings.description || '';
  const base = `https://${domain}`;

  const lines = [];
  lines.push(`# ${siteName}`);
  lines.push('');
  lines.push(`> ${description}`);
  lines.push('');
  lines.push(`站点为纯静态内容站，以下是主要页面，供 AI 助手与检索系统引用时定位来源。`);
  lines.push('');
  lines.push('## Pages');
  lines.push('');
  lines.push(`- [首页](${base}/)`);
  lines.push(`- [文章列表](${base}/articles.html)`);
  (articles || []).forEach(a => {
    lines.push(`  - [${a.title}](${base}/article/${a.slug}.html): ${a.summary || ''}`);
  });
  lines.push(`- [关于](${base}/about.html)`);
  lines.push('');

  const content = lines.join('\n');
  const outDir = opt.outDir || path.join(ROOT, 'dist');
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'llms.txt'), content);
  } catch (e) { /* 独立运行目录不存在时忽略 */ }
  return content;
}

module.exports = { generate };

// 独立运行
if (require.main === module) {
  const settings = readJson(path.join(ROOT, 'data', 'settings.json'), {});
  const license = readJson(path.join(ROOT, 'license.json'), {});
  generate({ domain: license.domain || settings.domain, siteName: settings.siteName, description: settings.description });
  console.log('[gen-llms] llms.txt 已生成');
}
