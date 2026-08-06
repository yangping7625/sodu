/* ==========================================================================
   tests/spec.js · J-9 红线扫描器（部署门禁）

   在 CI 部署前运行：node tests/spec.js
   任一红线被触即退出码 1（阻断发布）。

   扫描范围 = 会进入部署产物的文件（html / css / js / svg / txt）。
   明确排除 tests/（本文件）、README.md（开发者文档，不部署）、.github/。

   红线清单：
     ① 元层禁词：gonglue / gl_ / 攻略  （S8 / X-6）
     ② TW-2 禁词（任何位置）：我在看你
     ③ TW-3 叙述泄漏：千绘（本切片不应出现）
     ④ 永不渲染的 token：{pre_visit_ts}
     ⑤ 明文谜面泄漏：占位答案（源码内永不出现明文；KNOWN 仅为 S3 占位校验用）
     ⑥ 恐怖预算：A ≤ A_max(2) · B ≤ B_max(14)
     ⑦ 节点图：无悬空引用、无孤儿节点
     ⑧ 谜底哈希管线：normalize(KNOWN) 的 sha256 === answer_sha256
     ⑨ GitHub Pages 子路径安全：产物内禁止根绝对资源路径（`/xxx` 开头）

   ⚠️ 红线⑨ 的由来（ARG-BUILD-02）：GH Pages 项目站地址形如
      https://<user>.github.io/<repo>/ —— 带仓库名子路径。
      此时 `/css/a.css` 会解析到域名根 https://<user>.github.io/css/a.css → 404，
      样式与脚本全丢、首页裸奔。故所有资源引用必须是相对路径（不带前导 /）。

   ⚠️ KNOWN 是 S3 定稿前的【占位谜面】。最终答案定稿后：
      · 把 answer_sha256 换成真谜面的哈希（data/sd_slice.js）
      · 把本文件的 KNOWN 置空 '' 以跳过明文校验 —— 真答案绝不入库、绝不进源码
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

/* 占位谜面常量：S3 定稿后已置空 '' —— 真谜底绝不入库、绝不进源码。
   明文谜面（"占位答案"）仅作 S3 占位期校验；定稿后 KNOWN='' 跳过明文校验，
   纯靠 answer_sha256 自证（由 tripwire 派生哈希与 answer_sha256 闭合）。 */
const KNOWN = '';

/* ── 加载只读内容层 + 真实 normalize 管线 ───────────────────────────── */
function loadSandbox() {
  const sandbox = {};
  const slicePath = path.join(ROOT, 'data', 'sd_slice.js');
  const puzzlePath = path.join(ROOT, 'js', 'sd_puzzle.js');
  const sliceCode = fs.readFileSync(slicePath, 'utf8');
  const puzzleCode = fs.readFileSync(puzzlePath, 'utf8');
  // 复用同一 sandbox：sd_puzzle 会挂在 sandbox.SD.Puzzle 上
  new Function('window', sliceCode + '\nreturn window.SD_DATA;')(sandbox);
  new Function('window', puzzleCode + '\nreturn window.SD;')(sandbox);
  return sandbox;
}

/* ── 收集部署文件 ────────────────────────────────────────────────────── */
const SCAN_EXT = new Set(['.html', '.css', '.js', '.svg', '.txt']);
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'tests', '.github']);

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(name)) walk(full, out);
      continue;
    }
    if (name === 'robots.txt') { out.push(full); continue; }
    const ext = path.extname(name).toLowerCase();
    if (SCAN_EXT.has(ext)) out.push(full);
  }
}

/* ── 红线定义 ────────────────────────────────────────────────────────── */
/* ① 元层禁词（分面扫描）：
      gonglue / gl_  —— 硬标识符，全文件裸扫（只可能是元层泄漏，叙事层不说拼音）。
      攻略           —— 仅元层（注释 / 非叙事字符串字面量）判违规；
                       叙事层角色台词引述的"攻略"（游戏内攻略书）属世界内文本，§8 放行。 */
const FORBID_META_HARD = /gonglue|gl_/gi;
const FORBID_GONGLUE_NARR = /攻略/g;        // 仅在元层（注释 / 非叙事串）判定
/* ②–⑤ 屏显红线：只扫【渲染面】（可能落到玩家眼前的文案），
      不扫 tripwire_pairs / tripwire_guard 这类【规则定义】本身。 */
