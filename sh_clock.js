/* ==========================================================================
   sh_clock.js · 本机的钟（ARG-BUILD-11 / §4）

   它从聊天页搬到了这里。归属变了，设计意图一条没变，而且更成立：
   以前是"她的界面上有个钟"，现在是"这台机器的钟"。
   跨 app 常驻 · 跨窗口切换不重置 · 跨会话持久（同一个 time_warp_ms 字段）。

   三条纪律：
     · CL-1 只显示 HH:MM。永不显示日期 / 星期 / 年份。
       一台只有四个功能的机器有个只报时的钟，这不需要解释，也不占席位。
     · CL-2 改时间必须广播给所有已载入的 app，否则会出现
       "把时间往前拨一小时、窗口里的倒计时纹丝不动"这种同屏矛盾。
     · CL-3 钟归【最外层的那个 document】。被装进 iframe 的页面自己不挂钟
       （见 js/sd_clock.js 的自检）。任一时刻整页只有一个钟（X-10）。

   ⚠️ 时刻格式与 ±7 天钳制在本文件里【独立实现了一份】，没有复用 sd_ 的实现。
      这是刻意的：本机与 app 跑在不同的执行上下文里，共享一份运行时会让
      两边的内存态互相覆盖（同一个存档键的读-改-写竞态）。宁可各写十行。
   ========================================================================== */
