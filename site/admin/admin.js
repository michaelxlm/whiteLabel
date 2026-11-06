/* ==========================================================================
 * 白标内容管理端（零构建版）：原生 JS，无需 npm install / 无打包步骤
 *   1) 登录：POST /admin/api/login（口令来自 server/admin-credentials.json）
 *   2) 内容：GET/PUT /admin/api/{articles|tools|navs|posts|ads|settings}（整份 JSON 编辑）
 *   3) 统计：GET /admin/api/stats（本地 events.jsonl 聚合，数据不出你的服务器）
 *   4) License：GET /admin/api/license（软校验结果仅展示，不阻断任何操作）
 *   5) 发布：POST /admin/api/publish + 轮询 /admin/api/publish/status 查看构建日志
 *   6) AI 助手：GET/POST /admin/api/aiConfig（读写 data/ai-config.json，保存即生效）
 *      + POST /admin/api/aiTest（用已保存配置做一次连通测试）
 *   说明：交付包内置本页；admin/ 目录下的 Vue 源码为可选二次开发素材，不参与运行。
 * ========================================================================== */
(function() {
  'use strict';

  var TOKEN_KEY = 'wl-admin-token';
  var DATASETS = [
    { name: 'articles', label: '文章（articles.json）' },
    { name: 'tools', label: '工具（tools.json）' },
    { name: 'navs', label: '导航（navs.json）' },
    { name: 'posts', label: '博客（posts.json）' },
    { name: 'ads', label: '广告位（ads.json）' },
    { name: 'settings', label: '站点设置（settings.json）' },
  ];
  var TABS = [
    { id: 'content', label: '内容' },
    { id: 'stats', label: '统计' },
    { id: 'ai', label: 'AI 助手' },
    { id: 'license', label: 'License' },
    { id: 'publish', label: '发布' },
  ];

  var state = { token: localStorage.getItem(TOKEN_KEY) || '', tab: 'content', dataset: 'articles', dirty: false };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* ------------------------------ 网络 ------------------------------ */
  function req(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function(res) {
        return res.json().catch(function() { return {}; }).then(function(data) {
          if (res.status === 401) {
            setToken('');
            throw new Error('登录已失效，请重新登录');
          }
          if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
          return data;
        });
      });
  }
  function setToken(t) {
    state.token = t || '';
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  /* ------------------------------ 视图切换 ------------------------------ */
  function showLogin() {
    $('view-login').hidden = false;
    $('view-app').hidden = true;
    $('btn-logout').hidden = true;
    $('lic-badge').hidden = true;
  }
  function showApp() {
    $('view-login').hidden = true;
    $('view-app').hidden = false;
    $('btn-logout').hidden = false;
    renderTabs();
    renderPanel();
  }

  function setLicenseBadge(check) {
    var badge = $('lic-badge');
    // 不限域名 / 无远程校验：License 仅作购买标识，恒为正常，不再区分待核验。
    if (!check) { badge.hidden = true; return; }
    badge.hidden = false;
    badge.className = 'wl-badge ok';
    badge.textContent = 'License 正常';
  }

  /* ------------------------------ 登录 ------------------------------ */
  $('login-form').addEventListener('submit', function(ev) {
    ev.preventDefault();
    var msg = $('login-msg');
    msg.textContent = '';
    req('POST', '/admin/api/login', { user: $('login-user').value.trim(), pass: $('login-pass').value })
      .then(function(r) {
        setToken(r.token);
        setLicenseBadge(r.license);
        $('login-pass').value = '';
        showApp();
      })
      .catch(function(e) { msg.textContent = e.message === 'invalid credentials' ? '账号或口令不正确' : e.message; });
  });

  $('btn-logout').addEventListener('click', function() {
    req('POST', '/admin/api/logout', {}).catch(function() { /* 忽略 */ }).then(function() {
      setToken('');
      showLogin();
    });
  });

  /* ------------------------------ Tab ------------------------------ */
  function renderTabs() {
    var tabs = $('tabs');
    clear(tabs);
    TABS.forEach(function(t) {
      var b = el('button', t.id === state.tab ? 'active' : '', t.label);
      b.type = 'button';
      b.addEventListener('click', function() {
        if (state.dirty && !confirm('当前 JSON 尚未保存，确定切换吗？')) return;
        state.dirty = false;
        state.tab = t.id;
        renderTabs();
        renderPanel();
      });
      tabs.appendChild(b);
    });
  }

  function renderPanel() {
    var panel = $('panel');
    clear(panel);
    if (state.tab === 'content') renderContent(panel);
    else if (state.tab === 'stats') renderStats(panel);
    else if (state.tab === 'ai') renderAi(panel);
    else if (state.tab === 'license') renderLicense(panel);
    else renderPublish(panel);
  }

  /* ------------------------------ 内容 ------------------------------ */
  function renderContent(panel) {
    var row = el('div', 'wl-row');
    var sel = document.createElement('select');
    DATASETS.forEach(function(d) {
      var o = document.createElement('option');
      o.value = d.name;
      o.textContent = d.label;
      if (d.name === state.dataset) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function() {
      if (state.dirty && !confirm('当前 JSON 尚未保存，确定切换吗？')) { sel.value = state.dataset; return; }
      state.dirty = false;
      state.dataset = sel.value;
      renderPanel();
    });
    row.appendChild(sel);

    var saveBtn = el('button', 'wl-btn primary', '保存并生效');
    saveBtn.type = 'button';
    saveBtn.style.width = 'auto';
    var fmtBtn = el('button', 'wl-btn', '格式化');
    fmtBtn.type = 'button';
    var reloadBtn = el('button', 'wl-btn ghost', '重新载入');
    reloadBtn.type = 'button';
    var status = el('span', 'wl-status');
    row.appendChild(saveBtn);
    row.appendChild(fmtBtn);
    row.appendChild(reloadBtn);
    row.appendChild(status);
    panel.appendChild(row);

    panel.appendChild(el('p', 'wl-hint',
      '直接编辑整份 JSON（结构与 data/ 下的文件一致）。保存后内容才落盘；要让访客看到改动，请到「发布」重新构建一次。'));

    var ta = document.createElement('textarea');
    ta.className = 'wl-mono';
    ta.spellcheck = false;
    panel.appendChild(ta);

    function setStatus(text, ok) {
      status.textContent = text;
      status.className = 'wl-status ' + (ok ? 'ok' : 'err');
    }
    function load() {
      ta.value = '加载中…';
      req('GET', '/admin/api/' + state.dataset)
        .then(function(r) { ta.value = JSON.stringify(r.data, null, 2); state.dirty = false; setStatus('', true); })
        .catch(function(e) { ta.value = ''; setStatus(e.message, false); });
    }
    ta.addEventListener('input', function() { state.dirty = true; setStatus('未保存', false); });

    fmtBtn.addEventListener('click', function() {
      try {
        ta.value = JSON.stringify(JSON.parse(ta.value), null, 2);
        setStatus('格式正常', true);
      } catch (e) { setStatus('JSON 语法错误：' + e.message, false); }
    });

    reloadBtn.addEventListener('click', function() {
      if (state.dirty && !confirm('放弃未保存的修改？')) return;
      load();
    });

    saveBtn.addEventListener('click', function() {
      var data;
      try { data = JSON.parse(ta.value); } catch (e) { setStatus('JSON 语法错误，未保存：' + e.message, false); return; }
      saveBtn.disabled = true;
      req('PUT', '/admin/api/' + state.dataset, { data: data })
        .then(function() { state.dirty = false; setStatus('已保存（记得点「发布」重新构建）', true); })
        .catch(function(e) { setStatus(e.message, false); })
        .then(function() { saveBtn.disabled = false; });
    });

    load();
  }

  /* ------------------------------ 统计 ------------------------------ */
  function renderStats(panel) {
    panel.appendChild(el('h2', '', '本地访问统计'));
    panel.appendChild(el('p', 'wl-hint', '数据来自本站 /track 埋点写入的 data/stats/events.jsonl，只存在你自己的服务器。'));
    var box = el('div');
    panel.appendChild(box);

    function table(title, obj) {
      var keys = Object.keys(obj || {});
      var h = el('h2', '', title);
      h.style.marginTop = '16px';
      box.appendChild(h);
      if (!keys.length) { box.appendChild(el('p', 'wl-hint', '暂无数据')); return; }
      var t = el('table', 'wl-table');
      var thead = document.createElement('thead');
      var hr = document.createElement('tr');
      hr.appendChild(el('th', '', '项目'));
      hr.appendChild(el('th', '', '次数'));
      thead.appendChild(hr);
      t.appendChild(thead);
      var tb = document.createElement('tbody');
      keys.sort(function(a, b) { return obj[b] - obj[a]; }).forEach(function(k) {
        var tr = document.createElement('tr');
        tr.appendChild(el('td', '', k));
        tr.appendChild(el('td', '', obj[k]));
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      box.appendChild(t);
    }

    boot('/admin/api/stats', function(d) {
      var grid = el('div', 'wl-grid');
      [ [ '总事件', d.total ], [ '事件类型', Object.keys(d.byEvent || {}).length ], [ '覆盖页面', Object.keys(d.byPage || {}).length ] ]
        .forEach(function(pair) {
          var c = el('div', 'wl-stat');
          c.appendChild(el('b', '', pair[1] === undefined ? 0 : pair[1]));
          c.appendChild(el('span', '', pair[0]));
          grid.appendChild(c);
        });
      box.appendChild(grid);
      table('按事件', d.byEvent);
      table('按页面', d.byPage);
      table('按广告位', d.bySlot);
      table('按天', d.days);
    }, box);
  }

  /* ------------------------------ AI 助手 ------------------------------ */
  function renderAi(panel) {
    panel.appendChild(el('h2', '', 'AI 助手（自带 Key · 本地代理）'));
    panel.appendChild(el('p', 'wl-hint',
      '使用你自己的 OpenAI 兼容端点与密钥：请求由你的服务器直连你的模型，不经过任何第三方；密钥只写入服务器端 data/ai-config.json（已 gitignore）。保存即生效，无需重新发布。'));
    var box = el('div', 'wl-ai');
    panel.appendChild(box);

    boot('/admin/api/aiConfig', function(r) {
      var cfg = r.data || {};
      var inputs = {};

      function field(labelText, type, key) {
        var lab = el('label', null, labelText);
        var inp = document.createElement(type === 'textarea' ? 'textarea' : 'input');
        if (type !== 'textarea') inp.type = type;
        inp.value = cfg[key] === undefined || cfg[key] === null ? '' : cfg[key];
        lab.appendChild(inp);
        inputs[key] = inp;
        return lab;
      }

      var enableLab = el('label', 'wl-ai-enable');
      var enableInp = document.createElement('input');
      enableInp.type = 'checkbox';
      enableInp.checked = !!cfg.enable;
      enableLab.appendChild(enableInp);
      enableLab.appendChild(el('span', null, '开启 AI 助手（访客端出现悬浮气泡）'));
      box.appendChild(enableLab);
      inputs.enable = enableInp;

      box.appendChild(field('baseURL（如 https://api.openai.com/v1）', 'text', 'baseURL'));
      box.appendChild(field('apiKey（只存本地 ai-config.json）', 'password', 'apiKey'));
      box.appendChild(field('model', 'text', 'model'));
      box.appendChild(field('systemPrompt（人设与回答约束）', 'textarea', 'systemPrompt'));
      box.appendChild(field('fallbackAnswer（未配模型或调用失败时的兜底回答）', 'textarea', 'fallbackAnswer'));

      var faqLab = el('label', null, 'faqs（JSON 数组，[{q,a},...] 关键词兜底，最多 50 条）');
      var faqTa = document.createElement('textarea');
      faqTa.className = 'wl-ai-json';
      faqTa.value = JSON.stringify(cfg.faqs || [], null, 2);
      faqLab.appendChild(faqTa);
      box.appendChild(faqLab);
      inputs.faqs = faqTa;

      box.appendChild(field('rateLimitPerMinute（单 IP 每分钟限流，1~120）', 'number', 'rateLimitPerMinute'));

      if (r.source === 'example') {
        box.appendChild(el('p', 'wl-hint', '当前展示的是交付包模板（ai-config.example.json），保存后才写入 data/ai-config.json 生效。'));
      }

      var row = el('div', 'wl-row');
      row.style.marginTop = '12px';
      var saveBtn = el('button', 'wl-btn primary', '保存');
      saveBtn.type = 'button';
      saveBtn.style.width = 'auto';
      var testBtn = el('button', 'wl-btn', '保存并测试连接');
      testBtn.type = 'button';
      var status = el('span', 'wl-status');
      row.appendChild(saveBtn);
      row.appendChild(testBtn);
      row.appendChild(status);
      box.appendChild(row);

      function setStatus(text, ok) { status.textContent = text; status.className = 'wl-status ' + (ok ? 'ok' : 'err'); }
      function markDirty() { state.dirty = true; setStatus('未保存', false); }
      Object.keys(inputs).forEach(function(k) {
        inputs[k].addEventListener('input', markDirty);
        if (inputs[k].type === 'checkbox') inputs[k].addEventListener('change', markDirty);
      });

      function collect() {
        return {
          enable: inputs.enable.checked,
          baseURL: inputs.baseURL.value.trim(),
          apiKey: inputs.apiKey.value.trim(),
          model: inputs.model.value.trim(),
          systemPrompt: inputs.systemPrompt.value,
          fallbackAnswer: inputs.fallbackAnswer.value,
          faqs: JSON.parse(inputs.faqs.value || '[]'),
          rateLimitPerMinute: Number(inputs.rateLimitPerMinute.value) || 12,
        };
      }

      saveBtn.addEventListener('click', function() {
        var d;
        try { d = collect(); } catch (e) { setStatus('faqs JSON 语法错误：' + e.message, false); return; }
        saveBtn.disabled = true;
        req('POST', '/admin/api/aiConfig', { data: d })
          .then(function() { state.dirty = false; setStatus('已保存（立即生效，无需发布）', true); })
          .catch(function(e) { setStatus(e.message, false); })
          .then(function() { saveBtn.disabled = false; });
      });

      testBtn.addEventListener('click', function() {
        var d;
        try { d = collect(); } catch (e) { setStatus('faqs JSON 语法错误：' + e.message, false); return; }
        saveBtn.disabled = true;
        testBtn.disabled = true;
        setStatus('保存并测试中…', true);
        req('POST', '/admin/api/aiConfig', { data: d })
          .then(function() { state.dirty = false; return req('POST', '/admin/api/aiTest', {}); })
          .then(function(t) {
            if (t.ok) { setStatus('连通正常：' + (t.echo || ''), true); }
            else { setStatus('连通失败：' + (t.error || '未知原因'), false); }
          })
          .catch(function(e) { setStatus(e.message, false); })
          .then(function() { saveBtn.disabled = false; testBtn.disabled = false; });
      });
    }, box);
  }

  /* ------------------------------ License ------------------------------ */
  function renderLicense(panel) {
    panel.appendChild(el('h2', '', 'License 与授权信息'));
    var box = el('div');
    panel.appendChild(box);
    boot('/admin/api/license', function(d) {
      var lic = d.license || {};
      var t = el('table', 'wl-table');
      [ [ 'License Key', lic.key ], [ '被授权邮箱', lic.licenseeEmail ], [ '部署域名（选填·不限域名）', lic.domain ],
        [ '模板', lic.template ], [ '语言', lic.lang ], [ '签发时间', lic.issuedAt ? new Date(lic.issuedAt).toLocaleString('zh-CN', { hour12: false }) : '-' ] ]
        .forEach(function(pair) {
          var tr = document.createElement('tr');
          tr.appendChild(el('th', '', pair[0]));
          tr.appendChild(el('td', '', pair[1] || '-'));
          t.appendChild(tr);
        });
      box.appendChild(t);
      box.appendChild(el('p', 'wl-hint', '授权不限域名、永不过期：可在任意域名/多台服务器部署，换域名只需在站点设置里自行修改后重新发布，无需联系出售方。'));
    }, box);
  }

  /* ------------------------------ 发布 ------------------------------ */
  function renderPublish(panel) {
    panel.appendChild(el('h2', '', '发布（重新构建静态站）'));
    var row = el('div', 'wl-row');
    var btn = el('button', 'wl-btn primary', '开始发布');
    btn.type = 'button';
    btn.style.width = 'auto';
    var status = el('span', 'wl-status');
    row.appendChild(btn);
    row.appendChild(status);
    panel.appendChild(row);
    panel.appendChild(el('p', 'wl-hint', '发布会执行 node scripts/build.js，把 data/*.json 重新渲染成 dist/ 下的静态页面，通常数秒完成。'));
    var log = el('pre', 'wl-log', '尚未发布');
    panel.appendChild(log);

    var timer = null;
    function poll() {
      req('GET', '/admin/api/publish/status').then(function(r) {
        log.textContent = r.log || '（无输出）';
        log.scrollTop = log.scrollHeight;
        if (r.running) {
          status.textContent = '构建中…';
          status.className = 'wl-status';
        } else {
          status.textContent = '构建结束';
          status.className = 'wl-status ok';
          if (timer) { clearInterval(timer); timer = null; }
          btn.disabled = false;
        }
      }).catch(function(e) {
        status.textContent = e.message;
        status.className = 'wl-status err';
        if (timer) { clearInterval(timer); timer = null; }
        btn.disabled = false;
      });
    }

    btn.addEventListener('click', function() {
      btn.disabled = true;
      status.textContent = '触发中…';
      status.className = 'wl-status';
      req('POST', '/admin/api/publish', {})
        .then(function() {
          if (timer) clearInterval(timer);
          timer = setInterval(poll, 1500);
          poll();
        })
        .catch(function(e) {
          btn.disabled = false;
          status.textContent = e.message;
          status.className = 'wl-status err';
        });
    });

    req('GET', '/admin/api/publish/status').then(function(r) {
      log.textContent = r.log || '尚未发布';
      if (r.running) {
        status.textContent = '构建中…';
        btn.disabled = true;
        timer = setInterval(poll, 1500);
      }
    }).catch(function() { /* 首次进入无历史日志，忽略 */ });
  }

  /* ------------------------------ 通用加载壳 ------------------------------ */
  function boot(path, onOk, box) {
    var loading = el('p', 'wl-hint', '加载中…');
    box.appendChild(loading);
    req('GET', path)
      .then(function(d) { box.removeChild(loading); onOk(d); })
      .catch(function(e) {
        loading.textContent = e.message;
        loading.className = 'wl-status err';
        if (e.message.indexOf('登录已失效') >= 0) showLogin();
      });
  }

  /* ------------------------------ 启动 ------------------------------ */
  if (state.token) {
    req('GET', '/admin/api/license')
      .then(function(r) { setLicenseBadge(r.check); showApp(); })
      .catch(function() { setToken(''); showLogin(); });
  } else {
    showLogin();
  }
})();
