/* ==========================================================================
   tests/dom_shim.js · 零依赖无头 DOM 垫片（烟雾测试基础设施）

   为什么自己写而不用 jsdom：
     本项目零运行时依赖、零 npm 安装。测试基础设施也遵守同一条纪律。

   它做三件事：
     ① 解析【真实的 HTML 文件】（不是手搓假 DOM）→ 建 DOM 树
     ② 按 <script src> 的真实顺序解析并执行脚本
        ★ src 的解析语义与浏览器一致：
            'js/a.js'  → 相对【当前页面目录】
            '/js/a.js' → 相对【站点根】（域名根）
          子路径部署时站点根 ≠ 仓库目录，根绝对路径就会取不到文件 →
          本垫片会以 404 形式如实报错。这使烟雾测试同时成为路径审计的实证。
     ③ 虚拟时钟：接管 setTimeout / Date.now，让 delay/typing 队列瞬时跑完，
        并且能精确制造「停顿 N 秒」以驱动 A-1 三级兜底。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

/* ── 极简 HTML 解析器（只覆盖本项目手写 HTML 的子集） ────────────────── */
const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source']);

function parseHtml(src, doc) {
  const root = doc.createElement('#root');
  const stack = [root];
  let i = 0;

  const top = () => stack[stack.length - 1];

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { addText(top(), src.slice(i), doc); break; }
    if (lt > i) addText(top(), src.slice(i, lt), doc);

    // 注释
    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      const stop = end < 0 ? src.length : end + 3;
      top().appendChild(doc.createComment(src.slice(lt + 4, end < 0 ? src.length : end)));
      i = stop; continue;
    }
    // doctype
    if (src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt);
      i = end < 0 ? src.length : end + 1; continue;
    }
    // 闭合标签
    if (src.startsWith('</', lt)) {
      const end = src.indexOf('>', lt);
      if (stack.length > 1) stack.pop();
      i = end < 0 ? src.length : end + 1; continue;
    }
    // 开标签
    const end = findTagEnd(src, lt);
    const raw = src.slice(lt + 1, end);
    const m = /^([a-zA-Z0-9#_-]+)/.exec(raw);
    if (!m) { i = end + 1; continue; }
    const tag = m[1].toLowerCase();
    const selfClose = /\/\s*$/.test(raw);
    const node = doc.createElement(tag);
    for (const [k, v] of parseAttrs(raw.slice(m[1].length))) node.setAttribute(k, v);
    top().appendChild(node);

    if (tag === 'script' || tag === 'style') {
      const close = new RegExp('</' + tag + '\\s*>', 'i');
      const rest = src.slice(end + 1);
      const cm = close.exec(rest);
      const inner = cm ? rest.slice(0, cm.index) : rest;
      if (inner.trim()) addText(node, inner, doc);
      i = cm ? end + 1 + cm.index + cm[0].length : src.length;
      continue;
    }
    if (!selfClose && !VOID.has(tag)) stack.push(node);
    i = end + 1;
  }
  return root;
}

function findTagEnd(src, from) {
  let q = null;
  for (let i = from + 1; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '>') return i;
  }
  return src.length;
}

function parseAttrs(s) {
  const out = [];
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const name = m[1].toLowerCase();
    if (name === '/') continue;
    out.push([name, m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '']);
  }
  return out;
}

function addText(parent, text, doc) {
  if (!text) return;
  parent.appendChild(doc.createTextNode(text));
}

/* ── 节点 ─────────────────────────────────────────────────────────────── */
let UID = 0;

class SdNode {
  constructor(type, doc) {
    this.nodeType = type;          // 1 元素 / 3 文本 / 8 注释
    this._doc = doc;
    this.childNodes = [];
    this.parentNode = null;
    this._uid = ++UID;
  }
  get firstChild() { return this.childNodes[0] || null; }
  get nextSibling() {
    if (!this.parentNode) return null;
    const s = this.parentNode.childNodes;
    return s[s.indexOf(this) + 1] || null;
  }
  appendChild(n) {
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this; this.childNodes.push(n); return n;
  }
  removeChild(n) {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) { this.childNodes.splice(i, 1); n.parentNode = null; }
    return n;
  }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    const i = this.childNodes.indexOf(ref);
    if (i < 0) return this.appendChild(n);
    if (n.parentNode) n.parentNode.removeChild(n);
    n.parentNode = this; this.childNodes.splice(i, 0, n); return n;
  }
}

