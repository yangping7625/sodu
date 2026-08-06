/* ==========================================================================
   sd_savepage.js · 存档页装配

   它是【剧情道具】，不是进度面板（R2）——
   它显示的是"她记住的你"，不是"你完成了多少"。

   本页承载：
     L1-b  透明文本「竖着读。」（长按全选可见 · 手机可达线索之二）
     L1-c  HTML 注释「备份在旧版本里」
     L2-b  被抹黑行 FLAG_█████ → 解开后 FLAG_WATCHING = TRUE
     E6    不经对话直访的降级行为（表只渲染已产生的行 · 不出现输入框）
     TW-2  本页任何位置不得渲染明文谜底
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  var S = function () { return SD.State; };
  var T = function () { return SD.Timeline; };

  var DOT_MIN = 4;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    SD.Router.boot();

    var tbl = document.getElementById('sd-flags');
    if (!tbl) return;

    var conf = (g.SD_DATA && g.SD_DATA.save_table) || {};
    S().flag('opened_save', true);

    /* E6：她还没请你看 —— 由主对话页的 save_offered 旗标判定 */
    var invited = S().hasFlag('save_offered') || S().hasFlag('opened_save_offered');

    renderHead(conf);
    renderRows(tbl, conf, invited);
    renderHidden(conf);
    renderComment(conf);

    if (!invited) {
      var note = document.querySelector('[data-sd-early]');
      if (note && conf.direct_visit_note) note.textContent = conf.direct_visit_note;
    }
  });

  /* ── 表头 ────────────────────────────────────────────────────────── */
  function renderHead(conf) {
    var h = document.querySelector('[data-sd-slot]');
    if (h) h.textContent = conf.title || '';
    var w = document.querySelector('[data-sd-written]');
    if (w) w.textContent = 'WRITTEN AT ' + T().fmtStamp(S().now());
  }

  /* ── flag 表 ─────────────────────────────────────────────────────── */
  function renderRows(tbl, conf, invited) {
    (conf.rows || []).forEach(function (row) {
      var v = resolve(row.value);
      /* E6：只渲染已产生的行 */
      if (!row.redacted && v === null) return;

      var li = document.createElement('div');
      li.className = 'sd-flag' + (row.redacted ? ' sd-flag--redacted' : '');

      var k = document.createElement('span');
      k.className = 'sd-flag__k';
      k.textContent = row.redacted && !S().isRevealed(row.reveal_key)
        ? row.key
        : (row.redacted ? row.reveal_key : row.key);

      var dots = document.createElement('span');
      dots.className = 'sd-flag__dots';
      dots.setAttribute('aria-hidden', 'true');

      var val = document.createElement('span');
      val.className = 'sd-flag__v';
      val.textContent = row.redacted ? String(row.value) : String(v);

      li.appendChild(k); li.appendChild(dots); li.appendChild(val);
      tbl.appendChild(li);

      if (row.redacted) {
        li.setAttribute('data-sd-redacted', '1');
        if (invited) mountPuzzle(tbl, row, k);
      }
    });
  }

  /* 值解析：null 表示"这一行还没产生" */
  function resolve(tpl) {
    var d = S().get(), dw = d.dwell_ms || {};
    switch (String(tpl)) {
      case '{NAME}':
        return d.name_given ? d.name_given : null;
      case '{cover_n}':
        return d.feed_cover.cover_n ? String(d.feed_cover.cover_n) : null;
      case '{route_view}':
        return d.feed_cover.route_view || null;
      case '{avg_reply_s}s':
        return dw.avg_reply_ms ? (T().secs(dw.avg_reply_ms, 1) + 's') : null;
      case '{last_seen}':
        return T().fmtStamp(d.timeline.last_leave_at || S().now());
      default:
        return tpl;
    }
  }

  /* ── 谜题输入 + 三级提示阶梯 ─────────────────────────────────────── */
  function mountPuzzle(tbl, row, keyEl) {
    var unlock = row.unlock || {};
    if (S().isRevealed(row.reveal_key)) return;      // 已解开，不再出输入框

    var box = document.createElement('div');
    box.className = 'sd-puzzle';

    var form = document.createElement('form');
    form.className = 'sd-puzzle__form';
    form.setAttribute('autocomplete', 'off');

    var label = document.createElement('label');
    label.className = 'sd-puzzle__label';
    label.textContent = '这一行是：';
    label.setAttribute('for', 'sd-answer');

    var inp = document.createElement('input');
    inp.className = 'sd-puzzle__input';
    inp.id = 'sd-answer';
    inp.type = 'text';
    inp.maxLength = 24;
    inp.setAttribute('enterkeyhint', 'go');

    var btn = document.createElement('button');
    btn.className = 'sd-puzzle__btn';
    btn.type = 'submit';
    btn.textContent = '确定';

    form.appendChild(label); form.appendChild(inp); form.appendChild(btn);

    var say = document.createElement('p');
    say.className = 'sd-puzzle__say';

    box.appendChild(form); box.appendChild(say);
    tbl.parentNode.insertBefore(box, tbl.nextSibling);

    /* E9：移动端键盘遮挡 */
    inp.addEventListener('focus', function () {
      setTimeout(function () {
        try { inp.scrollIntoView({ block: 'center' }); } catch (e) {}
      }, 250);
    });

    /* R8：三级提示阶梯 + 到点自动解锁 —— 主线绝不锁死 */
    var ladder = new SD.Puzzle.HintLadder(unlock, {
      onHint: function (text) { say.textContent = text; },
      onAutoReveal: function () {
        S().flag('used_hint', true);
        doReveal(row, keyEl, box, say, true);
      }
    });
    ladder.start();

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = inp.value;
      SD.Puzzle.check(v, unlock.answer_sha256, function (ok) {
        if (ok) {
          ladder.stop();
          doReveal(row, keyEl, box, say, false);
        } else {
          say.textContent = unlock.wrong_reply || '不是这个。';
          inp.select();
        }
      });
    });
  }

  /* 揭示：无动画，直接换字（更冷） */
  function doReveal(row, keyEl, box, say, auto) {
    S().reveal(row.reveal_key);
    S().flag('solved_acrostic', !auto);
    keyEl.textContent = row.reveal_key;
    var li = keyEl.parentNode;
    if (li) li.classList.remove('sd-flag--redacted');
    if (box && box.parentNode) box.parentNode.removeChild(box);
  }

  /* ── L1-b：透明文本（长按全选可见） ─────────────────────────────── */
  function renderHidden(conf) {
    var host = document.querySelector('[data-sd-hidden]');
    if (!host || !conf.hidden_text) return;
    var s = document.createElement('span');
    s.className = 'sd-hidden';
    s.textContent = conf.hidden_text.content;
    host.appendChild(s);
  }

  /* ── L1-c：HTML 注释残留 ────────────────────────────────────────── */
  function renderComment(conf) {
    if (!conf.html_comment) return;
    try {
      document.body.appendChild(document.createComment(' ' + conf.html_comment + ' '));
    } catch (e) {}
  }

})(typeof window !== 'undefined' ? window : globalThis);
