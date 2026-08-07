/* ==========================================================================
   sd_state.js · 玩家状态层（J-1）
   单键持久化：localStorage['sudu_save_v1']
   内容层（window.SD_DATA）只读；任何玩家痕迹只写这一个键。

   降级纪律（原样继承参考实现）：
     所有 getItem/setItem 包 try/catch；失败即 persistent=false 转内存态；
     全程不抛异常 —— iOS 无痕、file:// 直开、Storage 被禁均不崩（E1）。

   R2：本模块不提供任何「进度 / 完成度 / 成就」读出接口。
       前台零进度 UI —— 采集到的一切只服务于她的台词，不回显给玩家。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  var KEY = 'sudu_save_v1';
  var SHELL_KEY = 'sudu_seen_v0';   // L1-e 面包屑：只写一次，不读、不参与逻辑
  var SCHEMA = 1;

  /* ── 存档骨架（arg_slice_01 §5.6） ────────────────────────────────── */
  function blank() {
    var now = Date.now();
    return {
      v: SCHEMA,
      created_at: now,
      updated_at: now,
      name_given: null,
      nick: null,
      cursor: null,

      feed_cover: {
        fed: [], fed_at: {}, cover_n: 0, route_view: null, unfed: []
      },

      /* 隐式行为五字段 + 本作新增两字段 */
      read_flags: {},      // { 'page:/save': ts, 'node:PN-014': ts }
      /* G-1 布尔位默认值（arg_g1_dialogue_script.md §3.2 自文档，非必需）：
         path_flags 是自由字典，未置位 = hasFlag() 返回 false（即默认 false）。
         此处预声明仅为显式登记 G-1 新增写入的三位（b5/b10/b11），
         不构成第 13 位、不改 SCHEMA、无迁移成本。既有存档经 load() 补齐
         顶层键时不会触碰已存在的 path_flags，语义与不预声明完全一致。 */
      path_flags: {
        sd_b5_left_once: false,   // 至少一次「离开后回来」（进页时由 sd_behavior 写入）
        sd_b10_silence: false,    // 关键节拍沉默累计 ≥3 次（EC-07 豁免前提）
        sd_b11_recall: false      // 复述过素读说过的原话（SD-068 提交时判定）
      },
      dwell_ms: {},        // { 'node:PC-012': 24310, session_total, max_gap_ms, ... }
      leave_ts: [],        // [{ at, from, method }]
      input_history: [],   // [{ at, node, raw, norm, role }]
      typing_events: [],   // [{ at, node, typed_len, cleared, peek }]

      save_table_state: { revealed: [] },

      /* 墙钟偏移（元字段，不属叙事层）：统一时间源 now() 的唯一输入。
         详见本文件下方「统一时间源」段。 */
      time_warp_ms: 0,

      /* ── ARG-BUILD-11 / SH-7：设备层的两个顶层子对象 ────────────────
         v1 → v2 只做加法：【不搬动任何现有字段】。线上已有玩家的存档
         必须继续有效 —— 「她还记得你」是本作最不能白白浪费的东西，
         一次粗心的迁移就能把它清零。
         · shell —— 设备自己的状态（谁开着、哪一条被命名过）
         · apps  —— 各 app 的私有格。**没有 apps.sd，也不许有**：
           素读的状态永远留在顶层（feed_cover / path_flags / timeline …）。
         time_warp_ms 同理留在顶层：它属于这台设备，不属于任何一个 app。
         本页一个字段都不读它们，只负责【别把它们弄丢】——
         load() 补齐缺字段 + commit() 整体回写，缺了声明就会被抹掉。 */
      shell: {
        booted_at: null,
        last_app: null,
        win_state: {},
        icons_revealed: [],
        fm_seen: [],
        /* ARG-BUILD-12 · CF-4：背景 framing 专用布尔（与 booted_at /
           win_state.sd 解耦）。FR-A 首启三行由桌面层渲染并置位；
           FR-B 窗口一行由 /sd/ 读同一字段决定 1.2s 延后（N1 裸开时
           /sd/ 自己渲染该行并置位）。仍在本键内，SH-7 守。 */
        framing_seen: false,
        framing_window_seen: false
      },
      apps: { qsw: {}, soda: {}, fm: {} },

      timeline: {
        first_visit_at: now,
        last_leave_at: null,
        session_start_at: now,
        next_available_at: null,
        pre_visit_ts: null,
        pre_visit_offset_ms: -259200000,   // S4 默认 −3 天（待最终确认）
        clock_skew_guard: true
      },

      horror_spent: { A: [], B: [] },
      ending: null
    };
  }

  var mem = null;
  var persistent = true;

  /* ── DEF-02：E7「A 类刷新不重播」的正确粒度 ────────────────────────
     一个 A 类 beat 在数据里往往横跨多个节点、共用一个 budget_id
     （A-2 = SN-074 / 076 / 077 / SS-078 / 080 / 082 / 083 共 7 个）。
     若按「这个 budget_id 花过了就跳过」判定，同一会话内整段 beat 只会
     播出第一句，其余全部静默 —— A-2 的核心载荷 SS-078（回访提示
     「N 天前 · HH:MM」）、SN-082、SN-083{ECHO} 永远上不了屏。
     E7 要的是【跨会话】不重播（refresh 后不再吓一次），不是同会话截断。
     故另存一份【载入时快照】：只有上个会话就已花掉的 budget_id 才拦截。 */
  var spentAtLoad = { A: [], B: [] };
  function snapshotSpent() {
    var h = (mem && mem.horror_spent) || {};
    spentAtLoad = {
      A: (h.A || []).slice(),
      B: (h.B || []).slice()
    };
  }
  /* true = 本会话开始【之前】就已花掉（= 刷新回访），应拦截重播 */
  function spentBefore(cls, id) {
    return (spentAtLoad[cls] || []).indexOf(id) >= 0;
  }

  /* 会话态：刷新即清空。A 类 refresh_rule='session_only' 依赖它（E7） */
  var sess = { started_at: Date.now(), a1_played: false, nodes_seen: {} };

  /* ── 原始读写：全部 try/catch，绝不抛 ────────────────────────────── */
  function rawGet(k) {
    try { return g.localStorage.getItem(k); }
    catch (e) { persistent = false; return null; }
  }
  function rawSet(k, s) {
    try { g.localStorage.setItem(k, s); return true; }
    catch (e) { persistent = false; return false; }
  }

  function load() {
    var s = rawGet(KEY), o = null;
    if (s) { try { o = JSON.parse(s); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object' || o.v !== SCHEMA) {
      mem = blank();
      if (o) commit();                 // schema 不匹配 → 丢弃重建（切片期不迁移）
    } else {
      var b = blank(), k;
      for (k in b) { if (!(k in o)) o[k] = b[k]; }     // 补齐缺字段
      if (!o.timeline) o.timeline = b.timeline;
      for (k in b.timeline) { if (!(k in o.timeline)) o.timeline[k] = b.timeline[k]; }
      mem = o;
      mem.timeline.session_start_at = now();
    }
    snapshotSpent();                 // DEF-02：记下「本会话开始前」已花掉的 A 类席位
    /* L1-e 面包屑：让开 DevTools 的玩家看见「还有个 v0」。不读、不参与逻辑。 */
    if (rawGet(SHELL_KEY) === null) rawSet(SHELL_KEY, '{}');
    return mem;
  }

  /* ── TQ-04：typing_events 落盘节流 ─────────────────────────────────
     现状核查：input 监听器只改内存变量，**不是每键一写**；只有
     「打了 ≥2 字又清空」这一语义事件才调 pushTyping。但该事件在
     反复输入-删除时仍可能 ~1–2 次/秒连发，每次都要 JSON.stringify
     整个存档（input_history 60 + typing_events 40 条）再 setItem，
     移动端会顶出可感卡顿（P4）。
     处置：事件【立即进内存】（pickA1Tier / A-1 兜底② 依赖同步可读），
     **落盘**合并到 ≥2s 节流窗；任何其他路径的 commit() 都会顺带冲刷，
     失焦/离开由 sd_behavior.onLeave → pushLeave → commit() 兜底。
     只约束这一条高频路径，其余关键节点写入保持即时 —— 不过度设计。 */
  var TYPING_FLUSH_MS = 2000;
  var typingTimer = null;
  var lastTypingWriteAt = 0;

  function cancelTypingFlush() {
    if (typingTimer == null) return;
    try { g.clearTimeout(typingTimer); } catch (e) { /* 静默 */ }
    typingTimer = null;
  }
  function scheduleTypingFlush(wait) {
    if (typingTimer != null) return;                 // 已有挂起的冲刷，合并进去
    try {
      typingTimer = g.setTimeout(function () {
        typingTimer = null;
        lastTypingWriteAt = Date.now();
        commit();
      }, wait);
    } catch (e) {                                    // 无定时器环境 → 退回即时落盘
      lastTypingWriteAt = Date.now();
      commit();
    }
  }

  /* 原子单键写入 */
  function commit() {
    if (!mem) return false;
    cancelTypingFlush();          // 本次写入已覆盖挂起的打字事件，冲刷计划作废
    mem.updated_at = Date.now();
    var s;
    try { s = JSON.stringify(mem); } catch (e) { return false; }
    return rawSet(KEY, s);
  }

  function get() { return mem || load(); }

  /* ── 统一时间源（墙钟偏移 / 元字段，不属叙事层） ───────────────────
     所有「游戏时钟」相关的判断都走 now()，而非裸 Date.now()。
        now() = Date.now() + time_warp_ms
     time_warp_ms 是【相对偏移】（毫秒），存于 sudu_save_v1.time_warp_ms，
     属于元层、不属叙事层。写入它只改变「时间怎么算」，绝不改动任何台词文本
     （S4 时间倒流靠相对差，依然成立）。偏移钳制在 ±7 天：足够跨越 6h 冷却锁，
     又不会把年份拨乱（X-2：本作绝不渲染 2011 这类绝对历史年份）。
     行为遥测（停留 / 停顿 / A-1 实测）保持裸 Date.now()，不在此列。      */
  var WARP_MAX_MS = 7 * 24 * 60 * 60 * 1000;   // ±7 天 = 604,800,000 ms
  function clampWarp(ms) {
    if (!isFinite(ms)) return 0;
    if (ms >  WARP_MAX_MS) ms =  WARP_MAX_MS;
    if (ms < -WARP_MAX_MS) ms = -WARP_MAX_MS;
    return ms;
  }
  function getWarp() {
    var d = get();
    return clampWarp(d.time_warp_ms || 0);
  }
  function setWarp(ms) {
    var d = get();
    d.time_warp_ms = clampWarp(ms || 0);
    commit();
    return d.time_warp_ms;
  }
  /* 统一时间源：裸 Date.now() 叠加墙钟偏移。墙钟显示与冷却/时序逻辑共用它，
     保证「显示」与「逻辑」一致。 */
  function now() {
    return Date.now() + getWarp();
  }

  /* ── 名字（R4：仅存本机，永不上传） ──────────────────────────────── */
  function setName(raw, nick) {
    var d = get();
    d.name_given = raw;
    d.nick = nick;
    commit();
  }
  function name() { return get().name_given; }
  function nick() { return get().nick; }

  /* ── 光标（E7：刷新后从 cursor 续播） ────────────────────────────── */
  function cursor(id) {
    var d = get();
    if (id === undefined) return d.cursor;
    d.cursor = id; commit();
    return id;
  }

  /* ── 已读 ────────────────────────────────────────────────────────── */
  function markRead(id) {
    if (!id) return;
    var d = get();
    if (!d.read_flags[id]) { d.read_flags[id] = Date.now(); commit(); }
  }
  function isRead(id) { return !!get().read_flags[id]; }

  /* ── 路径旗标 ────────────────────────────────────────────────────── */
  function flag(nm, val) {
    var d = get();
    if (val === undefined) return !!d.path_flags[nm];
    if (val) d.path_flags[nm] = true; else delete d.path_flags[nm];
    commit();
    return !!val;
  }
  function hasFlag(nm) { return !!get().path_flags[nm]; }

  /* ── 投喂覆盖（feedCover：与参考实现 searchCover 同构） ──────────── */
  function feed(id) {
    var d = get(), cat = ((g.SD_DATA && g.SD_DATA.feed_cover) || {}).catalog || [];
    if (!id) return d.feed_cover;
    if (d.feed_cover.fed.indexOf(id) < 0) {
      d.feed_cover.fed.push(id);
      d.feed_cover.fed_at[id] = Date.now();
    }
    d.feed_cover.cover_n = d.feed_cover.fed.length;
    var hit = null, i;
    for (i = 0; i < cat.length; i++) { if (cat[i].id === id) { hit = cat[i]; break; } }
    if (hit) d.feed_cover.route_view = hit.route_view;
    d.feed_cover.unfed = cat
      .filter(function (c) { return d.feed_cover.fed.indexOf(c.id) < 0; })
      .map(function (c) { return c.id; });
    commit();
    return d.feed_cover;
  }
  function routeView() { return get().feed_cover.route_view; }
  function coverN() { return get().feed_cover.cover_n || 0; }

  /* ── 输入历史（R4：raw 仅存本机） ────────────────────────────────── */
  function pushInput(node, raw, role) {
    var d = get();
    d.input_history.push({
      at: Date.now(), node: node || null,
      raw: String(raw == null ? '' : raw),
      norm: norm(raw), role: role || 'free'
    });
    if (d.input_history.length > 60) d.input_history.shift();
    commit();
  }
  function inputs() { return get().input_history.slice(); }

  /* ── 打字事件（A-1 兜底② 的数据源） ─────────────────────────────── */
  function pushTyping(node, typedLen, cleared, peek) {
    var d = get();
    d.typing_events.push({
      at: Date.now(), node: node || null,
      typed_len: typedLen | 0, cleared: !!cleared,
      peek: String(peek == null ? '' : peek).slice(0, 5)   // 只存前 5 字，仅本机
    });
    if (d.typing_events.length > 40) d.typing_events.shift();
    /* TQ-04：内存已更新（读接口立即可见）；落盘走 ≥2s 节流窗 */
    var since = Date.now() - lastTypingWriteAt;
    if (since >= TYPING_FLUSH_MS) {
      lastTypingWriteAt = Date.now();
      commit();
    } else {
      scheduleTypingFlush(TYPING_FLUSH_MS - since);
    }
  }
  function typingEvents() { return get().typing_events.slice(); }

  /* ── 停留时长 ────────────────────────────────────────────────────── */
  function dwell(k, v) {
    var d = get();
    if (v === undefined) return d.dwell_ms[k];
    d.dwell_ms[k] = v; commit();
    return v;
  }
  function dwellAll() { return get().dwell_ms; }

  /* ── 离开时间戳（visibilitychange / pagehide） ──────────────────── */
  function pushLeave(from, method) {
    var d = get();
    var at = Date.now();
    d.leave_ts.push({ at: at, from: from || null, method: method || 'visibilitychange' });
    if (d.leave_ts.length > 30) d.leave_ts.shift();
    d.timeline.last_leave_at = at;
    commit();
  }
  function lastLeave() { return get().timeline.last_leave_at; }

  /* ── 恐怖预算记账（E7：A 类刷新不重播） ─────────────────────────── */
  function spendHorror(cls, id) {
    if (!cls || !id) return false;
    var d = get(), arr = d.horror_spent[cls];
    if (!arr) { arr = d.horror_spent[cls] = []; }
    if (arr.indexOf(id) >= 0) return false;    // 已花过 → 不重播
    arr.push(id); commit();
    return true;
  }
  function hasSpent(cls, id) {
    var arr = get().horror_spent[cls] || [];
    return arr.indexOf(id) >= 0;
  }

  /* ── 存档表揭示状态 ──────────────────────────────────────────────── */
  function reveal(key) {
    var d = get();
    if (d.save_table_state.revealed.indexOf(key) < 0) {
      d.save_table_state.revealed.push(key);
      commit();
    }
  }
  function isRevealed(key) {
    return get().save_table_state.revealed.indexOf(key) >= 0;
  }

  /* ── 归一化（与 sd_puzzle 同语义，本地复刻零依赖） ───────────────── */
  function norm(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/[\uFF01-\uFF5E]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      })
      .replace(/[\u3000\s]/g, '')
      .toLowerCase();
  }

  /* ── 重置（E8 切片阶段：完全失忆） ───────────────────────────────── */
  function reset() {
    mem = blank();
    sess = { started_at: Date.now(), a1_played: false, nodes_seen: {} };
    snapshotSpent();                 // 完全失忆 → 快照同步清空（E8）
    commit();
    return mem;
  }

  SD.State = {
    KEY: KEY, SHELL_KEY: SHELL_KEY, SCHEMA: SCHEMA,
    load: load, get: get, commit: commit, reset: reset,
    now: now, getWarp: getWarp, setWarp: setWarp,
    setName: setName, name: name, nick: nick,
    cursor: cursor,
    markRead: markRead, isRead: isRead,
    flag: flag, hasFlag: hasFlag,
    feed: feed, routeView: routeView, coverN: coverN,
    pushInput: pushInput, inputs: inputs,
    pushTyping: pushTyping, typingEvents: typingEvents,
    dwell: dwell, dwellAll: dwellAll,
    pushLeave: pushLeave, lastLeave: lastLeave,
    spendHorror: spendHorror, hasSpent: hasSpent, spentBefore: spentBefore,
    reveal: reveal, isRevealed: isRevealed,
    norm: norm,
    sess: function () { return sess; },
    persistent: function () { return persistent; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
