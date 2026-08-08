/* ==========================================================================
   sd_idiolect.js · 昵称化 + 口音特征检测（J-8）
   零 LLM：8 条正则 + 一个字符串算法。她的"聪明"不来自语言能力（支柱 P-1）。

   ⚠️ 工程红线：{NAME} / {NICK} 会被拼进页面，必须转义。
      玩家输入 <script> 是 ARG 玩家的标准动作，不是边缘情况（E3）。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  var MAX_NAME = 12;

  /* Emoji / 变体选择符 / 零宽 / 控制字符 */
  var RE_EMOJI = /[\u200B-\u200D\uFE0F\u2600-\u27BF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g;
  var RE_CTRL  = /[\u0000-\u001F\u007F]/g;
  var RE_HAN   = /[\u4E00-\u9FFF]/;

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* 清洗：去首尾空白 / 控制字符 / emoji，截断 12 字 */
  function clean(raw) {
    var s = String(raw == null ? '' : raw)
      .replace(RE_CTRL, '')
      .replace(RE_EMOJI, '')
      .replace(/[\u3000\s]+/g, ' ')
      .trim();
    if (s.length > MAX_NAME) s = s.slice(0, MAX_NAME);
    return s;
  }

  /* §5.7 昵称化算法。返回 null 表示应走 E2（她说「……那我先不叫。」） */
  function nickname(raw) {
    var s = clean(raw);
    if (!s) return null;                                  // E2 / E3

    var hans = s.match(/[\u4E00-\u9FFF]/g) || [];

    if (hans.length === 1 && s.length === 1) return s + s;              // 澄 → 澄澄
    if (hans.length === 2 && s.length === 2) return s.charAt(1) + s.charAt(1); // 阿澄 → 澄澄
    if (hans.length >= 3) return '小' + s.charAt(s.length - 1);         // 林知澄 → 小澄
    if (/[A-Za-z]/.test(s)) return s.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toLowerCase(); // Alice → ali
    if (hans.length) return s.charAt(s.length - 1) + s.charAt(s.length - 1);

    return s;
  }

  /* 名字回落：清洗后为空 → 「你」（E2） */
  function displayNick(raw) {
    var n = nickname(raw);
    return n === null ? '你' : n;
  }

  /* ── 8 条口音特征（§5.8） ───────────────────────────────────────── */
  var RULES = [
    { key: 'ellipsis_style', test: function (s) { var m = s.match(/。{2,}|…+|\.{3,}/); return m ? m[0] : null; } },
    { key: 'laugh',          test: function (s) { var m = s.match(/哈哈+|hh+|233+|lol/i); return m ? m[0] : null; } },
    { key: 'tail_particle',  test: function (s) { var m = s.match(/[吧呢啊嘛哦]$/); return m ? m[0] : null; } },
    { key: 'no_punct',       test: function (s) { return /[^。！？.!?…]$/.test(s) ? true : null; } },
    { key: 'lowercase_latin',test: function (s) { return /^[a-z0-9 ]+$/.test(s) ? true : null; } },
    { key: 'emoji',          test: function (s) { return RE_EMOJI.test(s) ? true : null; } },
    { key: 'evasive',        test: function (s) { return /不知道|说不好|随便|无所谓/.test(s) ? true : null; } },
    { key: 'single_char',    test: function (s) { return /^[嗯哦好行对]$/.test(s) ? true : null; } }
  ];

  /* 派生字段：不落盘，渲染时现算 */
  function features(list) {
    var out = { detected_n: 0 }, i, j, r, v;
    list = list || [];
    for (i = 0; i < RULES.length; i++) {
      r = RULES[i]; out[r.key] = null;
      for (j = 0; j < list.length; j++) {
        v = r.test(String(list[j] || ''));
        if (v) { out[r.key] = v; out.detected_n++; break; }
      }
    }
    return out;
  }

  /* {ECHO}：用玩家自己的说话习惯说出的一句（口音阶段④）
     命中 0 → 兜底：复述玩家给她起的名字。                          */
  function echo(list, fallbackName) {
    var f = features(list);
    if (f.ellipsis_style) return '我等你' + f.ellipsis_style;
    if (f.laugh)          return '我等你 ' + f.laugh;
    if (f.tail_particle)  return '你会回来的' + f.tail_particle;
    if (f.single_char)    return '嗯';
    if (f.no_punct)       return '我等你';
    if (f.lowercase_latin)return 'i wait';
    return fallbackName ? String(fallbackName) : '我等你。';
  }

  SD.Idiolect = {
    clean: clean,
    nickname: nickname,
    displayNick: displayNick,
    features: features,
    echo: echo,
    escapeHtml: escapeHtml,
    MAX_NAME: MAX_NAME
  };

})(typeof window !== 'undefined' ? window : globalThis);
