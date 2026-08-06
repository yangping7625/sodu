/* ==========================================================================
   sd_puzzle.js · 谜题校验（J-7）

   纪律：
   ① 源码内零明文答案 —— 只存 sha256。J-9 会扫描明文是否泄漏。
   ② R8 主线绝不锁死 —— 三级提示阶梯 + 到点自动解锁。谜题永远不是墙。
   ③ 归一化管线：去空格 / 去标点 / 全角转半角 / 小写。
   ④ 降级：crypto.subtle 在非安全上下文（file://）不可用 →
      回落到内置纯 JS SHA-256，功能不减；再失败则走自动解锁，绝不卡死。

   ⚠️ 当前 answer_sha256 为占位谜面的哈希（data/sd_slice.js 内 todo_s3 标记）。
      S3 定稿后只替换那一行。源码内不出现明文谜面。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  /* ── 归一化 ──────────────────────────────────────────────────────── */
  var RE_PUNCT = /[。，、！？．,.!?…~～\-—_·:：;；"'“”‘’()（）\[\]【】《》〈〉]/g;

  function normalize(s) {
    return String(s == null ? '' : s)
      .replace(/[\uFF01-\uFF5E]/g, function (c) {        // 全角 → 半角
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      })
      .replace(/[\u3000\s]/g, '')                        // 去空格
      .replace(RE_PUNCT, '')                             // 去标点
      .toLowerCase()
      .trim();
  }

  /* ── SHA-256：优先 crypto.subtle，回落纯 JS ─────────────────────── */
  function sha256(str, cb) {
    try {
      if (g.crypto && g.crypto.subtle && g.TextEncoder) {
        var buf = new TextEncoder().encode(str);
        g.crypto.subtle.digest('SHA-256', buf).then(function (hash) {
          var b = Array.prototype.slice.call(new Uint8Array(hash));
          cb(b.map(function (x) { return ('00' + x.toString(16)).slice(-2); }).join(''));
        })['catch'](function () { cb(jsSha256(str)); });
        return;
      }
    } catch (e) { /* 落到纯 JS */ }
    cb(jsSha256(str));
  }

  /* 内置纯 JS SHA-256（无依赖，供非安全上下文回落） */
  function jsSha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var K = [], H = [], p = 2, i, j, isP, r, w, t1, t2, a, b, c, d, e, f, gg, h;
    for (i = 0; i < 64;) {
      for (isP = true, j = 2; j * j <= p; j++) if (p % j === 0) { isP = false; break; }
      if (isP) {
        if (i < 8) H[i] = (Math.pow(p, 0.5) % 1 * 4294967296) | 0;
        K[i] = (Math.pow(p, 1 / 3) % 1 * 4294967296) | 0;
        i++;
      }
      p++;
    }
    /* UTF-8 编码 */
    var bytes = [], cp;
    for (i = 0; i < ascii.length; i++) {
      cp = ascii.charCodeAt(i);
      if (cp < 0x80) bytes.push(cp);
      else if (cp < 0x800) bytes.push(0xC0 | (cp >> 6), 0x80 | (cp & 63));
      else if (cp < 0xD800 || cp >= 0xE000) bytes.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      else {
        i++;
        cp = 0x10000 + (((cp & 0x3FF) << 10) | (ascii.charCodeAt(i) & 0x3FF));
        bytes.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      }
    }
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 255);

    w = [];
    for (var blk = 0; blk < bytes.length; blk += 64) {
      for (i = 0; i < 16; i++) {
        w[i] = (bytes[blk + i * 4] << 24) | (bytes[blk + i * 4 + 1] << 16) |
               (bytes[blk + i * 4 + 2] << 8) | bytes[blk + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; gg = H[6]; h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
        var ch = (e & f) ^ (~e & gg);
        t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
        var mj = (a & b) ^ (a & c) ^ (b & c);
        t2 = (S0 + mj) | 0;
        h = gg; gg = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + gg) | 0; H[7] = (H[7] + h) | 0;
    }
    r = '';
    for (i = 0; i < 8; i++) r += ('00000000' + (H[i] >>> 0).toString(16)).slice(-8);
    return r;
  }

  /* ── 校验 ────────────────────────────────────────────────────────── */
  function check(input, expectedHash, cb) {
    var n = normalize(input);
    if (!n) return cb(false, 'empty');
    sha256(n, function (hex) {
      cb(hex === String(expectedHash || '').toLowerCase(), hex);
    });
  }

  /* 顺序反了的判定（E10）：字符集合相同但顺序不同 → 确认方向对但不给答案 */
  function sameCharSet(input, refSortedHash, cb) {
    var n = normalize(input);
    var sorted = n.split('').sort().join('');
    sha256(sorted, function (hex) { cb(hex === String(refSortedHash || '').toLowerCase()); });
  }

  /* ── 提示阶梯（R8：到点自动解锁，主线绝不锁死） ─────────────────── */
  function HintLadder(conf, handlers) {
    this.conf = conf || {};
    this.h = handlers || {};
    this.timers = [];
    this.done = false;
  }
  HintLadder.prototype.start = function () {
    var self = this;
    var ms = this.conf.hint_ladder_ms || [];
    var hints = this.conf.hints || [];
    ms.forEach(function (t, i) {
      self.timers.push(setTimeout(function () {
        if (self.done) return;
        var isLast = (i === ms.length - 1);
        if (isLast) {
          if (self.h.onHint && hints[i]) self.h.onHint(hints[i], i);
          if (self.h.onAutoReveal) self.h.onAutoReveal();      // 自动解锁
          self.stop();
        } else if (self.h.onHint && hints[i]) {
          self.h.onHint(hints[i], i);
        }
      }, t));
    });
  };
  HintLadder.prototype.stop = function () {
    this.done = true;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  };

  SD.Puzzle = {
    normalize: normalize,
    sha256: sha256,
    check: check,
    sameCharSet: sameCharSet,
    HintLadder: HintLadder
  };

})(typeof window !== 'undefined' ? window : globalThis);
