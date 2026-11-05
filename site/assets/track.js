/* track.js · 本地埋点（数据只发到你自己服务器上的 /track，绝不外发第三方）
 * window.WLTrack.event(name, props)：POST /track，失败静默（不阻断页面）。 */
(function (global) {
  'use strict';
  var ENDPOINT = (global.WL_CONFIG && global.WL_CONFIG.trackEndpoint) || '/track';
  function send(name, props) {
    try {
      var payload = JSON.stringify({
        event: name,
        page: global.location ? global.location.pathname : '',
        props: props || {},
        ts: Date.now(),
        ref: global.document ? global.document.referrer : '',
      });
      if (global.navigator && global.navigator.sendBeacon) {
        global.navigator.sendBeacon(ENDPOINT, new Blob([ payload ], { type: 'application/json' }));
      } else {
        var xhr = new global.XMLHttpRequest();
        xhr.open('POST', ENDPOINT, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(payload);
      }
    } catch (e) { /* 埋点永远不阻断页面 */ }
  }
  global.WLTrack = {
    event: send,
    pageview: function () { send('page_view', {}); },
  };
  if (global.document) {
    global.document.addEventListener('DOMContentLoaded', function () { global.WLTrack.pageview(); });
  }
})(window);
