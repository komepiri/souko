/*!
 * Mini DevTools for Mobile — bookmarklet-loadable dev panel
 * - Shadow DOM(open)でページのCSSと完全に分離(お互いに干渉しない)
 * - Console / Elements / Network / Storage の4タブ
 * - スマホのタッチ操作前提のUI(ボトムシート・ドラッグでリサイズ)
 * - console/fetch/XHR/historyのフックはdestroy()で全て復元される
 * Usage: このファイルをブックマークレットから <script> 注入して呼び出す
 */
(function () {
  'use strict';

  try {

  // すでに起動していたらトグルするだけ
  if (window.__miniDevTools) {
    window.__miniDevTools.toggle();
    return;
  }

  // ---------- ホスト要素(ページCSSの影響を受けない/与えない) ----------
  var host = document.createElement('div');
  host.id = '__mini_devtools_host__';
  host.style.cssText = [
    'all: initial',
    'position: fixed',
    'inset: 0',
    'z-index: 2147483647',
    'pointer-events: none',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ].join(';');
  document.documentElement.appendChild(host);

  // Discord/Twitter等はポータル型モーダルを後から <html> 直下やbody直下に追加してくることがあり、
  // 追加順が後 = 描画が上になるため、こちらのパネルが埋もれて操作不能に見えることがある。
  // documentElementの子要素構成を監視し、hostが最後尾でなくなったら都度末尾に戻して最前面を維持する。
  var reorderScheduled = false;
  function keepHostOnTop() {
    if (reorderScheduled) return;
    reorderScheduled = true;
    requestAnimationFrame(function () {
      reorderScheduled = false;
      if (document.documentElement.lastElementChild !== host) {
        document.documentElement.appendChild(host); // 末尾に移動しなおす(=再度最前面に)
      }
    });
  }
  var topObserver = new MutationObserver(keepHostOnTop);
  topObserver.observe(document.documentElement, { childList: true });

  var shadow = host.attachShadow({ mode: 'open' });

  var style = document.createElement('style');
  style.textContent =
    ':host{all:initial;}' +
    '*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}' +
    '.fab{position:fixed;right:16px;bottom:16px;width:46px;height:46px;border-radius:50%;' +
      'background:#1e1e1e;color:#4fc3f7;display:flex;align-items:center;justify-content:center;' +
      'font-size:19px;font-weight:bold;box-shadow:0 2px 10px rgba(0,0,0,.5);pointer-events:auto;' +
      'user-select:none;touch-action:none;border:2px solid #333;}' +
    '.panel{position:fixed;left:0;right:0;bottom:0;height:48vh;min-height:180px;max-height:92vh;' +
      'background:#1e1e1e;color:#e0e0e0;display:flex;flex-direction:column;pointer-events:auto;' +
      'box-shadow:0 -2px 12px rgba(0,0,0,.6);font-size:13px;border-top:1px solid #333;}' +
    '.panel.hidden{display:none;}' +
    '.drag{height:14px;display:flex;align-items:center;justify-content:center;touch-action:none;cursor:ns-resize;flex-shrink:0;}' +
    '.drag span{width:36px;height:4px;border-radius:2px;background:#555;}' +
    '.tabs{display:flex;border-bottom:1px solid #333;flex-shrink:0;overflow-x:auto;}' +
    '.tab{flex:1;padding:9px 4px;text-align:center;color:#888;font-size:12px;white-space:nowrap;}' +
    '.tab.active{color:#4fc3f7;border-bottom:2px solid #4fc3f7;font-weight:600;}' +
    '.toolbar{display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid #2a2a2a;flex-shrink:0;}' +
    '.btn{background:#2c2c2c;color:#ccc;border:1px solid #3a3a3a;border-radius:5px;padding:5px 9px;font-size:12px;flex-shrink:0;}' +
    '.btn:active{background:#3a3a3a;}' +
    '.btn.on{background:#0d5c8a;color:#fff;border-color:#0d5c8a;}' +
    '.btn.close{background:transparent;border-color:transparent;color:#888;font-size:16px;padding:2px 8px;}' +
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
    '.consolelist{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;}' +
    '.inputrow{display:flex;gap:6px;padding:6px 8px;border-top:1px solid #2a2a2a;flex-shrink:0;align-items:flex-start;}' +
    '.inputrow input{flex:1;background:#111;color:#e0e0e0;border:1px solid #333;border-radius:5px;' +
      'padding:8px;font-size:14px;font-family:Menlo,Consolas,monospace;}' +
    '.row{padding:6px 4px;border-bottom:1px solid #262626;font-size:12px;}' +
    '.row.net-row{cursor:pointer;}' +
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
    '.subtabs{display:flex;gap:6px;padding:5px 8px;border-bottom:1px solid #2a2a2a;flex-shrink:0;overflow-x:auto;}' +
    '.subtabs .btn.on{background:#0d5c8a;}' +
    '.crumbs{display:flex;gap:2px;overflow-x:auto;padding:6px 8px;border-bottom:1px solid #2a2a2a;flex-shrink:0;white-space:nowrap;}' +
    '.crumb{color:#4fc3f7;font-family:Menlo,Consolas,monospace;font-size:11px;padding:2px 5px;border-radius:3px;flex-shrink:0;}' +
    '.crumb:after{content:"\\203a";color:#555;margin-left:4px;}' +
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
    '.selecthint{color:#666;text-align:center;padding:24px 8px;font-size:12px;}' +
    '.chk{display:flex;align-items:center;gap:4px;color:#888;font-size:11px;white-space:nowrap;}' +
    '.chk input{accent-color:#4fc3f7;}' +
    '.net-detail{border-top:1px dashed #333;margin-top:6px;padding-top:4px;}' +
    '.net-body{font-family:Menlo,Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;' +
      'background:#111;border:1px solid #2a2a2a;border-radius:4px;padding:6px;max-height:150px;overflow:auto;}' +
    '.obj-node{display:inline-block;vertical-align:top;}' +
    '.obj-head{cursor:pointer;color:#e0e0e0;}' +
    '.obj-tri{display:inline-block;width:12px;color:#888;}' +
    '.obj-kids{margin-left:13px;border-left:1px solid #333;padding-left:6px;}' +
    '.obj-row{padding:1px 0;}' +
    '.obj-key{color:#9cdcfe;}' +
    '.obj-string{color:#ce9178;}' +
    '.obj-number{color:#b5cea8;}' +
    '.obj-boolean{color:#569cd6;}' +
    '.obj-nullish{color:#888;}' +
    '.cm-wrap{position:relative;flex:1;height:38px;}' +
    '.cm-box{position:absolute;inset:0;margin:0;padding:8px;font-size:14px;line-height:20px;' +
      'font-family:Menlo,Consolas,monospace;white-space:pre;overflow-x:auto;overflow-y:hidden;' +
      'border:1px solid #333;border-radius:5px;box-sizing:border-box;}' +
    '.cm-pre{background:#111;color:#d4d4d4;pointer-events:none;}' +
    '.cm-pre code{white-space:pre;}' +
    '.cm-input{background:transparent;color:transparent;caret-color:#fff;border-color:transparent;resize:none;}' +
    '.cm-input::placeholder{color:#666;opacity:1;}' +
    '.cm-wrap.focused .cm-pre{border-color:#4fc3f7;}' +
    '.cm-suggest{position:absolute;bottom:100%;left:0;right:0;max-height:160px;overflow-y:auto;' +
      'background:#1e1e1e;border:1px solid #333;border-radius:5px;margin-bottom:4px;display:none;' +
      'z-index:5;box-shadow:0 -2px 8px rgba(0,0,0,.5);}' +
    '.cm-suggest-item{padding:6px 10px;font-family:Menlo,Consolas,monospace;font-size:12px;color:#ccc;}' +
    '.cm-suggest-item.active{background:#0d5c8a;color:#fff;}' +
    '.tok-keyword{color:#c586c0;}' +
    '.tok-storage{color:#569cd6;}' +
    '.tok-string{color:#ce9178;}' +
    '.tok-number{color:#b5cea8;}' +
    '.tok-function{color:#dcdcaa;}' +
    '.tok-property{color:#9cdcfe;}' +
    '.tok-comment{color:#6a9955;font-style:italic;}';
  shadow.appendChild(style);

  // ---- Trusted Types対策 ----
  // Discord/Twitter等、セキュリティの厳しいSPAは CSP の Trusted Types を強制しており、
  // 素の innerHTML への文字列代入がブロックされることがある(何も表示されない主要因の一つ)。
  // 専用ポリシーを作って迂回し、失敗時はタグを剥がしたテキストとして流し込む(真っ白になるよりまし)。
  var ttPolicy = null;
  if (window.trustedTypes && window.trustedTypes.createPolicy) {
    try {
      ttPolicy = window.trustedTypes.createPolicy('mini-devtools-' + Date.now(), {
        createHTML: function (s) { return s; }
      });
    } catch (e) { ttPolicy = null; }
  }
  function setHTML(el, html) {
    try {
      el.innerHTML = ttPolicy ? ttPolicy.createHTML(html) : html;
    } catch (e) {
      el.textContent = String(html).replace(/<[^>]*>/g, '');
    }
  }


  // ---------- FAB(トグルボタン、ドラッグ移動可) ----------
  var fab = document.createElement('div');
  fab.className = 'fab';
  fab.textContent = '</>';
  shadow.appendChild(fab);
  makeDraggableFab(fab);

  // ---------- パネル本体 ----------
  var panel = document.createElement('div');
  panel.className = 'panel hidden';
  setHTML(panel,
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
          '<span class="spacer"></span><button class="btn close" data-act="close">&times;</button></div>' +
        '<div class="consolelist" id="consolelist"></div>' +
        '<div class="inputrow">' +
          '<div class="cm-wrap">' +
            '<div class="cm-suggest" id="cmsuggest"></div>' +
            '<pre class="cm-box cm-pre" id="cmpre"><code></code></pre>' +
            '<textarea id="cmdinput" class="cm-box cm-input" rows="1" spellcheck="false" autocapitalize="off" autocomplete="off" ' +
              'placeholder="JSを実行... (Enterで実行 / Tabで補完 / Up,Downで履歴)"></textarea>' +
          '</div>' +
          '<button class="btn" id="cmdrun">実行</button>' +
        '</div>' +
      '</div>' +
      '<div class="view" data-view="elements">' +
        '<div class="toolbar"><button class="btn" id="pickbtn">要素を選択</button>' +
          '<span class="spacer"></span><button class="btn close" data-act="close">&times;</button></div>' +
        '<div class="crumbs" id="crumbs"></div>' +
        '<div class="subtabs" id="elsubtabs">' +
          '<button class="btn on" data-elview="styles">Styles</button>' +
          '<button class="btn" data-elview="attrs">Attributes</button>' +
          '<button class="btn" data-elview="html">HTML</button>' +
          '<button class="btn" data-elview="children">Children</button>' +
        '</div>' +
        '<div id="elcontent"><div class="selecthint">「要素を選択」をタップしてページ内の要素をタップしてください(選択後は $0 でも参照できます)</div></div>' +
      '</div>' +
      '<div class="view" data-view="network">' +
        '<div class="toolbar"><button class="btn" data-act="clear-network">Clear</button>' +
          '<label class="chk"><input type="checkbox" id="clearnav" checked /> 画面遷移時にクリア</label>' +
          '<span class="spacer"></span><button class="btn close" data-act="close">&times;</button></div>' +
        '<div class="add-row"><input class="pval" id="netsearch" placeholder="URLで絞り込み..." /></div>' +
        '<div id="netlist"><div class="empty">通信を待機中です(fetch / XHR)</div></div>' +
      '</div>' +
      '<div class="view" data-view="storage">' +
        '<div class="subtabs">' +
          '<button class="btn on" data-store="local">localStorage</button>' +
          '<button class="btn" data-store="session">sessionStorage</button>' +
          '<button class="btn" data-store="cookie">cookie</button>' +
          '<span class="spacer"></span><button class="btn close" data-act="close">&times;</button>' +
        '</div>' +
        '<div class="add-row">' +
          '<input class="pkey" id="newkey" placeholder="key" />' +
          '<input class="pval" id="newval" placeholder="value" />' +
          '<button class="btn" id="newadd">+ 追加</button>' +
        '</div>' +
        '<div id="storelist"></div>' +
      '</div>' +
    '</div>');
  shadow.appendChild(panel);

  var $ = function (sel) { return shadow.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(shadow.querySelectorAll(sel)); };

  // ---------- 開閉制御 ----------
  function show() { panel.classList.remove('hidden'); }
  function hide() { panel.classList.add('hidden'); }
  function onFabClick() {
    if (fab.dataset.dragged === '1') { fab.dataset.dragged = '0'; return; }
    panel.classList.contains('hidden') ? show() : hide();
  }
  function onShadowClick(e) {
    if (e.target && e.target.dataset && e.target.dataset.act === 'close') hide();
  }
  fab.addEventListener('click', onFabClick);
  shadow.addEventListener('click', onShadowClick);

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
      newH = Math.max(180, Math.min(vh * 0.92, newH));
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

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ================= Console(オブジェクトは折りたたみ表示) =================
  var consolelist = $('#consolelist');

  function formatPreview(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (Array.isArray(v)) return 'Array(' + v.length + ')';
    if (v instanceof Error) return v.name + ': ' + v.message;
    if (typeof v === 'function') return '\u0192 ' + (v.name || 'anonymous') + '()';
    if (typeof v === 'object') {
      var ctor = v.constructor && v.constructor.name;
      return (ctor && ctor !== 'Object') ? ctor : 'Object';
    }
    return typeof v === 'string' ? '"' + v + '"' : String(v);
  }

  function buildValueNode(v, depth) {
    if (v !== null && typeof v === 'object' && !(v instanceof Error)) {
      var wrap = document.createElement('span');
      wrap.className = 'obj-node';
      var head = document.createElement('span');
      head.className = 'obj-head';
      var tri = document.createElement('span');
      tri.className = 'obj-tri';
      tri.textContent = '\u25b8';
      var label = document.createElement('span');
      label.textContent = formatPreview(v);
      head.appendChild(tri);
      head.appendChild(label);
      wrap.appendChild(head);
      var kids = document.createElement('div');
      kids.className = 'obj-kids';
      kids.style.display = 'none';
      var built = false;
      head.addEventListener('click', function () {
        var open = kids.style.display !== 'none';
        if (open) { kids.style.display = 'none'; tri.textContent = '\u25b8'; return; }
        if (!built) {
          built = true;
          if (depth < 5) {
            Object.keys(v).slice(0, 200).forEach(function (k) {
              var row = document.createElement('div');
              row.className = 'obj-row';
              var kEl = document.createElement('span');
              kEl.className = 'obj-key';
              kEl.textContent = k + ': ';
              row.appendChild(kEl);
              try { row.appendChild(buildValueNode(v[k], depth + 1)); }
              catch (e) {
                var errS = document.createElement('span');
                errS.className = 'obj-nullish';
                errS.textContent = '(unreadable)';
                row.appendChild(errS);
              }
              kids.appendChild(row);
            });
          } else {
            var lim = document.createElement('div');
            lim.className = 'obj-nullish';
            lim.textContent = '(階層が深すぎるため省略)';
            kids.appendChild(lim);
          }
        }
        kids.style.display = 'block';
        tri.textContent = '\u25be';
      });
      wrap.appendChild(kids);
      return wrap;
    }
    var span = document.createElement('span');
    if (v === null || v === undefined) span.className = 'obj-nullish';
    else if (typeof v === 'string') span.className = 'obj-string';
    else if (typeof v === 'number') span.className = 'obj-number';
    else if (typeof v === 'boolean') span.className = 'obj-boolean';
    span.textContent = formatPreview(v);
    return span;
  }

  function addConsoleEntry(level, args) {
    var div = document.createElement('div');
    div.className = 'log ' + level;
    Array.prototype.forEach.call(args, function (a, i) {
      if (i > 0) div.appendChild(document.createTextNode(' '));
      if (a instanceof Error) {
        div.appendChild(document.createTextNode(a.stack || a.message));
      } else if (a !== null && typeof a === 'object') {
        div.appendChild(buildValueNode(a, 0));
      } else {
        div.appendChild(document.createTextNode(String(a)));
      }
    });
    consolelist.appendChild(div);
    consolelist.scrollTop = consolelist.scrollHeight;
  }

  var origConsole = {};
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    origConsole[level] = console[level];
    console[level] = function () {
      origConsole[level].apply(console, arguments);
      addConsoleEntry(level === 'debug' ? 'log' : level, arguments);
    };
  });
  function onWindowError(e) {
    addConsoleEntry('error', [e.message + '  @ ' + (e.filename || '') + ':' + e.lineno]);
  }
  function onUnhandledRejection(e) {
    addConsoleEntry('error', ['Unhandled promise rejection: ' + (e.reason && e.reason.stack ? e.reason.stack : e.reason)]);
  }
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  var cmdinput = $('#cmdinput');
  var cmpre = $('#cmpre');
  var cmpreCode = cmpre.querySelector('code');
  var cmsuggest = $('#cmsuggest');
  var cmWrap = $('.cm-wrap');
  var cmdHistory = [];
  var histIndex = -1;

  // ---- シンタックスハイライト(軽量な正規表現トークナイザ、VS Code Dark+風配色) ----
  var CONTROL_KEYWORDS = ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'return', 'throw', 'try', 'catch', 'finally', 'in', 'of', 'instanceof', 'typeof', 'delete',
    'void', 'yield', 'await', 'new'];
  var STORAGE_KEYWORDS = ['var', 'let', 'const', 'function', 'class', 'extends', 'static', 'async',
    'import', 'export', 'default', 'get', 'set'];
  var LITERAL_KEYWORDS = ['true', 'false', 'null', 'undefined', 'this', 'super'];
  var JS_KEYWORDS = CONTROL_KEYWORDS.concat(STORAGE_KEYWORDS, LITERAL_KEYWORDS);
  var TOKEN_RE = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][A-Za-z0-9_$]*\b)|([{}()\[\].,;:?])|([+\-*/%=<>!&|^~]+)/g;

  function highlightJS(code) {
    return code.replace(TOKEN_RE, function (match, comment, blockComment, str, num, ident, punct, op, offset, full) {
      var safe = esc(match);
      if (comment || blockComment) return '<span class="tok-comment">' + safe + '</span>';
      if (str) return '<span class="tok-string">' + safe + '</span>';
      if (num) return '<span class="tok-number">' + safe + '</span>';
      if (ident) {
        if (CONTROL_KEYWORDS.indexOf(match) !== -1) return '<span class="tok-keyword">' + safe + '</span>';
        if (STORAGE_KEYWORDS.indexOf(match) !== -1) return '<span class="tok-storage">' + safe + '</span>';
        if (LITERAL_KEYWORDS.indexOf(match) !== -1) return '<span class="tok-storage">' + safe + '</span>';
        // 直後の非空白文字が "(" なら関数呼び出し/定義(VS Codeの黄色)。ドット直後でも呼び出しなら黄色を優先
        var afterTrim = full.slice(offset + match.length).replace(/^\s+/, '');
        if (afterTrim.charAt(0) === '(') return '<span class="tok-function">' + safe + '</span>';
        // 直前の非空白文字が "." なら(呼び出しでない)プロパティアクセス(VS Codeの水色)
        var beforeTrim = full.slice(0, offset).replace(/\s+$/, '');
        if (beforeTrim.charAt(beforeTrim.length - 1) === '.') {
          return '<span class="tok-property">' + safe + '</span>';
        }
        return safe; // 通常の識別子は既定の文字色を継承
      }
      return safe; // 記号・演算子は既定の文字色のまま(VS Codeもここは強調しない)
    });
  }
  function updateHighlight() {
    setHTML(cmpreCode, highlightJS(cmdinput.value) + '\n');
  }
  function syncScroll() {
    cmpre.scrollTop = cmdinput.scrollTop;
    cmpre.scrollLeft = cmdinput.scrollLeft;
  }

  // ---- 自動補完(実際にオブジェクトを評価してプロパティを列挙) ----
  var suggestItems = [];
  var suggestIndex = -1;
  var globalNamesCache = null;
  function getGlobalNames() {
    if (!globalNamesCache) {
      var names = {};
      JS_KEYWORDS.forEach(function (k) { names[k] = true; });
      try { Object.getOwnPropertyNames(window).forEach(function (n) { names[n] = true; }); } catch (e) {}
      globalNamesCache = Object.keys(names);
    }
    return globalNamesCache;
  }
  function getObjectProps(expr) {
    var obj;
    try { obj = (0, eval)(expr); } catch (e) { return null; }
    if (obj === null || obj === undefined) return [];
    var seen = {};
    var o = obj, depth = 0;
    while (o != null && depth < 12) {
      try { Object.getOwnPropertyNames(o).forEach(function (p) { seen[p] = true; }); } catch (e) {}
      o = Object.getPrototypeOf(o);
      depth++;
    }
    return Object.keys(seen);
  }
  function extractChain(text) {
    var m = text.match(/[A-Za-z0-9_$.]*$/);
    return m ? m[0] : '';
  }
  function updateSuggestions() {
    var caret = cmdinput.selectionStart;
    var text = cmdinput.value.slice(0, caret);
    var chain = extractChain(text);
    if (!chain) { hideSuggestions(); return; }
    var lastDot = chain.lastIndexOf('.');
    var objPath = lastDot === -1 ? '' : chain.slice(0, lastDot);
    var partial = lastDot === -1 ? chain : chain.slice(lastDot + 1);
    var candidates;
    if (objPath) {
      var props = getObjectProps(objPath);
      if (props === null) { hideSuggestions(); return; }
      candidates = props;
    } else {
      if (partial.length < 2) { hideSuggestions(); return; }
      candidates = getGlobalNames();
    }
    var filtered = candidates.filter(function (c) { return c.indexOf(partial) === 0 && c !== partial; })
      .sort().slice(0, 30);
    if (!filtered.length) { hideSuggestions(); return; }
    showSuggestions(filtered, objPath, partial);
  }
  function showSuggestions(list, objPath, partial) {
    suggestItems = list.map(function (name) { return { name: name, objPath: objPath }; });
    suggestIndex = -1;
    cmsuggest.textContent = '';
    suggestItems.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'cm-suggest-item';
      row.textContent = item.name;
      row.addEventListener('mousedown', function (e) {
        e.preventDefault();
        applySuggestion(suggestItems.indexOf(item));
      });
      cmsuggest.appendChild(row);
    });
    cmsuggest.style.display = 'block';
  }
  function hideSuggestions() {
    cmsuggest.style.display = 'none';
    cmsuggest.textContent = '';
    suggestItems = [];
    suggestIndex = -1;
  }
  function moveSuggestIndex(delta) {
    if (!suggestItems.length) return;
    suggestIndex = (suggestIndex + delta + suggestItems.length) % suggestItems.length;
    Array.prototype.forEach.call(cmsuggest.children, function (el, i) {
      el.classList.toggle('active', i === suggestIndex);
    });
    cmsuggest.children[suggestIndex].scrollIntoView({ block: 'nearest' });
  }
  function applySuggestion(i) {
    var item = suggestItems[i];
    if (!item) return;
    var caret = cmdinput.selectionStart;
    var before = cmdinput.value.slice(0, caret);
    var after = cmdinput.value.slice(caret);
    var chain = extractChain(before);
    var newBefore = before.slice(0, before.length - chain.length) + (item.objPath ? item.objPath + '.' : '') + item.name;
    cmdinput.value = newBefore + after;
    var newCaret = newBefore.length;
    cmdinput.setSelectionRange(newCaret, newCaret);
    updateHighlight();
    syncScroll();
    hideSuggestions();
    cmdinput.focus();
  }

  cmdinput.addEventListener('input', function () {
    updateHighlight();
    syncScroll();
    updateSuggestions();
  });
  cmdinput.addEventListener('scroll', syncScroll);
  cmdinput.addEventListener('focus', function () { cmWrap.classList.add('focused'); });
  cmdinput.addEventListener('blur', function () {
    cmWrap.classList.remove('focused');
    setTimeout(hideSuggestions, 150); // 候補タップのmousedownを先に処理させる
  });

  function runCmd() {
    var code = cmdinput.value;
    if (!code) return;
    cmdHistory.push(code);
    histIndex = -1;
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
    updateHighlight();
    hideSuggestions();
    consolelist.scrollTop = consolelist.scrollHeight;
  }
  $('#cmdrun').addEventListener('click', runCmd);
  cmdinput.addEventListener('keydown', function (e) {
    var suggestVisible = cmsuggest.style.display === 'block';
    if (suggestVisible && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      moveSuggestIndex(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (suggestVisible && (e.key === 'Tab' || (e.key === 'Enter' && suggestIndex !== -1))) {
      e.preventDefault();
      applySuggestion(suggestIndex === -1 ? 0 : suggestIndex);
      return;
    }
    if (suggestVisible && e.key === 'Escape') {
      e.preventDefault();
      hideSuggestions();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault(); // textareaなので改行を防いで実行に割り当てる
      runCmd();
    } else if (e.key === 'ArrowUp') {
      if (!cmdHistory.length) return;
      e.preventDefault();
      histIndex = histIndex === -1 ? cmdHistory.length - 1 : Math.max(0, histIndex - 1);
      cmdinput.value = cmdHistory[histIndex];
      updateHighlight();
    } else if (e.key === 'ArrowDown') {
      if (histIndex === -1) return;
      e.preventDefault();
      histIndex++;
      if (histIndex >= cmdHistory.length) { histIndex = -1; cmdinput.value = ''; }
      else cmdinput.value = cmdHistory[histIndex];
      updateHighlight();
    }
  });
  shadow.addEventListener('click', function (e) {
    if (e.target && e.target.dataset && e.target.dataset.act === 'clear-console') consolelist.textContent = '';
  });

  // ================= Elements =================
  var picking = false;
  var pickbtn = $('#pickbtn');
  var crumbs = $('#crumbs');
  var elcontent = $('#elcontent');
  var currentEl = null;
  var currentElView = 'styles';
  var pickedElements = [];
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
    pickbtn.textContent = picking ? '選択中(タップで確定・もう一度押すと解除)' : '要素を選択';
    hl.style.display = 'none';
  });

  function pickMove(e) {
    if (!picking) return;
    highlightEl(e.target);
  }
  function pickTouchMove(e) {
    if (!picking) return;
    e.preventDefault(); // 選択中はページのスクロールをロックして誤操作を防ぐ
    var t = e.touches[0];
    var el = document.elementFromPoint(t.clientX, t.clientY);
    highlightEl(el);
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
    pickbtn.textContent = '要素を選択';
    selectElement(el);
  }
  window.addEventListener('mousemove', pickMove, true);
  window.addEventListener('touchmove', pickTouchMove, { passive: false, capture: true });
  window.addEventListener('click', pickClick, true);
  window.addEventListener('touchend', pickClick, true);

  function selectElement(el) {
    currentEl = el;
    pickedElements.unshift(el);
    pickedElements = pickedElements.slice(0, 5);
    pickedElements.forEach(function (e, i) { window['$' + i] = e; });
    renderCrumbs();
    renderElView();
    highlightEl(el);
    setTimeout(function () { if (!picking) hl.style.display = 'none'; }, 600);
    addConsoleEntry('info', ['要素を選択しました。$0 でコンソールから参照できます(直近5件は $0〜$4)']);
  }

  function renderCrumbs() {
    var chain = [];
    var n = currentEl;
    while (n && n.nodeType === 1) {
      chain.unshift(n);
      if (n === document.documentElement) break;
      n = n.parentElement;
    }
    crumbs.textContent = '';
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
      setHTML(elcontent, '<div class="selecthint">「要素を選択」をタップしてページ内の要素をタップしてください(選択後は $0 でも参照できます)</div>');
      return;
    }
    if (currentElView === 'styles') renderStylesView();
    else if (currentElView === 'attrs') renderAttrsView();
    else if (currentElView === 'html') renderHtmlView();
    else renderChildrenView();
  }

  function renderStylesView() {
    elcontent.textContent = '';
    var box = document.createElement('div');
    box.className = 'el-sec-title';
    box.textContent = '<' + currentEl.tagName.toLowerCase() + '> の style を編集';
    elcontent.appendChild(box);

    var cs = getComputedStyle(currentEl);
    COMMON_PROPS.forEach(function (prop) {
      var val = currentEl.style.getPropertyValue(prop) || cs.getPropertyValue(prop) || '';
      elcontent.appendChild(buildStyleRow(prop, val));
    });
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
    setHTML(addRow, '<input class="pkey" placeholder="property (例: color)" />' +
      '<input class="pval" placeholder="value (例: red)" />' +
      '<button class="btn">+ 追加</button>');
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

  function renderAttrsView() {
    elcontent.textContent = '';
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
    setHTML(addRow, '<input class="pkey" placeholder="name (例: data-foo)" />' +
      '<input class="pval" placeholder="value" />' +
      '<button class="btn">+ 追加</button>');
    var pkey = addRow.querySelector('.pkey'), pval = addRow.querySelector('.pval');
    addRow.querySelector('button').addEventListener('click', function () {
      if (!pkey.value) return;
      currentEl.setAttribute(pkey.value.trim(), pval.value);
      renderAttrsView();
      renderCrumbs();
    });
    elcontent.appendChild(addRow);
  }

  function renderHtmlView() {
    elcontent.textContent = '';
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
    setHTML(bar, '<button class="btn on">適用</button><button class="btn">リセット</button>');
    var applyBtn = bar.children[0], resetBtn = bar.children[1];
    applyBtn.addEventListener('click', function () {
      try {
        setHTML(currentEl, ta.value);
        addConsoleEntry('info', ['innerHTML を更新しました']);
      } catch (err) {
        addConsoleEntry('error', [err]);
      }
    });
    resetBtn.addEventListener('click', renderHtmlView);
    elcontent.appendChild(bar);
  }

  function renderChildrenView() {
    elcontent.textContent = '';
    var title = document.createElement('div');
    title.className = 'el-sec-title';
    title.textContent = '子要素(タップで選択を移動)';
    elcontent.appendChild(title);

    var list = document.createElement('div');
    list.className = 'children-list';
    if (!currentEl.children.length) {
      setHTML(list, '<div class="empty">子要素はありません</div>');
    } else {
      Array.prototype.forEach.call(currentEl.children, function (child) {
        var row = document.createElement('div');
        row.className = 'child';
        setHTML(row, '&lt;' + child.tagName.toLowerCase() +
          (child.id ? ' id="' + esc(child.id) + '"' : '') +
          (child.className && typeof child.className === 'string' ? ' class="' + esc(child.className) + '"' : '') +
          '&gt; <span class="cnt">' + child.children.length + ' children</span>');
        row.addEventListener('click', function () { selectElement(child); });
        list.appendChild(row);
      });
    }
    elcontent.appendChild(list);
  }

  // ================= Network(ヘッダー/ボディを展開表示・URL絞り込み・遷移時クリア) =================
  var netlist = $('#netlist');
  var netsearch = $('#netsearch');
  var clearnavChk = $('#clearnav');
  var netEntries = [];

  function safeBodyPreview(body) {
    if (body === undefined || body === null) return '';
    if (typeof body === 'string') return body.slice(0, 2000);
    if (body instanceof FormData) {
      var parts = [];
      body.forEach(function (v, k) { parts.push(k + ' = ' + v); });
      return parts.join('\n').slice(0, 2000);
    }
    try { return JSON.stringify(body).slice(0, 2000); } catch (e) { return String(body).slice(0, 2000); }
  }

  function addNetEntry(entry) {
    netEntries.push(entry);
    renderNetList();
  }
  function renderNetList() {
    var q = (netsearch.value || '').toLowerCase();
    var filtered = netEntries.filter(function (e) { return !q || e.url.toLowerCase().indexOf(q) !== -1; });
    netlist.textContent = '';
    if (!filtered.length) {
      setHTML(netlist, '<div class="empty">' + (netEntries.length ? '一致する通信がありません' : '通信を待機中です(fetch / XHR)') + '</div>');
      return;
    }
    filtered.forEach(function (entry) { netlist.appendChild(buildNetRow(entry)); });
    netlist.scrollTop = netlist.scrollHeight;
  }
  function buildKvBlock(title, obj) {
    var box = document.createElement('div');
    var t = document.createElement('div'); t.className = 'el-sec-title'; t.textContent = title;
    box.appendChild(t);
    var keys = Object.keys(obj || {});
    if (!keys.length) {
      var e = document.createElement('div'); e.className = 'empty'; e.textContent = '(なし)';
      box.appendChild(e); return box;
    }
    keys.forEach(function (k) {
      var row = document.createElement('div'); row.className = 'kv';
      var kEl = document.createElement('div'); kEl.className = 'k'; kEl.textContent = k;
      var vEl = document.createElement('div'); vEl.className = 'v'; vEl.textContent = obj[k];
      row.appendChild(kEl); row.appendChild(vEl);
      box.appendChild(row);
    });
    return box;
  }
  function buildTextBlock(title, text) {
    var box = document.createElement('div');
    var t = document.createElement('div'); t.className = 'el-sec-title'; t.textContent = title;
    box.appendChild(t);
    var pre = document.createElement('div');
    pre.className = 'net-body';
    pre.textContent = text || '(空)';
    box.appendChild(pre);
    return box;
  }
  function buildNetRow(entry) {
    var wrap = document.createElement('div');
    wrap.className = 'row net-row';
    var head = document.createElement('div');
    head.className = 'main';
    var badgeM = '<span class="badge ' + (entry.method === 'GET' ? 'get' : 'post') + '">' + entry.method + '</span>';
    var badgeS = '<span class="badge ' + (entry.ok ? 'ok' : 'err') + '">' + entry.status + '</span>';
    setHTML(head, badgeM + badgeS + esc(entry.url));
    var sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = entry.ms + 'ms';
    wrap.appendChild(head);
    wrap.appendChild(sub);

    var detail = document.createElement('div');
    detail.className = 'net-detail';
    detail.style.display = 'none';
    wrap.appendChild(detail);
    var built = false;
    wrap.addEventListener('click', function () {
      var open = detail.style.display !== 'none';
      if (open) { detail.style.display = 'none'; return; }
      if (!built) {
        built = true;
        detail.appendChild(buildKvBlock('Request Headers', entry.reqHeaders));
        detail.appendChild(buildKvBlock('Response Headers', entry.resHeaders));
        detail.appendChild(buildTextBlock('Request Body', entry.reqBody));
        detail.appendChild(buildTextBlock('Response Body', entry.resBody));
      }
      detail.style.display = 'block';
    });
    return wrap;
  }
  netsearch.addEventListener('input', renderNetList);

  var origFetch = window.fetch;
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      var reqHeaders = {};
      try {
        var h = (init && init.headers) || (input && input.headers);
        if (h && h.forEach) h.forEach(function (v, k) { reqHeaders[k] = v; });
        else if (h) Object.keys(h).forEach(function (k) { reqHeaders[k] = h[k]; });
      } catch (e) {}
      var reqBody = safeBodyPreview(init && init.body);
      var t0 = performance.now();
      return origFetch.apply(this, arguments).then(function (res) {
        var ms = Math.round(performance.now() - t0);
        var resHeaders = {};
        try { res.headers.forEach(function (v, k) { resHeaders[k] = v; }); } catch (e) {}
        res.clone().text().then(function (bodyText) {
          addNetEntry({ method: method, url: url, status: res.status, ok: res.ok, ms: ms, reqHeaders: reqHeaders, resHeaders: resHeaders, reqBody: reqBody, resBody: bodyText.slice(0, 2000) });
        }).catch(function () {
          addNetEntry({ method: method, url: url, status: res.status, ok: res.ok, ms: ms, reqHeaders: reqHeaders, resHeaders: resHeaders, reqBody: reqBody, resBody: '(バイナリ、または読み取り不可)' });
        });
        return res;
      }).catch(function (err) {
        addNetEntry({ method: method, url: url, status: 'ERR', ok: false, ms: Math.round(performance.now() - t0), reqHeaders: reqHeaders, resHeaders: {}, reqBody: reqBody, resBody: String(err) });
        throw err;
      });
    };
  }
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__mdt = { method: method, url: url };
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    this.__mdt = this.__mdt || {};
    this.__mdt.reqHeaders = this.__mdt.reqHeaders || {};
    this.__mdt.reqHeaders[k] = v;
    return origSetHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    this.__mdt = this.__mdt || {};
    this.__mdt.t0 = performance.now();
    this.__mdt.reqBody = safeBodyPreview(body);
    var self = this;
    this.addEventListener('loadend', function () {
      var m = self.__mdt || {};
      var resHeadersRaw = '';
      try { resHeadersRaw = self.getAllResponseHeaders() || ''; } catch (e) {}
      var resHeaders = {};
      resHeadersRaw.split('\r\n').forEach(function (line) {
        var idx = line.indexOf(':');
        if (idx > 0) resHeaders[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      });
      var resBody = '';
      try { resBody = (typeof self.responseText === 'string') ? self.responseText.slice(0, 2000) : '(テキスト以外のレスポンス)'; }
      catch (e) { resBody = '(読み取り不可)'; }
      addNetEntry({
        method: String(m.method || 'GET').toUpperCase(), url: m.url, status: self.status,
        ok: self.status >= 200 && self.status < 400, ms: Math.round(performance.now() - (m.t0 || performance.now())),
        reqHeaders: m.reqHeaders || {}, resHeaders: resHeaders, reqBody: m.reqBody || '', resBody: resBody
      });
    });
    return origSend.apply(this, arguments);
  };

  // SPAのページ遷移(history API)を検知してNetworkログを自動クリア
  var origPushState = history.pushState;
  var origReplaceState = history.replaceState;
  function onNav() {
    if (clearnavChk.checked) { netEntries = []; renderNetList(); }
  }
  history.pushState = function () { var r = origPushState.apply(this, arguments); onNav(); return r; };
  history.replaceState = function () { var r = origReplaceState.apply(this, arguments); onNav(); return r; };
  window.addEventListener('popstate', onNav);
  window.addEventListener('hashchange', onNav);

  shadow.addEventListener('click', function (e) {
    if (e.target && e.target.dataset && e.target.dataset.act === 'clear-network') {
      netEntries = [];
      renderNetList();
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
    storelist.textContent = '';
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
      setHTML(storelist, '<div class="empty">データがありません(上の入力欄から追加できます)</div>');
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

  // ---------- 外部API(destroy ですべてのフックとイベントリスナーを復元) ----------
  window.__miniDevTools = {
    toggle: function () { panel.classList.contains('hidden') ? show() : hide(); },
    destroy: function () {
      ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
        console[level] = origConsole[level];
      });
      if (origFetch) window.fetch = origFetch;
      XMLHttpRequest.prototype.open = origOpen;
      XMLHttpRequest.prototype.send = origSend;
      XMLHttpRequest.prototype.setRequestHeader = origSetHeader;
      history.pushState = origPushState;
      history.replaceState = origReplaceState;
      window.removeEventListener('popstate', onNav);
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('mousemove', pickMove, true);
      window.removeEventListener('touchmove', pickTouchMove, true);
      window.removeEventListener('click', pickClick, true);
      window.removeEventListener('touchend', pickClick, true);
      topObserver.disconnect();
      host.remove();
      delete window.__miniDevTools;
    }
  };

  addConsoleEntry('info', ['Mini DevTools を起動しました']);

  } catch (initErr) {
    // 初期化中に例外が出た場合(CSPやサイト固有の制約など)は無反応にせず必ず表示する
    try { console.error('[Mini DevTools] 初期化に失敗しました', initErr); } catch (e2) {}
    alert('Mini DevTools の初期化に失敗しました:\n' + (initErr && initErr.message ? initErr.message : initErr) +
      '\n\nこのサイトのCSP(Content Security Policy)による制約の可能性があります。');
  }
})();
