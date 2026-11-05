/* ==========================================================================
 * license-client.js · License 状态本地检查（NO-OP，已随 WO-122 放宽下线远程校验）
 *   口径（对齐已定原则：不限域名 / 防伪体系全解除 / 交付纯自足无外链）：
 *     - 不再向任何我方接口发起网络请求，本模块只读本地 license.json；
 *     - verify() 恒返回 { valid:true }，不阻断、不告警，产品包可完全离线自足运行；
 *     - 保留函数签名，使 server/index.js 中登录/发布/License 展示等调用点无需修改。
 * ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}

/**
 * 本地 License 检查（纯 no-op，不发起任何网络请求）。任何情况下都归一为不阻断结果。
 * @param {{ key?: string, domain?: string }} [opt] - 保留入参签名以兼容旧调用点（当前忽略）
 * @return {Promise<{ valid:boolean, checked:boolean, selfContained:boolean, reason:string }>}
 */
async function verify() {
  const license = readJson(path.join(ROOT, 'license.json'), {});
  return {
    valid: true,
    checked: false,
    selfContained: true,
    reason: 'self-contained license (no remote check)',
    key: license.key || '',
  };
}

module.exports = { verify };