class SdText extends SdNode {
  constructor(t, doc) { super(3, doc); this.nodeValue = String(t); }
  get textContent() { return this.nodeValue; }
}
class SdComment extends SdNode {
  constructor(t, doc) { super(8, doc); this.nodeValue = String(t); }
  get textContent() { return ''; }
}

class SdElement extends SdNode {
  constructor(tag, doc) {
    super(1, doc);
    this.tagName = String(tag).toUpperCase();
    this._attrs = new Map();
    this._listeners = new Map();
    this.value = '';
    this.scrollTop = 0;
    this.scrollHeight = 1000;
    /* ARG-BUILD-11：本垫片【不加载】iframe（那需要一个真渲染引擎）。
       它只把 <iframe> 当成一个带 src 的普通元素来记账，另外留一个可注入的
       contentWindow —— 桥接测试据此模拟"子页面在说话"，而不必真跑两个上下文。
       ⚠️ 因此 iframe 内部的行为一律【测不到】：那部分由 app 自己的冒烟测试覆盖。 */
    if (this.tagName === 'IFRAME') this.contentWindow = null;
    const self = this;
    this.classList = {
      contains: (c) => self.className.split(/\s+/).includes(c),
      add: (c) => { if (!self.classList.contains(c)) self.className = (self.className + ' ' + c).trim(); },
      remove: (c) => { self.className = self.className.split(/\s+/).filter((x) => x && x !== c).join(' '); }
    };
  }
  get className() { return this._attrs.get('class') || ''; }
  set className(v) { this._attrs.set('class', String(v)); }
  get id() { return this._attrs.get('id') || ''; }
  set id(v) { this._attrs.set('id', String(v)); }

