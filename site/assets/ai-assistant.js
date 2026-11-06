/*!
 * ai-assistant.js · 白标 AI 助手悬浮问答组件（WO-151）
 * 装载：build.js 注入 <script src="/assets/ai-assistant.js" defer></script>（随页面构建产物）
 * 说明：
 *   - 仿中台 ai-widget.js（WO-146）的气泡 + 问答面板，ES5 零依赖、包内本地副本；
 *   - 端点固定同源 /api/ai/status 与 /api/ai/chat，由 server/index.js 代理到
 *     客户自配模型端点——绝不引用任何第三方域名（离线自足口径同 license.js）；
 *   - 开关在运行时判定：status 非 enable/未配置/纯静态托管 404 时组件整体不出现，
 *     站点功能零影响；配置改完无需重新构建发布；
 *   - 面板底部固定「数据服务与致谢」引导区（window.__AIGUIDE，构建期由
 *     promo.json + 模板配置注入，均为 <a> 链接、不产生运行时请求）；
 *   - 提问事件走本地埋点 WLTrack.event('ai_chat')，数据只落客户自己的服务器。
 */
(function (global, doc) {
  'use strict';

  var STATUS_ENDPOINT = '/api/ai/status';
  var CHAT_ENDPOINT = '/api/ai/chat';

  function el(tag, cls, text) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildUi() {
    var style = doc.createElement('style');
    style.textContent = [
      '.wla-b{position:fixed;right:20px;bottom:20px;z-index:9998;width:52px;height:52px;border-radius:50%;',
      'background:#2457d6;color:#fff;border:0;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.18);',
      'font:600 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;}',
      '.wla-b:hover{background:#1d4bbd;}',
      '.wla-p{position:fixed;right:20px;bottom:84px;z-index:9999;width:320px;max-width:calc(100vw - 32px);',
      'max-height:min(500px,72vh);background:#fff;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.18);',
      'display:none;flex-direction:column;overflow:hidden;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;}',
      '.wla-p.is-open{display:flex;}',
      '.wla-hd{padding:10px 14px;background:#2457d6;color:#fff;font-weight:600;display:flex;align-items:center;justify-content:space-between;}',
      '.wla-hd .wla-x{background:transparent;border:0;color:#fff;cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;}',
      '.wla-body{flex:1;overflow-y:auto;padding:12px 14px;background:#fafbfe;color:#222;}',
      '.wla-msg{margin:0 0 10px;padding:8px 12px;border-radius:10px;white-space:pre-wrap;word-break:break-word;}',
      '.wla-msg.u{background:#e6efff;margin-left:auto;max-width:82%;}',
      '.wla-msg.a{background:#fff;border:1px solid #ebebef;max-width:92%;}',
      '.wla-msg.s{color:#8a94a6;font-size:12px;padding:0;}',
      '.wla-guide{padding:8px 12px;border-top:1px solid #ebebef;background:#fff;font-size:12px;color:#8a94a6;}',
      '.wla-guide a{color:#2457d6;text-decoration:none;margin-right:10px;}',
      '.wla-f{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #ebebef;background:#fff;}',
      '.wla-in{flex:1;padding:8px 10px;border:1px solid #d5dbe8;border-radius:8px;font:inherit;outline:none;}',
      '.wla-in:focus{border-color:#2457d6;}',
      '.wla-s{padding:8px 14px;background:#2457d6;color:#fff;border:0;border-radius:8px;cursor:pointer;font:inherit;}',
      '.wla-s:disabled{opacity:.55;cursor:wait;}',
      '@media (prefers-color-scheme:dark){.wla-p{background:#1b1e26;color:#e6e8ef;}',
      '.wla-body{background:#151821;color:#e6e8ef;}.wla-msg.a{background:#20242f;border-color:#2c3040;}',
      '.wla-msg.u{background:#244085;}.wla-f,.wla-guide{background:#1b1e26;border-top-color:#2c3040;}',
      '.wla-in{background:#151821;color:#e6e8ef;border-color:#2c3040;}}',
    ].join('');
    doc.head.appendChild(style);

    var btn = el('button', 'wla-b', 'AI');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'AI 助手');
    btn.title = 'AI 助手';

    var panel = el('div', 'wla-p');
    var hd = el('div', 'wla-hd');
    hd.appendChild(el('span', null, 'AI 助手'));
    var close = el('button', 'wla-x', '×');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    hd.appendChild(close);
    panel.appendChild(hd);

    var body = el('div', 'wla-body');
    body.appendChild(el('div', 'wla-msg s', '你好，我可以帮你快速了解本站。回答由站点主理人自配的模型生成。'));
    panel.appendChild(body);

    // 「数据服务与致谢」固定引导区：纯 <a> 链接，不产生运行时请求
    var guideItems = global.__AIGUIDE || [];
    if (guideItems.length) {
      var guide = el('div', 'wla-guide');
      guide.appendChild(el('span', null, '数据服务与致谢：'));
      guideItems.slice(0, 6).forEach(function (g) {
        var a = el('a', null, g.label || g.url);
        a.href = g.url;
        a.target = '_blank';
        a.rel = 'noopener';
        guide.appendChild(a);
      });
      panel.appendChild(guide);
    }

    var form = el('div', 'wla-f');
    var input = el('input', 'wla-in');
    input.type = 'text';
    input.placeholder = '想问什么？回车发送';
    input.setAttribute('aria-label', '想问什么？回车发送');
    var send = el('button', 'wla-s', '发送');
    send.type = 'button';
    form.appendChild(input);
    form.appendChild(send);
    panel.appendChild(form);

    doc.body.appendChild(btn);
    doc.body.appendChild(panel);

    btn.addEventListener('click', function () { panel.classList.toggle('is-open'); if (panel.classList.contains('is-open')) input.focus(); });
    close.addEventListener('click', function () { panel.classList.remove('is-open'); });

    function appendUser(text) {
      var n = el('div', 'wla-msg u', text);
      body.appendChild(n); body.scrollTop = body.scrollHeight;
      return n;
    }
    function appendAnswer(text) {
      var n = el('div', 'wla-msg a', text || '');
      body.appendChild(n); body.scrollTop = body.scrollHeight;
      return n;
    }

    // 会话上下文：随请求带最近 10 条（服务端会再校验裁剪）
    var history = [];
    var busy = false;
    function submit() {
      var q = String(input.value || '').trim();
      if (!q || busy) return;
      busy = true;
      send.disabled = true;
      appendUser(q);
      input.value = '';
      var holder = appendAnswer('思考中…');
      fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, messages: history }),
      }).then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (json) {
          var answer = json.disabled ? '当前站点未开启 AI 助手。' : (json.answer || '暂时没答上来，稍后再试～');
          holder.textContent = answer;
          history.push({ role: 'user', content: q });
          history.push({ role: 'assistant', content: answer });
          if (history.length > 10) history = history.slice(-10);
          if (global.WLTrack) global.WLTrack.event('ai_chat', { fallback: !!json.fallback });
          body.scrollTop = body.scrollHeight;
        })
        .catch(function () {
          holder.textContent = '请求失败，稍后再试。';
        })
        .then(function () {
          busy = false;
          send.disabled = false;
          input.focus();
        });
    }

    send.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
  }

  function boot() {
    try {
      // 运行时开关探测：纯静态托管 / 服务未起 / 未配置 / 关闭 → 组件整体不出现
      fetch(STATUS_ENDPOINT).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (st) {
          if (st && st.enable && st.configured) buildUi();
        })
        .catch(function () { /* 探测失败静默：不挂载 */ });
    } catch (e) { /* 挂载失败静默：不阻塞宿主页面 */ }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this, document);
