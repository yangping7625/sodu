/* ==========================================================================
   sd_render.js · 对话渲染层（J-3）

   三条硬纪律：
   ① escapeHtml 全覆盖 —— 本模块【不使用 innerHTML 渲染任何玩家输入或台词】，
      一律走 textContent。玩家输入 <script> 时不可能被执行。
   ② 首字保护（no_highlight_first_char）—— 首字连读谜题的物理前提。
      任何 tier 样式 / kw 高亮 / 搜索命中高亮都不得作用于每句第一个字。
      本模块提供 assertFirstCharPlain() 断言，供 J-9 与运行期自检调用。
   ③ 主对话页单点承载全部恐怖预算，渲染层出问题 = 整份预算损失。
      故此处宁可少功能，不可有花活。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  var root = null;      // 消息流容器
  var dock = null;      // 交互区容器（选项 / 输入框）
  var typingEl = null;

  function mount(streamEl, dockEl) {
    root = streamEl;
    dock = dockEl;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);   // ← 永远 textContent
    return n;
  }

  /* ── 气泡 ────────────────────────────────────────────────────────── */
  /* V-R3（ARG-BUILD-12 · 组5）：幕级留白台阶。block 参数 = 节点所属幕
     （数据层 block 字段）。幕边界（block 变化）给气泡行加 .sd-row--act，
     CSS 负责把幕间间距做到 ≥2.2× 幕内（可感阈值，玩家能说出"后面变松了"）。
     ⚠️ 不认具体节点 ID —— 只按 block 切换判定，通用能力。 */
  var lastBlock = null;
  function bubble(speaker, text, nodeId, block) {
    var wrap = el('div', 'sd-row sd-row--' + speaker);
    if (block && lastBlock !== null && block !== lastBlock) {
      wrap.classList.add('sd-row--act');
    }
    if (block) lastBlock = block;
    var b = el('div', 'sd-bubble sd-bubble--' + speaker, text);
    if (nodeId) b.setAttribute('data-node', nodeId);
    wrap.appendChild(b);
    root.appendChild(wrap);
    assertFirstCharPlain(b);
    scrollEnd();
    return b;
  }

  /* 系统行（非气泡，居中小字） */
  function sysLine(text, nodeId) {
    var n = el('div', 'sd-sys', text);
    if (nodeId) n.setAttribute('data-node', nodeId);
    root.appendChild(n);
    scrollEnd();
    return n;
  }

  /* 站内跳转行（真换页，不做 SPA 伪装 —— N2 纪律）
     ARG-BUILD-11 / S15：内容层写的是相对站点根的裸名（save.html），
     本页现在住在 /sd/ 下，统一过一次 SD.Router.rel() 再落 DOM。
     Router 未就位时按原样输出 —— 解析是增强，不是依赖。 */
  function linkLine(text, href, nodeId) {
    var n = el('div', 'sd-sys');
    var a = el('a', 'sd-link', text);
    var h = href;
    try { if (SD.Router && SD.Router.rel) h = SD.Router.rel(href); } catch (e) { h = href; }
    a.setAttribute('href', h);
    if (nodeId) n.setAttribute('data-node', nodeId);
    n.appendChild(a);
    root.appendChild(n);
    scrollEnd();
    return n;
  }

  /* 被删除的消息（B-10 形态）：灰条 + 原文写入 DOM 注释（L1-c） */
  function deletedLine(originalText, nodeId) {
    var n = el('div', 'sd-deleted', DELETED_LABEL);
    if (nodeId) n.setAttribute('data-node', nodeId);
    root.appendChild(n);
    try {
      root.appendChild(document.createComment(' ' + (nodeId || '') + ': ' + originalText + ' '));
    } catch (e) { /* 静默 */ }
    scrollEnd();
    return n;
  }

  /* ── V-R1 第三类视觉物：引用块（{FRAG} 的容器 · ARG-BUILD-12）────────
     既不是她的气泡，也不是你的气泡 —— 是"从别处来的那段文字"。
     · 无气泡、无圆角、无底色
     · 左侧 1px 竖线（全站唯一一处竖线）
     · 字号 −1px、行距紧（1.45，与全页 1.6 反向）
     · 保留原始换行（white-space: pre-wrap）
     V-R5：命中反馈只能是这段文字自身的底色一闪（0%→4%灰→0%，120ms 一次）。
     禁 toast / 勾号 / 色相变化 / 音效 —— 任何"操作成功"的产品语汇即违规。 */
  function fragBlock(text, nodeId) {
    var n = el('div', 'sd-frag', text);
    if (nodeId) n.setAttribute('data-node', nodeId);
    root.appendChild(n);
    scrollEnd();
    return n;
  }

  /* V-R5 命中一闪：只做底色一闪，一次，120ms，不重复。无文字、无图标。 */
  function fragHit(node) {
    if (!node || !node.classList) return null;
    node.classList.add('sd-frag--hit');
    setTimeout(function () {
      try { node.classList.remove('sd-frag--hit'); } catch (e) {}
    }, 140);
    return node;
  }

  /* ── effects:redact ── 就地抹除已出的某一句（B-10 / L1-c）────────────
     语义上「她把刚说过的那句删了」，所以必须在原位替换，
     而不是在消息流末尾另起一条 —— 后者读起来像系统公告，不像她心虚。

     line_index 指 a1_reveal 逐句气泡的序号（0 基）。A-1 三档句数不同
     （pause 3 句 / cleared·fast 2 句），故命中失败时回落到该节点的
     【最后一句】—— 无论走哪一档，被删掉的都是她刚说完的那句。       */
  var DELETED_LABEL = '[这条消息已被删除]';
  var MAX_SUBLINE = 8;

  function findByNode(nid) {
    if (!root) return null;
    try { return root.querySelector('[data-node="' + nid + '"]'); } catch (e) { return null; }
  }

  function redact(baseId, lineIndex, fallbackText, markNodeId) {
    var t = null, k;
    if (typeof lineIndex === 'number') t = findByNode(baseId + '.' + (lineIndex + 1));
    for (k = MAX_SUBLINE; k >= 1 && !t; k--) t = findByNode(baseId + '.' + k);
    if (!t) t = findByNode(baseId);
    if (!t) return false;

    /* 命中的是气泡本体，连同它的 sd-row 外壳一起换掉 */
    var victim = t;
    if (victim.parentNode && victim.parentNode !== root &&
        victim.parentNode.classList && victim.parentNode.classList.contains('sd-row')) {
      victim = victim.parentNode;
    }
    var host = victim.parentNode;
    if (!host) return false;

    var original = t.textContent || fallbackText || '';
    var mark = el('div', 'sd-deleted', DELETED_LABEL);
    if (markNodeId) mark.setAttribute('data-node', markNodeId);
    host.insertBefore(mark, victim);
    host.removeChild(victim);
    try {
      host.insertBefore(document.createComment(' ' + original + ' '), mark.nextSibling);
    } catch (e) { /* 静默 */ }
    scrollEnd();
    return true;
  }

  /* ── typing 指示 ─────────────────────────────────────────────────── */
  function typingOn() {
    if (typingEl) return typingEl;
    typingEl = el('div', 'sd-row sd-row--her');
    var b = el('div', 'sd-bubble sd-bubble--her sd-typing');
    b.appendChild(el('i')); b.appendChild(el('i')); b.appendChild(el('i'));
    b.setAttribute('aria-label', '正在输入');
    typingEl.appendChild(b);
    root.appendChild(typingEl);
    scrollEnd();
    return typingEl;
  }
  function typingOff() {
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }

  /* ── 交互区 ──────────────────────────────────────────────────────── */
  function clearDock() { while (dock.firstChild) dock.removeChild(dock.firstChild); }

  function choices(options, onPick) {
    clearDock();
    var box = el('div', 'sd-choices');
    var btns = [];
    (options || []).forEach(function (opt, i) {
      var btn = el('button', 'sd-choice', opt.label);
      btn.setAttribute('type', 'button');
      btn.addEventListener('click', function () {
        clearDock();
        onPick(opt, i);
      });
      /* UX 打磨：选项键盘导航。
         ↑/↓ 在选项间循环切换焦点，Enter 选中当前。
         纯选项节点：第一个选项自动聚焦（键盘用户直接能选）。 */
      btn.addEventListener('keydown', function (ev) {
        if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
          ev.preventDefault();
          var idx = btns.indexOf(ev.target);
          if (idx < 0) return;
          var next = ev.key === 'ArrowDown'
            ? (idx + 1) % btns.length
            : (idx - 1 + btns.length) % btns.length;
          btns[next].focus();
        }
      });
      btns.push(btn);
      box.appendChild(btn);
    });
    dock.appendChild(box);
    scrollEnd();
    /* 纯选项节点首项自动聚焦（键盘用户直接能选）。
       延迟一帧判断：并存节点（选项 + 自由输入）下，
       freeInput 会紧接着把输入框挂进 dock，首项就不该抢焦点
       —— 输入框才是主交互，选项靠 ↑ 键上去。 */
    if (btns.length) {
      setTimeout(function () {
        if (!dock.querySelector('.sd-inputbar')) {
          try { btns[0].focus(); } catch (e) {}
        }
      }, 0);
    }
    return box;
  }

  /* conf.append:true —— 「引导选项 + 自由输入」并存形态（ARG-BUILD-04）。
     旧行为是无条件 clearDock()，于是 playChoice() 先渲染的选项区被本函数
     当场抹掉，屏上只剩输入框 —— 设计意图（选项引导 + 允许自己打字）丢失。
     append 模式下不清空交互区，只在选项下方补一条分隔线再挂输入条。
     默认仍为 false（独占交互区），纯选项 / 纯自由输入节点行为不变。 */
  function freeInput(conf, onSubmit) {
    conf = conf || {};
    var append = conf.append === true;
    if (!append) clearDock();
    if (append) dock.appendChild(el('div', 'sd-dock__sep'));
    var form = el('form', 'sd-inputbar' + (append ? ' sd-inputbar--with-choices' : ''));
    form.setAttribute('autocomplete', 'off');
    var inp = el('input', 'sd-input');
    inp.setAttribute('type', 'text');
    inp.setAttribute('maxlength', String(conf.max_len || 60));
    inp.setAttribute('placeholder', conf.placeholder || '');
    inp.setAttribute('enterkeyhint', 'send');
    var btn = el('button', 'sd-send', '→');
    btn.setAttribute('type', 'submit');
    btn.setAttribute('aria-label', '发送');
    form.appendChild(inp);
    form.appendChild(btn);
    dock.appendChild(form);

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = inp.value;
      clearDock();
      onSubmit(v, inp);
    });

    /* E9：移动端键盘顶飞输入框 */
    inp.addEventListener('focus', function () {
      setTimeout(function () {
        try { inp.scrollIntoView({ block: 'nearest' }); } catch (e) {}
        scrollEnd();
      }, 250);
    });

    scrollEnd();
    return inp;
  }

  /* 玩家气泡回显 */
  function playerEcho(text) {
    if (!text) return null;
    return bubble('player', text);
  }

  /* ── 投喂卡（S6：出处行必须出现论坛站名） ───────────────────────── */
  function feedCards(catalog, showDate, onPick) {
    clearDock();
    var box = el('div', 'sd-cards');
    (catalog || []).forEach(function (c) {
      var card = el('button', 'sd-card');
      card.setAttribute('type', 'button');
      card.appendChild(el('div', 'sd-card__title', '《' + c.title + '》'));
      card.appendChild(el('div', 'sd-card__excerpt', c.excerpt));

      /* 出处行：站名 + 楼主 ID（+ 年代锚点） */
      var src = c.source_site + ' · ' + c.source_uid;
      if (showDate && c.source_date) src += ' · ' + c.source_date;
      card.appendChild(el('div', 'sd-card__src', src));

      card.addEventListener('click', function () {
        clearDock();
        onPick(c);
      });
      box.appendChild(card);
    });
    dock.appendChild(box);
    scrollEnd();
    return box;
  }

  /* ── L1-a：<title> 漂移 ──────────────────────────────────────────── */
  function setTitle(s) { try { document.title = s; } catch (e) {} }

  /* ── effects:theme_shift ── 界面色温位移（极轻微，说不清哪变了）────
     主开关是 body[data-temp]，整套色值由 CSS 变量表接管；
     节点里带的 var/to/weight_to 只是【渐进增强】——
     CSS 缺这条规则也不能让流程崩，故全程 try/catch 且不做断言。     */
  function themeShift(conf) {
    conf = conf || {};
    try { document.body.setAttribute('data-temp', 'shifted'); } catch (e) {}
    try {
      var de = document.documentElement;
      if (de && de.style && de.style.setProperty) {
        if (conf['var'] && conf.to) de.style.setProperty(conf['var'], conf.to);
        if (conf.weight_to) de.style.setProperty('--sd-bubble-weight', String(conf.weight_to));
      }
    } catch (e) { /* 静默 */ }
  }
  function tempShift() { themeShift(null); }        // 旧名保留，勿删（外部可能已引用）

  /* ── effects:soft_countdown ── 页脚软提示（L4-c）─────────────────────
     R8 / R10：只显示，不阻断。这里【不】做任何倒计时动画或禁用逻辑 ——
     锁门是惩罚，被她说中才是恐怖。                                    */
  function softCountdown(text) {
    var host = null;
    try { host = document.querySelector('[data-sd-soft]'); } catch (e) {}
    if (!host) return null;
    host.textContent = text == null ? '' : String(text);
    return host;
  }

  /* ── effects:tripwire_guard ── 同屏禁令运行期守卫（TW-1 / TW-3）──────
     "同屏" 无法在无布局的环境里精确判定，故取【消息流末尾 N 条】作为
     一屏的保守近似。命中时唯一允许的自动缓解是插入一段留白把旧的那条
     推出可视区 —— 绝不改写任何已经出过的台词（改台词比同屏更糟）。

     禁词永不以明文入参：调用方传 raw（token 原样，仅用于日志）与
     resolved（插值后的实际屏显串，用于比对）。                        */
  var TRIPWIRE_WINDOW = 6;

  function screenTail(n) {
    if (!root) return '';
    var kids = root.childNodes || [];
    var start = Math.max(0, kids.length - (n || TRIPWIRE_WINDOW));
    var s = '';
    for (var i = start; i < kids.length; i++) s += (kids[i].textContent || '');
    return s;
  }

  function tripwireGuard(raw, resolved) {
    var tail = screenTail(TRIPWIRE_WINDOW);
    var hits = [];
    (raw || []).forEach(function (r, i) {
      var lit = (resolved && resolved[i]) || r;
      if (lit && String(lit).length && tail.indexOf(lit) >= 0) hits.push(r);
    });
    if (hits.length) {
      root.appendChild(el('div', 'sd-spacer'));
      try {
        console.warn('[sd_render] 同屏禁令命中：' + hits.join(' × ') + '（已插入留白隔离）');
      } catch (e) {}
    }
    return hits;
  }

  /* ── 首字保护断言 ───────────────────────────────────────────────── */
  /* 通过条件：气泡的第一个子节点是纯文本节点（首字未被任何元素包裹）。 */
  function assertFirstCharPlain(node) {
    if (!node || !node.firstChild) return true;
    var f = node.firstChild;
    if (f.nodeType === 3 && f.nodeValue && f.nodeValue.length) return true;
    if (node.classList && node.classList.contains('sd-typing')) return true;  // typing 无文本
    try {
      console.warn('[sd_render] 首字保护失败：首字被元素包裹，L2-a 谜题会泄题。', node);
    } catch (e) {}
    return false;
  }

  function scrollEnd() {
    try {
      var s = document.scrollingElement || document.documentElement;
      /* V-R8（ARG-BUILD-12 · 组5）：玩家向上回读时新消息不抢滚动位置。
         距底 ≤80px 才自动滚到底；上翻（距底 >80px）时新气泡 / 引用块 /
         投喂反应插播都不打断回读（设计真源 §4.3 V-R8，PO-IX-25 的 JS 半侧）。 */
      var client = s.clientHeight || 0;
      if (s.scrollHeight - s.scrollTop - client > 80) return;
      g.requestAnimationFrame(function () { s.scrollTop = s.scrollHeight; });
    } catch (e) {}
  }

  function escapeHtml(s) {
    return SD.Idiolect ? SD.Idiolect.escapeHtml(s) : String(s == null ? '' : s);
  }

  SD.Render = {
    mount: mount, el: el,
    bubble: bubble, sysLine: sysLine, linkLine: linkLine, deletedLine: deletedLine,
    fragBlock: fragBlock, fragHit: fragHit,
    typingOn: typingOn, typingOff: typingOff,
    clearDock: clearDock, choices: choices, freeInput: freeInput,
    playerEcho: playerEcho, feedCards: feedCards,
    setTitle: setTitle, tempShift: tempShift,
    /* 舞台效果（effects 分发目标） */
    redact: redact, themeShift: themeShift,
    softCountdown: softCountdown, tripwireGuard: tripwireGuard,
    screenTail: screenTail,
    assertFirstCharPlain: assertFirstCharPlain,
    scrollEnd: scrollEnd, escapeHtml: escapeHtml
  };

})(typeof window !== 'undefined' ? window : globalThis);
