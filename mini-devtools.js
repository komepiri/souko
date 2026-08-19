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
    '.subtabs{display:flex;gap:6px;padding:5px 8px;border-bottom:1px solid #2a2a2a;flex-shrink:0;overflow-x:auto;}' +
    '.subtabs .btn.on{background:#0d5c8a;}' +
    '.crumbs{display:flex;gap:2px;overflow-x:auto;padding:6px 8px;border-bottom:1px solid #2a2a2a;flex-shrink:0;white-space:nowrap;}' +
    '.crumb{color:#4fc3f7;font-family:Menlo,Consolas,monospace;font-size:11px;padding:2px 5px;border-radius:3px;flex-shrink:0;}' +
    '.crumb:after{content:"›";color:#555;margin-left:4px;}' +
    '.crumb:last-child:after{content:"";}' +
    '.crumb.current{background:#0d5c8a;color:#fff;}' +
    '.el-sec-title{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.03em;padding:8px 4px 4px;}' +
    '.style-row{display:flex;align-items:center;gap:4px;padding:3px 2px;}' +
    '.style-row .prop{color:#4fc3f7;font-family:Menlo,Consolas,monospace;font-size:11px;width:36%;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.style-row input{flex:1;min-width:0;background:#111;color:#e0e0e0;border:1px solid #333;border-radius:4px;padding:4px 6px;font-size:11px;font-family:Menlo,Consolas,monospace;}' +
    '.style-row input:focus{border-color:#4fc3f7;outline:none;}' +
    '.icon-btn{background:#3a1e1e;color:#ff8a8a;border:1px solid #4a2a2a;border-radius:4px;padding:3px 7px;font-size:11px;flex-shrink:0;}' +
    '.add-row{display:flex;gap:4px;padding:6px 4px;align-items:center;}' +
    '.add-row input{min-width:0;background:#111;color:#e0e0e0;border:1px dashed #444;border-radius:4px;padding:5px 6px;font-size:11px;font-family:Menlo,Consolas,monospace;}' +
    '.add-row input.pkey{flex:0 0 36%;}' +
    '.add-row input.pval{flex:1;}' +
    '.add-row .btn{flex-shrink:0;}' +
    '.children-list .child{padding:5px 4px;border-bottom:1px solid #262626;font-family:Menlo,Consolas,monospace;font-size:12px;color:#9ccc65;}' +
    '.children-list .child .cnt{color:#666;font-size:10px;}' +
    '.htmlarea{width:100%;background:#111;color:#e0e0e0;border:1px solid #333;border-radius:5px;padding:8px;' +
      'font-family:Menlo,Consolas,monospace;font-size:12px;min-height:110px;resize:vertical;}' +
    '.applybar{display:flex;gap:6px;padding:6px 4px;}' +
    '.selecthint{color:#666;text-align:center;padding:24px 8px;font-size:12px;}';
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
        '<div class="crumbs" id="crumbs"></div>' +
        '<div class="subtabs" id="elsubtabs">' +
          '<button class="btn on" data-elview="styles">Styles</button>' +
          '<button class="btn" data-elview="attrs">Attributes</button>' +
          '<button class="btn" data-elview="html">HTML</button>' +
          '<button class="btn" data-elview="children">Children</button>' +
        '</div>' +
        '<div id="elcontent"><div class="selecthint">「要素を選択」をタップしてページ内の要素をタップしてください</div></div>' +
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
        '<div class="add-row">' +
          '<input class="pkey" id="newkey" placeholder="key" />' +
          '<input class="pval" id="newval" placeholder="value" />' +
          '<button class="btn" id="newadd">+ 追加</button>' +
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
  var crumbs = $('#crumbs');
  var elcontent = $('#elcontent');
  var currentEl = null;
  var currentElView = 'styles';
  var hl = document.createElement('div');
  hl.className = 'highlight';
  hl.style.display = 'none';
  shadow.appendChild(hl);

  var COMMON_PROPS = ['display', 'position', 'top', 'left', 'right', 'bottom', 'width', 'height',
    'color', 'background-color', 'font-size', 'font-weight', 'text-align',
    'margin', 'padding', 'border', 'border-radius', 'z-index', 'opacity', 'flex', 'gap'];

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
    selectElement(el);
  }

  function selectElement(el) {
    currentEl = el;
    window.__mdt_lastEl = el; // console から参照できるように
    renderCrumbs();
    renderElView();
    // 選択した要素にも一瞬枠を出す
    highlightEl(el);
    setTimeout(function () { if (!picking) hl.style.display = 'none'; }, 600);
  }

  function renderCrumbs() {
    var chain = [];
    var n = currentEl;
    while (n && n.nodeType === 1 && n !== document.documentElement.parentNode) {
      chain.unshift(n);
      if (n === document.documentElement) break;
      n = n.parentElement;
    }
    crumbs.innerHTML = '';
    chain.forEach(function (node) {
      var c = document.createElement('span');
      c.className = 'crumb' + (node === currentEl ? ' current' : '');
      c.textContent = node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') +
        (node.classList && node.classList.length ? '.' + Array.prototype.join.call(node.classList, '.') : '');
      c.addEventListener('click', function () { selectElement(node); });
      crumbs.appendChild(c);
    });
    crumbs.scrollLeft = crumbs.scrollWidth;
  }

  $$('[data-elview]').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('[data-elview]').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      currentElView = b.dataset.elview;
      renderElView();
    });
  });

  function renderElView() {
    if (!currentEl) {
      elcontent.innerHTML = '<div class="selecthint">「要素を選択」をタップしてページ内の要素をタップしてください</div>';
      return;
    }
    if (currentElView === 'styles') renderStylesView();
    else if (currentElView === 'attrs') renderAttrsView();
    else if (currentElView === 'html') renderHtmlView();
    else renderChildrenView();
  }

  // ---- Styles(編集可能) ----
  function renderStylesView() {
    elcontent.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'el-sec-title';
    box.textContent = '<' + currentEl.tagName.toLowerCase() + '> の style を編集';
    elcontent.appendChild(box);

    var cs = getComputedStyle(currentEl);
    COMMON_PROPS.forEach(function (prop) {
      var val = currentEl.style.getPropertyValue(prop) || cs.getPropertyValue(prop) || '';
      elcontent.appendChild(buildStyleRow(prop, val));
    });

    // カスタムで既に inline style にあり、上記リストに無いものも表示
    Array.prototype.forEach.call(currentEl.style, function (prop) {
      if (COMMON_PROPS.indexOf(prop) === -1) {
        elcontent.appendChild(buildStyleRow(prop, currentEl.style.getPropertyValue(prop)));
      }
    });

    var addTitle = document.createElement('div');
    addTitle.className = 'el-sec-title';
    addTitle.textContent = 'プロパティを追加';
    elcontent.appendChild(addTitle);

    var addRow = document.createElement('div');
    addRow.className = 'add-row';
    addRow.innerHTML = '<input class="pkey" placeholder="property (例: color)" />' +
      '<input class="pval" placeholder="value (例: red)" />' +
      '<button class="btn">+ 追加</button>';
    var pkey = addRow.querySelector('.pkey'), pval = addRow.querySelector('.pval');
    addRow.querySelector('button').addEventListener('click', function () {
      if (!pkey.value) return;
      currentEl.style.setProperty(pkey.value.trim(), pval.value.trim());
      renderStylesView();
    });
    elcontent.appendChild(addRow);
  }
  function buildStyleRow(prop, val) {
    var row = document.createElement('div');
    row.className = 'style-row';
    var label = document.createElement('div');
    label.className = 'prop';
    label.textContent = prop;
    var input = document.createElement('input');
    input.value = val;
    input.addEventListener('change', function () {
      if (input.value === '') currentEl.style.removeProperty(prop);
      else currentEl.style.setProperty(prop, input.value);
    });
    row.appendChild(label);
    row.appendChild(input);
    return row;
  }

  // ---- Attributes(編集可能) ----
  function renderAttrsView() {
    elcontent.innerHTML = '';
    var title = document.createElement('div');
    title.className = 'el-sec-title';
    title.textContent = '属性';
    elcontent.appendChild(title);

    Array.prototype.forEach.call(currentEl.attributes, function (attr) {
      var row = document.createElement('div');
      row.className = 'style-row';
      var label = document.createElement('div');
      label.className = 'prop';
      label.textContent = attr.name;
      var input = document.createElement('input');
      input.value = attr.value;
      input.addEventListener('change', function () {
        currentEl.setAttribute(attr.name, input.value);
        if (attr.name === 'class' || attr.name === 'id') renderCrumbs();
      });
      var del = document.createElement('button');
      del.className = 'icon-btn';
      del.textContent = '削除';
      del.addEventListener('click', function () {
        currentEl.removeAttribute(attr.name);
        renderAttrsView();
        renderCrumbs();
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(del);
      elcontent.appendChild(row);
    });

    var addTitle = document.createElement('div');
    addTitle.className = 'el-sec-title';
    addTitle.textContent = '属性を追加';
    elcontent.appendChild(addTitle);

    var addRow = document.createElement('div');
    addRow.className = 'add-row';
    addRow.innerHTML = '<input class="pkey" placeholder="name (例: data-foo)" />' +
      '<input class="pval" placeholder="value" />' +
      '<button class="btn">+ 追加</button>';
    var pkey = addRow.querySelector('.pkey'), pval = addRow.querySelector('.pval');
    addRow.querySelector('button').addEventListener('click', function () {
      if (!pkey.value) return;
      currentEl.setAttribute(pkey.value.trim(), pval.value);
      renderAttrsView();
      renderCrumbs();
    });
    elcontent.appendChild(addRow);
  }

  // ---- HTML(innerHTMLを編集して即反映) ----
  function renderHtmlView() {
    elcontent.innerHTML = '';
    var title = document.createElement('div');
    title.className = 'el-sec-title';
    title.textContent = 'innerHTML(編集して適用を押すと反映されます)';
    elcontent.appendChild(title);

    var ta = document.createElement('textarea');
    ta.className = 'htmlarea';
    ta.value = currentEl.innerHTML;
    elcontent.appendChild(ta);

    var bar = document.createElement('div');
    bar.className = 'applybar';
    bar.innerHTML = '<button class="btn on">✓ 適用</button><button class="btn">↺ 元に戻す</button>';
    var applyBtn = bar.children[0], resetBtn = bar.children[1];
    applyBtn.addEventListener('click', function () {
      try {
        currentEl.innerHTML = ta.value;
        addConsoleEntry('info', ['innerHTML を更新しました']);
      } catch (err) {
        addConsoleEntry('error', [err]);
      }
    });
    resetBtn.addEventListener('click', renderHtmlView);
    elcontent.appendChild(bar);
  }

  // ---- Children(子要素をタップして移動) ----
  function renderChildrenView() {
    elcontent.innerHTML = '';
    var title = document.createElement('div');
    title.className = 'el-sec-title';
    title.textContent = '子要素(タップで選択を移動)';
    elcontent.appendChild(title);

    var list = document.createElement('div');
    list.className = 'children-list';
    if (!currentEl.children.length) {
      list.innerHTML = '<div class="empty">子要素はありません</div>';
    } else {
      Array.prototype.forEach.call(currentEl.children, function (child) {
        var row = document.createElement('div');
        row.className = 'child';
        row.innerHTML = '&lt;' + child.tagName.toLowerCase() +
          (child.id ? ' id="' + esc(child.id) + '"' : '') +
          (child.className && typeof child.className === 'string' ? ' class="' + esc(child.className) + '"' : '') +
          '&gt; <span class="cnt">' + child.children.length + ' children</span>';
        row.addEventListener('click', function () { selectElement(child); });
        list.appendChild(row);
      });
    }
    elcontent.appendChild(list);
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

  // ================= Storage(新規作成・編集・削除に対応) =================
  var storelist = $('#storelist');
  var newkeyInput = $('#newkey'), newvalInput = $('#newval'), newaddBtn = $('#newadd');
  var currentStore = 'local';

  function getStoreObj() {
    return currentStore === 'local' ? localStorage : sessionStorage;
  }
  function setPair(key, val) {
    if (!key) return;
    if (currentStore === 'cookie') {
      document.cookie = encodeURIComponent(key) + '=' + encodeURIComponent(val) + '; path=/';
    } else {
      getStoreObj().setItem(key, val);
    }
  }
  function deletePair(key) {
    if (currentStore === 'cookie') {
      document.cookie = encodeURIComponent(key) + '=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } else {
      getStoreObj().removeItem(key);
    }
  }

  newaddBtn.addEventListener('click', function () {
    if (!newkeyInput.value) return;
    setPair(newkeyInput.value.trim(), newvalInput.value);
    newkeyInput.value = '';
    newvalInput.value = '';
    renderStorage();
  });

  function renderStorage() {
    storelist.innerHTML = '';
    var pairs = [];
    if (currentStore === 'cookie') {
      document.cookie.split(';').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (p) {
        var idx = p.indexOf('=');
        pairs.push([decodeURIComponent(p.slice(0, idx)), decodeURIComponent(p.slice(idx + 1))]);
      });
    } else {
      var store = getStoreObj();
      for (var i = 0; i < store.length; i++) {
        var k = store.key(i);
        pairs.push([k, store.getItem(k)]);
      }
    }
    if (!pairs.length) {
      storelist.innerHTML = '<div class="empty">データがありません(上の入力欄から追加できます)</div>';
      return;
    }
    pairs.forEach(function (pair) { addKv(pair[0], pair[1]); });
  }

  function addKv(k, v) {
    var row = document.createElement('div');
    row.className = 'kv';
    var kEl = document.createElement('div');
    kEl.className = 'k';
    kEl.textContent = k;
    var vInput = document.createElement('input');
    vInput.value = v;
    vInput.style.cssText = 'flex:1;background:#111;color:#ccc;border:1px solid #333;border-radius:4px;' +
      'padding:4px 6px;font-size:12px;font-family:Menlo,Consolas,monospace;text-align:right;min-width:0;';
    vInput.addEventListener('change', function () {
      setPair(k, vInput.value);
    });
    var delBtn = document.createElement('button');
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', function () {
      deletePair(k);
      renderStorage();
    });
    row.appendChild(kEl);
    row.appendChild(vInput);
    row.appendChild(delBtn);
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
