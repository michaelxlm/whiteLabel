/* ad-slot.js · 广告位框架（内容由你在 data/ads.json 自填，构建时注入 window.__ADS）
 * - 只渲染框架，不含任何第三方广告库存/联盟数据；
 * - 展示触发 ad_view、点击触发 ad_click，均走本地 /track（不外发）。
 * 页面用 <div class="ad-slot" data-ad-slot="top-banner"></div> 声明挂点。 */
(function (global) {
  'use strict';
  var ADS = global.__ADS || [];
  function track(name, props) {
    if (global.WLTrack && global.WLTrack.event) global.WLTrack.event(name, props);
  }
  function findSlot(id, page) {
    for (var i = 0; i < ADS.length; i++) {
      var a = ADS[i];
      if (a.id === id && (a.page === 'all' || a.page === page || !page)) return a;
    }
    return null;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function render() {
    var hosts = global.document.querySelectorAll('[data-ad-slot]');
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      var id = host.getAttribute('data-ad-slot');
      var page = host.getAttribute('data-ad-page') || 'all';
      var ad = findSlot(id, page);
      if (!ad) { host.setAttribute('data-empty', '1'); continue; }
      var inner = '<span class="ad-label">推广</span>';
      if (ad.image) inner += '<img src="' + esc(ad.image) + '" alt="">';
      inner += '<div><h4>' + esc(ad.title) + '</h4><p>' + esc(ad.text) + '</p></div>';
      if (ad.url) {
        host.innerHTML = '<a class="ad-card" href="' + esc(ad.url) + '" rel="nofollow noopener" target="_blank">' + inner + '</a>';
      } else {
        host.innerHTML = '<div class="ad-card">' + inner + '</div>';
      }
      track('ad_view', { slot: id, page: page });
      var a = host.querySelector('a');
      if (a) a.addEventListener('click', function () { track('ad_click', { slot: id, page: page }); });
    }
  }
  if (global.document) {
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', render);
    else render();
  }
  global.WLAdSlots = { render: render };
})(window);