const FORBID_TW2   = /我在看你/g;            // TW-2：任何位置禁词
const FORBID_TW3   = /千绘/g;                // TW-3：叙述泄漏（本切片不应出现）
const FORBID_TOKEN = /\{pre_visit_ts\}/g;    // 永不渲染 token（SS-078 除外，见 scanRendered）
const FORBID_PLAIN = /占位答案/g;            // 明文谜面（守卫：若有人误把占位明文写进产物即拦截）

/* ── 报告收集 ────────────────────────────────────────────────────────── */
const fails = [];
const notes = [];

function fail(msg) { fails.push(msg); }
function note(msg) { notes.push(msg); }

/* 抽取「会渲染到玩家眼前」的所有字符串（排除规则定义）。
   返回 [{id, s}]：id 为来源节点 id（非节点来源为 null），供 scanRendered
   对 SS-078 这类【有意承载模板 token】的节点做白名单放行。 */
function extractRendered(SD_DATA) {
  const out = [];
  const push = function (v, id) { if (typeof v === 'string') out.push({ id: id || null, s: v }); };

  const meta = SD_DATA.meta || {};
  for (const k in meta) push(meta[k]);

  const titles = SD_DATA.titles || {};
  for (const k in titles) push(titles[k]);

  push(SD_DATA.footer_notice);

  const fc = SD_DATA.feed_cover || {};
  (fc.catalog || []).forEach(function (c) {
    push(c.title); push(c.excerpt); push(c.source_site);
    push(c.source_uid); push(c.source_date); push(c.route_view);
  });

  const a1 = SD_DATA.a1_tiers || {};
  for (const k in a1) (a1[k].lines || []).forEach(function (s) { push(s); });

  (SD_DATA.dialogue_nodes || []).forEach(function (n) {
    push(n.text, n.id);
    if (n.kind === 'branch_line') {
      const cs = n.cases || {};
      for (const k in cs) push(cs[k], n.id);
      push(n.default, n.id);
    }
    if (n.kind === 'link') push(n.text, n.id);
    (n.options || []).forEach(function (o) { push(o.label, n.id); });
  });

  const st = SD_DATA.save_table || {};
  push(st.title);
  (st.rows || []).forEach(function (r) {
    push(r.key); push(String(r.value)); push(r.reveal_key);
  });
  push(st.hidden_text && st.hidden_text.content);
  push(st.html_comment);
  push(st.direct_visit_note);
  /* 注意：st.tripwire_guard 与 SD_DATA.tripwire_pairs 是规则定义，
     永不渲染，不纳入渲染面扫描。 */
  return out;
}

/* 文件级全扫描：元层禁词（分面）+ 明文谜面（含注释，源码内零明文）。 */
function scanFilesMeta(files, SD_DATA) {
  const narrative = new Set(extractRendered(SD_DATA).map(function (o) { return o.s; }));

  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const txt = fs.readFileSync(f, 'utf8');

    /* gonglue / gl_：硬标识符，全文件裸扫。部署产物任何位置都不该出现。 */
    FORBID_META_HARD.lastIndex = 0;
    let mm, at = [];
    while ((mm = FORBID_META_HARD.exec(txt)) !== null) {
      at.push('L' + txt.slice(0, mm.index).split('\n').length);
      if (mm.index === FORBID_META_HARD.lastIndex) FORBID_META_HARD.lastIndex++;
    }
    if (at.length) fail(`[元层禁词(gonglue/gl_)] 命中 ${at.length} 处 @ ${rel} (${at.join(', ')})`);

    /* 攻略：分面扫描（注释 / 非叙事字符串字面量）。叙事层放行。 */
    scanGonglueFaceted(txt, rel, narrative);

    /* 明文谜面守卫（含注释）。最终定稿后源码内不应再有任何明文谜面。 */
    FORBID_PLAIN.lastIndex = 0;
    let pm, pat = [];
    while ((pm = FORBID_PLAIN.exec(txt)) !== null) {
      pat.push('L' + txt.slice(0, pm.index).split('\n').length);
      if (pm.index === FORBID_PLAIN.lastIndex) FORBID_PLAIN.lastIndex++;
    }
    if (pat.length) fail(`[明文谜面(占位答案)] 命中 ${pat.length} 处 @ ${rel} (${pat.join(', ')})`);
  }
}

/* 攻略 分面：仅【注释】与【非叙事字符串字面量】判违规。
   叙事层（角色台词里的"攻略"，指游戏内攻略书）由 narrative 白名单放行。 */
