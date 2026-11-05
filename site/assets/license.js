/* license.js · 授权标记（惰性，已随 WO-122 放宽：不限域名 / 无远程校验）
 * - 只把被授权人指纹（sha256 前 12 位，非邮箱明文）写入 window.__bl（base64 混淆），作为购买标识；
 * - **不发起任何远程校验、不做域名一致性判定**，产品包完全离线自足；任何异常都不得影响页面。 */
(function (global) {
  'use strict';
  var LICENSEE_B64 = '__LICENSEE_B64__';

  function decode(b64) {
    try { return global.atob(b64); } catch (e) { return ''; }
  }

  var licensee = decode(LICENSEE_B64);

  // 标识挂点：随 bundle 打进页面，正常浏览不可见；仅作品牌/归属标识，不具备任何校验语义
  global.__bl = { k: LICENSEE_B64, licensee: licensee };
})(window);
