/* theme.js · 明暗主题切换（偏好记 localStorage，默认跟随系统）
 * 无第三方依赖，在 <head> 末尾内联引入以避免首屏闪烁。 */
(function () {
  'use strict';
  var KEY = 'wl-theme';
  var root = document.documentElement;
  function applySaved() {
    var saved = '';
    try { saved = localStorage.getItem(KEY) || ''; } catch (e) {}
    if (saved === 'light' || saved === 'dark') root.setAttribute('data-theme', saved);
  }
  applySaved();
  window.WLTheme = {
    toggle: function () {
      var cur = root.getAttribute('data-theme')
        || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      var next = cur === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) {}
      return next;
    },
  };
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.querySelector('.theme-toggle');
    if (btn) btn.addEventListener('click', function () { window.WLTheme.toggle(); });
  });
})();
