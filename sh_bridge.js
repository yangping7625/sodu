/* ==========================================================================
   sh_bridge.js · 桥接（子侧 · ARG-BUILD-11）

   ⚠️ 装载纪律（BR-3，硬红线）：
      本文件【只允许】被 /sd/ 加载。
      /qsw/、/save、/about 一律不得引用它，也不得以任何方式触碰
      window.parent / window.top —— 归档是一份 2011 年的死镜像，
      它不知道自己正被谁打开；这份"无知"就是 X-5 的全部内容。

   协议（X-9 / BR-1）：白名单四条，除此之外一律不存在。
      title_request   子 → 父   { t, v:string }   素读的标题漂移交由本机渲染
      open_window     子 → 父   { t, v:string }   v1 只用于给"存档"那一条【具名】
      clock_sync      父 → 子   { t, v:number }   本机改过时间，页内时序跟上
      minimize_window 子 → 父   { t, v:string }   Esc 键请求最小化（UX 打磨：焦点在 iframe 时的键盘可达）

   载荷纪律（BR-1 / BR-2）：
      只传纯字符串 / 纯数值。禁传 HTML、禁传 CSS、禁传选择器、禁传函数名，
      载荷内出现 "<" 直接丢弃。父侧同样再校验一次 —— 两头都不信对方。

   裸开纪律：
      玩家从搜索引擎直接进 /sd/ 是完全合法的入口（N1）。
      那种情况下本文件必须【完全静默】：不发消息、不改任何行为。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  /* ── 宿主判定 ─────────────────────────────────────────────────────── */
  var host = null;
  try {
    if (typeof g.self !== 'undefined' && typeof g.top !== 'undefined' && g.self !== g.top) {
      host = g.parent || null;
    }
  } catch (e) { host = null; }

  var MAXLEN = 60;

  function post(t, v) {
    if (!host) return false;                     // 裸开：静默
    if (typeof v !== 'string' || !v) return false;
    if (v.indexOf('<') >= 0) return false;       // BR-2
    try { host.postMessage({ t: t, v: v.slice(0, MAXLEN) }, '*'); return true; }
    catch (e) { return false; }
  }

  function title(v) { return post('title_request', v); }
  function ask(id) { return post('open_window', id); }

  /* ── 子 → 父 ①：标题漂移（L1-a）────────────────────────────────────
     页内本来就有 SD.Render.setTitle 在改 document.title。
     开在窗口里的时候，iframe 的 title 玩家一眼都看不到 ——
     所以把它顺出去，由本机落到真正会被看见的地方。
     包装而非替换：原行为一次不少地照跑（裸开时唯一生效的也还是它）。 */
  function wrapTitle() {
    var R = SD.Render;
    if (!R || typeof R.setTitle !== 'function' || R.setTitle.__sh) return;
    var orig = R.setTitle;
    var wrapped = function (s) {
      var r = orig.apply(R, arguments);
      try { if (typeof s === 'string') title(s); } catch (e) {}
      return r;
    };
    wrapped.__sh = true;
    R.setTitle = wrapped;
  }

  /* ── 子 → 父 ②：给"存档"具名（SH-B1）──────────────────────────────
     她在对话里递出存档的那一刻，本机列表上那一条空条目才有了名字。
     ⚠️ 只【具名】，不替玩家开窗 —— 自己弹出来的窗口等于显式进度提示，
        那会当场破 R2。父侧同样只做 reveal。 */
  var SAVE_FLAGS = { save_offered: 1, opened_save_offered: 1, sd_g1_save_offered: 1 };

  function offeredNow() {
    var S = SD.State;
    if (!S || typeof S.hasFlag !== 'function') return false;
    try {
      return !!(S.hasFlag('save_offered') ||
                S.hasFlag('opened_save_offered') ||
                S.hasFlag('sd_g1_save_offered'));
    } catch (e) { return false; }
  }

  function wrapFlag() {
    var S = SD.State;
    if (!S || typeof S.flag !== 'function' || S.flag.__sh) return;
    var orig = S.flag;
    var wrapped = function (name, val) {
      var r = orig.apply(S, arguments);
      try { if (val !== false && SAVE_FLAGS[name]) ask('save'); } catch (e) {}
      return r;
    };
    wrapped.__sh = true;
    S.flag = wrapped;
  }

  /* ── 子 → 父 ③：Esc 请求最小化（UX 打磨 · 键盘可达） ────────────
     焦点在 iframe 输入框里时，键盘事件不会冒泡到父窗口 ——
     所以子侧也得监听 Esc，把请求转发出去。
     只在嵌入态生效，裸开静默（裸开没有"窗口"可最小化）。 */
  function bindEsc() {
    try {
      g.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape') return;
        post('minimize_window', 'esc');
      });
    } catch (e) {}
  }

  /* ── 父 → 子：时间同步（CL-2）──────────────────────────────────────
     本机上把时间往前拨，页内的 6h 冷却锁 / 时序判定必须跟着走，
     否则玩家会看见"时钟已经是明天了，她却说你刚走"。 */
  function onMessage(ev) {
    if (!host) return;
    if (!ev || ev.source !== host) return;        // 只听宿主，其余一概不理
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.t !== 'clock_sync') return;             // 白名单之外丢弃，不回消息
    var ms = Number(d.v);
    if (!isFinite(ms)) return;
    try {
      if (SD.State && typeof SD.State.setWarp === 'function') SD.State.setWarp(ms);
    } catch (e) {}
  }

  function boot() {
    if (!host) return;
    wrapTitle();
    wrapFlag();
    bindEsc();
    try { g.addEventListener('message', onMessage); } catch (e) {}
    /* 回访：她早就递过存档了，这次进来直接把那一条认下来。 */
    if (offeredNow()) ask('save');
  }

  /* sd_app.js 在本文件之后装配；等 DOM 就绪再挂，
     保证 SD.State 已 load()、SD.Render 已就位。 */
  try {
    if (g.document && g.document.readyState === 'loading') {
      g.document.addEventListener('DOMContentLoaded', boot);
    } else { boot(); }
  } catch (e) { try { boot(); } catch (e2) {} }

  SD.Bridge = {
    active: !!host,
    title: title,
    ask: ask,
    /* 测试用：不产生任何玩家可见行为 */
    _onMessage: onMessage
  };

})(typeof window !== 'undefined' ? window : globalThis);