  setAttribute(k, v) { this._attrs.set(String(k).toLowerCase(), String(v)); }
  getAttribute(k) { const v = this._attrs.get(String(k).toLowerCase()); return v === undefined ? null : v; }
  hasAttribute(k) { return this._attrs.has(String(k).toLowerCase()); }
  removeAttribute(k) { this._attrs.delete(String(k).toLowerCase()); }

  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this.childNodes.forEach((c) => { c.parentNode = null; });
    this.childNodes = [];
    if (v !== '' && v != null) this.appendChild(this._doc.createTextNode(v));
  }

  addEventListener(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, []);
    this._listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const a = this._listeners.get(type);
    if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  }
  dispatch(type, ev) {
    const e = Object.assign({ type, target: this, preventDefault() {}, stopPropagation() {} }, ev || {});
    (this._listeners.get(type) || []).slice().forEach((fn) => fn.call(this, e));
    return e;
  }
  /* 输入类便捷方法 */
  focus() {} blur() {} select() {} scrollIntoView() {}
  click() { this.dispatch('click'); }

  /* style：最简实现（读写字符串，不做 CSS 解析） */
  get style() {
    const self = this;
    if (!this._style) {
      this._style = new Proxy({}, {
        get(t, k) {
          if (typeof k !== 'string') return undefined;
          const css = self._attrs.get('style') || '';
          const prop = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
          const m = new RegExp('(?:^|;)\\s*' + prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*([^;]*)').exec(css);
          return m ? m[1].trim() : '';
        },
        set(t, k, v) {
          const prop = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
          const css = self._attrs.get('style') || '';
          const re = new RegExp('(^|;)\\s*' + prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*:\\s*[^;]*', 'i');
          if (re.test(css)) {
            self._attrs.set('style', css.replace(re, '$1 ' + prop + ': ' + v));
          } else {
            self._attrs.set('style', css + (css && !css.endsWith(';') ? '; ' : '') + prop + ': ' + v);
          }
          return true;
        }
      });
    }
    return this._style;
  }

  /* 遍历 */
  walk(fn) {
    fn(this);
    this.childNodes.forEach((c) => { if (c.nodeType === 1) c.walk(fn); });
  }
  querySelectorAll(sel) {
    const out = [];
    this.walk((el) => { if (el !== this && matches(el, sel)) out.push(el); });
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

function matches(el, sel) {
  sel = String(sel).trim();
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('[')) {
    const m = /^\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]$/.exec(sel);
    if (!m) throw new Error('dom_shim: 不支持的选择器 ' + sel);
    if (!el.hasAttribute(m[1])) return false;
    return m[2] === undefined || el.getAttribute(m[1]) === m[2];
  }
  if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
  return el.tagName === sel.toUpperCase();
}

/* ── 虚拟时钟 ─────────────────────────────────────────────────────────── */
function makeClock(startMs) {
  let now = startMs;
  let seq = 0;
  const timers = new Map();

  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      timers.set(id, { at: now + (Number(ms) || 0), fn, id, seq });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    /* 跑到没有待触发定时器为止（带熔断，防死循环） */
    runUntilIdle(maxSteps = 20000) {
      let steps = 0;
      while (timers.size) {
        if (++steps > maxSteps) throw new Error('dom_shim: 定时器未收敛（疑似死循环）');
        let next = null;
        for (const t of timers.values()) {
          if (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq)) next = t;
        }
        timers.delete(next.id);
        if (next.at > now) now = next.at;
        next.fn();
      }
      return steps;
    },
    /* 只跑到 now+ms 为止；到期外的定时器保持挂起。
       存档页的提示阶梯（60s/90s/150s 自动解锁）必须靠它才能测"手动解题"。 */
    runFor(ms, maxSteps = 20000) {
      const deadline = now + (Number(ms) || 0);
      let steps = 0;
      for (;;) {
        if (++steps > maxSteps) throw new Error('dom_shim: 定时器未收敛（疑似死循环）');
        let next = null;
        for (const t of timers.values()) {
          if (t.at > deadline) continue;
          if (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq)) next = t;
        }
        if (!next) break;
        timers.delete(next.id);
        if (next.at > now) now = next.at;
        next.fn();
      }
      if (now < deadline) now = deadline;
      return steps;
    },
    /* 只推进时间，不触发（用于制造"玩家在思考"的停顿） */
    advance(ms) { now += Number(ms) || 0; },
    pending() { return timers.size; }
  };
}

/* ── 站点 / 页面 环境 ─────────────────────────────────────────────────── */
/**
 * @param {object} o
 * @param {string} o.siteRoot   模拟的【域名根】目录
 * @param {string} o.pagePath   页面相对 siteRoot 的路径，如 'repo/index.html'
 * @param {boolean} o.storage   localStorage 是否可用（false 模拟 iOS 无痕）
 * @param {object}  o.seedState 预置的存档对象（模拟"已经过对话"）
 * @param {number}  o.viewport  视口宽度 px（默认 1280；≤719 即窄屏形态）
 * @param {boolean} o.embedded  本页是否被装在 iframe 里（self !== top）
 */
