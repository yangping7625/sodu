/* ==========================================================================
   sd_ending.js · 结局判定系统（内部代号 sd_ending）· EN-β 行为沉默代理

   玩家从不选择结局；系统静默记录"你怎么对待她"，在她该说最后一句话时，
   决定她说哪一句。三轴（ATT 注视 / TRS 越界 / RET 回访）→ 阈值切分三结局。

   G-1 期铁律（arg_flow_endings_design.md §3.6 / arg_g1_dialogue_script.md §1.5）：
     · SD-088 结局判定挂点只【写】state.ending，不出字、不提示、
       不改变后续任何一句台词 —— 这是"只写不读"的可上线中间态（R2 零泄漏）。
     · 前台零泄漏：分数 / 结局名永不渲染。控制台可查仅供调试与测试。

   真源：
     design/concept/arg_flow_endings_design.md §3.4（公式与阈值）
     design/concept/arg_g1_dialogue_script.md §4（G-1 采集点映射）

   TRS_hi 分阶段常量（D-G1-03 已锁）：G-1 独立上线时仅 b2/b3 可置位
   （TRS 上限 0.5333 < 0.67），降级为 0.40 让第一批玩家三结局全可达、
   KD-03「越界越多真结局越远」当场可被撞到；批 3 上线后回调 0.67。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var S = function () { return SD.State; };

  /* 阈值（GDD §3.4 初始建议值，G2 门实测后校准） */
  var ATT_HI = 0.55;
  var ATT_LO = 0.30;
  var TRS_HI_G1  = 0.40;      // G-1 期降级阈值（分阶段常量）
  var TRS_HI_FULL = 0.67;     // 批 3 上线后回调

  var BASELINE_PER_CHAR = 220;         // 中文默读速率（ms/字）
  var SESSION_GAP_MS = 20 * 60 * 1000; // RET：相邻离开间隔 ≥20 分钟 = 一次跨会话
  var DAY_MS = 24 * 60 * 60 * 1000;

  /* ── 自陈类节点集（ATT 分母的载体） ───────────────────────────────
     tags 含 'arc:CONFESS'。G-1 共 20 个：SD-033…040、042…046、048…054
     （SD-041 / SD-047 为输入节点，不计入）。 */
  function confessNodes() {
    var nodes = (g.SD_DATA && g.SD_DATA.dialogue_nodes) || [];
    return nodes.filter(function (n) {
      return (n.tags || []).indexOf('arc:CONFESS') >= 0;
    });
  }

  /* baseline_read_ms = 字数 × 220ms/字；token 占位（{ECHO} 等）不计阅读量 */
  function baselineOf(n) {
    var t = typeof n.text === 'string' ? n.text : '';
    return t.replace(/\{[A-Za-z_:]+\}/g, '').length * BASELINE_PER_CHAR;
  }

  /* ── ATT（注视）───────────────────────────────────────────────────
     ATT = 0.50×R_dwell + 0.30×R_read + 0.20×R_hesitate
     EC-03 离席判定：单节点 dwell > 10×baseline → 分子分母同时剔除
     EC-07 沉默豁免：b10 置位 → 0.65×R_dwell + 0.35×R_read（重新归一）
     route_view 权重（§3.5 弱耦合）：AFFECTION +0.03 / BRANCH 0 / TRUE_END −0.03 */
  function attScore() {
    var nodes = confessNodes();
    if (!nodes.length) return 0;
    var dw = S().dwellAll();
    var num = 0, den = 0, i, n, d, b;
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      d = dw['node:' + n.id] || 0;
      b = baselineOf(n);
      if (b > 0 && d > 10 * b) continue;          // EC-03 离席 → 剔除
      num += d; den += b;
    }
    var rDwell = den > 0 ? num / den : 0;
    if (rDwell > 1) rDwell = 1;                    // 上限截断 1.00

    var read = 0;
    for (i = 0; i < nodes.length; i++) {
      if (S().isRead('node:' + nodes[i].id)) read++;
    }
    var rRead = nodes.length ? read / nodes.length : 0;

    var te = S().typingEvents();
    var hes = 0;
    for (i = 0; i < te.length; i++) {
      if (te[i].cleared && te[i].typed_len >= 5) hes++;
    }
    var rHes = Math.min(hes / 4, 1);

    var att = S().hasFlag('sd_b10_silence')
      ? 0.65 * rDwell + 0.35 * rRead               // EC-07 沉默豁免
      : 0.50 * rDwell + 0.30 * rRead + 0.20 * rHes;

    var rv = S().routeView();
    if (rv === 'AFFECTION') att += 0.03;
    else if (rv === 'TRUE_END') att -= 0.03;

    if (att < 0) att = 0;
    if (att > 1) att = 1;
    return att;
  }

  /* ── TRS（越界）───────────────────────────────────────────────────
     TRS = 0.70×(P_set÷6) + 0.30×min(Q_probe÷5, 1.00)
     P_set：b2/b3/b6/b7/b8/b9 六位置位数。G-1 期仅 b2/b3 可达（上限 2/6）。
     b2/b3 为【派生】位（§3.2 纪律：绝不重写现有 83 节点，由数据推导）。

     ⚠️ CF-2 修复（D-G1R-01 甲案已拍板 · arg_g1_revision_design.md §5.2）：
       现行公式把 b6 汽水屋到访 / b7 论坛深读 / b8 打开其它 app 全部计入
       TRS（越界）轴 —— 照新机制认真检索的玩家 TRS 会被顶到 0.767 ≥ 0.67，
       直接被排除出 E-true（主导策略反转）。甲案 = 时序快照法：
       · 首次投喂（sd_b1_fed 置位）那一刻，把当时的 b6/b7/b8 快照进
         3-bit 非布尔字段 trs_seed（sd_state.seedTrs）
       · 此后 P_set 只用【快照值】+ b2/b3/b9 —— 语义 = 「在她开口邀请
         之前，你就已经翻过的地方」才算越界（未被邀请的越界）        */
  function trsScore() {
    var seed = S().trsSeed();
    var p = 0;
    if (derivedB2()) p++;
    if (derivedB3()) p++;
    if (seed) {
      /* 已投喂：P_set 用快照值 —— 受邀后才翻的不算越界（CF-2 甲案） */
      if (seed.b6) p++;
      if (seed.b7) p++;
      if (seed.b8) p++;
    } else {
      /* 未投喂（trs_seed=null）：沿用骨架期行为，b6/b7/b8 实时计入。
         从未投喂的玩家没有「受邀」语义 —— 翻过就是越界。 */
      if (S().hasFlag('sd_b6_qsw_seen')) p++;
      if (S().hasFlag('sd_b7_qsw_deep')) p++;
      if (S().hasFlag('sd_b8_sh_seen')) p++;
    }
    if (S().hasFlag('sd_b9_soda_seen')) p++;
    var q = qProbe();
    return 0.70 * (p / 6) + 0.30 * Math.min(q / 5, 1);
  }
  function derivedB2() {
    /* 到访过 /save：read_flags['page:/save'] 存在（SD-060 二次入口或切片 SS-053） */
    return !!S().get().read_flags['page:/save'];
  }
  function derivedB3() {
    /* FLAG 手解（非 150s 兜底）：solved_acrostic 仅在手动答对时置位 */
    return S().hasFlag('solved_acrostic');
  }
  /* Q_probe：role='sd_g1_probe' 的条目 + 其余 role 中判定为「检索式」的条目
     （疑问式 / 专名 / 无第二人称的疑问句）。幕 3 供给可检索专名，
     Q_probe 才有源（§4.2）。
     ⚠️ TRS-α / TRS-β（CF-2）：投喂命中的输入（role 带 feed_ 前缀）与
     近场未命中（role='near_miss'）从 Q_probe 分子剔除 —— 检索式判据
     天然全中投喂输入（论坛原文就是专名密集且无第二人称），不剔除的话
     每喂对一次，玩家就离真结局更远一步。
     （T-hit / U-1 的输入【不进 input_history】—— CF-3 的 idiolect 排除
     结构性保证 qProbe 数不到；此处再按 role 防御性过滤一次，双保险。） */
  function qProbe() {
    var hist = S().inputs();
    var count = 0, i, it;
    for (i = 0; i < hist.length; i++) {
      it = hist[i];
      if (it.role === 'sd_g1_probe') { count++; continue; }
      if (it.role === 'feed_hit' || it.role === 'near_miss') continue;
      if (isQueryLike(S().norm(it.raw))) count++;
    }
    return count;
  }
  function isQueryLike(raw) {
    if (!raw) return false;
    if (/[？?]|吗|呢|什么|谁|哪|怎么|为何|为什么|如何|几|是否/.test(raw)) return true;
    /* 专名供给（幕 3 玩家可查的对象） */
    if (/(傍晚颜色|那个论坛|抄得最全|第 ?4 ?页|多出来的那句|行为记录)/.test(raw)) return true;
    /* 疑问句且不提她 → 更像在查资料而非在跟她说话 */
    if (!/你|您|她|素读/.test(raw) && /[？?]$/.test(raw)) return true;
    return false;
  }

  /* ── RET（回访）───────────────────────────────────────────────────
     RET = N_session_gap + N_daycross，阈值 RET ≥ 1。
     N_session_gap：相邻 leave_ts 间隔 ≥20 分钟（近似「离开后回来」）
     N_daycross：相邻时间点跨自然日次数（按 S().now() 统一时间源）
     EC-02 反作弊：time_warp_ms ≠ 0 → N_daycross 强制归零 + 置 b4。
       改时间不能刷真结局（消除主导策略）。 */
  function retScore() {
    var d = S().get();
    var leaves = d.leave_ts || [];
    var first = d.timeline && d.timeline.first_visit_at;
    var nGap = 0, i;
    for (i = 1; i < leaves.length; i++) {
      if (leaves[i].at - leaves[i - 1].at >= SESSION_GAP_MS) nGap++;
    }
    /* 首次回访：第一次 leave 距 first_visit ≥20 分钟也算一次 */
    if (first && leaves.length && leaves[0].at - first >= SESSION_GAP_MS) nGap++;

    var points = [first];
    for (i = 0; i < leaves.length; i++) points.push(leaves[i].at);
    points.push(S().now());
    var nDay = 0;
    for (i = 1; i < points.length; i++) {
      var a = points[i - 1], b = points[i];
      if (!a || !b) continue;
      if (dayOf(a) !== dayOf(b)) nDay++;
    }
    if (S().getWarp() !== 0) {
      nDay = 0;
      S().flag('sd_b4_warp_seen', true);
    }
    return nGap + nDay;
  }
  function dayOf(ts) { return Math.floor(ts / DAY_MS); }

  /* D-G1R-01 已拍板：TRS 阈值 = 0.67（TRS_HI_FULL，设计稿目标值）。
     E 探针窗口 [0.197, 0.900] 内；候选机制（trs_seed + α + β）把认真检索
     玩家 TRS 压到 ≈0.117，远低于 0.67 → E-true 可达（CF-2 修复）。
     真正越界（未受邀就翻页）的快照后仍高 → 0.67 是设计稿的判定线。 */
  function trsHi() { return TRS_HI_FULL; }   // D-G1R-01：0.40(G1期) → 0.67(全量)

  /* ── 判定（GDD §3.4 严格自上而下，首个命中即定） ─────────────────── */
  function decide() {
    try {
      var att = attScore();
      var trs = trsScore();
      var ret = retScore();
      var hi = trsHi();
      var ending;
      if (att >= ATT_HI && ret >= 1 && trs < hi) ending = 'E-true';
      else if (att >= ATT_LO && trs >= hi) ending = 'E-mixed';
      else if (att < ATT_LO) ending = 'E-shallow';
      else ending = 'E-mixed';
      var d = S().get();
      d.ending = ending;
      S().commit();
      /* R2：分数永不回显。控制台日志仅供调试/测试面，前台零泄漏。 */
      try {
        if (g.console && g.console.info) {
          g.console.info('[sd_ending] ATT=' + att.toFixed(3) +
            ' TRS=' + trs.toFixed(3) + ' RET=' + ret + ' → ' + ending);
        }
      } catch (e) { /* 静默 */ }
      return ending;
    } catch (e) {
      /* J-1：判定失败绝不影响可玩性 —— 保持 E-null 缺省态（EC-04） */
      return null;
    }
  }

  /* 调试/测试面（前台零泄漏） */
  function scores() {
    return { att: attScore(), trs: trsScore(), ret: retScore() };
  }

  SD.Ending = {
    decide: decide,
    scores: scores,
    attScore: attScore, trsScore: trsScore, retScore: retScore,
    confessNodes: confessNodes,
    isQueryLike: isQueryLike,
    ATT_HI: ATT_HI, ATT_LO: ATT_LO,
    TRS_HI_G1: TRS_HI_G1, TRS_HI_FULL: TRS_HI_FULL
  };

})(typeof window !== 'undefined' ? window : globalThis);
