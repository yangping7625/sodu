/* ==========================================================================
   sd_timeline.js · 时序层（J-5）
   first_visit_at / pre_visit_ts 相对生成 / next_available_at 软倒计时 /
   clock_skew_guard

   纪律：
   · pre_visit_ts 永远由 first_visit_at + offset 相对生成，绝不写死日期。
   · next_available_at 只显示不阻断（R8 / R10）——锁门是惩罚，被她说中才是恐怖。
   · 玩家改系统时间导致负间隔时，一律回落为台词，不报错（E5）。
   · X-2：本模块只产出相对时间；绝对历史日期（2011 等）属论坛地层，不在此处。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var S = function () { return SD.State; };

  var SIX_HOURS = 6 * 60 * 60 * 1000;

  /* 首访登记：只在真正第一次时写入 */
  function boot() {
    var d = S().get(), t = d.timeline, now = Date.now();
    if (!t.first_visit_at) t.first_visit_at = now;
    t.session_start_at = now;
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
    var v = Date.now() - (t.session_start_at || Date.now());
    return v < 0 ? 0 : v;                 // clock_skew_guard
  }

  /* 软倒计时：只显示，不阻断 */
  function armNextAvailable() {
    var d = S().get();
    d.timeline.next_available_at = Date.now() + SIX_HOURS;
    S().commit();
    return d.timeline.next_available_at;
  }

  /* 返回 { early:bool, text:string }；early=true 表示玩家比她算的早回来 */
  function nextAvailableState() {
    var t = S().get().timeline;
    if (!t.next_available_at) return { early: false, text: null };
    var diff = t.next_available_at - Date.now();
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
  function fmtStamp(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
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
    mmss: mmss, secs: secs, fmtClock: fmtClock, fmtStamp: fmtStamp
  };

})(typeof window !== 'undefined' ? window : globalThis);
