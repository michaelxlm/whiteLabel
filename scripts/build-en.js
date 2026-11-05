#!/usr/bin/env node
/* ==========================================================================
 * build-en.js · 英文页构建入口（i18n 词典驱动）
 *   仅负责把语言强制为 en 并复用 build.js 的构建能力产出 dist/en/ 一套页面，
 *   确保中英共用同一 SEO / 水印 / 资源注入逻辑，两份构建器不各写一遍。
 *
 *   - settings.language = 'en'    独立英文站：直接 `node scripts/build.js` 即可，本脚本等价；
 *   - settings.language = 'zh-en' 双语站：build.js 默认已同批产出 zh + en，本脚本用于只重建英文部分的手动场景。
 *
 *   交付打包时（pack-whitelabel.js）：lang=zh 的包会剔除本脚本与 en 资源，客户拿不到未启用的双语链路。
 * ========================================================================== */

'use strict';

const path = require('path');

// 复用同目录 build.js 导出的 main（require 时不会触发整包构建，因为有 require.main 守卫）
const build = require(path.join(__dirname, 'build.js'));

if (require.main === module) {
  build.main({ lang: 'en' });
  console.log('[build-en] 英文页构建完成（dist/en/）');
}

module.exports = { run: () => build.main({ lang: 'en' }) };
