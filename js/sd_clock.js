/* ==========================================================================
   sd_clock.js · 右下角常驻系统时钟 + 点击设时间（ARG-BUILD-05-rev）

   设计意图（用户拍板）：
     · 像真实电脑系统托盘时钟一样，始终常驻视口右下角；极简、单色、低存在感，
       绝不抢对话焦点（不自动聚焦、不拦截对话区点击、不遮挡输入框）。
     · 点击 → 弹出一个克制、正常的「时间」面板（无任何「调试 / debug」措辞，
       它就是个看时间的面板）。面板调的是墙钟偏移 time_warp_ms（相对偏移），
       不影响任何台词文本。
     · 玩家调时间 → 所有走 now() 的时序逻辑一起变，含 6 小时冷却锁
       （可快进绕过，6h 不再是硬锁）。这是「环境信息」而非「进度条」，不违反 R2。
     · 偏移钳制在 ±7 天：足够跨过 6h 冷却，又不会把年份拨乱
       （X-2：本作绝不渲染 2011 这类绝对历史年份 —— 面板只显示 HH:MM 与相对偏移）。

   纪律：
     · 所有 DOM 写入走 textContent（XSS 安全）。
     · 墙钟显示与冷却逻辑共用 SD.State.now()（统一时间源）。
     · 关闭面板即移除 DOM（任务要求：不留游离节点）。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  var S = function () { return SD.State; };
  var T = function () { return SD.Timeline; };

  /* 步进档位（毫秒）。与任务拍板的 -1h / -10m / +10m / +1h 一致。 */
  var STEP = {
    '-1h':  -3600000,
    '-10m':  -600000,
    '+10m':   600000,
    '+1h':   3600000
  };

  /* 把毫秒偏移格式成中文相对短标签（不外露任何年份，X-2 安全）。 */
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

  /* 渲染一条 HH:MM（取统一时间源，使「显示」与「逻辑」一致）。 */
  function tickLabel() {
    return T().fmtClock(S().now());
  }

  var clockEl = null;
  var panelEl = null;
  var tickTimer = null;

  /* ── 常驻时钟 ──────────────────────────────────────────────────────── */
  function mountClock() {
    if (clockEl) return clockEl;            // 幂等：重复挂载不重复创建
    var el = document.createElement('button');
    el.setAttribute('type', 'button');
    el.setAttribute('data-sd-clock', '');
    el.className = 'sd-clock';
    el.setAttribute('aria-label', '当前时间');
    el.textContent = tickLabel();
    el.addEventListener('click', function () {
      if (panelEl) closePanel(); else openPanel();
    });
    /* 挂到 body 末尾，靠 CSS 做 fixed 定位到视口右下角。 */
    try { (document.body || document.documentElement).appendChild(el); } catch (e) {}
    clockEl = el;
    /* 无头环境（测试垫片）未实现 setInterval：静默降级，时钟静态显示当前时刻即可，
       不抛异常、不阻断脚本执行。真实浏览器里每秒刷新一次。 */
    try { tickTimer = g.setInterval(function () {
      if (clockEl) clockEl.textContent = tickLabel();
    }, 1000); } catch (e) { tickTimer = null; }
    return el;
  }

  /* ── 设置面板（克制、正常，无任何「调试」措辞） ─────────────────────── */
  function openPanel() {
    if (panelEl) return;
    var wrap = document.createElement('div');
    wrap.setAttribute('data-sd-clock-panel', '');
    wrap.className = 'sd-clock-panel';

    var title = document.createElement('div');
    title.className = 'sd-clock-panel__title';
    title.textContent = '时间';                       // 普通措辞，非「调试」
    wrap.appendChild(title);

    var nowLine = document.createElement('div');
    nowLine.className = 'sd-clock-panel__now';
    nowLine.textContent = '当前：' + tickLabel();
    wrap.appendChild(nowLine);

    var offLine = document.createElement('div');
    offLine.className = 'sd-clock-panel__off';
    offLine.setAttribute('data-sd-clock-offset', '');
    offLine.textContent = '偏移：' + offsetLabel(S().getWarp());
    wrap.appendChild(offLine);

    var grid = document.createElement('div');
    grid.className = 'sd-clock-panel__grid';
    ['-1h', '-10m', '+10m', '+1h'].forEach(function (k) {
      var b = document.createElement('button');
      b.setAttribute('type', 'button');
      b.setAttribute('data-sd-clock-step', k);
      b.className = 'sd-clock-panel__btn';
      b.textContent = k;                              // -1h / -10m / +10m / +1h
      b.addEventListener('click', function () {
        S().setWarp(S().getWarp() + STEP[k]);        // 相对偏移累加，钳制 ±7 天
        refreshPanel(nowLine, offLine);
      });
      grid.appendChild(b);
    });
    wrap.appendChild(grid);

    var reset = document.createElement('button');
    reset.setAttribute('type', 'button');
    reset.setAttribute('data-sd-clock-reset', '');
    reset.className = 'sd-clock-panel__reset';
    reset.textContent = '回到此刻';                  // 清零偏移
    reset.addEventListener('click', function () {
      S().setWarp(0);
      refreshPanel(nowLine, offLine);
    });
    wrap.appendChild(reset);

    try { (document.body || document.documentElement).appendChild(wrap); } catch (e) {}
    panelEl = wrap;

    /* 点击面板之外才关闭；面板内 / 时钟按钮内的点击不关闭。 */
    document.addEventListener('click', onDocClick, true);
  }

  function refreshPanel(nowLine, offLine) {
    if (!panelEl) return;
    nowLine.textContent = '当前：' + tickLabel();
    offLine.textContent = '偏移：' + offsetLabel(S().getWarp());
  }

  function onDocClick(ev) {
    if (!panelEl) return;
    var t = ev && ev.target;
    if (t && panelEl.contains(t)) return;            // 面板内
    if (t && clockEl && clockEl.contains(t)) return; // 时钟按钮内
    closePanel();
  }

  function closePanel() {
    if (!panelEl) return;
    try { document.removeEventListener('click', onDocClick, true); } catch (e) {}
    if (panelEl.parentNode) panelEl.parentNode.removeChild(panelEl);  // 关闭即移除 DOM
    panelEl = null;
  }

  /* 卸载（理论用不到；刷新即整页重建。保留以便单测/清理场景调用）。 */
  function unmount() {
    closePanel();
    if (tickTimer) { try { g.clearInterval(tickTimer); } catch (e) {} tickTimer = null; }
    if (clockEl && clockEl.parentNode) clockEl.parentNode.removeChild(clockEl);
    clockEl = null;
  }

  SD.Clock = {
    mount: mountClock,
    open: openPanel,
    close: closePanel,
    unmount: unmount,
    el: function () { return clockEl; },
    panelEl: function () { return panelEl; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
