/* ==========================================================================
   sh_main.js · 本机装配（ARG-BUILD-11）

   它做四件事，且只做这四件：
     ① 存档单键的读-改-写（SH-7：不新增任何 localStorage 键）
     ② 窗口：同时只有一个可见；不可拖拽、不可缩放、无最大化（SH-1~SH-4）
     ③ 桥接：父子之间只允许三类纯字符串/数值消息（X-9 / BR-1~BR-4）
     ④ 条目的渐进具名（SH-B1）

   ⚠️ 它【不是】操作系统。没有任务栏、没有顶栏、没有 Dock、没有壁纸、
      没有通知、没有右键菜单、桌面空白处零交互。做加法之前先读 §7.6.1。

   ── 关于状态写入的一条硬约束（真实踩过的坑）────────────────────────
   app 跑在 iframe 里，与本页是【两个执行上下文】，但共享同一份存档键。
   若本页缓存一份内存态再整体写回，就会把 app 刚写的进度覆盖掉。
   故本文件所有写入一律【当场重读 → 只改自己的子树 → 写回】，
   并且只碰 shell / apps / horror_spent / leave_ts / time_warp_ms 这几处。
   这也是本文件不复用 js/sd_state.js 的唯一理由。
   ========================================================================== */
(function (g) {
  'use strict';
  var SH = (g.SH = g.SH || {});
  var doc = g.document;

  var KEY = 'sudu_save_v1';
  var SCHEMA = 1;
  var WARP_MAX = 7 * 24 * 60 * 60 * 1000;    // ±7 天，与 app 侧同值
  var BASE_TITLE = '本机';
  var NARROW_PX = 719;

  /* 四个功能。就这四个。 */
  var APPS = {
    sd:   { label: '素读', url: 'sd/index.html',  kind: 'frame' },
    qsw:  { label: '归档', url: null,             kind: 'archive' },
    fm:   { label: '文件', url: null,             kind: 'file' },
    save: { label: '存档', url: 'save.html',      kind: 'frame' }
  };

  /* ══ ① 存档单键 ══════════════════════════════════════════════════ */

  function rawGet() {
    try { return g.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function rawSet(s) {
    try { g.localStorage.setItem(KEY, s); return true; } catch (e) { return false; }
  }

  function parse() {
    var s = rawGet(), o = null;
    if (s) { try { o = JSON.parse(s); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object') return null;
    return o;
  }

  /* v1 → v2：只加 shell / apps 两个顶层子对象，【绝不搬动任何现有字段】。
     线上已有玩家的存档必须继续有效 —— "她忘了你"是本作最不能白白浪费的东西。 */
  function fill(o) {
    if (!o.shell || typeof o.shell !== 'object') o.shell = {};
    var sh = o.shell;
    if (!('booted_at' in sh)) sh.booted_at = null;
    if (!('last_app' in sh)) sh.last_app = null;
    if (!sh.win_state || typeof sh.win_state !== 'object') sh.win_state = {};
    if (!(sh.icons_revealed instanceof Array)) sh.icons_revealed = [];
    if (!(sh.fm_seen instanceof Array)) sh.fm_seen = [];
    /* ARG-BUILD-12 · CF-4（专用标志，与 booted_at / win_state.sd 解耦）：
       首启三行与窗口一行的"是否已播过"专用布尔。绝不依赖 booted_at 的
       "为空"语义 —— 那已经被首帧自动开素读 / last_app 回读占用。
       同一存档键内，SH-7 守。 */
    if (typeof sh.framing_seen !== 'boolean') sh.framing_seen = false;
    if (typeof sh.framing_window_seen !== 'boolean') sh.framing_window_seen = false;

    /* ARG-BUILD-12 · FM-3 / GD-5：记录/ 的内容（{FRAG} 截断 24 字逐条）。
       素读侧在首次命中时 pushFeedLog 写入；本机侧读同源键决定
       「文件 › 记录/」能否打开（空 = 保持「无法打开。」）。
       仍在本键内，SH-7 守。 */
    if (!(o.feed_log instanceof Array)) o.feed_log = [];

    if (!o.apps || typeof o.apps !== 'object') o.apps = {};
    if (!o.apps.qsw) o.apps.qsw = {};
    if (!o.apps.soda) o.apps.soda = {};
    if (!o.apps.fm) o.apps.fm = {};
    /* apps.sd 不存在，也不许有：素读的状态永远在顶层（迁移纪律） */
    return o;
  }

  /* 没有存档时不凭空建一份完整档 —— 建档权归 app。
     这里只落一个能被 app 认领的最小骨架（v 对得上，其余字段由 app 补齐）。 */
  function seed() {
    var t = Date.now();
    return fill({ v: SCHEMA, created_at: t, updated_at: t });
  }

  function patch(fn) {
    var o = parse();
    if (!o) o = seed();
    else if (o.v !== SCHEMA) return null;       // 版本对不上就不碰，交给 app 处理
    fill(o);
    try { fn(o); } catch (e) { return null; }
    o.updated_at = Date.now();
    var s;
    try { s = JSON.stringify(o); } catch (e) { return null; }
    rawSet(s);
    return o;
  }

  function read() {
    var o = parse();
    return o && o.v === SCHEMA ? fill(o) : fill(seed());
  }

  function clampWarp(ms) {
    if (!isFinite(ms)) return 0;
    if (ms > WARP_MAX) ms = WARP_MAX;
    if (ms < -WARP_MAX) ms = -WARP_MAX;
    return ms;
  }
  function warp() { return clampWarp(read().time_warp_ms || 0); }
  function setWarp(ms) {
    var v = clampWarp(ms || 0);
    patch(function (o) { o.time_warp_ms = v; });
    return v;
  }
  /* 统一时间源：显示与逻辑同一个出口（ST-1：这个字段属于设备） */
  function now() { return Date.now() + warp(); }

  /* 恐怖席位登记：只登记，不回显。玩家永远看不到这个数字（R2）。 */
  function spend(id) {
    var first = false;
    patch(function (o) {
      if (!o.horror_spent || typeof o.horror_spent !== 'object') o.horror_spent = { A: [], B: [] };
      if (!(o.horror_spent.B instanceof Array)) o.horror_spent.B = [];
      if (o.horror_spent.B.indexOf(id) < 0) { o.horror_spent.B.push(id); first = true; }
    });
    return first;
  }

  SH.Store = {
    read: read, patch: patch,
    warp: warp, setWarp: setWarp, now: now, spend: spend
  };

  /* ══ 极简事件总线（时钟 → 桥接广播）══════════════════════════════ */
  var subs = {};
  SH.Bus = {
    on: function (t, fn) { (subs[t] = subs[t] || []).push(fn); },
    emit: function (t, v) { (subs[t] || []).slice().forEach(function (fn) { try { fn(v); } catch (e) {} }); }
  };

  /* ══ ② 窗口 ═════════════════════════════════════════════════════ */

  var win = null, bodyEl = null, titleEl = null;
  var panes = {};          // id → { el, frame }
  var cur = null;          // 当前【可见】的 app；同时只有一个
  var titleReq = 0;        // 本会话收到的 title 变更次数（SH-B3 的节拍源）

  /* ARG-BUILD-12 · CF-4：首启三行 / 窗口一行的写入前快照。
     在 ready() 最早分支（写 booted_at 之前、open('sd') 之前）取值，
     与 booted_at / win_state.sd 完全解耦（专用布尔，SH-7 单键内）。 */
  var framingBoot = { fresh: false, windowFresh: false };
  var winLineShown = false;   // 本会话内 FR-B 行只渲染一次（防重开窗重复）

  /* ── ARG-BUILD-12 · CF-4 专用标志（与 booted_at / win_state.sd 解耦）──
     首启三行（FR-A）与窗口一行（FR-B）的"是否播过"专用布尔。
     本会话内 FR-B 只允许渲染一次（winLineShown 局部兜底，防同会话重开窗重复）。 */
  var winLineShown = false;

  var FR_A_LINES = ['这台机器不是你的。', '它被打开过很多次。', '最后一次，没有关。'];
  var FR_B_LINE = '之前的记录还在。';

  function narrow() {
    try {
      if (g.matchMedia) return !!g.matchMedia('(max-width: ' + NARROW_PX + 'px)').matches;
    } catch (e) {}
    try {
      var w = g.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 0;
      return w > 0 && w <= NARROW_PX;
    } catch (e) {}
    return false;
  }

  /* ⭐ 逃生舱（§7.8 碰撞 2）：宽屏用 iframe（保窗口感 + 保 X-5 物理隔离），
     窄屏改真跳转（保输入框不被键盘吃掉）。真跳转不向任何地层页面注入
     任何东西，X-5 一样满足 —— 两条路都合规，这不是降级。 */
  function go(url) { try { g.location.href = url; } catch (e) {} }

  function itemOf(id) { return doc.querySelector('[data-sh-item="' + id + '"]'); }

  function setRun(id, on) {
    var li = itemOf(id);
    if (!li) return;
    if (on) li.setAttribute('data-run', '1'); else li.removeAttribute('data-run');
  }

  /* SH-6：标题栏恒为 app 名，永不渲染任何人名。
     SH-B3 允许的漂移【只在 app 名内部】发生。 */
  function barText(id) {
    if (id !== 'sd') return APPS[id].label;
    if (titleReq < 1) return '素读';
    /* 内容层当前只有一处 L1-a 会改标题，故第一次就是它。
       字距变宽一格 —— 看得见，但说不清是不是自己记错了。 */
    spend('SH-B3');
    return titleReq >= 3 ? '素\u3000读' : '素\u2009读';
  }

  function paint() {
    if (!titleEl) return;
    titleEl.textContent = cur ? barText(cur) : '';
  }

  function api() {
    return {
      open: open,
      sub: subFrame,
      seen: seen,
      revealed: isRevealed,
      narrow: narrow,
      /* ARG-BUILD-12 · FM-3 / GD-5：记录/ 内容（{FRAG} 截断 24 字）。
         读同源键（ST-2 既有裁决：不走 postMessage，父级读同源存档）。 */
      feedLog: function () {
        var o = read();
        return (o.feed_log instanceof Array) ? o.feed_log.slice() : [];
      }
    };
  }

  function makePane(id) {
    if (panes[id]) return panes[id];
    var el = doc.createElement('div');
    el.className = 'sh-pane';
    el.setAttribute('data-sh-pane', id);
    bodyEl.appendChild(el);

    var pane = { el: el, frame: null };
    panes[id] = pane;

    var app = APPS[id];
    if (app.kind === 'frame') {
      if (narrow()) { go(app.url); return pane; }
      pane.frame = mountFrame(el, app.url, app.label);
    } else if (app.kind === 'file') {
      SH.Views.file(el, api());
    } else if (app.kind === 'archive') {
      SH.Views.archive(el, api());
    }
    return pane;
  }

  function mountFrame(host, url, label) {
    var f = doc.createElement('iframe');
    f.className = 'sh-frame';
    f.setAttribute('data-sh-frame', '');
    f.setAttribute('title', label);
    f.setAttribute('src', url);
    host.appendChild(f);
    return f;
  }

  /* 二级：内建列表 → 内嵌一份页面。列表顶端留一行「上一层」。 */
  function subFrame(url, label) {
    if (!cur) return;
    if (narrow()) { go(url); return; }
    var pane = panes[cur];
    if (!pane) return;
    var view = pane.el.querySelector('[data-sh-view]');
    if (view) view.setAttribute('data-hidden', '1');

    var lvl = doc.createElement('div');
    lvl.className = 'sh-lvl';
    lvl.setAttribute('data-sh-lvl', '');

    var up = doc.createElement('button');
    up.setAttribute('type', 'button');
    up.className = 'sh-row sh-row--up';
    up.setAttribute('data-sh-up', '');
    up.textContent = '← 上一层';
    up.addEventListener('click', function () {
      if (lvl.parentNode) lvl.parentNode.removeChild(lvl);
      if (view) view.removeAttribute('data-hidden');
    });
    lvl.appendChild(up);

    var f = doc.createElement('iframe');
    f.className = 'sh-frame sh-frame--sub';
    f.setAttribute('data-sh-subframe', '');
    f.setAttribute('title', label || '');
    f.setAttribute('src', url);
    lvl.appendChild(f);

    pane.el.appendChild(lvl);
  }

  function show(id) {
    for (var k in panes) {
      if (panes[k] && panes[k].el) {
        if (k === id) panes[k].el.setAttribute('data-on', '1');
        else panes[k].el.removeAttribute('data-on');
      }
      setRun(k, k !== id && !!panes[k]);       // SH-4：最小化中的 app，符号变实心
    }
    cur = id;
    win.setAttribute('data-open', '1');
    try { doc.body.setAttribute('data-sh-open', '1'); } catch (e) {}
    paint();
    remember();
  }

  function open(id) {
    if (!APPS[id]) return;
    var app = APPS[id];
    /* 窄屏 + 有真实页面的 app：直接跳过去，不套窗口 */
    if (narrow() && app.kind === 'frame') { go(app.url); return; }
    makePane(id);
    if (!panes[id]) return;
    /* ARG-BUILD-12 · FR-B：素读窗口【首次打开】时，父层窗口 chrome 渲染
       一行「之前的记录还在。」，1.2s 硬切消失（播过即置位）。
       ⚠️ 与 /sd/ 裸开自渲染同文案（ARG-DIALOGUE-REV · MVP-3 已换措辞）。
       只在第一次（windowFresh 快照）触发；重开窗由 winLineShown 挡住。 */
    if (id === 'sd' && framingBoot.windowFresh) showWindowLine();
    show(id);
  }

  function minimize() {
    if (!cur) return;
    var id = cur;
    if (panes[id] && panes[id].el) panes[id].el.removeAttribute('data-on');
    setRun(id, true);                          // iframe 不销毁：状态与滚动位置都留着
    cur = null;
    win.removeAttribute('data-open');
    try { doc.body.removeAttribute('data-sh-open'); } catch (e) {}
    paint();
    remember();
    syncReveal();
    if (SH.Clock && SH.Clock.refresh) SH.Clock.refresh();
  }

  /* SH-5：关闭必须先真的干净。不挽留、不改标题、不留残影、不弹任何东西。
     那一击留给以后 —— 它的全部威力来自玩家先确认过"关掉是安全的"。
     ⚠️ 本函数【禁止】登记任何恐怖席位。 */
  function close() {
    if (!cur) return;
    var id = cur;
    var pane = panes[id];
    if (pane && pane.el && pane.el.parentNode) pane.el.parentNode.removeChild(pane.el);
    panes[id] = null;
    setRun(id, false);
    cur = null;
    win.removeAttribute('data-open');
    try { doc.body.removeAttribute('data-sh-open'); } catch (e) {}
    if (id === 'sd') { titleReq = 0; try { doc.title = BASE_TITLE; } catch (e) {} }
    paint();
    /* 静默采集，v1 不使用 */
    patch(function (o) {
      if (!(o.leave_ts instanceof Array)) o.leave_ts = [];
      o.leave_ts.push({ at: Date.now(), from: id, method: 'shell_close' });
      if (o.leave_ts.length > 40) o.leave_ts = o.leave_ts.slice(-40);
      if (o.shell) { o.shell.win_state[id] = 'closed'; o.shell.last_app = null; }
    });
    syncReveal();
    if (SH.Clock && SH.Clock.refresh) SH.Clock.refresh();
  }

  function remember() {
    patch(function (o) {
      var sh = o.shell;
      sh.last_app = cur;
      for (var k in APPS) {
        if (!panes[k]) sh.win_state[k] = 'closed';
        else sh.win_state[k] = (k === cur) ? 'open' : 'min';
      }
    });
  }

  /* ══ ARG-BUILD-12 · 组1 背景 framing（FR-A / FR-B）════════════════
     两处都走 CF-4 的专用布尔（framing_seen / framing_window_seen），
     与 booted_at / win_state.sd 解耦 —— 详见 ready() 最早分支的快照。

     FR-A 首启三行：桌面主体渲染之前，占满视口，设备自己的等宽字。
       退出 = 任意点击 / 任意按键 / 4.5s 自动，硬切（≤100ms opacity）。
       R5：无进度条 / 百分比 / logo / 版本号 / 跳过按钮 / 缓动 / 音效。
       文案逐字来自设计真源 §2.2 —— 玩家屏幕上三行字一字不差。 */
  var FR_A_LINES = ['这台机器不是你的。', '它被打开过很多次。', '最后一次，没有关。'];
  var FR_B_LINE = '之前的记录还在。';

  function showFraming(done) {
    var ov = doc.createElement('div');
    ov.className = 'sh-framing';
    ov.setAttribute('data-sh-framing', '');
    FR_A_LINES.forEach(function (t) {
      var p = doc.createElement('p');
      p.className = 'sh-framing__l';
      p.textContent = t;
      ov.appendChild(p);
    });
    (doc.body || doc.documentElement).appendChild(ov);

    var fired = false;
    function cut() {
      if (fired) return;
      fired = true;
      try { doc.removeEventListener('click', cut, true); } catch (e) {}
      try { doc.removeEventListener('keydown', cut, true); } catch (e) {}
      ov.classList.add('sh-framing--off');       // ≤100ms opacity 硬切
      setTimeout(function () {
        if (ov.parentNode) ov.parentNode.removeChild(ov);
        done();
      }, 80);
    }
    /* 任意键 / 任意点击硬切（capture：桌面空白处零交互，但这里不点白屏 =
       这台机器自己印的字，点一下就是"知道了"） */
    try { doc.addEventListener('click', cut, true); } catch (e) {}
    try { doc.addEventListener('keydown', cut, true); } catch (e) {}
    setTimeout(cut, 4500);                        // 4.5s 自动硬切
  }

  /* FR-B 素读窗口首开一行：父层窗口 chrome 渲染（设备命名空间），
     1.2s 后硬切消失，随后 /sd/ 内的 SS-001 正常播。
     ⚠️ 不依赖 win_state.sd —— 只由本窗口【首次打开】驱动（CF-4）。
     ⚠️ 与 /sd/ 的时序由【同一枚 framing_window_seen】协调：
        · 本函数渲染期间【不置位】——/sd/ 在 iframe 内读到 false 才把
          SS-001 延后 1.2s（否则它会提前播，与这一行撞车）。
        · 1.2s 播完后【播过即置位】，此后 /sd/ 读到 true 不再延后。 */
  function showWindowLine() {
    if (!bodyEl || winLineShown) return;
    winLineShown = true;
    var line = doc.createElement('div');
    line.className = 'sh-winline';
    line.setAttribute('data-sh-winline', '');
    line.textContent = FR_B_LINE;
    bodyEl.appendChild(line);
    setTimeout(function () {
      if (line.parentNode) line.parentNode.removeChild(line);
      try { patch(function (o) { o.shell.framing_window_seen = true; }); } catch (e) {}
    }, 1200);
  }

  function seen(tag) {
    patch(function (o) {
      if (o.shell.fm_seen.indexOf(tag) < 0) o.shell.fm_seen.push(tag);
    });
    if (tag === 'fm') spend('SH-B2');          // 空名条目：首次打开文件即成立
  }

  /* ══ ④ 渐进具名（SH-B1）══════════════════════════════════════════
     不是"出现"，是"具名"。那一行本来就在那 —— 开局它只是一个空条目。
     静默：无动画、无角标、无提示音、无计数（R2）。 */

  function isRevealed(id) {
    var sh = read().shell;
    return sh.icons_revealed.indexOf(id) >= 0;
  }

  function offered() {
    var o = read();
    var pf = o.path_flags || {};
    return !!(pf.save_offered || pf.opened_save_offered || pf.sd_g1_save_offered);
  }

  function reveal(id) {
    if (id !== 'save') return;                 // v1 只有这一个条目会被命名
    if (!isRevealed(id)) {
      patch(function (o) {
        if (o.shell.icons_revealed.indexOf(id) < 0) o.shell.icons_revealed.push(id);
      });
      spend('SH-B1');
    }
    paintReveal();
  }

  function paintReveal() {
    var slot = doc.querySelector('[data-sh-slot="save"]');
    if (!slot) return;                         // 已经具名过了
    var li = itemOf('save');
    if (!li) return;
    var b = doc.createElement('button');
    b.setAttribute('type', 'button');
    b.className = 'sh-btn';
    b.setAttribute('data-sh-open', 'save');
    var gm = doc.createElement('span');
    gm.className = 'sh-g sh-g--hollow';
    var lb = doc.createElement('span');
    lb.className = 'sh-label';
    lb.textContent = APPS.save.label;
    b.appendChild(gm); b.appendChild(lb);
    b.addEventListener('click', function () { open('save'); });
    li.removeChild(slot);
    li.appendChild(b);
  }

  /* 兜底：玩家可能是裸开 /sd/ 玩到 SS-053 再回本机的（N1 直链降级）。
     那种情况下没有任何桥接消息，只能靠回读存档。 */
  function syncReveal() {
    if (isRevealed('save')) { paintReveal(); return; }
    if (offered()) reveal('save');
  }

  /* ══ ③ 桥接（父侧）══════════════════════════════════════════════
     白名单三条，全部纯字符串 / 纯数值：
       title_request  子→父   素读的标题漂移由本机渲染
       clock_sync     父→子   改时间后 app 内的时序逻辑跟随
       open_window    子→父   v1 仅用于"存档"条目的具名
     BR-1 禁传样式 · BR-2 载荷禁含 "<" · BR-3 其余 app 一律不得握手 ·
     BR-4 只有素读可以说话（它与本机同代；归档是被打开的文件，
          文件不知道自己被谁打开）。 */

  function safe(v) {
    if (typeof v !== 'string') return '';
    if (v.indexOf('<') >= 0) return '';        // BR-2
    return v.slice(0, 60);
  }

  function fromSd(ev) {
    var pane = panes.sd;
    if (!pane || !pane.frame) return false;
    var w = null;
    try { w = pane.frame.contentWindow; } catch (e) { return false; }
    return !!w && ev.source === w;
  }

  function onMessage(ev) {
    var d = ev && ev.data;
    if (!d || typeof d !== 'object') return;
    if (!fromSd(ev)) return;                   // BR-3 / BR-4：只有素读能握手

    if (d.t === 'title_request') {
      var s = safe(d.v);
      if (!s) return;
      titleReq++;
      try { doc.title = s; } catch (e) {}      // L1-a 的落点仍是标签页标题
      if (cur === 'sd') paint();               // SH-B3 只在 app 名内部漂移
      return;
    }
    if (d.t === 'open_window') {
      var id = safe(d.v);
      /* v1 语义：把这一条【命名】，不替玩家开窗。
         自己弹出来的窗口 = 显式进度提示，那会当场破 R2。 */
      if (APPS[id]) reveal(id);
      return;
    }
    /* 白名单之外的一律丢弃，不回消息、不报错。 */
  }

  function broadcastClock(ms) {
    var pane = panes.sd;                       // 只发给素读：归档没有"现在"（§4.4）
    if (!pane || !pane.frame) return;
    var w = null;
    try { w = pane.frame.contentWindow; } catch (e) { return; }
    if (!w || !w.postMessage) return;
    try { w.postMessage({ t: 'clock_sync', v: Number(ms) || 0 }, '*'); } catch (e) {}
  }

  /* ══ 装配 ═══════════════════════════════════════════════════════ */

  function ready(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    win = doc.querySelector('[data-sh-win]');
    bodyEl = doc.querySelector('[data-sh-body]');
    titleEl = doc.querySelector('[data-sh-title]');
    if (!win || !bodyEl || !titleEl) return;

    /* 条目：一条一条挂，不做事件委托 —— 列表是死的，四行而已 */
    doc.querySelectorAll('[data-sh-open]').forEach(function (b) {
      b.addEventListener('click', function () { open(b.getAttribute('data-sh-open')); });
    });

    doc.querySelectorAll('[data-sh-act]').forEach(function (b) {
      var act = b.getAttribute('data-sh-act');
      b.addEventListener('click', function () { if (act === 'close') close(); else minimize(); });
    });

    syncReveal();

    try { g.addEventListener('message', onMessage); } catch (e) {}
    SH.Bus.on('clock_sync', broadcastClock);

    if (SH.Clock && SH.Clock.mount) SH.Clock.mount();

    /* 首帧：第一次拿到这台机器时，素读是开着的（P-a）。
       ⚠️ 窄屏例外：那里"打开素读"= 真跳转，首帧就跳走等于把本机整个跳过去。
          手机上第一屏就是这张列表 —— 这不是降级，是设备形态的一致表达。

       ARG-BUILD-12 · CF-4：FR-A / FR-B 的【写入前快照】必须在此处、在
       patch 写 booted_at 之前、open('sd') 之前取 —— 这正是 first 的语义。
       · first（首帧自动开素读 / last_app 回读）仍由 booted_at 驱动，不变。
       · framingFresh / windowFresh 由专用布尔驱动，与 booted_at 解耦。 */
    var boot = read().shell;
    var first = !boot.booted_at;
    var framingFresh = !boot.framing_seen;
    var windowFresh = !boot.framing_window_seen;
    framingBoot = { fresh: framingFresh, windowFresh: windowFresh };
    patch(function (o) {
      if (!o.shell.booted_at) o.shell.booted_at = Date.now();
      /* FR-A 播过即置位：本机侧无其它读者，决定即置位（防刷新重播）。
         ⚠️ FR-B 的 framing_window_seen【不在此置位】——/sd/ 读同一字段
         决定 SS-001 的 1.2s 延后；若这里先置 true，iframe 内 /sd/ 会读到
         "已播过"而不再延后，窗口一行与 SS-001 就会撞车（CF-4 时序竞态）。
         它由 showWindowLine 在 1.2s 播完后置位。 */
      if (framingFresh) o.shell.framing_seen = true;
    });

    function afterFraming() {
      if (!narrow()) {
        if (first) open('sd');
        else if (boot.last_app && APPS[boot.last_app]) open(boot.last_app);
      }
    }

    if (framingFresh) {
      /* FR-A 首启三行：占满视口，硬切后进桌面 + 素读自动开（P-a） */
      showFraming(afterFraming);
    } else {
      afterFraming();
    }
  });

  SH.Home = {
    open: open, minimize: minimize, close: close,
    reveal: reveal, sync: syncReveal,
    visible: function () { return cur; },
    apps: APPS,
    baseTitle: BASE_TITLE
  };

})(typeof window !== 'undefined' ? window : globalThis);
