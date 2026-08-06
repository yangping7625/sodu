/* ==========================================================================
   sd_behavior.js · 隐式行为采集（J-4）★ A-1 的命脉

   采集：dwell_ms（节点级 + 页面级 + max_gap / avg / median）
        typing_events（打字后清空侦测）
        leave_ts（visibilitychange + pagehide，不用 beforeunload —— 移动端不可靠）
        input_history（由 sd_state 落盘）

   两条铁律：
   ① R2 —— 前台零进度 UI。本模块不渲染任何东西，不回显任何数字给玩家。
      采集到的一切只有一个出口：她的台词。
   ② {gap} 必须是真数。任何硬编码或估算都会当场杀死 P2。
      本模块不提供"造一个好看的数字"的接口。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var S  = function () { return SD.State; };
  var T  = function () { return SD.Timeline; };

  var A1_PAUSE_MS = 8000;      // 兜底① 触发阈值：最长停顿 ≥ 8s
  var MIN_TYPED   = 2;         // 兜底② 触发阈值：打了 ≥2 字又清空

  var probe = null;            // { node, at }
  var replies = [];            // 本会话全部响应间隔（ms）
  var pageEnterAt = Date.now();
  var pageId = '/';

  /* ── 页面级 ─────────────────────────────────────────────────────── */
  function initPage(id) {
    pageId = id || '/';
    pageEnterAt = Date.now();
    S().markRead('page:' + pageId);

    /* leave_ts：移动端只有 visibilitychange / pagehide 可靠 */
    try {
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') onLeave('visibilitychange');
        else pageEnterAt = Date.now();
      });
      g.addEventListener('pagehide', function () { onLeave('pagehide'); });
    } catch (e) { /* 静默：采集失败绝不影响可玩性 */ }
  }

  function onLeave(method) {
    try {
      flushPageDwell();
      S().pushLeave(pageId, method);
    } catch (e) { /* 静默 */ }
  }

  function flushPageDwell() {
    var now = Date.now();
    var add = now - pageEnterAt;
    if (add < 0) add = 0;                                   // clock_skew_guard
    var k = 'page:' + pageId;
    S().dwell(k, (S().dwell(k) || 0) + add);
    S().dwell('session_total', (S().dwell('session_total') || 0) + add);
    pageEnterAt = now;
  }

  /* ── 节点级探针：她"开始等你"的那一刻 ───────────────────────────── */
  function openProbe(nodeId) {
    probe = { node: nodeId, at: Date.now() };
  }

  /* 玩家应答 → 记录真实间隔，更新派生统计 */
  function closeProbe(nodeId) {
    if (!probe) return 0;
    var id = nodeId || probe.node;
    var gap = Date.now() - probe.at;
    probe = null;
    if (T().skewed(gap)) gap = 0;                           // E5

    S().dwell('node:' + id, gap);
    replies.push(gap);
    recompute(id, gap);
    return gap;
  }

  function recompute(nodeId, gap) {
    var d = S().get(), dw = d.dwell_ms;

    if (!dw.max_gap_ms || gap > dw.max_gap_ms) {
      dw.max_gap_ms = gap;
      dw.max_gap_node = 'node:' + nodeId;
      /* 该停顿发生在会话内的哪个时间点 —— {mm:ss} 的来源 */
      dw.max_gap_at_ms = T().sessionElapsed();
    }
    var sum = 0, i;
    for (i = 0; i < replies.length; i++) sum += replies[i];
    dw.avg_reply_ms = Math.round(sum / replies.length);

    var sorted = replies.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    dw.median_reply_ms = sorted.length % 2
      ? sorted[mid]
      : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

    S().commit();
  }

  /* ── 打字后清空侦测（兜底② 的数据源） ───────────────────────────── */
  function watchInput(el, nodeId) {
    if (!el) return;
    var peak = 0, peek = '';
    function onInput() {
      var v = el.value || '';
      if (v.length > peak) { peak = v.length; peek = v.slice(0, 5); }
      if (v.length === 0 && peak >= MIN_TYPED) {
        S().pushTyping(nodeId, peak, true, peek);           // 她看见了你没发出去的东西
        peak = 0; peek = '';
      }
    }
    el.addEventListener('input', onInput);
    /* 提交成功时由调用方 clearWatch() 复位，避免把"发出去了"误记成"删掉了" */
    el._sdReset = function () { peak = 0; peek = ''; };
  }
  function clearWatch(el) { if (el && el._sdReset) el._sdReset(); }

  /* ── A-1 三级兜底选择器 ★ P2 硬指标 ─────────────────────────────
     ① 最长停顿 ≥ 8s          → pause    （主路径：停顿被当成回答）
     ② 无长停顿但有打字后清空 → cleared  （比①更狠：她看见了你没发的字）
     ③ 全程飞快、无删改       → fast     （快也是证据：她把速度读成敷衍）
     三级必须全部实装 —— 不能因为测试者手速快就落空。                */
  function pickA1Tier() {
    var dw = S().dwellAll();
    var maxGap = dw.max_gap_ms || 0;
    if (maxGap >= A1_PAUSE_MS) return 'pause';

    var te = S().typingEvents(), i;
    for (i = 0; i < te.length; i++) { if (te[i].cleared) return 'cleared'; }

    return 'fast';
  }

  /* 真实实测值 → token 表。全部来自本会话真实数据。 */
  function tokens() {
    var dw = S().dwellAll();
    return {
      '{gap}':   T().secs(dw.max_gap_ms || 0),
      '{mm:ss}': T().mmss(dw.max_gap_at_ms || 0),
      '{avg}':   T().secs(dw.avg_reply_ms || 0, 1),
      '{med}':   T().secs(dw.median_reply_ms || 0, 1)
    };
  }

  /* 装配 A-1 揭示台词（文本来自 SD_DATA.a1_tiers，可整体替换） */
  function a1Lines() {
    var tier = pickA1Tier();
    var conf = (g.SD_DATA && g.SD_DATA.a1_tiers) || {};
    var block = conf[tier] || conf.fast || { lines: [] };
    var tk = tokens();
    var lines = (block.lines || []).map(function (s) {
      return String(s).replace(/\{gap\}|\{mm:ss\}|\{avg\}|\{med\}/g, function (m) {
        return tk[m] !== undefined ? tk[m] : m;
      });
    });
    /* pause 档第 2 句按 route_view 风味替换（设计稿 §4 / 数据层 route_flavors）。
       P2 硬指标：A-1 文本必须随玩家真实路线漂移，不能恒定。
       仅 pause 档生效 —— cleared / fast 档无此分支。 */
    if (tier === 'pause' && block.route_flavors) {
      var rv = S().routeView();
      var flavor = rv ? block.route_flavors[rv] : null;
      if (flavor && lines.length >= 2) {
        lines[1] = String(flavor).replace(/\{gap\}|\{mm:ss\}|\{avg\}|\{med\}/g, function (m) {
          return tk[m] !== undefined ? tk[m] : m;
        });
      }
    }
    return { tier: tier, lines: lines };
  }

  /* 调试用（仅控制台，前台永不显示 —— R2） */
  function snapshot() {
    return {
      tier: pickA1Tier(),
      dwell: S().dwellAll(),
      typing: S().typingEvents().length,
      replies: replies.slice()
    };
  }

  SD.Behavior = {
    initPage: initPage,
    flushPageDwell: flushPageDwell,
    openProbe: openProbe,
    closeProbe: closeProbe,
    watchInput: watchInput,
    clearWatch: clearWatch,
    pickA1Tier: pickA1Tier,
    tokens: tokens,
    a1Lines: a1Lines,
    snapshot: snapshot,
    A1_PAUSE_MS: A1_PAUSE_MS
  };

})(typeof window !== 'undefined' ? window : globalThis);
