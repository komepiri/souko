/*!
 * Mini DevTools for Mobile — bookmarklet-loadable dev panel
 * - Shadow DOM(open)でページのCSSと完全に分離(お互いに干渉しない)
 * - Console / Elements / Network / Storage の4タブ
 * - スマホのタッチ操作前提のUI(ボトムシート・ドラッグでリサイズ)
 * Usage: このファイルをブックマークレットから <script> 注入して呼び出す
 */
(function () {
  'use strict';

  // すでに起動していたらトグルするだけ
  if (window.__miniDevTools) {
    window.__miniDevTools.toggle();
    return;
  }

  // ---------- ホスト要素(ページCSSの影響を受けない/与えない) ----------
  var host = document.createElement('div');
  host.id = '__mini_devtools_host__';
  // ページ側のCSSに巻き込まれないよう、host自体はinlineで最小限のリセットのみ
  host.style.cssText = [
    'all: initial',
    'position: fixed',
    'inset: 0',
    'z-index: 2147483647',
    'pointer-events: none',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ].join(';');
  document.documentElement.appendChild(host);

  var shadow = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent =
    ':host{all:initial;}' +
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}' +
    '.fab{position:fixed;right:16px;bottom:16px;width:48px;height:48px;border-radius:50%;' +
      'background:#1e1e1e;color:#4fc3f7;display:flex;align-items:center;justify-content:center;' +
      'font-size:20px;font-weight:bold;box-shadow:0 2px 10px rgba(0,0,0,.5);pointer-events:auto;' +
      'user-select:none;touch-action:none;border:2px solid #333;}' +
    '.panel{position:fixed;left:0;right:0;bottom:0;height:46vh;min-height:150px;max-height:90vh;' +
      'background:#1e1e1e;color:#e0e0e0;display:flex;flex-direction:column;pointer-events:auto;' +
      'box-shadow:0 -2px 12px rgba(0,0,0,.6);font-size:13px;border-top:1px solid #333;}' +
    '.panel.hidden{display:none;}' +
    '.drag{height:14px;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:ns-resize;}' +
    '.drag span{width:36px;height:4px;border-radius:2px;background:#555;}' +
    '.tabs{display:flex;border-bottom:1px solid #333;flex-shrink:0;overflow-x:auto;}' +
    '.tab{flex:1;padding:9px 4px;text-align:center;color:#888;font-size:12px;white-space:nowrap;}' +
    '.tab.active{color:#4fc3f7;border-bottom:2px solid #4fc3f7;font-weight:600;}' +
    '.toolbar{display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid #2a2a2a;flex-shrink:0;}' +
    '.btn{background:#2c2c2c;color:#ccc;border:1px solid #3a3a3a;border-radius:5px;padding:5px 9px;font-size:12px;}' +
    '.btn:active{background:#3a3a3a;}' +
    '.btn.on{background:#0d5c8a;color:#fff;border-color:#0d5c8a;}' +
    '.spacer{flex:1;}' +
    '.body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:6px 8px;}' +
    '.view{display:none;height:100%;flex-direction:column;}' +
    '.view.active{display:flex;}' +
    '.log{padding:4px 2px;border-bottom:1px solid #262626;font-family:Menlo,Consolas,monospace;' +
      'font-size:12px;white-space:pre-wrap;word-break:break-all;}' +
    '.log.error{color:#ff6b6b;}' +
    '.log.warn{color:#ffd166;}' +
    '.log.info{color:#4fc3f7;}' +
    '.log.cmd{color:#9ccc65;}' +
    '.log.net{color:#ba68c8;}' +
    '.consolelist{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;}' +
    '.inputrow{display:flex;gap:6px;padding:6px 8px;border-top:1px solid #2a2a2a;flex-shrink:0;}' +
    '.inputrow input{flex:1;background:#111;color:#e0e0e0;border:1px solid #333;border-radius:5px;' +
      'padding:8px;font-size:14px;font-family:Menlo,Consolas,monospace;}' +
    '.row{padding:6px 4px;border-bottom:1px solid #262626;font-size:12px;}' +
    '.row .main{color:#e0e0e0;font-family:Menlo,Consolas,monospace;word-break:break-all;}' +
    '.row .sub{color:#888;font-size:11px;margin-top:2px;}' +
    '.kv{display:flex;justify-content:space-between;gap:8px;padding:6px 4px;border-bottom:1px solid #262626;font-size:12px;}' +
    '.kv .k{color:#4fc3f7;font-family:Menlo,Consolas,monospace;flex-shrink:0;max-width:40%;overflow:hidden;text-overflow:ellipsis;}' +
    '.kv .v{color:#ccc;font-family:Menlo,Consolas,monospace;word-break:break-all;text-align:right;flex:1;}' +
    '.kv button{margin-left:6px;background:#3a1e1e;color:#ff8a8a;border:1px solid #4a2a2a;border-radius:4px;padding:2px 6px;font-size:11px;}' +
    '.empty{color:#666;text-align:center;padding:20px 8px;font-size:12px;}' +
    '.badge{display:inline-block;padding:0 5px;border-radius:3px;font-size:10px;margin-right:4px;}' +
    '.badge.get{background:#0d5c8a;color:#fff;}' +
    '.badge.post{background:#5c8a0d;color:#fff;}' +
    '.badge.ok{background:#2e7d32;color:#fff;}' +
    '.badge.err{background:#c62828;color:#fff;}' +
    '.highlight{position:fixed;background:rgba(79,195,247,.25);border:1px solid #4fc3f7;pointer-events:none;z-index:2147483647;}' +
    '.eltinfo{padding:6px 4px;font-family:Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;border-bottom:1px solid #333;background:#151515;}' +
    '.subtabs{display:flex;gap:6px;padding:5px 8px;border-bottom:1px solid #2a2a2a;flex-shrink:0;}' +
    '.subtabs .btn.on{background:#0d5c8a;}';
  shadow.appendChild(style);

  // ---------- FAB(トグルボタン、ドラッグ移動可) ----------
  var fab = document.createElement('div');
  fab.className = 'fab';
  fab.textContent = '</>';
  shadow.appendChild(fab);
  makeDraggableFab(fab);

  // ---------- パネル本体 ----------
  var panel = document.createElement('div');
  panel.className = 'panel hidden';
  panel.innerHTML =
    '<div class="drag"><span></span></div>' +
    '<div class="tabs">' +
      '<div class="tab active" data-tab="console">Console</div>' +
      '<div class="tab" data-tab="elements">Elements</div>' +
      '<div class="tab" data-tab="network">Network</div>' +
      '<div class="tab" data-tab="storage">Storage</div>' +
    '</div>' +
    '<div class="body">' +
      '<div class="view active" data-view="console">' +
        '<div class="toolbar"><button class="btn" data-act="clear-console">Clear</button>' +
          '<span class="spacer"></span><button class="btn" data-act="close">✕ Close</button></div>' +
        '<div class="consolelist" id="consolelist"></div>' +
        '<div class="inputrow"><input id="cmdinput" placeholder="JSを実行... 例: document.title" />' +
          '<button class="btn" id="cmdrun">実行</button></div>' +
      '</div>' +
      '<div class="view" data-view="elements">' +
        '<div class="toolbar"><button class="btn" id="pickbtn">🎯 要素を選択</button>' +
          '<span class="spacer"></span><button class="btn" data-act="close">✕ Close</button></div>' +
        '<div id="eltinfo" class="empty">「要素を選択」をタップしてページ内の要素をタップしてください</div>' +
      '</div>' +
      '<div class="view" data-view="network">' +
        '<div class="toolbar"><button class="btn" data-act="clear-network">Clear</button>' +
          '<span class="spacer"></span><button class="btn" data-act="close">✕ Close</button></div>' +
        '<div id="netlist"><div class="empty">通信を待機中...(fetch / XHR)</div></div>' +
      '</div>' +
      '<div class="view" data-view="storage">' +
        '<div class="subtabs">' +
          '<button class="btn on" data-store="local">localStorage</button>' +
          '<button class="btn" data-store="session">sessionStorage</button>' +
          '<button class="btn" data-store="cookie">cookie</button>' +
          '<span class="spacer"></span><button class="btn" data-act="close">✕ Close</button>' +
        '</div>' +
        '<div id="storelist"></div>' +
      '</div>' +
    '</div>';
  shadow.appendChild(panel);

  var $ = function (sel) { return shadow.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(shadow.querySelectorAll(sel)); };

  // ---------- 開閉制御 ----------
  function show() { panel.classList.remove('hidden'); }
  function hide() { panel.classList.add('hidden'); }
  fab.addEventListener('click', function (e) {
    if (fab.dataset.dragged === '1') { fab.dataset.dragged = '0'; return; }
    panel.classList.contains('hidden') ? show() : hide();
  });
  shadow.addEventListener('click', function (e) {
    if (e.target && e.target.dataset && e.target.dataset.act === 'close') hide();
  });

  // ---------- タブ切り替え ----------
  $$('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('.tab').forEach(function (t) { t.classList.remove('active'); });
      $$('.view').forEach(function (v) { v.classList.remove('active'); });
      tab.classList.add('active');
      $('.view[data-view="' + tab.dataset.tab + '"]').classList.add('active');
    });
  });

  // ---------- パネルの高さをドラッグでリサイズ ----------
  (function () {
    var dragHandle = $('.drag');
    var startY = 0, startH = 0;
    function onStart(e) {
      startY = (e.touches ? e.touches[0].clientY : e.clientY);
      startH = panel.getBoundingClientRect().height;
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
    }
    function onMove(e) {
      e.preventDefault();
      var y = (e.touches ? e.touches[0].clientY : e.clientY);
      var newH = startH - (y - startY);
      var vh = window.innerHeight;
      newH = Math.max(150, Math.min(vh * 0.9, newH));
      panel.style.height = newH + 'px';
    }
    function onEnd() {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
    }
    dragHandle.addEventListener('touchstart', onStart, { passive: true });
    dragHandle.addEventListener('mousedown', onStart);
  })();

  function makeDraggableFab(el) {
    var sx, sy, ox, oy, moved;
    function start(e) {
      moved = false;
      var p = e.touches ? e.touches[0] : e;
      sx = p.clientX; sy = p.clientY;
      var r = el.getBoundingClientRect();
      ox = r.left; oy = r.top;
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end);
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', end);
    }
    function move(e) {
      var p = e.touches ? e.touches[0] : e;
      var dx = p.clientX - sx, dy = p.clientY - sy;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      if (!moved) return;
      e.preventDefault();
      el.style.left = (ox + dx) + 'px';
      el.style.top = (oy + dy) + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    }
    function end() {
      el.dataset.dragged = moved ? '1' : '0';
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
    }
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('mousedown', start);
  }

  // ================= Console =================
  var consolelist = $('#consolelist');
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function stringify(a) {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === 'object' && a !== null) {
      try { return JSON.stringify(a, null, 1); } catch (e) { return String(a); }
    }
    return String(a);
  }
  function addConsoleEntry(level, args) {
    var div = document.createElement('div');
    div.className = 'log ' + level;
    div.innerHTML = esc(Array.prototype.map.call(args, stringify).join(' '));
    consolelist.appendChild(div);
    consolelist.scrollTop = consolelist.scrollHeight;
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level];
    console[level] = function () {
      orig.apply(console, arguments);
      addConsoleEntry(level === 'debug' ? 'log' : level, arguments);
    };
  });
  window.addEventListener('error', function (e) {
    addConsoleEntry('error', [e.message + '  @ ' + (e.filename || '') + ':' + e.lineno]);
  });
  window.addEventListener('unhandledrejection', function (e) {
    addConsoleEntry('error', ['Unhandled promise rejection: ' + stringify(e.reason)]);
  });

  var cmdinput = $('#cmdinput');
  function runCmd() {
    var code = cmdinput.value;
    if (!code) return;
    var d = document.createElement('div');
    d.className = 'log cmd';
    d.textContent = '> ' + code;
    consolelist.appendChild(d);
    try {
      var result = (0, eval)(code);
      addConsoleEntry('log', [result]);
    } catch (err) {
      addConsoleEntry('error', [err]);
    }
    cmdinput.value = '';
    consolelist.scrollTop = consolelist.scrollHeight;
  }
  $('#cmdrun').addEventListener('click', runCmd);
  cmdinput.addEventListener('keydown', function (e) { if (e.key === 'Enter') runCmd(); });
  shadow.addEventListener('click', function (e) {
    if (e.target && e.target.dataset && e.target.dataset.act === 'clear-console') consolelist.innerHTML = '';
  });

  // ================= Elements =================
  var picking = false;
  var pickbtn = $('#pickbtn');
  var eltinfo = $('#eltinfo');
  var hl = document.createElement('div');
  hl.className = 'highlight';
  hl.style.display = 'none';
  shadow.appendChild(hl);

  pickbtn.addEventListener('click', function () {
    picking = !picking;
    pickbtn.classList.toggle('on', picking);
    pickbtn.textContent = picking ? '🎯 選択中(タップで確定)' : '🎯 要素を選択';
    hl.style.display = 'none';
  });

  document.addEventListener('mousemove', pickMove, true);
  document.addEventListener('touchmove', function (e) {
    if (!picking) return;
    var t = e.touches[0];
    var el = document.elementFromPoint(t.clientX, t.clientY);
    highlightEl(el);
  }, true);
  document.addEventListener('click', pickClick, true);
  document.addEventListener('touchend', pickClick, true);

  function pickMove(e) {
    if (!picking) return;
    highlightEl(e.target);
  }
  function highlightEl(el) {
    if (!el || host.contains(el)) return;
    var r = el.getBoundingClientRect();
    hl.style.display = 'block';
    hl.style.left = r.left + 'px';
    hl.style.top = r.top + 'px';
    hl.style.width = r.width + 'px';
    hl.style.height = r.height + 'px';
    hl._current = el;
  }
  function pickClick(e) {
    if (!picking) return;
    var el = e.target && host.contains(e.target) ? null : (hl._current || e.target);
    if (!el || host.contains(el)) return;
    e.preventDefault();
    e.stopPropagation();
    picking = false;
    pickbtn.classList.remove('on');
    pickbtn.textContent = '🎯 要素を選択';
    showEltInfo(el);
  }
  function showEltInfo(el) {
    var cs = getComputedStyle(el);
    var attrs = Array.prototype.map.call(el.attributes, function (a) { return a.name + '="' + a.value + '"'; }).join(' ');
    var text =
      '<' + el.tagName.toLowerCase() + (attrs ? ' ' + attrs : '') + '>\n\n' +
      'size: ' + Math.round(el.getBoundingClientRect().width) + ' x ' + Math.round(el.getBoundingClientRect().height) + '\n' +
      'display: ' + cs.display + '   position: ' + cs.position + '\n' +
      'color: ' + cs.color + '\n' +
      'background: ' + cs.backgroundColor + '\n' +
      'font: ' + cs.fontSize + ' ' + cs.fontFamily + '\n' +
      'margin: ' + cs.margin + '\n' +
      'padding: ' + cs.padding + '\n\n' +
      'text: ' + (el.textContent || '').trim().slice(0, 150);
    eltinfo.className = 'eltinfo';
    eltinfo.textContent = text;
    window.__mdt_lastEl = el; // console から $0 相当で使えるように
    addConsoleEntry('info', ['選択した要素は window.__mdt_lastEl から参照できます']);
  }

  // ================= Network =================
  var netlist = $('#netlist');
  function addNetRow(method, url, statusOrErr, ms, ok) {
    if (netlist.querySelector('.empty')) netlist.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'row';
    var badgeM = '<span class="badge ' + (method === 'GET' ? 'get' : 'post') + '">' + method + '</span>';
    var badgeS = '<span class="badge ' + (ok ? 'ok' : 'err') + '">' + statusOrErr + '</span>';
    row.innerHTML = '<div class="main">' + badgeM + badgeS + esc(url) + '</div>' +
      '<div class="sub">' + ms + 'ms</div>';
    netlist.appendChild(row);
    netlist.scrollTop = netlist.scrollHeight;
  }
  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      var t0 = performance.now();
      return origFetch.apply(this, arguments).then(function (res) {
        addNetRow(method.toUpperCase(), url, res.status, Math.round(performance.now() - t0), res.ok);
        return res;
      }).catch(function (err) {
        addNetRow(method.toUpperCase(), url, 'ERR', Math.round(performance.now() - t0), false);
        throw err;
      });
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__mdt = { method: method, url: url, t0: performance.now() };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var self = this;
    this.addEventListener('loadend', function () {
      if (self.__mdt) {
        addNetRow(String(self.__mdt.method).toUpperCase(), self.__mdt.url, self.status,
          Math.round(performance.now() - self.__mdt.t0), self.status >= 200 && self.status < 400);
      }
    });
    return origSend.apply(this, arguments);
  };
  shadow.addEventListener('click', function (e) {
    if (e.target && e.target.dataset && e.target.dataset.act === 'clear-network') {
      netlist.innerHTML = '<div class="empty">通信を待機中...(fetch / XHR)</div>';
    }
  });

  // ================= Storage =================
  var storelist = $('#storelist');
  var currentStore = 'local';
  function renderStorage() {
    storelist.innerHTML = '';
    if (currentStore === 'cookie') {
      var pairs = document.cookie.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!pairs.length) { storelist.innerHTML = '<div class="empty">cookieはありません</div>'; return; }
      pairs.forEach(function (p) {
        var idx = p.indexOf('=');
        addKv(p.slice(0, idx), p.slice(idx + 1), null);
      });
      return;
    }
    var store = currentStore === 'local' ? localStorage : sessionStorage;
    if (!store.length) { storelist.innerHTML = '<div class="empty">データがありません</div>'; return; }
    for (var i = 0; i < store.length; i++) {
      (function (key) {
        addKv(key, store.getItem(key), function () { store.removeItem(key); renderStorage(); });
      })(store.key(i));
    }
  }
  function addKv(k, v, onDel) {
    var row = document.createElement('div');
    row.className = 'kv';
    row.innerHTML = '<div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div>';
    if (onDel) {
      var b = document.createElement('button');
      b.textContent = '削除';
      b.addEventListener('click', onDel);
      row.appendChild(b);
    }
    storelist.appendChild(row);
  }
  $$('[data-store]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-store]').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      currentStore = b.dataset.store;
      renderStorage();
    });
  });
  $$('.tab').forEach(function (tab) {
    if (tab.dataset.tab === 'storage') tab.addEventListener('click', renderStorage);
  });

  // ---------- 外部API ----------
  window.__miniDevTools = {
    toggle: function () { panel.classList.contains('hidden') ? show() : hide(); },
    destroy: function () {
      host.remove();
      delete window.__miniDevTools;
    }
  };

  addConsoleEntry('info', ['Mini DevTools 起動しました 📱']);
})();