function scanGonglueFaceted(txt, rel, narrative) {
  /* 注释中的作品名 = 元层泄漏 */
  txt.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, function (m) {
    if (m.indexOf('攻略') >= 0) {
      fail(`[元层禁词·攻略] 注释出现作品名 @ ${rel}: 「${m.slice(0, 40)}…」`);
    }
    return m;
  });
  /* 非叙事字符串字面量中的作品名 = 元层泄漏（键名 / 配置 / 标题等） */
  const litRe = /(['"])((?:\\.|(?!\1).)*?)\1/g;
  let mm;
  while ((mm = litRe.exec(txt)) !== null) {
    const val = mm[2];
    if (val.indexOf('攻略') >= 0 && !narrative.has(val)) {
      fail(`[元层禁词·攻略] 非叙事字符串含作品名 @ ${rel}: 「${val.slice(0, 28)}…」`);
    }
    if (mm.index === litRe.lastIndex) litRe.lastIndex++;
  }
}

/* 渲染面扫描：TW-2 / TW-3 / 永不渲染 token。
   入参为 [{id, s}]（extractRendered 产出）。
   {pre_visit_ts} 在 SS-078 以【模板形态】有意承载（P5 硬指标：A-2 时间倒错），
   仅该节点放行；其余渲染文案不得残留字面 token（未插值 = 泄漏）。 */
function scanRendered(list) {
  list.forEach(function (item) {
    const s = item.s;
    FORBID_TW2.lastIndex = 0;
    if (FORBID_TW2.test(s)) {
      fail(`[TW-2(我在看你)] 命中于渲染文案：「${s.slice(0, 40)}${s.length > 40 ? '…' : ''}」`);
    }
    FORBID_TW3.lastIndex = 0;
    if (FORBID_TW3.test(s)) {
      fail(`[TW-3(千绘)] 命中于渲染文案：「${s.slice(0, 40)}${s.length > 40 ? '…' : ''}」`);
    }
    if (item.id !== 'SS-078') {
      FORBID_TOKEN.lastIndex = 0;
      if (FORBID_TOKEN.test(s)) {
        fail(`[永不渲染token({pre_visit_ts})] 命中于渲染文案 @ ${item.id || '?'}：「${s.slice(0, 40)}${s.length > 40 ? '…' : ''}」`);
      }
    }
  });
}

/* ── ⑨ GitHub Pages 子路径安全：禁止根绝对资源路径 ──────────────────
   只扫【真资源引用面】，精确到 HTML 的 href/src 属性与 CSS 的 url()，
   刻意不做全文 `/` 扫描 —— 否则会误伤 JS 正则字面量、注释 `/* *\/`、
   以及 sd_router.js 里 '/save' '/404' 这类【逻辑页面 id】（它们不是 URL）。

   放行：相对路径 (css/a.css)、./ ../、#锚点、协议绝对 (https:)、
        data: mailto: tel:、以及协议相对 //host（虽罕见但非本红线目标）。 */
const ABS_IN_HTML = /(?:href|src)\s*=\s*["'](\/(?!\/)[^"']*)["']/gi;
const ABS_IN_CSS  = /url\(\s*["']?(\/(?!\/)[^"')]*)/gi;

function scanAbsolutePaths(files) {
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const ext = path.extname(f).toLowerCase();
    let re;
    if (ext === '.html') re = ABS_IN_HTML;
    else if (ext === '.css') re = ABS_IN_CSS;
    else continue;

    const txt = fs.readFileSync(f, 'utf8');
    re.lastIndex = 0;
    let mm;
    while ((mm = re.exec(txt)) !== null) {
      const line = txt.slice(0, mm.index).split('\n').length;
      fail(`[GH Pages 子路径] 根绝对资源路径 "${mm[1]}" @ ${rel}:L${line} ` +
           `—— 子路径部署下会 404，请改为相对路径（去掉前导 /）`);
      if (mm.index === re.lastIndex) re.lastIndex++;
    }
  }
  note('GH Pages 子路径安全：已扫 html/css 的 href/src/url() 资源引用面');
}

/* ── 恐怖预算 + 节点图（来自 SD_DATA） ──────────────────────────────── */
function checkBudgetAndGraph(SD_DATA) {
  const nodes = SD_DATA.dialogue_nodes || [];
  const hb = SD_DATA.horror_budget || {};
  const A_MAX = hb.A_max != null ? hb.A_max : 2;
  const B_MAX = hb.B_max != null ? hb.B_max : 14;

  /* 按【唯一 budget_id】计数（非 effect 出现次数）：
     同一 budget_id 在多节点复用只占一席（如 B-5 在 4 节点复用 = 1 席）。
     B-12 属独立页面资产（Phase 2 /v1/save 旧版表），不在节点内登记，单独累加。 */
  const idSet = { A: new Set(), B: new Set() };
  const index = {};
  nodes.forEach(function (n) {
    index[n.id] = n;
    (n.effects || []).forEach(function (e) {
      if (e.type === 'horror' && e.budget_id) idSet[e.class].add(e.budget_id);
    });
  });
  (hb.B_offdialogue || []).forEach(function (id) { idSet.B.add(id); });

  const aCount = idSet.A.size;
  const bCount = idSet.B.size;
  const declA = (hb.A_declared || []).length;
  const declB = (hb.B_declared || []).length;

  if (aCount > A_MAX) fail(`恐怖预算超支：A 类 ${aCount} > 上限 ${A_MAX}`);
  if (bCount > B_MAX) fail(`恐怖预算超支：B 类 ${bCount} > 上限 ${B_MAX}`);
  /* 零余量纪律：满额登记，实测必须等于上限（也等于台账声明数） */
  if (aCount !== A_MAX) fail(`恐怖预算未满额：A 类实测 ${aCount} ≠ 上限 ${A_MAX}（零余量要求）`);
  if (bCount !== B_MAX) fail(`恐怖预算未满额：B 类实测 ${bCount} ≠ 上限 ${B_MAX}（零余量要求）`);
  if (declA && aCount !== declA) fail(`恐怖预算台账不一致：A 实 ${aCount} ≠ 声明 ${declA}`);
  if (declB && bCount !== declB) fail(`恐怖预算台账不一致：B 实 ${bCount} ≠ 声明 ${declB}`);
  note(`恐怖预算：A ${aCount}/${A_MAX}（声明${declA}）· B ${bCount}/${B_MAX}（声明${declB}）`);

  /* 节点图可达性 */
  const reach = new Set();
  const stack = [nodes.length ? nodes[0].id : null];
  const dangling = [];
  while (stack.length) {
    const id = stack.pop();
    if (!id || reach.has(id) || !index[id]) continue;
    reach.add(id);
    const n = index[id];
    const push = function (t) { if (t) { if (!index[t]) dangling.push(id + ' → ' + t); else stack.push(t); } };
    push(n.next);
    (n.options || []).forEach(function (o) { push(o.next); });
    if (n.free_input) push(n.free_input.next);
  }
  dangling.forEach(function (d) { fail('节点图悬空引用：' + d); });
  /* 孤儿检测：puzzle_hint 节点由谜题提示阶梯注入，不在静态可达链上，放行 */
  nodes.forEach(function (n) {
    if (reach.has(n.id)) return;
    if ((n.tags || []).indexOf('puzzle_hint') >= 0) {
      note('节点 ' + n.id + '：puzzle_hint，由提示阶梯注入（不在静态可达链），放行');
      return;
    }
    fail('节点图孤儿节点：' + n.id);
  });
  note(`节点图：共 ${nodes.length} 个 · 可达 ${reach.size} 个`);
}

/* ── 谜底哈希管线校验 ───────────────────────────────────────────────── */
function checkHash(SD_DATA, sandbox) {
  const normalize = sandbox.SD && sandbox.SD.Puzzle && sandbox.SD.Puzzle.normalize;
  const redacted = (SD_DATA.save_table && SD_DATA.save_table.rows || [])
    .filter(function (r) { return r.redacted && r.unlock; });
  if (!normalize) { fail('未能加载 SD.Puzzle.normalize —— 哈希校验跳过'); return; }

  redacted.forEach(function (r) {
    const want = String(r.unlock.answer_sha256 || '').toLowerCase();
    if (!want) { fail('谜题 ' + r.key + ' 缺少 answer_sha256'); return; }
    const got = crypto.createHash('sha256').update(normalize(KNOWN), 'utf8').digest('hex');
    if (!KNOWN) {
      note('谜题 ' + r.key + '：KNOWN 为空，跳过明文校验（最终答案不应入库）');
      return;
    }
    if (got === want) {
      note('谜题 ' + r.key + '：归一化管线 ↔ 哈希一致（占位校验通过）');
    } else {
      fail('谜题 ' + r.key + '：normalize(KNOWN) 哈希 ' + got + ' ≠ answer_sha256 ' + want);
    }
  });
}

/* ── §9 节点存在性与字段断言（P2/P5 硬指标 + 明文纪律 + X-2 护栏） ───── */
function checkNodes(SD_DATA) {
  const nodes = SD_DATA.dialogue_nodes || [];
  const byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });

  const req = function (id, tag) {
    const n = byId[id];
    if (!n) { fail('节点缺失：' + id + (tag || '')); return null; }
    return n;
  };

  /* P2 块 + 投喂三选一（S6 汽水屋出处行的载体） */
  if (!nodes.some(function (n) { return n.block === 'P2'; })) fail('P2 块缺失（对话节点 block:"P2" 为空）');
  const feed = byId['SC-015'];
  if (!feed || feed.kind !== 'feed') fail('P2 投喂教学节点 SC-015(kind:feed) 缺失或类型错');
  else if ((feed.options || []).length !== 3) fail('P2 投喂卡必须等于 3 选 1（实得 ' + (feed.options || []).length + '）');

  /* P5 块存在 */
  if (!nodes.some(function (n) { return n.block === 'P5'; })) fail('P5 块缺失（对话节点 block:"P5" 为空）');

  /* SN-037：A-1 揭示槽，text 恒 null（P2 硬指标：文本由 a1_tiers 依实测装配） */
  const a1 = req('SN-037', '（A-1 揭示槽）');
  if (a1) {
    if (a1.kind !== 'a1_reveal') fail('SN-037 必须是 kind:"a1_reveal"');
    if (a1.text !== null) fail('SN-037.text 必须为 null（写死文案 = P2 死亡）');
    if (!(a1.effects || []).some(function (e) { return e.type === 'horror' && e.class === 'A'; }))
      fail('SN-037 缺少 A 类恐怖预算记账');
  }

  /* SS-078：A-2 时间倒错，有意渲染 {pre_visit_ts}（P5 硬指标） */
  const ss078 = req('SS-078', '（A-2 时间倒错）');
  if (ss078) {
    if (ss078.text.indexOf('{pre_visit_ts}') < 0) fail('SS-078 必须渲染 {pre_visit_ts}（P5 时间倒错硬指标）');
    if ((ss078.tokens || []).indexOf('{pre_visit_ts}') < 0) fail('SS-078 必须在 tokens 声明 {pre_visit_ts}');
  }

  /* SN-083：用玩家自己的口音回显 {ECHO} */
  const sn083 = req('SN-083', '（阶段④ 玩家口音回显）');
  if (sn083) {
    if (sn083.text.indexOf('{ECHO}') < 0) fail('SN-083 必须渲染 {ECHO}');
    if ((sn083.tokens || []).indexOf('{ECHO}') < 0) fail('SN-083 必须在 tokens 声明 {ECHO}');
  }

  /* SN-084：未投喂卡标题回显 {UNFED_TITLE} */
  const sn084 = req('SN-084');
  if (sn084) {
    if (sn084.text.indexOf('{UNFED_TITLE}') < 0) fail('SN-084 必须渲染 {UNFED_TITLE}');
    if ((sn084.tokens || []).indexOf('{UNFED_TITLE}') < 0) fail('SN-084 必须在 tokens 声明 {UNFED_TITLE}');
  }

  /* SS-085：render:false 舞台指示 + soft_countdown 效果 */
  const ss085 = req('SS-085', '（页脚软倒计时）');
  if (ss085) {
    if (ss085.render !== false) fail('SS-085 必须是 render:false（舞台指示，非台词，防元层串泄漏）');
    if (!(ss085.effects || []).some(function (e) { return e.type === 'soft_countdown'; }))
      fail('SS-085 必须含 soft_countdown 效果（R8/R10 只显示不阻断）');
  }

  /* SN-081：全片唯一强制等待（skippable:false） */
  const sn081 = req('SN-081', '（唯一强制等待）');
  if (sn081) {
    const d = (sn081.effects || []).filter(function (e) { return e.type === 'delay'; })[0];
    if (!d || d.skippable !== false) fail('SN-081 的 delay 必须为 skippable:false（唯一不可跳过等待）');
  }

  /* route_flavors：A-1 pause 档必须装配风味替换（P2 文本随玩家路线漂移） */
  const a1t = SD_DATA.a1_tiers || {};
  if (!a1t.pause || !a1t.pause.route_flavors) fail('a1_tiers.pause.route_flavors 缺失（A-1 文本必须随路线漂移）');
  if (!a1t.cleared || !a1t.fast) fail('a1_tiers 缺少 cleared / fast 兜底档');

  /* 明文谜底纪律：tripwire 禁词不得以明文入库（必须 ref / sha256 登记） */
  const twp = SD_DATA.tripwire_pairs || [];
  const tw2 = twp.filter(function (t) { return t.id === 'TW-2'; })[0];
  if (tw2) {
    const f = (tw2.forbid_anywhere || [])[0];
    if (!f || typeof f === 'string') fail('TW-2 禁词不得写明文（应使用 { ref:"acrostic_answer" } 登记）');
  }
  const tg = (SD_DATA.save_table && SD_DATA.save_table.tripwire_guard) || {};
  const tge = (tg.forbid_on_screen || [])[0];
  if (tge && typeof tge === 'string') fail('save_table.tripwire_guard 禁词不得写明文（应 ref 登记）');

  /* X-2 静态护栏：主对话渲染面不得出现绝对历史年份（2011 等地层日期属论坛页，
     由该页自行渲染；主对话页只产相对时间戳 / 站名 + 楼主 ID）。
     刻意排除 feed_cover.source_date（字段保留不渲染，show_source_date:false）。 */
  const x2 = [];
  nodes.forEach(function (n) {
    if (typeof n.text === 'string') x2.push(n.text);
    if (n.kind === 'branch_line') {
      const cs = n.cases || {};
      for (const k in cs) if (typeof cs[k] === 'string') x2.push(cs[k]);
      if (n.default) x2.push(n.default);
    }
    (n.options || []).forEach(function (o) { if (typeof o.label === 'string') x2.push(o.label); });
  });
  (SD_DATA.feed_cover.catalog || []).forEach(function (c) { if (c.excerpt) x2.push(c.excerpt); });
  for (const k in a1t) (a1t[k].lines || []).forEach(function (s) { x2.push(s); });
  const yearHit = x2.filter(function (s) { return /\b20\d{2}\b/.test(s); });
  if (yearHit.length) fail('X-2 主对话渲染面出现绝对年份（疑似历史日期泄漏）：' + yearHit.slice(0, 3).join(' | '));
}

