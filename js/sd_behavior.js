/* ==========================================================================
   sd_behavior.js · 隐式行为采集（J-4）★ A-1 的命脉 + G-1 三轴采集

   采集：dwell_ms（节点级 + 页面级 + max_gap / avg / median）
        typing_events（打字后清空侦测）
        leave_ts（visibilitychange + pagehide，不用 beforeunload —— 移动端不可靠）
        input_history（由 sd_state 落盘）

   G-1（ARG-BUILD-07）新增采集面（真源：arg_g1_dialogue_script.md §4）：
     ① 节点级停留采样 noteNode/flushNode → ATT R_dwell 分子
     ② 沉默采样（openProbe 带 measure.silence_ms，超窗未提交计数）→ b10 写入器
     ③ 回访布尔 b5（进页时 leave_ts 非空 → sd_b5_left_once）
     ④ 复述布尔 b11（checkRecall，SD-068 提交时对她的历史台词做模糊命中）
     三轴分数计算与结局判定在 js/sd_ending.js（纯函数），本模块只负责采集。

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
  var SILENCE_HITS = 3;        // b10：沉默采样 ≥3 次置位（EC-07 豁免前提）

  var probe = null;            // { node, at }
  var replies = [];            // 本会话全部响应间隔（ms）
  var pageEnterAt = Date.now();
  var pageId = '/';

  /* ── G-1：节点级停留采样（ATT R_dwell 数据源） ─────────────────────
     进入新节点即结算上一节点停留（含 render:false 舞台节点 —— 其 delay
     本身就构成停留）。R2：采集结果只进存档，前台永不回显。 */
  var nodeEnterId = null;
  var nodeEnterAt = 0;
  function addNodeDwell(id, ms) {
    if (!id || !(ms > 0)) return;
    S().dwell('node:' + id, (S().dwell('node:' + id) || 0) + ms);
  }
  function noteNode(id) {
    var now = Date.now();
    if (nodeEnterId && nodeEnterId !== id) addNodeDwell(nodeEnterId, now - nodeEnterAt);
    nodeEnterId = id;
    nodeEnterAt = now;
  }
  function flushNode() {
    if (!nodeEnterId) return;
    addNodeDwell(nodeEnterId, Date.now() - nodeEnterAt);
    nodeEnterId = null; nodeEnterAt = 0;
  }

  /* ── G-1：沉默采样（b10 写入器） ───────────────────────────────────
     6 个带 measure.silence_ms 的输入节点（SD-010/021/030/041/047/068），
     单次窗 45s 超窗未提交计 1 次；累计 ≥3 次置位 sd_b10_silence。
     ⚠️ 实现采用【事件驱动的窗口检查】，不挂常驻 setTimeout 看门狗：
     无头测试的 runUntilIdle 会把任何挂起的定时器当「待办工作」快进，
     45s 看门狗被快进后会把探测间隔顶到 46s（S5c 失真）、并制造假沉默。
     事件驱动在行为上等价 —— 超窗未提交的判定点移到提交时与离开时：
       · closeProbe（玩家最终提交）：elapsed ≥ 窗 → 计 1 次
       · onLeave（玩家开着输入页离开）：elapsed ≥ 窗 → 计 1 次 */
  var silenceCount = 0;
  function countSilence() {
    silenceCount++;
    if (silenceCount >= SILENCE_HITS) S().flag('sd_b10_silence', true);
  }
  function checkProbeSilence() {
    if (!probe || !(probe.silence_ms > 0)) return;
    if (Date.now() - probe.at >= probe.silence_ms) countSilence();
  }

  /* ── 页面级 ─────────────────────────────────────────────────────── */
  function initPage(id) {
    pageId = id || '/';
    pageEnterAt = Date.now();
    S().markRead('page:' + pageId);

    /* G-1 b5：至少一次「离开后回来」—— leave_ts 非空即置位（§3.2）。
       SD-001/002、SD-083/084 据此切换回访/未回访双开场。 */
    try {
      var d = S().get();
      if (d.leave_ts && d.leave_ts.length > 0) S().flag('sd_b5_left_once', true);
    } catch (e) { /* 静默 */ }

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
      /* G-1 沉默采样：开着输入页离开且已超窗 → 计 1 次沉默（b10） */
      checkProbeSilence();
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

  /* ── 节点级探针：她"开始等你"的那一刻 ─────────────────────────────
     silenceMs：该输入节点的沉默采样窗（G-1 measure.silence_ms）——
     超窗未提交的判定在提交（closeProbe）与离开（onLeave）时进行。 */
  function openProbe(nodeId, silenceMs) {
    probe = { node: nodeId, at: Date.now(), silence_ms: silenceMs };
  }

  /* 玩家应答 → 记录真实间隔，更新派生统计（应答即结算沉默窗口） */
  function closeProbe(nodeId) {
    checkProbeSilence();
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

  /* ── G-1 b11：复述过素读说过的原话（SD-068 提交时判定） ──────────
     判据（§3.2）：去标点归一化后与她的历史台词
       ① 连续 ≥4 字重合，或 ② 编辑距离 ≤2。
     输入过短（<4 字）不构成"复述"，直接不命中 —— 避免 2 字输入
     与任何短句都满足编辑距离 ≤2 的假阳性。 */
  var RECALL_MIN_LEN = 4;
  function herLines() {
    var nodes = (g.SD_DATA && g.SD_DATA.dialogue_nodes) || [];
    var out = [];
    nodes.forEach(function (n) {
      if (n.speaker === 'her' && typeof n.text === 'string' && n.render !== false) {
        var h = S().norm(n.text);
        if (h) out.push(h);
      }
    });
    return out;
  }
  function commonSubLen(a, b) {
    var best = 0, i, j, k;
    for (i = 0; i < a.length; i++) {
      for (j = 0; j < b.length; j++) {
        k = 0;
        while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
        if (k > best) best = k;
      }
    }
    return best;
  }
  function editDist(a, b) {
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      var cur = [i];
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  function checkRecall(raw) {
    var r = S().norm(raw);
    if (!r || r.length < RECALL_MIN_LEN) return false;
    var lines = herLines();
    for (var i = 0; i < lines.length; i++) {
      var h = lines[i];
      if (!h) continue;
      if (commonSubLen(r, h) >= 4 || editDist(r, h) <= 2) {
        S().flag('sd_b11_recall', true);
        return true;
      }
    }
    return false;
  }

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
    /* G-1：节点停留 / 沉默 / 复述采集 */
    noteNode: noteNode,
    flushNode: flushNode,
    checkRecall: checkRecall,
    pickA1Tier: pickA1Tier,
    tokens: tokens,
    a1Lines: a1Lines,
    snapshot: snapshot,
    A1_PAUSE_MS: A1_PAUSE_MS
  };

})(typeof window !== 'undefined' ? window : globalThis);
