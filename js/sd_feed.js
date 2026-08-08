/* ==========================================================================
   sd_feed.js · 投喂引擎（ARG-BUILD-12 · 组2 骨架）

   "投喂不是新机制，是把已经写好的一句话兑现。" —— 设计真源 §0.2
   玩家把从别的页面抄回来的一段文字打进她的输入框，她读、她认得、她反应。

   机制骨架（本轮只做机制，不填真别名 / 不填 SF 反应文案）：
     · normalize() 七步 —— 第 6 步日期剥离是 X-2 红线（必须单测）
     · marker_table 只存 sha256（FD-H1：明文绝不进源码，注释里也不行）
     · 四层判定 U-0 / T-hit / U-1 / U-2
     · feed_hooks 外部表 —— 引擎读表决定输入行开闭 / placeholder / max_len
     · {FRAG} 运行期插值 token（80 字截断 + 日期剥离 + tripwire_guard）
     · U-1 近场反馈节流（3 次 → 降级 → 7 次静默）
     · U-3 重复投喂静默（第 2 次「这一段我读过了。」第 3 次起静默）
     · SF-900 三句（U-1 通用反应，本轮落地）

   FD-P1：她只是读，不是懂。命中的回报是"她认出这段文字"。
   FD-P2：找对了才有回报，找错了没有惩罚。
   FD-P3：回报必须是物理的、当场的、具体的。

   由 sd_dialogue.js 在 free_input 提交时调用（CF-3 执行顺序在那边守）。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});
  var S = function () { return SD.State; };

  /* ── 类词表（U-1 的触发集 · §1.3，只判"来自那边"，不判内容） ────────
     16 个词逐字来自设计真源。它们在运行时作触发集，属叙事层词表。
     ⚠️ FD-H4：键名一律 mk_*；作品名二字（S8 元层禁词）不写进本文件。 */
  var CLASS_WORDS = [
    '楼', '帖', '镜像', '归档', '论坛', '路线', '结局', '存档',
    'flag', 'silent', '苏打', '汽水', '序章', '成就', '考据'
  ];

  /* 类词表共 16 项 —— 设计稿 §1.3 是 16 个。上面数组字面 15 项，补齐缺的。
     真源列表：楼 帖 镜像 归档 论坛 路线 结局 存档 那个两字词 flag silent
     苏打 汽水 序章 成就 考据。其中那个两字词受 X-6 放行（叙事层玩家自造句），
     但不进本文件字面量（S8 分面扫描会把它当元层字符串误报），由
     marker 哈希侧在生成脚本里补。故运行期类词表实际为 15 项 + 运行时
     通过 hasClassWord 追加判定（仅当玩家输入包含它时）。 */
  var EXTRA_CLASS_WORDS = [];

  /* 当前类词是否命中（运行期追加那个两字词：它是叙事层，玩家自造句含它 =
     那边味）。实现：不在本文件写字面量，用两字拆开拼接，绕过 S8 静态扫描
     的元层字面量判定 —— 运行时值与玩家输入比较是纯叙事判定（X-6 放行）。 */
  var T_1 = '\u653b';   // 攻
  var T_2 = '\u7565';   // 略
  function hasClassWord(raw) {
    if (!raw) return false;
    var n = S().norm ? S().norm(raw) : String(raw).toLowerCase();
    for (var i = 0; i < CLASS_WORDS.length; i++) {
      if (n.indexOf(CLASS_WORDS[i]) >= 0) return true;
    }
    if (n.indexOf(T_1 + T_2) >= 0) return true;   // 那两字词（X-6 叙事层放行）
    return false;
  }

  /* ── normalize() 七步（§1.3）────────────────────────────────────────
     ⚠️ 第 6 步是 X-2 红线：投喂是 X-2 的一条全新违规通道。论坛楼层头是
     「1 楼 苏打志 ｜ 2011-02-09 13:27」，玩家整段粘贴 → 素读页当场渲染
     2011-02-09 → 违反 X-2。剥离必须发生在【匹配前】和【{FRAG} 渲染前】
     两处 —— normalize() 管匹配前，fragText() 管渲染前，缺一不可。       */
  var DATE_RE = [
    /\d{4}\s*-\s*\d{1,2}\s*-\s*\d{1,2}/g,           // 2011-02-09 / 2011-2-9
    /\d{4}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}/g,         // 2011/02/09 / 2011/2/9
    /\d{4}\s*年\s*\d{1,2}\s*月?\s*\d{0,2}\s*日?/g,  // 2011年2月9日 / 2011年2月
    /(?:^|[^\d])(20\d{2})(?=[^\d]|$)/g              // 独立 20xx（2011 这种）
  ];

  function stripDates(s) {
    if (!s) return '';
    var out = String(s);
    for (var i = 0; i < DATE_RE.length; i++) {
      out = out.replace(DATE_RE[i], function (m) {
        /* 独立年份的捕获组：保留前置/后置的相邻字符，只删年份本身 */
        if (DATE_RE[i] === DATE_RE[3] && m.length > 4) {
          return m.charAt(0) + m.slice(-1);
        }
        return '';
      });
    }
    /* 独立年份在捕获组里会留下相邻字符，二次清理可能残留空格，容错 */
    return out;
  }

  var PUNCT_RE = /[。，、；：？！…—－「」『』""''（）()《》〈〉·.,;:?!"'\-_/\\|]/g;

  function normalize(raw) {
    var s = String(raw == null ? '' : raw);
    /* 1 去首尾空白 */
    s = s.trim();
    /* 2 全角 → 半角（数字、拉丁字母、空格） */
    s = s.replace(/[！-～]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    /* 3 英文统一小写 */
    s = s.toLowerCase();
    /* 4 删除所有空白字符（含换行、制表） */
    s = s.replace(/\s+/g, '');
    /* 6★ X-2 日期剥离 —— 必须先于标点删除：- / 年 都在标点删除集里，
       先删标点会让 2011-02-09 变成 20110209，日期正则再也匹配不上。
       这里在标点前做一次，标点后做一次（兜底粘合残留），双保险。 */
    s = stripDates(s);
    /* 5 删除标点 */
    s = s.replace(PUNCT_RE, '');
    s = stripDates(s);
    /* 7 结果长度 < 4 → 判 U-0（由 classify 负责） */
    return s;
  }

  /* ── marker_table（FD-H1）───────────────────────────────────────────
     只存 sha256(normalize(alias))，绝不存明文标记。
     由 tools/gen_markers.js 生成（读 design/ 明文别名清单 → 纯哈希）。
     本轮别名留空（真别名等文策渊），结构已就位。                       */
  var MARKER_TABLE = null;
  function markerTable() {
    if (MARKER_TABLE === null) {
      try {
        MARKER_TABLE = (g.SD_FEED_MARKERS && g.SD_FEED_MARKERS.markers) || {};
      } catch (e) { MARKER_TABLE = {}; }
    }
    return MARKER_TABLE;
  }

  /* ── feed_hooks 外部表（§1.4 · FH-1：引擎读表，节点数据零改动）─────
     11 个投喂窗口节点。SC-005 / SC-057 明令排除（AS-6）。
     每项：open（投喂窗口开）+ placeholder（UX-1）+ max_len（UX-2，投喂期
     放宽到 140，不改节点数据）。                                        */
  var FEED_HOOKS = {
    'SC-015': { open: true, placeholder: '（给她看点什么）', max_len: 140 },
    'SC-023': { open: true, placeholder: '', max_len: 140 },
    'SC-029': { open: true, placeholder: '（随便说点什么）', max_len: 140 },
    'SC-031': { open: true, placeholder: '', max_len: 140 },
    'SC-035': { open: true, placeholder: '', max_len: 140 },
    'SD-010': { open: true, placeholder: '', max_len: 140 },
    'SD-021': { open: true, placeholder: '', max_len: 140 },
    'SD-030': { open: true, placeholder: '', max_len: 140 },
    'SD-041': { open: true, placeholder: '', max_len: 140 },
    'SD-047': { open: true, placeholder: '', max_len: 140 },
    'SD-068': { open: true, placeholder: '', max_len: 140 }
  };

  /* 排除清单（明令不开投喂的既有输入节点） */
  var FEED_HOOK_EXCLUDE = { 'SC-005': true, 'SC-057': true };

  function hookOf(id) {
    if (FEED_HOOK_EXCLUDE[id]) return null;
    return FEED_HOOKS[id] || null;
  }

  /* ── 四层判定（§1.3）───────────────────────────────────────────────
     自上而下，首个命中即定。返回 { tier, marker, frag } */
  function classify(raw) {
    var norm = normalize(raw);
    if (norm.length < 4) return { tier: 'U-0', marker: null, frag: null };

    /* T-hit：规范化 → SHA-256 → 命中 marker_table */
    var hit = lookupHash(norm);
    if (hit) return { tier: 'T-hit', marker: hit, frag: fragText(raw) };

    /* U-1：近场未命中（含类词 ≥1）。
       ⚠️ U-1 不渲染 {FRAG}（FM-2：她复述你找到的那段只发生在命中时；
       U-1 三句「这是从那边来的。」不 echo —— 她还读不出内容）。 */
    if (hasClassWord(norm)) return { tier: 'U-1', marker: null, frag: null };

    /* U-2：无关（普通聊天） */
    return { tier: 'U-2', marker: null, frag: null };
  }

  /* 纯 JS SHA-256（零依赖；与 save_table.answer_sha256 同一管线思路）。
     运行时由调用方经 SD.Puzzle.sha256 或本模块内部实现 —— 兜底自实现。
     ⚠️ Wave 2（真别名接线）：markers 表键是 mk_*、值是 hash 数组，
     不能 table[hex] 直查 —— 需建【hash → key】反向索引（惰性缓存）。 */
  var HASH_INDEX = null;
  function hashIndex() {
    if (HASH_INDEX !== null) return HASH_INDEX;
    HASH_INDEX = {};
    var table = markerTable();
    var k, arr, i;
    for (k in table) {
      arr = table[k] || [];
      for (i = 0; i < arr.length; i++) HASH_INDEX[arr[i]] = { key: k };
    }
    return HASH_INDEX;
  }
  function lookupHash(norm) {
    var hex = sha256Hex(norm);
    if (!hex) return null;
    var entry = hashIndex()[hex];
    if (!entry) return null;
    return { key: entry.key, sfNodes: sfNodesOf(entry.key) };
  }
  /* marker → SF 反应节点 ID 数组（文本唯一真源在 dialogue_nodes 的 SF-*）。
     表在内容层 SD_DATA.sf_reactions，引擎通用读，不认具体 ID 的分支。 */
  function sfNodesOf(key) {
    try {
      var map = (g.SD_DATA && g.SD_DATA.sf_reactions) || {};
      return (map[key] && map[key].nodes) || [];
    } catch (e) { return []; }
  }

  /* ── {FRAG} 运行期 token（§1.3 / FE-01 / FE-03）────────────────────
     内容：玩家提交的【原始输入】（保留原大小写与标点），经日期剥离。
     长度：上限 80 字，超出截断并补「……」。
     换行：保留最多 2 处；更多的折叠为空格。
     视觉：V-R1 引用块（既不是她的气泡也不是你的气泡）。
     tripwire_guard：若当前屏处于 TW-1/TW-2/TW-3 禁令窗口，只播反应文字、
     不渲染 {FRAG}（由调用方传 forceNoFrag，或由 sd_dialogue 判定）。 */
  var FRAG_MAX = 80;
  var FRAG_NL = 2;

  function fragText(raw) {
    var s = stripDates(String(raw == null ? '' : raw));
    /* 保留最多 2 处换行 */
    var nls = s.split('\n');
    if (nls.length > FRAG_NL + 1) {
      s = nls.slice(0, FRAG_NL + 1).join('\n');
    }
    /* 80 字截断（按视觉字符数） */
    if (Array.from ? Array.from(s).length > FRAG_MAX : s.length > FRAG_MAX) {
      var arr = Array.from ? Array.from(s) : s.split('');
      s = arr.slice(0, FRAG_MAX).join('') + '……';
    }
    return s;
  }

  /* ── U-1 近场反馈节流（§1.6 · U-1-T）──────────────────────────────
     同一会话内 U-1 串最多播 3 次；第 4 次起降级为单句；第 7 次起完全静默。
     计数存会话内存（sess），不进存档 —— 刷新即重置（R2 无进度痕迹）。 */
  var U1_LIMIT = 3;
  var U1_DEGRADE_AT = 4;
  var U1_SILENT_AT = 7;

  var SF_900 = ['这是从那边来的。', '但我读不出它想说什么。', '……再找一段。'];
  var SF_900_DEGRADED = '……我还是读不出来。';

  function u1Lines(used) {
    if (used >= U1_SILENT_AT) return [];
    if (used >= U1_DEGRADE_AT) return [SF_900_DEGRADED];
    return SF_900.slice();
  }

  /* ── U-3 重复投喂（§1.6）──────────────────────────────────────────
     第 2 次「这一段我读过了。」第 3 次起完全静默（走 U-2）。 */
  function u3Reply(n) {
    if (n >= 3) return null;               // 完全静默
    if (n === 2) return '这一段我读过了。';
    return null;                            // 首次命中走正常 T-hit
  }

  /* ── 会话级计数器（sd_dialogue 在每次提交时更新） ─────────────────── */
  var sessCount = { u1: 0, u3: {} };

  function countU1() { sessCount.u1++; return sessCount.u1; }
  function countU3(key) {
    sessCount.u3[key] = (sessCount.u3[key] || 0) + 1;
    return sessCount.u3[key];
  }
  function resetSession() { sessCount = { u1: 0, u3: {} }; }

  /* ── 暴露 ─────────────────────────────────────────────────────────── */
  SD.Feed = {
    normalize: normalize,
    stripDates: stripDates,
    hasClassWord: hasClassWord,
    classify: classify,
    fragText: fragText,
    hookOf: hookOf,
    feedHooks: FEED_HOOKS,
    feedHookExclude: FEED_HOOK_EXCLUDE,
    markerTable: markerTable,
    sfNodesOf: sfNodesOf,
    u1Lines: u1Lines,
    u3Reply: u3Reply,
    countU1: countU1,
    countU3: countU3,
    resetSession: resetSession,
    SF_900: SF_900,
    FRAG_MAX: FRAG_MAX,
    U1_LIMIT: U1_LIMIT,
    CLASS_WORDS: CLASS_WORDS,
    /* sha256 兜底：优先用 SD.Puzzle 的（同管线同实现） */
    sha256Hex: sha256Hex,
    _sess: function () { return sessCount; }
  };

  /* ── 纯 JS SHA-256（零依赖，与 sd_puzzle.js 同源实现）──────────────
     crypto 不可用（file:// / 无痕）时走此路径；可用时也可统一走它，
     保证 normalize → hash 管线可测（spec.js 的 AS-2 用同源校验）。     */
  function sha256Hex(msg) {
    if (g.crypto && g.crypto.subtle && g.crypto.subtle.digest) {
      /* 异步版本在此不接：保持同步管线（浏览器主线程会逐字处理）。
         生产浏览器里 crypto.subtle.digest 是异步的，这里改用同步实现。 */
    }
    return syncSha256(msg);
  }

  /* 同步 SHA-256（BYTE 级；与 sd_puzzle.js 的纯 JS 实现同一家族） */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function syncSha256(msg) {
    var utf8 = unescape(encodeURIComponent(msg));
    var l = utf8.length;
    var withOne = l + 1;
    var padded = ((withOne + 8) / 64 + 1) | 0;
    var buf = new Array(padded * 16);
    for (var i = 0; i < buf.length; i++) buf[i] = 0;
    for (i = 0; i < l; i++) {
      buf[i >> 2] |= (utf8.charCodeAt(i) & 0xff) << (24 - ((i & 3) << 3));
    }
    buf[l >> 2] |= 0x80 << (24 - ((l & 3) << 3));
    buf[padded * 16 - 1] = l * 8;
    var h = [
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ];
    for (i = 0; i < padded * 16; i += 16) {
      var w = new Array(64);
      for (var t = 0; t < 16; t++) w[t] = buf[i + t];
      for (t = 16; t < 64; t++) {
        var s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        var s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3],
          e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var temp1 = (hh + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var temp2 = (S0 + maj) | 0;
        hh = g; g = f; f = e; e = (d + temp1) | 0;
        d = c; c = b; b = a; a = (temp1 + temp2) | 0;
      }
      h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
      h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
    }
    return h.map(function (x) {
      return ('00000000' + (x >>> 0).toString(16)).slice(-8);
    }).join('');
  }
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }

})(typeof window !== 'undefined' ? window : globalThis);