/* ── 主流程 ──────────────────────────────────────────────────────────── */
function main() {
  const files = [];
  walk(ROOT, files);
  note('扫描部署文件 ' + files.length + ' 个');

  const sandbox = loadSandbox();
  const SD_DATA = sandbox.SD_DATA;

  scanAbsolutePaths(files);             // ⑨ GH Pages 子路径安全（资源引用面，无需 SD_DATA）

  if (!SD_DATA) { fail('无法加载 window.SD_DATA（data/sd_slice.js）'); }
  else {
    scanFilesMeta(files, SD_DATA);      // ① 元层禁词（分面）+ ⑤ 明文（文件级）
    scanRendered(extractRendered(SD_DATA));   // ②–④ 屏显红线（渲染面）
    checkBudgetAndGraph(SD_DATA);
    checkNodes(SD_DATA);                       // §9 节点存在性 + 字段 + 明文纪律 + X-2
    checkHash(SD_DATA, sandbox);
  }

  /* 正 rename 自检：部署产物中至少应出现 sd_/sudu_/soda_/qsw_ 之一 */
  let renameOk = false;
  for (const f of files) {
    const t = fs.readFileSync(f, 'utf8');
    if (/sudu_|sd_|soda_|qsw_/.test(t)) { renameOk = true; break; }
  }
  if (!renameOk) fail('rename 自检失败：部署产物中未发现 sd_/sudu_/soda_/qsw_ 命名');

  /* 报告 */
  console.log('\n── J-9 红线扫描 ─────────────────────────────────────');
  notes.forEach(function (n) { console.log('  · ' + n); });
  if (fails.length) {
    console.log('\n✗ 发现 ' + fails.length + ' 处红线违反：');
    fails.forEach(function (m) { console.log('  ✗ ' + m); });
    console.log('\n部署被阻断。请修复后重试。\n');
    process.exit(1);
  } else {
    console.log('\n✓ 全部红线通过。可进入部署。\n');
    process.exit(0);
  }
}

main();
