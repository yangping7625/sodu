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
      path_flags: {},      // { opened_save: true, solved_acrostic: true, ... }
      dwell_ms: {},        // { 'node:PC-012': 24310, session_total, max_gap_ms, ... }
      leave_ts: [],        // [{ at, from, method }]
      input_history: [],   // [{ at, node, raw, norm, role }]
      typing_events: [],   // [{ at, node, typed_len, cleared, peek }]

      save_table_state: { revealed: [] },

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
      mem.timeline.session_start_at = Date.now();
    }
    /* L1-e 面包屑：让开 DevTools 的玩家看见「还有个 v0」。不读、不参与逻辑。 */
    if (rawGet(SHELL_KEY) === null) rawSet(SHELL_KEY, '{}');
    return mem;
  }

  /* 原子单键写入 */
  function commit() {
    if (!mem) return false;
    mem.updated_at = Date.now();
    var s;
    try { s = JSON.stringify(mem); } catch (e) { return false; }
    return rawSet(KEY, s);
  }

  function get() { return mem || load(); }

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
    commit();
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
    commit();
    return mem;
  }

  SD.State = {
    KEY: KEY, SHELL_KEY: SHELL_KEY, SCHEMA: SCHEMA,
    load: load, get: get, commit: commit, reset: reset,
    setName: setName, name: name, nick: nick,
    cursor: cursor,
    markRead: markRead, isRead: isRead,
    flag: flag, hasFlag: hasFlag,
    feed: feed, routeView: routeView, coverN: coverN,
    pushInput: pushInput, inputs: inputs,
    pushTyping: pushTyping, typingEvents: typingEvents,
    dwell: dwell, dwellAll: dwellAll,
    pushLeave: pushLeave, lastLeave: lastLeave,
    spendHorror: spendHorror, hasSpent: hasSpent,
    reveal: reveal, isRevealed: isRevealed,
    norm: norm,
    sess: function () { return sess; },
    persistent: function () { return persistent; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
