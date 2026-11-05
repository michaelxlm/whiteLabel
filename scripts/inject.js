#!/usr/bin/env node
/* ==========================================================================
 * inject.js · 广告位框架注入器（仅 ad-slot，无优惠券腿）
 *   build.js 已在模板层把 <div class="ad-slot" data-ad-slot="..."> 挂点与 window.__ADS 数据内联写入页面；
 *   本脚本作为「发布前体检 + 兜底注入」的独立工具，做三件事（全部幂等，可反复执行）：
 *     1) 确保每个含挂点的页面在 </body> 前引入了 /assets/ad-slot.js（缺则补，有则跳过）；
 *     2) 确保 window.__ADS 内联存在（缺则补空数组，避免 ad-slot.js 读不到数据报错）；
 *     3) 校验：绝不允许出现任何 coupon / 优惠券 / 第三方广告联盟脚本挂点（交付口径只留 ad-slot）。
 *   命中禁止项即抛错退出（供 CI / pack 前置门禁调用）。
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');

// 交付口径明确不带的东西：命中即视为信息泄露/越界，硬失败
// （注：License 软校验口是服务端 license-client 的调用，公开页永不含我方域名；故这里扫描的是公开 dist）
const FORBIDDEN = [
  { re: /coupon/i, why: '优惠券腿（本产品在白标口径中已移除）' },
  { re: /api\.xuyiheng\.com/i, why: '我方中台域名（不得出现在公开页面）' },
  { re: /antucao\.com/i, why: '帮助/售后入口（交付物不得含任何支持引导）' },
];

const AD_SLOT_SRC = '<script src="/assets/ad-slot.js"></script>';
const ADS_INLINE_FALLBACK = '<script>window.__ADS=window.__ADS||[];</script>';

function walkHtml(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  fs.readdirSync(dir).forEach(name => {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (name === 'admin') return; // 管理端占位页不注入公开广告脚本
      out.push(...walkHtml(p));
    } else if (name.endsWith('.html')) {
      out.push(p);
    }
  });
  return out;
}

/**
 * 对 dist/ 内所有公开 HTML 做广告位框架兜底注入 + 越界校验。
 * @param {Object} [opt] - { outDir, dryRun }
 * @return {{ touched:number, checked:number, violations:string[] }}
 */
function inject(opt) {
  opt = opt || {};
  const dir = opt.outDir || OUT;
  const dryRun = !!opt.dryRun;
  const files = walkHtml(dir);
  let touched = 0;
  const violations = [];

  files.forEach(file => {
    const original = fs.readFileSync(file, 'utf8');
    let html = original;

    // 1) 有挂点却没引 ad-slot.js → 补
    if (/data-ad-slot/.test(html) && !/ad-slot\.js/.test(html)) {
      html = html.replace('</body>', `  ${AD_SLOT_SRC}\n</body>`);
    }
    // 2) 有挂点却没内联 __ADS → 补空数组兜底
    if (/data-ad-slot/.test(html) && !/__ADS/.test(html)) {
      html = html.replace('</body>', `  ${ADS_INLINE_FALLBACK}\n</body>`);
    }

    // 3) 越界校验（对最终内容扫描，含客户自填数据）
    FORBIDDEN.forEach(f => {
      if (f.re.test(html)) violations.push(`${path.relative(dir, file)}: 命中禁止项 ${f.why}`);
    });

    if (html !== original) {
      touched++;
      if (!dryRun) fs.writeFileSync(file, html);
    }
  });

  return { touched, checked: files.length, violations };
}

module.exports = { inject, FORBIDDEN };

if (require.main === module) {
  const res = inject({ dryRun: process.argv.includes('--check') });
  if (res.violations.length) {
    console.error('[inject] 越界校验未通过：\n  ' + res.violations.join('\n  '));
    process.exit(1);
  }
  console.log(`[inject] 体检 ${res.checked} 个页面，兜底注入 ${res.touched} 个${process.argv.includes('--check') ? '（--check 未写盘）' : ''}`);
}