function createEnv(o) {
  const siteRoot = o.siteRoot;
  const pagePath = o.pagePath.replace(/\\/g, '/');
  const pageFile = path.join(siteRoot, pagePath);
  const pageDir = path.dirname(pageFile);
  const clock = makeClock(o.startMs || Date.parse('2026-03-01T20:00:00Z'));

  const loaded = [];
  const errors = [];
  const consoleLog = [];

  /* localStorage */
  const store = new Map();
  const localStorage = {
    getItem(k) {
      if (!o.storage) throw new Error('SecurityError: storage disabled');
      const v = store.get(String(k));
      return v === undefined ? null : v;
    },
    setItem(k, v) {
      if (!o.storage) throw new Error('QuotaExceededError: storage disabled');
      store.set(String(k), String(v));
    },
    removeItem(k) { store.delete(String(k)); },
    _dump: () => Object.fromEntries(store)
  };

  const doc = {
    nodeType: 9,
    readyState: 'loading',
    visibilityState: 'visible',
    title: '',
    _listeners: new Map(),
    createElement: (t) => new SdElement(t, doc),
    createTextNode: (t) => new SdText(t, doc),
    createComment: (t) => new SdComment(t, doc),
    addEventListener(type, fn) {
      if (!doc._listeners.has(type)) doc._listeners.set(type, []);
      doc._listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const a = doc._listeners.get(type);
      if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
    },
    dispatch(type, ev) {
      const e = Object.assign({ type, preventDefault() {}, stopPropagation() {} }, ev || {});
      (doc._listeners.get(type) || []).slice().forEach((fn) => fn(e));
      return e;
    },
    getElementById: (id) => doc.documentElement.querySelector('#' + id),
    querySelector: (s) => doc.documentElement.querySelector(s),
    querySelectorAll: (s) => doc.documentElement.querySelectorAll(s)
  };

  /* 解析真实 HTML */
  if (!fs.existsSync(pageFile)) throw new Error('页面不存在：' + pageFile);
  const html = fs.readFileSync(pageFile, 'utf8');
  const rootFrag = parseHtml(html, doc);

  const htmlEl = rootFrag.querySelector('html') || rootFrag;
  doc.documentElement = htmlEl;
  doc.body = htmlEl.querySelector('body') || htmlEl;
  doc.head = htmlEl.querySelector('head') || htmlEl;
  doc.scrollingElement = doc.documentElement;
  const titleEl = htmlEl.querySelector('title');
  if (titleEl) doc.title = titleEl.textContent;

  /* window */
  const win = {
    document: doc,
    localStorage,
    location: {
      pathname: '/' + pagePath,
      href: 'https://example.github.io/' + pagePath
    },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval() { throw new Error('dom_shim: 未实现 setInterval'); },
    requestAnimationFrame: (fn) => clock.setTimeout(fn, 0),
    TextEncoder: global.TextEncoder,
    crypto: undefined,          // 强制走纯 JS SHA-256 回落路径（同 file:// 场景）
    /* ARG-BUILD-11 · 视口：narrow() 先问 matchMedia，问不到才退 innerWidth。
       两条路都要给，否则测不出「桌面态 iframe / 移动态真跳转」的分叉。 */
    innerWidth: Number(o.viewport) || 1280,
    matchMedia(q) {
      const m = /\(\s*max-width\s*:\s*(\d+)px\s*\)/.exec(String(q || ''));
      const matches = m ? win.innerWidth <= Number(m[1]) : false;
      return { media: String(q || ''), matches, addListener() {}, removeListener() {} };
    },
    _listeners: new Map(),
    addEventListener(type, fn) {
      if (!win._listeners.has(type)) win._listeners.set(type, []);
      win._listeners.get(type).push(fn);
    },
    removeEventListener() {},
    /* 第二参数是载荷：postMessage 的 { data, source } 靠它送进 onMessage。
       没有它就只能测「监听器挂上了没」，测不到白名单到底拦不拦得住。 */
    dispatch(type, ev) {
      const e = Object.assign({ type }, ev || {});
      (win._listeners.get(type) || []).slice().forEach((fn) => fn(e));
      return e;
    },
    console: {
      log: (...a) => consoleLog.push(['log', a.join(' ')]),
      info: (...a) => consoleLog.push(['info', a.join(' ')]),
      warn: (...a) => consoleLog.push(['warn', a.join(' ')]),
      error: (...a) => consoleLog.push(['error', a.join(' ')])
    }
  };
  win.window = win;
  win.globalThis = win;

  /* ARG-BUILD-11 · 嵌套自检面（X-10 / CL-3）：
       o.embedded 为真 → self !== top，等同「本页被装进了别人的窗口」。
     js/sd_clock.js 的 embedded() 与 sh_bridge.js 的握手判定都读这两个值，
     缺了它们就只能测到裸开一条路径，而 CL-3 恰恰是关于另一条路径的。

     宿主还带一个 outbox：子页面 postMessage 出去的东西全落在这里 ——
     于是「子侧到底发了什么」变成可断言的，而不是只能验证"监听器挂上了"。 */
  const outbox = [];
  win.self = win;
  win.top = o.embedded
    ? { _shimOuter: true, postMessage: (d, t) => { outbox.push({ data: d, targetOrigin: t }); } }
    : win;
  win.parent = o.embedded ? win.top : win;

  /* 预置存档（模拟"已经过对话走到 save"） */
  if (o.seedState && o.storage) {
    store.set('sudu_save_v1', JSON.stringify(o.seedState));
  }
  /* 直接搬运上一页的 localStorage 快照 —— 最贴近"同一浏览器换页"的真实情形 */
  if (o.seedStore && o.storage) {
    for (const k of Object.keys(o.seedStore)) store.set(k, o.seedStore[k]);
  }

  /* ── 资源解析：浏览器语义 ─────────────────────────────────────────
     相对路径 → 相对页面目录；'/' 开头 → 相对站点根（域名根）。   */
  function resolveRef(ref) {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref) || ref.startsWith('//')) {
      return { kind: 'external', file: null, ref };
    }
    if (ref.startsWith('/')) {
      return { kind: 'root-absolute', file: path.join(siteRoot, ref), ref };
    }
    return { kind: 'relative', file: path.resolve(pageDir, ref), ref };
  }

  /* 收集页面引用的所有资源（script/link/img） */
  function refs() {
    const out = [];
    htmlEl.walk((el) => {
      const t = el.tagName;
      const r = t === 'SCRIPT' ? el.getAttribute('src')
        : t === 'LINK' ? el.getAttribute('href')
          : t === 'IMG' ? el.getAttribute('src') : null;
      if (r) out.push({ tag: t, ...resolveRef(r) });
    });
    return out;
  }

  /* 执行脚本：顺序同浏览器；缺文件 = 404
     opts.settleMs: 只跑这么久的定时器（默认跑到完全空闲）。 */
  function runScripts(opts = {}) {
    const prevDateNow = Date.now;
    Date.now = clock.now;
    try {
      for (const el of htmlEl.querySelectorAll('script')) {
        const src = el.getAttribute('src');
        if (!src) continue;
        const r = resolveRef(src);
        if (r.kind === 'external') { loaded.push({ src, status: 'skipped-external' }); continue; }
        if (!fs.existsSync(r.file)) {
          const e = { src, status: 404, kind: r.kind, resolved: r.file };
          errors.push(e); loaded.push(e);
          continue;
        }
        const code = fs.readFileSync(r.file, 'utf8');
        try {
          new Function('window', 'document', 'localStorage', 'setTimeout', 'clearTimeout',
            'requestAnimationFrame', 'console', 'location', 'globalThis',
            code)(win, doc, localStorage, clock.setTimeout, clock.clearTimeout,
            win.requestAnimationFrame, win.console, win.location, win);
          loaded.push({ src, status: 200, kind: r.kind });
        } catch (err) {
          const e = { src, status: 'throw', error: err.message };
          errors.push(e); loaded.push(e);
        }
      }
      /* 浏览器：同步脚本跑完 → DOMContentLoaded */
      doc.readyState = 'interactive';
      doc.dispatch('DOMContentLoaded');
      if (typeof opts.settleMs === 'number') clock.runFor(opts.settleMs);
      else clock.runUntilIdle();
    } finally {
      Date.now = prevDateNow;
    }
  }

  /* 在虚拟时钟下执行一段操作（供测试驱动玩家行为） */
  function withClock(fn) {
    const prev = Date.now;
    Date.now = clock.now;
    try { return fn(); } finally { Date.now = prev; }
  }

  return {
    win, doc, clock, localStorage,
    loaded, errors, consoleLog,
    refs, resolveRef, runScripts, withClock,
    pageFile, pageDir, siteRoot,
    /* 子页面 postMessage 给宿主的全部消息（仅 embedded 模式下有内容） */
    outbox,
    text: () => doc.body.textContent
  };
}

module.exports = { createEnv, makeClock, parseHtml, matches };
