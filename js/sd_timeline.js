/* ==========================================================================
   sd_timeline.js · 时序层（J-5）
   first_visit_at / pre_visit_ts 相对生成 / next_available_at 软倒计时 /
   clock_skew_guard

   纪律：
   · pre_visit_ts 永远由 first_visit_at + offset 相对生成，绝不写死日期。
   · next_available_at 只显示不阻断（R8 / R10）——锁门是惩罚，被她说中才是恐怖。
   · 玩家改系统时间导致负间隔时，一律回落为台词，不报错（E5）。
   · 冷却/时序一律走 SD.State.now()（= Date.now() + time_warp_ms），与墙钟显示共用
     同一时间源；玩家调墙钟偏移即可快进绕过 6h 冷却锁，且不触碰任何台词文本。
   · X-2：本模块只产出相对时间；绝对历史日期（2011 等）属论坛地层，不在此处。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var S = function () { return SD.State; };

  var SIX_HOURS = 6 * 60 * 60 * 1000;

  /* 首访登记：只在真正第一次时写入 */
  function boot() {
    var d = S().get(), t = d.timeline, ts = S().now();
    if (!t.first_visit_at) t.first_visit_at = ts;
    t.session_start_at = ts;
    /* A-2 的时序悖论：相对生成，永不写死 */
    t.pre_visit_ts = t.first_visit_at + (t.pre_visit_offset_ms || -259200000);
    S().commit();
    return t;
  }

  function firstVisitAt() { return S().get().timeline.first_visit_at; }
  function preVisitTs()   { return S().get().timeline.pre_visit_ts; }

  /* 会话内已过去的毫秒数 —— {mm:ss} 的基准 */
  function sessionElapsed() {
    var t = S().get().timeline;
    var n = S().now();
    var v = n - (t.session_start_at || n);
    return v < 0 ? 0 : v;                 // clock_skew_guard
  }

  /* 软倒计时：只显示，不阻断 */
  function armNextAvailable() {
    var d = S().get();
    d.timeline.next_available_at = S().now() + SIX_HOURS;
    S().commit();
    return d.timeline.next_available_at;
  }

  /* 返回 { early:bool, text:string }；early=true 表示玩家比她算的早回来 */
  function nextAvailableState() {
    var t = S().get().timeline;
    if (!t.next_available_at) return { early: false, text: null };
    var diff = t.next_available_at - S().now();
    if (diff <= 0) return { early: false, text: null };
    return { early: true, text: fmtClock(t.next_available_at) };
  }

  /* clock_skew_guard：把 bug 变成台词（E5） */
  function skewed(ms) {
    return !(typeof ms === 'number' && isFinite(ms) && ms >= 0);
  }

  /* ── 格式化 ──────────────────────────────────────────────────────── */
  function mmss(ms) {
    if (skewed(ms)) ms = 0;
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return pad(m) + ':' + pad(s);
  }
  function secs(ms, digits) {
    if (skewed(ms)) return '0';
    var v = ms / 1000;
    return (digits ? v.toFixed(digits) : String(Math.round(v)));
  }
  function fmtClock(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /* ⚠️ X-2 危险品：本函数会吐出绝对年月日（2026-08-03 20:23）。
     【禁止】用于主对话页任何屏显路径 —— 主对话地层永不渲染绝对年份。
     绝对日期只属论坛地层（qsw_，X-5 要求独立实现，不复用本函数）。
     保留仅为兼容既有导出面；{pre_visit_ts} 已改走 preVisitStamp()。 */
  function fmtStamp(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ── DEF-01 / TQ-01：回访轴（RET）相对时间戳 ───────────────────────
     把 offset 折算成相对天数标签。通用实现：天数由 offset 推导，
     不写死「3」——  S4 当前定稿为 −3 天，将来改 offset 即自动跟随。
     永不产出年/月/日（X-2）。                                        */
  function relDayLabel(offsetMs) {
    var ms = (typeof offsetMs === 'number' && isFinite(offsetMs)) ? offsetMs : -259200000;
    var days = Math.round(Math.abs(ms) / 86400000);
    if (days === 0) return '今天';
    return days + ' 天' + (ms < 0 ? '前' : '后');
  }

  /* 「N 天前 · HH:MM」：相对日 + 绝对时分。
     相对日前缀是硬要求 —— 桌面壳同屏会同时存在系统托盘时钟（纯 HH:MM），
     没有前缀就会与之撞脸，A-2「早 3 天」的信息量当场被吃掉（DEF-01）。 */
  function fmtRelStamp(ts, offsetMs) {
    return relDayLabel(offsetMs) + ' · ' + fmtClock(ts);
  }

  /* {pre_visit_ts} 的唯一渲染入口。数据字段一个字不动（EXT-0），只改形态。 */
  function preVisitStamp() {
    var t = S().get().timeline || {};
    if (t.pre_visit_ts == null) return fmtRelStamp(S().now(), 0);   // 未 boot → 退化为「今天」
    return fmtRelStamp(t.pre_visit_ts, t.pre_visit_offset_ms);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  SD.Timeline = {
    boot: boot,
    firstVisitAt: firstVisitAt,
    preVisitTs: preVisitTs,
    sessionElapsed: sessionElapsed,
    armNextAvailable: armNextAvailable,
    nextAvailableState: nextAvailableState,
    skewed: skewed,
    mmss: mmss, secs: secs, fmtClock: fmtClock, fmtStamp: fmtStamp,
    /* DEF-01：回访轴相对时间戳 */
    relDayLabel: relDayLabel, fmtRelStamp: fmtRelStamp, preVisitStamp: preVisitStamp
  };

})(typeof window !== 'undefined' ? window : globalThis);
