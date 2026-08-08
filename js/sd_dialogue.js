/* ==========================================================================
   sd_dialogue.js · 对话节点机（J-2）

   职责：cursor 推进 / requires 判定 / branch 切换 / delay+typing 队列 /
        set_flags / token 插值 / A-1 揭示槽装配

   架构承诺（本次骨架的核心验收标准）：
     最终脚本灌入时，【只替换 data/sd_slice.js】，本文件不认识任何具体节点 ID，
     只认识 kind / effects / tags。ARG-BUILD-03 灌入 83 节点定稿后，本文件的
     改动仅限于「补齐 schema 能力」，没有一行是为某个节点 ID 写的。

   节点 kind：
     line        普通台词（her / sys）
     branch_line 按 feed_cover.route_view 切文案
     a1_reveal   ★ A-1 揭示槽：文本由实测行为数据装配，非硬编码
     choice      玩家选项 / 自由输入（free_input.puzzle 时挂谜题阶梯）
     feed        投喂卡三选一
     link        站内跳转行（真换页）

   节点字段：
     render:false  text 是【舞台指示】不是台词 —— 只执行 effects，不出字。
                   （若照直渲染，玩家会在屏上读到 CSS 变量名这类元层字符串）
     tags:[...]    'puzzle_hint' = 由提示阶梯定时注入，不在静态图的可达链上。

   effects 类型：
     delay / typing        计时（skippable:false 时不可点击跳过）
     title                 <title> 漂移
     horror                恐怖预算记账（A 类刷新不重播）
     redact                就地抹除已出的某一句
     reveal_flag           翻转存档表的被抹黑行
     theme_shift           界面色温位移
     soft_countdown        页脚软提示（只显示不阻断）
     tripwire_guard        同屏禁令运行期守卫
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  var S = function () { return SD.State; };
  var R = function () { return SD.Render; };
  var B = function () { return SD.Behavior; };
  var T = function () { return SD.Timeline; };
  var I = function () { return SD.Idiolect; };

  var index = {};        // id → node
  var order = [];        // 顺序表
  var running = false;
  var skipRequested = false;
  var current = null;
  var ladder = null;     // 谜题提示阶梯（free_input.puzzle 期间存活）

  /* ── 初始化 ──────────────────────────────────────────────────────── */
  function init() {
    var nodes = (g.SD_DATA && g.SD_DATA.dialogue_nodes) || [];
    index = {}; order = [];
    nodes.forEach(function (n) { index[n.id] = n; order.push(n.id); });
    /* ARG-BUILD-12 · U-1 / U-3 节流计数是会话内存（R2：无进度痕迹，
       刷新即重置）。进页即清零。 */
    try { if (SD.Feed && SD.Feed.resetSession) SD.Feed.resetSession(); } catch (e) {}
    return order.length;
  }

  function node(id) { return index[id] || null; }
  function firstId() { return order[0] || null; }

  /* ── token 插值 ──────────────────────────────────────────────────── */
  function tokens() {
    var d = S().get();
    var bt = B().tokens();
    var nm = d.name_given;
    var out = {
      '{NAME}': nm == null ? '你' : nm,
      '{NICK}': d.nick == null ? '你' : d.nick,
      '{cover_n}': String(S().coverN()),
      '{route_view}': String(S().routeView() || '—'),
      '{ECHO}': I().echo(
        S().inputs().map(function (r) { return r.raw; }),
        nm
      ),
      '{UNFED_TITLE}': unfedTitle(),
      /* A-2 时间倒错：相对生成的时间戳（X-2 —— 这里永远不会是 2011，
         绝对历史日期属论坛地层，不由本页产出）。
         DEF-01/TQ-01：形态为「N 天前 · HH:MM」。相对日前缀不可省 ——
         纯 HH:MM 会在桌面壳同屏被系统托盘时钟吃掉「早 3 天」的信息量，
         A-2 这个 A 类强异常就静默失效了。 */
      '{pre_visit_ts}': T().preVisitStamp(),
      /* L4-c 软倒计时：只在 soft_countdown 触发后才有值 */
      '{now+6h}': nextAvailableClock()
    };
    for (var k in bt) out[k] = bt[k];
    return out;
  }

  function nextAvailableClock() {
    var st = null;
    try { st = T().nextAvailableState(); } catch (e) {}
    return (st && st.text) ? st.text : '—';
  }

  function unfedTitle() {
    var cat = ((g.SD_DATA && g.SD_DATA.feed_cover) || {}).catalog || [];
    var unfed = S().get().feed_cover.unfed || [];
    for (var i = 0; i < cat.length; i++) {
      if (unfed.indexOf(cat[i].id) >= 0) return cat[i].title;
    }
    return cat.length ? cat[0].title : '';
  }

  var TOKEN_RE =
    /\{NAME\}|\{NICK\}|\{gap\}|\{mm:ss\}|\{avg\}|\{med\}|\{ECHO\}|\{cover_n\}|\{route_view\}|\{UNFED_TITLE\}|\{pre_visit_ts\}|\{now\+6h\}/g;

  function interp(text) {
    if (text == null) return '';
    var tk = tokens();
    return String(text).replace(TOKEN_RE, function (m) {
      return tk[m] !== undefined ? tk[m] : m;
    });
  }

  /* ── requires 判定 ───────────────────────────────────────────────── */
  function meets(n) {
    var req = n.requires;
    if (!req) return true;
    var i;
    if (req.flags) {
      for (i = 0; i < req.flags.length; i++) { if (!S().hasFlag(req.flags[i])) return false; }
    }
    if (req.not_flags) {
      for (i = 0; i < req.not_flags.length; i++) { if (S().hasFlag(req.not_flags[i])) return false; }
    }
    if (req.feed && S().routeView() !== req.feed) return false;
    return true;
  }

  function applyFlags(list) {
    (list || []).forEach(function (f) { S().flag(f, true); });
  }

  /* ── effects ─────────────────────────────────────────────────────── */
  function effectsOf(n, type) {
    return (n.effects || []).filter(function (e) { return e.type === type; });
  }
  function firstEffect(n, type) {
    var a = effectsOf(n, type);
    return a.length ? a[0] : null;
  }

  function applyTitle(n) {
    var e = firstEffect(n, 'title');
    if (!e) return;
    var titles = (g.SD_DATA && g.SD_DATA.titles) || {};
    var t = titles[e.key];
    if (t) R().setTitle(interp(t));
  }

  /* 恐怖预算：A 类刷新不重播（E7）
     DEF-02：判据用 spentBefore（本会话【开始前】就花掉过）而非 hasSpent
     （本会话内也算）。一个 A 类 beat 横跨多个节点共用一个 budget_id，
     用 hasSpent 会让整段 beat 只播首句 —— A-2 的 SS-078 回访提示、
     SN-082、SN-083{ECHO} 全部静默。E7 要的是刷新不重播，不是同会话截断。 */
  function horrorGate(n) {
    var e = firstEffect(n, 'horror');
    if (!e) return true;
    if (e.class === 'A' && S().spentBefore('A', e.budget_id)) return false;
    S().spendHorror(e.class, e.budget_id);
    return true;
  }

  /* ── 舞台效果 ────────────────────────────────────────────────────────
     出字【前】：tripwire_guard（同屏禁令必须先于出字判定）
     出字【时】：redact（就地替换，替换成功则本节点不再另起一条）
     出字【后】：reveal_flag / theme_shift / soft_countdown / title      */

  function guardBefore(n) {
    var e = firstEffect(n, 'tripwire_guard');
    if (!e) return;
    var raw = e.forbid_on_screen || [];
    var resolved = raw.map(function (s) {
      /* ref 形态的禁词永不在运行期还原（还原 = 把谜底带进内存又带上屏）。
         它是给 tests/spec.js 的静态扫描用的登记项，此处直接跳过。 */
      return (typeof s === 'string') ? interp(s) : '';
    });
    R().tripwireGuard(raw.filter(function (s, i) { return !!resolved[i]; }),
                      resolved.filter(function (v) { return !!v; }));
  }

  /* 返回 true 表示已就地抹除 —— 本节点不必再往流末尾追加一条 */
  function applyRedact(n) {
    var e = firstEffect(n, 'redact');
    if (!e || !e.target) return false;
    return R().redact(
      e.target,
      typeof e.line_index === 'number' ? e.line_index : null,
      e.comment,
      n.id
    );
  }

  function applyStage(n) {
    (n.effects || []).forEach(function (e) {
      switch (e.type) {
        case 'reveal_flag':
          if (e.key) { S().reveal(e.key); S().flag('revealed_' + e.key, true); }
          break;
        case 'theme_shift':
          R().themeShift(e);
          break;
        case 'soft_countdown':
          armSoftCountdown(n);
          break;
        default: break;
      }
    });
    applyTitle(n);
  }

  /* render:false 节点的 text 形如「<舞台指示>：<载荷>」，载荷才是玩家看见的。
     解析失败时退回整串 —— 宁可多几个字，也不要页脚空着。 */
  function stagePayload(raw) {
    var s = String(raw == null ? '' : raw);
    var i = s.indexOf('：');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function armSoftCountdown(n) {
    try { T().armNextAvailable(); } catch (e) {}
    var txt = interp(stagePayload(n.text));
    if (txt) R().softCountdown(txt);
  }

  /* ── 等待（可跳过；no_skip 的强制等待不可跳过） ─────────────────── */
  function wait(ms, noSkip, done) {
    if (!ms || ms <= 0) return done();
    var fired = false;
    var timer = setTimeout(function () { finish(); }, ms);

    function finish() {
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      document.removeEventListener('click', onClick, true);
      done();
    }
    function onClick() { if (!noSkip) finish(); }

    if (!noSkip) document.addEventListener('click', onClick, true);
  }

  /* ── 主推进 ──────────────────────────────────────────────────────── */
  function start(fromId) {
    if (!order.length) init();
    var id = fromId || S().cursor() || firstId();
    if (!index[id]) id = firstId();
    go(id);
  }

  function go(id) {
    if (!id) { current = null; running = false; return onEnd(); }
    var n = node(id);
    if (!n) { running = false; return onEnd(); }

    /* GD-7 事件驱动检查点：每次节点推进时结算「投喂窗口停留 ≥40s 无输入」 */
    checkSoftWait();

    /* requires 不满足 → 顺延到 next，不卡死 */
    if (!meets(n)) return go(n.next);

    current = n;
    S().cursor(id);
    running = true;

    /* 节点级停留采样（ATT R_dwell 数据源）：进入新节点即结算上一节点 */
    try { B().noteNode(id); } catch (e) { /* 静默：采集失败绝不影响可玩性 */ }

    /* 结局判定挂点（SD-088，tags:['sd_ending_gate']）：render:false 纯计算节点，
       依 ATT/TRS/RET 三轴静默写入 state.ending，不出字、不提示、
       不改变后续任何一句台词（R2 零泄漏）。判定逻辑在 sd_ending.js。 */
    if ((n.tags || []).indexOf('sd_ending_gate') >= 0) {
      try { if (SD.Ending) SD.Ending.decide(); } catch (e) { /* 静默 */ }
    }

    switch (n.kind) {
      case 'line':        return playLine(n, n.text);
      case 'branch_line': return playLine(n, branchText(n));
      case 'a1_reveal':   return playA1(n);
      case 'choice':      return playChoice(n);
      case 'feed':        return playFeed(n);
      case 'link':        return playLink(n);
      default:            return go(n.next);
    }
  }

  function branchText(n) {
    var rv = S().routeView();
    var cases = n.cases || {};
    return (rv && cases[rv]) || n.default || '';
  }

  /* 普通台词：delay → typing → 出字 */
  function playLine(n, rawText) {
    var dEff = firstEffect(n, 'delay');
    var tEff = firstEffect(n, 'typing');
    var delayMs = dEff ? dEff.ms : 0;
    var typeMs  = tEff ? tEff.ms : 0;
    /* skippable:false 是全片唯一的强制等待（SN-081）；no_skip 为旧写法，兼容 */
    var noSkip  = isNoSkip(dEff) || isNoSkip(tEff);
    var visible = n.render !== false;

    if (!horrorGate(n)) return go(n.next);

    wait(delayMs, noSkip, function () {
      if (visible && typeMs && n.speaker === 'her') R().typingOn();
      wait(typeMs, noSkip, function () {
        R().typingOff();
        if (visible) {
          guardBefore(n);
          /* redact 成功 = 已经在原位换成灰条，不再往流末尾追加 */
          if (!applyRedact(n)) {
            var text = interp(rawText);
            if (n.speaker === 'sys') R().sysLine(text, n.id);
            else R().bubble(n.speaker || 'her', text, n.id, n.block);
          }
        } else {
          applyRedact(n);
        }
        S().markRead('node:' + n.id);
        applyFlags(n.set_flags);
        applyStage(n);
        go(n.next);
      });
    });
  }

  function isNoSkip(e) {
    if (!e) return false;
    return e.skippable === false || !!e.no_skip;
  }

  /* ★ A-1 揭示：文本来自实测行为数据，逐句吐出。
     text 恒为 null —— 一旦这里出现硬编码文案，P2 当场死亡。
     每句气泡带 data-node="<id>.<序号>"，供 effects:redact 精确定位。 */
  function playA1(n) {
    if (!horrorGate(n)) return go(n.next);

    var pack = B().a1Lines();
    var lines = pack.lines || [];
    S().flag('a1_tier_' + pack.tier, true);
    S().sess().a1_played = true;
    guardBefore(n);

    var i = 0;
    (function step() {
      if (i >= lines.length) {
        S().markRead('node:' + n.id);
        applyFlags(n.set_flags);
        applyStage(n);
        return go(n.next);
      }
      var text = lines[i++];
      R().typingOn();
      wait(900, false, function () {
        R().typingOff();
        R().bubble('her', text, n.id + '.' + i, n.block);
        /* N-039 位：不追加解释，留足静默 */
        wait(i === lines.length ? 2000 : 700, false, step);
      });
    })();
  }

  /* 玩家选项 / 自由输入：此处开探针，玩家应答即为真实间隔。
     silence_ms（G-1 measure 字段）：传给探针做沉默采样（b10 写入器）。 */
  function playChoice(n) {
    B().openProbe(n.id, n.measure && n.measure.silence_ms);
    /* ARG-BUILD-12 · GD-7：投喂窗口节点（feed_hooks 内）开启时，
       40s 无输入 → [data-sd-soft] 软行「她在等。」（既有表面，非新 UI）。 */
    armSoftWait(n.id);

    var opts = n.options || [];
    var fi = n.free_input;

    if (n.prompt && !opts.length) R().sysLine(interp(n.prompt), n.id);

    if (opts.length) {
      R().choices(opts.map(function (o) {
        return { label: interp(o.label), _raw: o };
      }), function (picked) {
        B().closeProbe(n.id);
        clearSoftWait();
        var o = picked._raw;
        R().playerEcho(picked.label);
        applyFlags(o.set_flags);
        go(o.next || n.next);
      });
      if (fi && fi.enabled) attachInlineInput(n, fi);
    } else if (fi && fi.enabled) {
      openFreeInput(n, fi);
      if (fi.puzzle) startLadder(n, fi);
    } else {
      go(n.next);
    }
  }

  /* ── 谜题提示阶梯（R8：主线绝不锁死）────────────────────────────────
     阶梯配置来自 save_table 里那一行被抹黑的 unlock（单一真源，
     存档页与主对话页共用同一份 hint_ladder_ms / hints）。
     提示文本优先取【标了 puzzle_hint 的节点】—— 那些节点不在静态可达链上，
     它们的入口就是这里；tests/spec.js 的孤儿白名单与此对应。            */
  function puzzleRow() {
    var rows = ((g.SD_DATA && g.SD_DATA.save_table) || {}).rows || [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].redacted && rows[i].unlock) return rows[i];
    }
    return null;
  }

  function hintNodes() {
    var out = [];
    order.forEach(function (id) {
      var n = index[id];
      if (n && (n.tags || []).indexOf('puzzle_hint') >= 0) out.push(n);
    });
    return out;
  }

  function stopLadder() {
    if (ladder) { try { ladder.stop(); } catch (e) {} ladder = null; }
  }

  function startLadder(n, fi) {
    var row = puzzleRow();
    if (!row || !SD.Puzzle) return;
    var hints = hintNodes();
    stopLadder();

    ladder = new SD.Puzzle.HintLadder(row.unlock, {
      onHint: function (text, i) {
        var hn = hints[i];
        if (hn) S().markRead('node:' + hn.id);
        R().bubble('her', interp(hn ? hn.text : text), hn ? hn.id : null);
      },
      onAutoReveal: function () {
        stopLadder();
        S().flag('used_hint', true);
        S().reveal(row.reveal_key);
        R().clearDock();
        var last = hints.length ? hints[hints.length - 1] : null;
        go((last && last.next) || fi.next || n.next);
      }
    });
    ladder.start();
  }

  /* 谜题作答：对 = 推进；错 = 冷回后原地重来（不惩罚、不推进 —— R8） */
  function submitPuzzle(n, fi, raw) {
    var row = puzzleRow();
    S().pushInput(n.id, raw, fi.capture || 'acrostic_answer');
    if (raw.trim()) R().playerEcho(raw.trim());
    if (!row || !SD.Puzzle) { stopLadder(); return go(fi.next || n.next); }

    var u = row.unlock || {};
    SD.Puzzle.check(raw, u.answer_sha256, function (hit) {
      if (hit) {
        stopLadder();
        S().flag('solved_acrostic', true);
        S().reveal(row.reveal_key);
        applyFlags(n.set_flags);
        return go(fi.next || n.next);
      }
      /* E10：字符集合相同但顺序不同 → 确认方向对，但不给答案 */
      SD.Puzzle.sameCharSet(raw, u.answer_sorted_sha256, function (sameSet) {
        R().bubble('her', sameSet
          ? (u.wrong_order_reply || '顺序反了。')
          : (u.wrong_reply || '不是这个。'));
        B().openProbe(n.id);
        openFreeInput(n, fi);
      });
    });
  }

  function openFreeInput(n, fi) {
    var conf = feedInputConf(n, fi);
    var inp = R().freeInput(conf, function (val) { submitFree(n, fi, val); });
    B().watchInput(inp, n.id);
    try { inp.focus({ preventScroll: true }); } catch (e) {}
  }

  /* 选项 + 自由输入并存时，输入框挂在选项下方（append:true —— 不清空选项区）。
     此处【不】autofocus：移动端弹起键盘会把刚渲染的引导选项顶出可视区，
     等于又一次吞掉选项。要打字的玩家自己点输入框即可。 */
  function attachInlineInput(n, fi) {
    var conf = feedInputConf(n, fi);
    conf.append = true;
    var inp = R().freeInput(conf, function (val) { submitFree(n, fi, val); });
    B().watchInput(inp, n.id);
  }

  /* ARG-BUILD-12 · UX-2 / UX-3（FH-1）：投喂窗口期 max_len 放宽到 140、
     placeholder 由 feed_hooks 表驱动（UX-1）。不改节点数据 —— 引擎读表。
     非投喂节点原样（fi.max_len 保持，如命名节点 24 不动）。 */
  function feedInputConf(n, fi) {
    var conf = { max_len: fi.max_len, placeholder: fi.placeholder || '' };
    try {
      if (SD.Feed) {
        var hk = SD.Feed.hookOf(n.id);
        if (hk) {
          conf.max_len = (hk.max_len != null) ? hk.max_len : conf.max_len;
          if (hk.placeholder) conf.placeholder = hk.placeholder;
        }
      }
    } catch (e) { /* 静默：读表失败按节点原值 */ }
    return conf;
  }

  function submitFree(n, fi, val) {
    var raw = String(val == null ? '' : val);

    if (fi.puzzle) return submitPuzzle(n, fi, raw);

    /* ── ARG-BUILD-12 · 组2 投喂引擎（CF-3 执行顺序，见下方三处裁决）──
       feed_hooks 外部表（FH-1：引擎读表，节点数据零改动）。SC-005/SC-057
       明令排除（命名 / 谜题通道）。U-0/U-2 走既有 free_input.next 不变。
       ⚠️ 先判 verdict 再关探针 —— SC-035 需要 verdict 决定是否把本次
       输入耗时从 a1_probe 剔除（CF-3）。 */
    var feedNode = null;
    try { if (SD.Feed) feedNode = SD.Feed.hookOf(n.id); } catch (e) {}
    var verdict = null;
    if (feedNode) {
      try { verdict = SD.Feed.classify(raw); } catch (e) { verdict = null; }
    }
    /* U-3 重复投喂计数：只计一次（同一标记第 n 次命中）。
       首次=1、第 2 次=2、第 3 次起 ≥3（走 U-2 静默）。 */
    var u3n = 0;
    if (verdict && verdict.tier === 'T-hit' && SD.Feed && verdict.marker) {
      try { u3n = SD.Feed.countU3(verdict.marker.key); } catch (e) { u3n = 0; }
    }

    /* ⚠️ CF-3 · SC-035（a1_probe）：投喂窗口期的输入耗时不计入 a1_probe；
       若该节点发生 T-hit，a1_probe 取上一个探针的值（A-1 三级兜底不被
       粘贴长文拉偏）。其它节点照常结算探针。 */
    var isA1Probe = !!(n.measure && n.measure.role === 'a1_probe');
    B().closeProbe(n.id, (isA1Probe && verdict && verdict.tier === 'T-hit')
      ? { skipRecompute: true } : undefined);
    clearSoftWait();

    if (fi.capture === 'name_given') {
      var cleaned = I().clean(raw);
      var nick = I().nickname(raw);
      S().setName(cleaned || null, nick);
      S().pushInput(n.id, raw, 'name_given');
      if (cleaned) R().playerEcho(cleaned);
      /* E2：不输入名字 / 全空格 → 她说「……那我先不叫。」，不卡死 */
      if (!cleaned) {
        R().bubble('her', '……那我先不叫。');
        S().flag('no_name_given', true);
      }
    } else {
      /* ⚠️ CF-3 · SC-029（idiolect）：命中的投喂输入【不得进入】语料池。
         否则 {ECHO} 会变成"论坛的口音"而不是玩家的口音，
         SN-083 / SD-057 的 A-2 / B-K2 两击当场作废。
         顺序：投喂判定 → 若 T-hit 或 U-1，跳过 idiolect 采集；
                若 U-0/U-2，正常采集。
         ⚠️ U-3 第 3 次起「完全静默（走 U-2）」：不跳过 idiolect、
         正常 echo —— 与普通聊天完全一致（FD-P2：喂错没有惩罚）。 */
      var treatAsU2 = u3n >= 3;
      var skipIdiolect = false;
      if (!treatAsU2 && verdict && (verdict.tier === 'T-hit' || verdict.tier === 'U-1')) {
        skipIdiolect = true;
      }
      if (!skipIdiolect) {
        S().pushInput(n.id, raw, fi.capture || 'free');
      }
      if (raw.trim() && !skipIdiolect) {
        R().playerEcho(raw.trim());
      }
    }
    /* G-1 b11：SD-068（capture:'sd_g1_recall'）提交时判定「复述过她的话」，
       命中则置 sd_b11_recall，驱动 SD-069/070 的 requires 对偶分支。
       ⚠️ CF-3 · SD-068：b11 判定优先于投喂判定 —— 论坛原文可能与她的
       历史台词模糊命中，若先走投喂，b11 会被误置位。故 b11 先判；
       （b11 模糊池排除 marker 别名 —— 骨架期 marker 为空，天然满足，
        待真别名灌入时在 sd_behavior.checkRecall 内排除。） */
    if (fi.capture === 'sd_g1_recall') {
      try { B().checkRecall(raw); } catch (e) { /* 静默 */ }
    }

    /* ── 投喂插播（T-hit / U-1 / U-3）──────────────────────────────
       FM-1：链结构永不因投喂改变 —— 插播播完【必回原 next】。
       插播机制复用 arc_entry 同族的通用能力：不为任何具体 ID 写分支。
       FE-05：投喂反应播放中输入行已禁用（与既有 typing 期一致），
       且不弹任何提示（R5：禁 toast）。 */
    if (verdict && verdict.tier === 'T-hit' && SD.Feed && verdict.marker) {
      /* U-3 重复投喂：第 2 次「这一段我读过了。」；第 3 次起完全静默（走 U-2）。
         第 1 次（u3n===1）走正常 T-hit。 */
      if (u3n >= 3) { applyFlags(n.set_flags); go(fi.next || n.next); return; }
      if (u3n === 2) {
        R().bubble('her', '这一段我读过了。', n.id + '.feed.u3');
        applyFlags(n.set_flags); go(fi.next || n.next);
        return;
      }
      /* 首次命中：插播 {FRAG} 引用块 + marker 反应。
         FM-3：首次命中 → 设备侧 记录/ 升格（sh_fm.js 由 SD 侧触发）。 */
      /* ⚠️ CF-2（D-G1R-01 甲案）：首次投喂（sd_b1_fed 首次置位）→ 快照
         trs_seed（此刻的 b6/b7/b8）。此后 TRS 的 P_set 只用快照值 +
         b2/b3/b9 —— 受邀后才翻的地方不再算越界（"她开口邀请之前
         翻过"才算）。幂等：seedTrs 已快照则不覆盖。 */
      if (!S().hasFlag('sd_b1_fed')) {
        S().flag('sd_b1_fed', true);
        try { if (SD.State.seedTrs) SD.State.seedTrs(); } catch (e) { /* 静默 */ }
      }
      /* FE-03（TW）：{FRAG} 渲染前过 tripwire_guard —— 若当前屏处于
         TW-1/2/3 禁令窗口（屏尾已出现禁词插值形态），一律不渲染引用块，
         只播她的反应文字（避免把谜底 / 时间戳同屏带出）。 */
      var fragOk = !fragForbidden();
      if (verdict.frag && fragOk) {
        var fragEl = R().fragBlock(verdict.frag, n.id + '.feed.frag');
        try { if (SD.Feed.fragHit) SD.Feed.fragHit(fragEl); } catch (e) {}
      }
      /* FM-3 / GD-5：物理回报 —— 记录/ 升格。首次命中写第一行，
         后续命中末尾追加一行（{FRAG} 截断 24 字，无序号/总数/时间戳）。
         ⚠️ tripwire 禁令窗口内也不写记录行（{FRAG} 未上屏就不落盘）。 */
      if (verdict.frag && fragOk) {
        try { S().pushFeedLog(fragLogLine(verdict.frag)); } catch (e) { /* 静默 */ }
      }
      /* 播 marker 的 SF 反应串（Wave 2 真别名接线）：先 {FRAG} 引用块，
         再依次播 SF 气泡，播完回原 next（FM-1：链结构永不因投喂改变）。 */
      var sfLines = sfLinesOf(verdict.marker.sfNodes);
      if (sfLines.length) {
        playInterlude(sfLines, n.id + '.feed.sf', function () {
          applyFlags(n.set_flags);
          go(fi.next || n.next);
        });
      } else {
        applyFlags(n.set_flags);
        go(fi.next || n.next);
      }
      return;
    }

    if (verdict && verdict.tier === 'U-1' && SD.Feed) {
      var usedU1 = SD.Feed.countU1();
      var lines = SD.Feed.u1Lines(usedU1);
      if (lines.length === 0) {
        /* 第 7 次起完全静默（走 U-2），不插播 */
        go(fi.next || n.next);
        return;
      }
      /* U-1 三句：确认方向正确 —— 引导层最关键的一句（GD-4） */
      playInterlude(lines, n.id + '.feed.u1', function () {
        go(fi.next || n.next);
      });
      return;
    }

    applyFlags(n.set_flags);
    go(fi.next || n.next);
  }

  /* 通用插播：按序吐出若干条 her 气泡，播完调用 done。
     不为任何具体 ID 写分支 —— 与 arc_entry 同族的"通用跳转能力"。 */
  function playInterlude(lines, baseId, done) {
    if (!lines || !lines.length) { try { done(); } catch (e) {} return; }
    var i = 0;
    (function step() {
      if (i >= lines.length) { try { done(); } catch (e) {} return; }
      var text = lines[i++];
      R().typingOn();
      wait(900, false, function () {
        R().typingOff();
        R().bubble('her', text, baseId + '.' + i);
        wait(i === lines.length ? 600 : 400, false, step);
      });
    })();
  }

  /* ── ARG-BUILD-12 · 组2 真别名接线辅助 ──────────────────────────────
     sfLinesOf：marker 的 SF 节点 ID 数组 → 逐条取文本（对话机不认识
     具体节点 ID，只按 ID 查表取文本 —— 通用能力）。
     fragLogLine：{FRAG} 截断 24 字（GD-5 / V-F2：无引号 / 序号 / 时间 / 来源）。
     fragForbidden：FE-03 tripwire 守卫 —— 当前屏尾出现禁词插值形态
     时 {FRAG} 不渲染（只播反应文字）。 */
  function sfLinesOf(ids) {
    var out = [];
    (ids || []).forEach(function (id) {
      var n = node(id);
      if (n && typeof n.text === 'string') out.push(n.text);
    });
    return out;
  }
  var FEED_LOG_MAX = 24;
  function fragLogLine(frag) {
    var s = String(frag == null ? '' : frag);
    var arr = Array.from ? Array.from(s) : s.split('');
    return arr.slice(0, FEED_LOG_MAX).join('');
  }
  function fragForbidden() {
    try {
      var pairs = (g.SD_DATA && g.SD_DATA.tripwire_pairs) || [];
      var tail = R().screenTail ? R().screenTail() : '';
      for (var i = 0; i < pairs.length; i++) {
        var forb = (pairs[i] || {}).forbid_same_screen || [];
        for (var j = 0; j < forb.length; j++) {
          var item = forb[j];
          if (typeof item !== 'string' || item.indexOf('{') !== 0) continue;
          var resolved = interp(item);
          if (resolved && resolved !== item && tail.indexOf(resolved) >= 0) return true;
        }
      }
    } catch (e) { /* 静默：守卫失败宁可放行 */ }
    return false;
  }

  /* ── ARG-BUILD-12 · GD-7：`.sd-soft` 软行「她在等。」 ─────────────
     投喂窗口（feed_hooks 内）开启且玩家 ≥40s 无任何输入 → 极轻灰字一行
     （复用既有 .sd-soft 表面，不新建 UI · R5）。状态描述，非指令（R2 /
     GD-R1 / V-R5：禁祈使 / 疑问 / 「提示」类元层词 ——「她在等。」符合）。
     ⚠️ 事件驱动（与沉默采样 b10 同模式，无常驻 setTimeout）：
     无头测试的 runUntilIdle 会把任何挂起定时器当「待办工作」快进，
     40s 看门狗一挂上就被执行、把探针 gap 推成 49s（S5c 失真）——
     这是 dom_shim 语义，不是浏览器语义。故到点判定放在【每次交互 /
     节点切换】的检查点：elapsed ≥40s 且仍在投喂窗口 → 写软行（幂等）。
     真实浏览器中玩家 40s 后做任意轻交互（滚动/点击/新消息渲染）即触发；
     完全静止时软行不出现 —— 那个场景玩家不看屏幕，可接受（见 changelog）。
     ⚠️ 清除只清「她在等。」本身 —— 不覆盖 soft_countdown 写进同一挂点的
     内容（SS-085 / SD-090 的「下次可访问时间」）。 */
  var SOFT_WAIT_MS = 40000;
  var SOFT_WAIT_TEXT = '她在等。';
  var softWait = null;      // { at, nid } —— 投喂窗口开启时刻（无输入计时起点）
  var softShown = false;
  function armSoftWait(nid) {
    try {
      if (!SD.Feed || !SD.Feed.hookOf(nid)) return;   // 仅投喂窗口
      softWait = { at: Date.now(), nid: nid };
      softShown = false;
    } catch (e) { /* 静默 */ }
  }
  function checkSoftWait() {
    try {
      if (!softWait) return;
      if (softShown) return;
      if (Date.now() - softWait.at < SOFT_WAIT_MS) return;
      softShown = true;
      R().softCountdown(SOFT_WAIT_TEXT);
    } catch (e) { /* 静默：软行失败不影响可玩性 */ }
  }
  function clearSoftWait() {
    softWait = null;
    softShown = false;
    try {
      var host = document.querySelector('[data-sd-soft]');
      if (host && host.textContent === SOFT_WAIT_TEXT) host.textContent = '';
    } catch (e) { /* 静默 */ }
  }

  /* 投喂卡三选一 */
  function playFeed(n) {
    B().openProbe(n.id);
    var fc = (g.SD_DATA && g.SD_DATA.feed_cover) || {};
    if (n.prompt) R().sysLine(interp(n.prompt), n.id);
    R().feedCards(fc.catalog || [], fc.show_source_date, function (card) {
      B().closeProbe(n.id);
      clearSoftWait();
      S().feed(card.id);
      R().playerEcho('《' + card.title + '》');
      applyFlags(n.set_flags);
      go(n.next);
    });
    /* ARG-BUILD-12 · GD-3：投喂卡卡片下方开出输入行（三张卡仍可点）。
       由 feed_hooks 外部表驱动（FH-1）—— 不在此为具体节点写分支。
       GD-2（UX-1）：placeholder 变化由同一张表驱动（SC-015 →（给她看点什么））。
       提交走 submitFree 投喂判定，播完回 n.next（FM-1）。 */
    var hk = null;
    try { if (SD.Feed) hk = SD.Feed.hookOf(n.id); } catch (e) {}
    if (hk) {
      armSoftWait(n.id);
      var fi2 = {
        enabled: true, capture: 'free',
        max_len: (hk.max_len != null) ? hk.max_len : 60,
        placeholder: hk.placeholder || '',
        next: n.next
      };
      var inp2 = R().freeInput({
        append: true,
        max_len: fi2.max_len,
        placeholder: fi2.placeholder
      }, function (val) { submitFree(n, fi2, val); });
      B().watchInput(inp2, n.id);
    }
  }

  function playLink(n) {
    var dEff = firstEffect(n, 'delay');
    wait(dEff ? dEff.ms : 0, false, function () {
      R().linkLine(interp(n.text), n.href, n.id);
      applyFlags(n.set_flags);
      S().flag('save_offered', true);
      go(n.next);
    });
  }

  function onEnd() {
    /* 结算最后一个节点的停留采样（ATT R_dwell） */
    try { B().flushNode(); } catch (e) { /* 静默 */ }
    clearSoftWait();

    /* 续弧接续（D-G1-02 已锁）：当前弧走完时，若存在 tags 含 'arc_entry'
       且【尚未读过】的节点，则跳过去继续。这是一条不认识任何具体 ID 的
       通用规则 —— 将来 G-E / G-2 / G-3 接入时零成本复用。
       ⚠️ 故意【不】在入口处判 requires：入口节点的 requires 对偶分支
       （如 SD-001/002 的 sd_b5_left_once 双开场）由 go() 内的级联处理。
       若在此判 requires，未回访的新玩家会被挡在整条续弧之外 ——
       与「恒有且仅有一个渲染」的对偶设计冲突，故不判。
       ⚠️ 跳转前把入口节点标记为已读（=「续弧已进入」的持久门闩）：
       否则 b5 未置位时 SD-001 永远不渲染、永远不 read，
       弧走完 → onEnd → 再次跳回 → 无限重播整条续弧。标记后，
       无论哪条 requires 分支渲染，续弧每会话只进一次（刷新靠 cursor 续播）。 */
    var entry = null;
    order.forEach(function (id) {
      if (entry) return;
      var n = index[id];
      if (!n || (n.tags || []).indexOf('arc_entry') < 0) return;
      if (S().isRead('node:' + id)) return;
      entry = id;
    });
    if (entry) { S().markRead('node:' + entry); go(entry); return; }

    /* 切片收尾：软倒计时（只显示不阻断 —— R8 / R10） */
    try { T().armNextAvailable(); } catch (e) {}
    if (typeof SD.onDialogueEnd === 'function') SD.onDialogueEnd();
  }

  /* ── 自检：节点图可达性（J-9 运行期轻量版） ─────────────────────── */
  function audit() {
    if (!order.length) init();
    var problems = [];
    order.forEach(function (id) {
      var n = index[id];
      if (n.next && !index[n.next]) problems.push(id + '.next → ' + n.next + ' 不存在');
      (n.options || []).forEach(function (o, i) {
        if (o.next && !index[o.next]) problems.push(id + '.options[' + i + '] → ' + o.next + ' 不存在');
      });
      if (n.free_input && n.free_input.next && !index[n.free_input.next]) {
        problems.push(id + '.free_input → ' + n.free_input.next + ' 不存在');
      }
    });
    /* 孤儿检测 */
    var reachable = {}, stack = [firstId()];
    while (stack.length) {
      var id = stack.pop();
      if (!id || reachable[id] || !index[id]) continue;
      reachable[id] = true;
      var n = index[id];
      if (n.next) stack.push(n.next);
      (n.options || []).forEach(function (o) { if (o.next) stack.push(o.next); });
      if (n.free_input && n.free_input.next) stack.push(n.free_input.next);
    }
    order.forEach(function (id) { if (!reachable[id]) problems.push('孤儿节点：' + id); });
    return problems;
  }

  SD.Dialogue = {
    init: init, start: start, go: go, node: node, audit: audit,
    interp: interp, tokens: tokens,
    /* 测试面（前台零泄漏）：submitFree 供 smoke_main 直测 CF-3 采集顺序 */
    submitFree: submitFree,
    current: function () { return current; },
    running: function () { return running; },
    /* GD-7 软行：供测试直接驱动检查点（事件驱动，无常驻定时器） */
    checkSoftWait: checkSoftWait,
    clearSoftWait: clearSoftWait
  };

})(typeof window !== 'undefined' ? window : globalThis);