(function (g) {
  'use strict';
  var SH = (g.SH = g.SH || {});
  var doc = g.document;

  var STEP = { '-1h': -3600000, '-10m': -600000, '+10m': 600000, '+1h': 3600000 };

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* CL-1：只有 HH:MM。这里没有第三段，也没有日期区 —— 它根本不存在。 */
  function fmtClock(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* 相对短标签，不外露任何年份（X-2 安全） */
  function offsetLabel(ms) {
    if (!ms) return '此刻';
    var sign = ms > 0 ? '+' : '−';
    var a = Math.abs(ms);
    var h = Math.floor(a / 3600000);
    var m = Math.floor((a % 3600000) / 60000);
    var s = '';
    if (h) s += h + '小时';
    if (m) s += m + '分';
    if (!s) s = Math.round(a / 1000) + '秒';
    return sign + s;
  }

  /* shim 与老浏览器都没有可靠的 Node.contains，自己走一遍父链 */
  function within(box, node) {
    for (var n = node; n; n = n.parentNode) if (n === box) return true;
    return false;
  }

  var clockEl = null;
  var panelEl = null;
  var tickTimer = null;

  /* ── SH-B4（B 类 · L4 · 单次会话仅 1 次）────────────────────────────
     异常本体：分位【停一拍】—— 该跳的时候没跳，过一会儿才跳上去。
     不解释、不重复、无任何提示。

     ⚠️ TW-4 护栏（硬条件，不可绕过）：
        只在素读窗口【不可见】时才允许发生。
        理由：它与她消息上的时间戳漂移是同族异常（时间不对劲）。
        同屏 = 玩家会把两者一起归因成"这网站时间显示有 bug" → 双双失效。 */
  var beatFired = false;      // 会话内一次（刷新即重置，这是设计要的粒度）
  var beatArmedAt = 0;        // 素读不可见的起始时刻
  var beatHoldUntil = 0;      // 停拍结束时刻
  var beatLast = '';          // 停拍期间钉住的那一格

  var BEAT_ARM_MS = 20000;    // 离开她 20 秒后才允许发生
  var BEAT_HOLD_MS = 18000;   // 停一拍 ≈18 秒，然后自己跳上去

  function guardOk() {
    try { return !(SH.Home && SH.Home.visible && SH.Home.visible() === 'sd'); }
    catch (e) { return false; }
  }

  function label() {
    var now = SH.Store.now();
    var txt = fmtClock(now);

    if (!guardOk()) { beatArmedAt = 0; beatHoldUntil = 0; return txt; }

    if (beatHoldUntil) {
      if (now < beatHoldUntil) return beatLast;      // 还停着
      beatHoldUntil = 0;                             // 跳上去，不解释
      return txt;
    }
    if (beatFired) return txt;

    if (!beatArmedAt) { beatArmedAt = now; beatLast = txt; return txt; }
    if (now - beatArmedAt < BEAT_ARM_MS) { beatLast = txt; return txt; }

    if (txt !== beatLast) {                          // 正要跳分 → 就在这一拍停住
      beatFired = true;
      beatHoldUntil = now + BEAT_HOLD_MS;
      try { SH.Store.spend('SH-B4'); } catch (e) {}
      return beatLast;
    }
    beatLast = txt;
    return txt;
  }

  /* ── 常驻钟 ───────────────────────────────────────────────────────── */
  function mount() {
    if (clockEl) return clockEl;
    /* 优先复用页面上已有的时钟元素（任务栏托盘里的），
       没有的话再动态创建一个（兼容裸开 / 旧布局）。 */
    var el = doc.querySelector('[data-sh-clock]');
    if (!el) {
      el = doc.createElement('button');
      el.setAttribute('type', 'button');
      el.setAttribute('data-sh-clock', '');
      el.className = 'sh-clock';
      el.setAttribute('aria-label', '当前时间');
      try { (doc.body || doc.documentElement).appendChild(el); } catch (e) {}
    }
    el.textContent = label();
    el.addEventListener('click', function () {
      if (panelEl) closePanel(); else openPanel();
    });
    clockEl = el;
    /* 无头环境没有 setInterval：静态显示当前时刻即可，不抛、不阻断。 */
    try {
      tickTimer = g.setInterval(function () {
        if (clockEl) clockEl.textContent = label();
      }, 1000);
    } catch (e) { tickTimer = null; }
    return el;
  }

  /* ── 「时间」面板（克制、正常，无任何调试措辞）────────────────────── */
  function openPanel() {
    if (panelEl) return;
    var wrap = doc.createElement('div');
    wrap.setAttribute('data-sh-panel', '');
    wrap.className = 'sh-panel';

    var title = doc.createElement('div');
    title.className = 'sh-panel__t';
    title.textContent = '时间';
    wrap.appendChild(title);

    var nowLine = doc.createElement('div');
    nowLine.className = 'sh-panel__l';
    nowLine.setAttribute('data-sh-panel-now', '');
    nowLine.textContent = '当前：' + fmtClock(SH.Store.now());
    wrap.appendChild(nowLine);

    var offLine = doc.createElement('div');
    offLine.className = 'sh-panel__l';
    offLine.setAttribute('data-sh-panel-offset', '');
    offLine.textContent = '偏移：' + offsetLabel(SH.Store.warp());
    wrap.appendChild(offLine);

    var grid = doc.createElement('div');
    grid.className = 'sh-panel__g';
    ['-1h', '-10m', '+10m', '+1h'].forEach(function (k) {
      var b = doc.createElement('button');
      b.setAttribute('type', 'button');
      b.setAttribute('data-sh-step', k);
      b.className = 'sh-panel__b';
      b.textContent = k;
      b.addEventListener('click', function () {
        apply(SH.Store.warp() + STEP[k], nowLine, offLine);
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);

    var reset = doc.createElement('button');
    reset.setAttribute('type', 'button');
    reset.setAttribute('data-sh-reset', '');
    reset.className = 'sh-panel__r';
    reset.textContent = '回到此刻';
    reset.addEventListener('click', function () { apply(0, nowLine, offLine); });
    wrap.appendChild(reset);

    try { (doc.body || doc.documentElement).appendChild(wrap); } catch (e) {}
    panelEl = wrap;
    doc.addEventListener('click', onDocClick, true);
  }

  /* CL-2：写偏移 → 立刻广播给已载入的 app，再刷新自己 */
  function apply(ms, nowLine, offLine) {
    var v = SH.Store.setWarp(ms);
    try { SH.Bus.emit('clock_sync', v); } catch (e) {}
    if (clockEl) clockEl.textContent = label();
    if (nowLine) nowLine.textContent = '当前：' + fmtClock(SH.Store.now());
    if (offLine) offLine.textContent = '偏移：' + offsetLabel(v);
  }

  function onDocClick(ev) {
    if (!panelEl) return;
    var t = ev && ev.target;
    if (t && within(panelEl, t)) return;
    if (t && clockEl && within(clockEl, t)) return;
    closePanel();
  }

  function closePanel() {
    if (!panelEl) return;
    try { doc.removeEventListener('click', onDocClick, true); } catch (e) {}
    if (panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);
    panelEl = null;
  }

  function refresh() { if (clockEl) clockEl.textContent = label(); }

  SH.Clock = {
    mount: mount,
    open: openPanel,
    close: closePanel,
    refresh: refresh,
    fmt: fmtClock,
    el: function () { return clockEl; },
    panelEl: function () { return panelEl; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
