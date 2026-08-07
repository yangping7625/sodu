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

   ── ARG-BUILD-09 · Phase 2 全站覆盖（INS-2 入门条件）─────────────────
     ⑩ Phase 2 恐怖预算分区台账：2a 段 8×B 占位登记 + 席位全局唯一（HB-5）
        + 全局天花板 A4/B38 + 台账↔现实防漂移探针
     ⑪ X-5 反 DRY：地层之间禁共享 CSS/JS/字体（物理隔离靠 iframe）
        + era 地层禁用素读/桌面壳命名前缀
     ⑫ X-2 跨页：2026 地层静态页零绝对日期；era 地层日期须落在年代窗口内（D-2）
     ⑬ D-3 死链：站内 href/src 指向的文件必须存在，未登记的死链即失败
     ⑭ Gap-1 防漂移：deploy.yml 必须是【通配发布 + 排除清单】形态，
        且排除清单与 tests/phase2_ledger.js 一致（漏排 tests/ = 谜底上线）

     ⚠️ ⑩–⑬ 对【尚未创建】的 Phase 2 目录一律优雅跳过（skip 而非 fail）：
        扫描器先于页面就位是 INS-2 的要求，不是页面缺失的报错理由。

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

/* Phase 2 巡检寄存器（纯声明配置：发布清单 / 地层登记 / 预算台账）。
   本文件只放逻辑，数据在 ledger —— 2a 施工者改 ledger，不动扫描器。 */
const LEDGER = require('./phase2_ledger');

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
/* 扫描面 == 发布面：排除清单取自 phase2_ledger（deploy.yml 的同一真源）。
   两边共用一张表，才不会出现"扫了但没发"或"发了但没扫"的缺口。 */
const EXCLUDE_DIRS = new Set(LEDGER.PUBLISH_EXCLUDE_DIRS);

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

/* G-1 段判定（台账分区用）：SD- 前缀节点 / block 以 G1- 开头。
   模块级共用 —— checkBudgetAndGraph 与 checkPhase2Budget 必须用同一判据，
   否则两处分区口径会悄悄漂开。 */
function isG1Node(n) {
  return /^SD-/.test(n.id || '') || /^G1-/.test(n.block || '');
}

/* ── 恐怖预算 + 节点图（来自 SD_DATA） ──────────────────────────────── */
function checkBudgetAndGraph(SD_DATA) {
  const nodes = SD_DATA.dialogue_nodes || [];
  const hb = SD_DATA.horror_budget || {};
  const hbG1 = SD_DATA.horror_budget_g1 || {};
  const A_MAX = hb.A_max != null ? hb.A_max : 2;
  const B_MAX = hb.B_max != null ? hb.B_max : 14;
  const A_MAX_G1 = hbG1.A_max != null ? hbG1.A_max : 0;
  const B_MAX_G1 = hbG1.B_max != null ? hbG1.B_max : 3;

  /* 台账分区（ARG-BUILD-07）：切片段（SN-/SC-/SS-）记入 horror_budget；
     G-1 段（SD-）记入同级 horror_budget_g1（P-2 划拨 3 席 B-K1/K2/K3，
     HB-5：切片 A2/B14 十六席零触碰）。分区保证「切片 2/2 · 14/14 零余量」
     红线不被 G-1 的 3 个划拨席位稀释，也保证 G-1 台账 0/0 · 3/3 满额。 */
  const isG1 = isG1Node;

  /* 按【唯一 budget_id】计数（非 effect 出现次数）：
     同一 budget_id 在多节点复用只占一席（如 B-5 在 4 节点复用 = 1 席，
     G-1 的 B-K2 在 4 节点复用同样只占一席）。 */
  const idSet = { A: new Set(), B: new Set() };
  const idSetG1 = { A: new Set(), B: new Set() };
  const index = {};
  nodes.forEach(function (n) {
    index[n.id] = n;
    const ledger = isG1(n) ? idSetG1 : idSet;
    (n.effects || []).forEach(function (e) {
      if (e.type === 'horror' && e.budget_id) ledger[e.class].add(e.budget_id);
    });
  });
  (hb.B_offdialogue || []).forEach(function (id) { idSet.B.add(id); });

  const aCount = idSet.A.size;
  const bCount = idSet.B.size;
  const declA = (hb.A_declared || []).length;
  const declB = (hb.B_declared || []).length;
  const aG1 = idSetG1.A.size;
  const bG1 = idSetG1.B.size;
  const declAG1 = (hbG1.A_declared || []).length;
  const declBG1 = (hbG1.B_declared || []).length;

  /* ── 切片段台账（既有红线，零余量） ── */
  if (aCount > A_MAX) fail(`恐怖预算超支：切片段 A 类 ${aCount} > 上限 ${A_MAX}`);
  if (bCount > B_MAX) fail(`恐怖预算超支：切片段 B 类 ${bCount} > 上限 ${B_MAX}`);
  if (aCount !== A_MAX) fail(`恐怖预算未满额：切片段 A 类实测 ${aCount} ≠ 上限 ${A_MAX}（零余量要求）`);
  if (bCount !== B_MAX) fail(`恐怖预算未满额：切片段 B 类实测 ${bCount} ≠ 上限 ${B_MAX}（零余量要求）`);
  if (declA && aCount !== declA) fail(`恐怖预算台账不一致：切片段 A 实 ${aCount} ≠ 声明 ${declA}`);
  if (declB && bCount !== declB) fail(`恐怖预算台账不一致：切片段 B 实 ${bCount} ≠ 声明 ${declB}`);
  note(`恐怖预算（切片段）：A ${aCount}/${A_MAX}（声明${declA}）· B ${bCount}/${B_MAX}（声明${declB}）`);

  /* ── G-1 段台账（P-2 划拨，独立满额） ── */
  if (aG1 > A_MAX_G1) fail(`恐怖预算超支：G-1 段 A 类 ${aG1} > 上限 ${A_MAX_G1}`);
  if (bG1 > B_MAX_G1) fail(`恐怖预算超支：G-1 段 B 类 ${bG1} > 上限 ${B_MAX_G1}`);
  if (aG1 !== A_MAX_G1) fail(`恐怖预算未满额：G-1 段 A 类实测 ${aG1} ≠ 上限 ${A_MAX_G1}（零余量要求）`);
  if (bG1 !== B_MAX_G1) fail(`恐怖预算未满额：G-1 段 B 类实测 ${bG1} ≠ 上限 ${B_MAX_G1}（零余量要求）`);
  if (declAG1 && aG1 !== declAG1) fail(`恐怖预算台账不一致：G-1 段 A 实 ${aG1} ≠ 声明 ${declAG1}`);
  if (declBG1 && bG1 !== declBG1) fail(`恐怖预算台账不一致：G-1 段 B 实 ${bG1} ≠ 声明 ${declBG1}`);
  note(`恐怖预算（G-1 段 P-2 划拨）：A ${aG1}/${A_MAX_G1} · B ${bG1}/${B_MAX_G1}（声明${declBG1}）`);

  /* 节点图可达性 */
  const reach = new Set();
  const stack = [nodes.length ? nodes[0].id : null];
  /* G-1 续弧种子（D-G1-02）：切片收尾后由 sd_dialogue.onEnd() 的通用
     「续弧接续」跳转到 tags 含 'arc_entry' 的节点 —— 静态图以 arc_entry
     为第二起点，SD-001…SD-090 整链因此可达（与运行期行为镜像）。 */
  nodes.forEach(function (n) {
    if ((n.tags || []).indexOf('arc_entry') >= 0) stack.push(n.id);
  });
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

  /* SS-085：render:false 舞台指示 + soft_countdown 效果
     EXT-0：next 必须保持 null —— 切片末节点不硬接线，G-1 接续靠
     SD-001 的 arc_entry 通用跳转（D-G1-02）。 */
  const ss085 = req('SS-085', '（页脚软倒计时）');
  if (ss085) {
    if (ss085.render !== false) fail('SS-085 必须是 render:false（舞台指示，非台词，防元层串泄漏）');
    if (!(ss085.effects || []).some(function (e) { return e.type === 'soft_countdown'; }))
      fail('SS-085 必须含 soft_countdown 效果（R8/R10 只显示不阻断）');
    if (ss085.next !== null) fail('SS-085.next 必须保持 null（EXT-0：不得硬接线，靠 onEnd 通用续弧跳转）');
  }

  /* G-1 接线锚点（ARG-BUILD-07）：
     SD-001 = arc_entry（onEnd 续弧跳转入口，不写死任何 ID）
     SD-088 = 结局判定挂点（render:false，只写 state.ending，R2 零渲染）
     SD-090 = 幕 5 收尾（同 SS-085 形态：render:false + soft_countdown，next:null） */
  const sd001 = req('SD-001', '（G-1 arc_entry 入口）');
  if (sd001) {
    if ((sd001.tags || []).indexOf('arc_entry') < 0)
      fail('SD-001 必须挂 tags:["arc_entry"]（onEnd 续弧跳转入口）');
  }
  const sd088 = req('SD-088', '（G-1 结局判定挂点）');
  if (sd088) {
    if (sd088.render !== false) fail('SD-088 必须是 render:false（纯计算挂点，R2 零渲染零提示）');
    if ((sd088.tags || []).indexOf('sd_ending_gate') < 0)
      fail('SD-088 必须挂 tags:["sd_ending_gate"]（由 sd_ending.decide() 触发三轴判定）');
  }
  const sd090 = req('SD-090', '（G-1 幕5 收尾）');
  if (sd090) {
    if (sd090.render !== false) fail('SD-090 必须是 render:false（舞台指示，防元层串泄漏）');
    if (!(sd090.effects || []).some(function (e) { return e.type === 'soft_countdown'; }))
      fail('SD-090 必须含 soft_countdown 效果（R8/R10 只显示不阻断）');
    if (sd090.next !== null) fail('SD-090.next 必须为 null（弧终点，由 onEnd 收尾）');
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

/* ── DX-02 双写点（J-9 巡检）：404.html 页脚声明必须逐字等同
   SD_DATA.footer_notice。404 页零 JS 依赖（方案乙），声明静态写死进
   HTML —— 改一处漏一处直接 fail，不要手动绕过。 */
function checkDualWriteNotice(SD_DATA) {
  const footer = String(SD_DATA.footer_notice || '');
  const html = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
  const m = /<footer class="sd-foot" data-sd-footer>([\s\S]*?)<\/footer>/.exec(html);
  if (!footer) { fail('DX-02 双写点：SD_DATA.footer_notice 为空'); return; }
  if (!m) { fail('DX-02 双写点：404.html 未找到 data-sd-footer 页脚'); return; }
  if (m[1].indexOf(footer) < 0) {
    fail('DX-02 双写点：404.html 页脚声明与 footer_notice 不一致（改一处漏一处）');
  } else {
    note('DX-02 双写点：404.html 页脚声明与 footer_notice 逐字一致');
  }
}

/* ══════════════════════════════════════════════════════════════════════
   ARG-BUILD-09 · Phase 2 全站覆盖（INS-2 入门条件）
   ══════════════════════════════════════════════════════════════════════
   下面五段扫描是 arg_pages_phase2.md §3.2 INS-2 的兑现：
   "J-9 扩展到全站扫描，是 2a 的入门条件（entry condition），不是交付项。"

   共同纪律：Phase 2 的目录（qsw/ soda/ xk/ files/ about/ v1/）
   【尚未创建】。所有检查必须对"目录不存在"优雅跳过，
   否则扫描器会在页面建出来之前就把部署卡死。                        */

/* 相对 ROOT 的 posix 路径（Windows 反斜杠归一） */
function relOf(f) {
  return path.relative(ROOT, f).replace(/\\/g, '/');
}

/* 取某相对路径所属地层：按第一段目录名匹配 STRATA.roots。
   根级散件（index.html 等）第一段为 ''，归 assistant 地层。 */
function strataOf(rel) {
  const seg = rel.indexOf('/') >= 0 ? rel.slice(0, rel.indexOf('/')) : '';
  for (const s of LEDGER.STRATA) if (s.roots.indexOf(seg) >= 0) return s;
  return null;
}

/* 某地层是否已在磁盘上存在（用于"未创建即跳过"） */
function strataExists(s) {
  return s.roots.some(function (r) {
    return r === '' ? true : fs.existsSync(path.join(ROOT, r));
  });
}

/* 链接归一：返回相对 ROOT 的目标路径；不可判定/站外返回 null。 */
function resolveLink(fromRel, raw) {
  if (!raw) return null;
  const link = raw.trim();
  if (!link) return null;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(link)) return null;  // 协议/协议相对/纯锚点
  if (link.charAt(0) === '/') return null;                        // 根绝对：红线⑨ 已管
  const clean = link.split('#')[0].split('?')[0];
  if (!clean) return null;
  const baseDir = path.posix.dirname(fromRel);
  let t = path.posix.normalize(path.posix.join(baseDir === '.' ? '' : baseDir, clean));
  if (t === '.' || t === './') t = '';
  t = t.replace(/^\.\//, '');
  return t;
}

/* ── ⑩ Phase 2 恐怖预算分区台账 ──────────────────────────────────────
   目的（audit Gap-2 第 1 项）：把 2a 的 8×B 预先分区登记，
   使 2a 开工时能直接核对，而不是临时去偷占切片那 16 席（HB-5）。   */
function checkPhase2Budget(SD_DATA) {
  const H = LEDGER.HORROR;

  /* 席位总登记簿：seatId → 分区。跨分区重号 = HB-5 席位寄生。 */
  const owner = new Map();
  const tally = {};
  const bump = function (part, cls) {
    if (!tally[part]) tally[part] = { A: 0, B: 0 };
    if (cls === 'A' || cls === 'B') tally[part][cls]++;
  };
  const addSeat = function (id, part, cls) {
    if (owner.has(id)) {
      fail(`[HB-5 席位寄生] 席位 ${id} 被重复登记：${owner.get(id)} 与 ${part} ` +
           `—— 同一编号不得跨分区复用（新席位必须用全新编号）`);
      return;
    }
    owner.set(id, part);
    bump(part, cls);
  };

  /* 动态分区：席位从 data/ 的真实 effects 里数出来 */
  (SD_DATA.dialogue_nodes || []).forEach(function (n) {
    const part = isG1Node(n) ? 'g1' : 'slice';
    (n.effects || []).forEach(function (e) {
      if (e.type === 'horror' && e.budget_id && !owner.has(e.budget_id)) {
        addSeat(e.budget_id, part, e.class);
      } else if (e.type === 'horror' && e.budget_id && owner.get(e.budget_id) !== part) {
        /* 同一 budget_id 在【同分区】多节点复用只占一席（既有纪律）；
           但跨分区复用 = 寄生，必须报。 */
        fail(`[HB-5 席位寄生] 席位 ${e.budget_id} 跨分区复用：` +
             `${owner.get(e.budget_id)} → ${part}`);
      }
    });
  });
  ((SD_DATA.horror_budget || {}).B_offdialogue || []).forEach(function (id) {
    if (!owner.has(id)) addSeat(id, 'slice', 'B');
  });

  /* ── 静态分区：Phase 2 · 2a 段（占位登记）── */
  const p2 = H.p2_2a;
  const seats = p2.seats || [];
  seats.forEach(function (s) { addSeat(s.id, p2.id, s.cls); });

  const a2a = (tally[p2.id] || {}).A || 0;
  const b2a = (tally[p2.id] || {}).B || 0;

  if (a2a > p2.A_max) fail(`恐怖预算超支：${p2.id} 段 A 类 ${a2a} > 上限 ${p2.A_max}（Phase 2 实装 A 类 = 0）`);
  if (b2a > p2.B_max) fail(`恐怖预算超支：${p2.id} 段 B 类 ${b2a} > 上限 ${p2.B_max}`);
  if (p2.zeroMargin && b2a !== p2.B_max) {
    fail(`恐怖预算台账不符：${p2.id} 段 B 类登记 ${b2a} ≠ 平账值 ${p2.B_max} ` +
         `—— 平账即零余量，要加必须指名替换（arg_pages_phase2.md §2.4）`);
  }

  /* HB-3 / AB-1：安全区页面恒 H=0，任何席位不得指向它 */
  const zero = H.zeroHorrorPaths || [];
  seats.forEach(function (s) {
    const p = s.probe && s.probe.path;
    if (p && zero.indexOf(p) >= 0) {
      fail(`[HB-3 安全区] 席位 ${s.id} 指向 ${p} —— /about 恐怖预算恒为 0，一个 B 类都不许放`);
    }
  });

  /* 台账 ↔ 现实 防漂移探针：
     页面建了却忘了翻 status（或反过来）会让台账变成一张废纸。 */
  let planned = 0, built = 0;
  seats.forEach(function (s) {
    const pr = s.probe || { type: 'none' };
    const isBuilt = s.status === 'built';
    if (isBuilt) built++; else planned++;

    if (pr.type === 'path') {
      const exists = fs.existsSync(path.join(ROOT, pr.path));
      if (isBuilt && !exists) {
        fail(`[台账漂移] 席位 ${s.id} 标记 built，但页面不存在：${pr.path}`);
      }
      if (!isBuilt && exists) {
        fail(`[台账漂移] 页面 ${pr.path} 已创建，但席位 ${s.id} 仍标 planned ` +
             `—— 请在 tests/phase2_ledger.js 翻为 built 并填巡检寄存器`);
      }
    } else if (pr.type === 'content') {
      const abs = path.join(ROOT, pr.path);
      const hit = fs.existsSync(abs) &&
                  fs.readFileSync(abs, 'utf8').indexOf(pr.marker) >= 0;
      if (isBuilt && !hit) {
        fail(`[台账漂移] 席位 ${s.id} 标记 built，但 ${pr.path} 内未见落地标记「${pr.marker}」`);
      }
      if (!isBuilt && hit) {
        fail(`[台账漂移] ${pr.path} 已出现落地标记「${pr.marker}」，但席位 ${s.id} 仍标 planned`);
      }
    }
  });

  /* ── 全局天花板 ── */
  let aAll = 0, bAll = 0;
  for (const k in tally) { aAll += tally[k].A; bAll += tally[k].B; }
  const cap = H.ceiling;
  if (aAll > cap.A_max) fail(`恐怖预算超支：全局 A 类 ${aAll} > 天花板 ${cap.A_max}`);
  if (bAll > cap.B_max) fail(`恐怖预算超支：全局 B 类 ${bAll} > 天花板 ${cap.B_max}`);

  note(`恐怖预算（Phase 2 · 2a 段占位登记）：A ${a2a}/${p2.A_max} · B ${b2a}/${p2.B_max}` +
       `（planned ${planned} · built ${built}）`);
  note(`恐怖预算（全局天花板 A4/B38）：A ${aAll}/${cap.A_max} · B ${bAll}/${cap.B_max} ` +
       `· 余量 A ${cap.A_max - aAll} · B ${cap.B_max - bAll}（留给 2b/2c/§2做深/桌面壳）`);
}

/* ── ⑪ X-5 反 DRY：地层之间禁共享资源 ────────────────────────────────
   X-5 原文："汽水屋不得引用主站的任何 CSS/JS/字体文件，不得使用 sudu_
   前缀，不得走主站路由器。宁可复制粘贴 CSS。"
   > 在 ARG 里，DRY 是穿帮源。一次 view-source: 当场穿帮。

   两条巡检：
     (a) 资源引用面：<link> / <script src> / CSS @import / url() 跨地层 = fail。
         ⚠️ <iframe src> 与 <a href> 【放行】—— 物理隔离本来就靠 iframe，
            地层之间的跳转是叙事，不是资源共享。
     (b) 命名前缀面：era 地层（qsw/soda/xk）内出现素读/桌面壳前缀 = fail。
         单向纪律，理由见 phase2_ledger.js STRATA 注释。            */
function checkStrataIsolation(files) {
  /* 未登记地层守卫：新开一个顶层目录却没登记，后续所有巡检都会漏掉它。 */
  const unreg = new Set();
  files.forEach(function (f) {
    const rel = relOf(f);
    if (!strataOf(rel)) unreg.add(rel.slice(0, rel.indexOf('/')));
  });
  unreg.forEach(function (d) {
    fail(`[X-5 地层未登记] 顶层目录 "${d}/" 不在 phase2_ledger.js 的 STRATA 表内 ` +
         `—— 未登记的地层不会被反 DRY / 年代窗口巡检覆盖，请先登记`);
  });

  /* (a) 跨地层资源引用 */
  const REFS = [
    { ext: '.html', re: /<link\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>/gi, what: '<link>' },
    { ext: '.html', re: /<script\b[^>]*?src\s*=\s*["']([^"']+)["']/gi, what: '<script src>' },
    { ext: '.css', re: /@import\s+(?:url\(\s*)?["']([^"']+)["']/gi, what: '@import' },
    { ext: '.css', re: /url\(\s*["']?([^"')]+)["']?\s*\)/gi, what: 'url()' },
  ];

  files.forEach(function (f) {
    const rel = relOf(f);
    const mine = strataOf(rel);
    if (!mine) return;
    const ext = path.extname(f).toLowerCase();
    const txt = fs.readFileSync(f, 'utf8');

    REFS.forEach(function (r) {
      if (r.ext !== ext) return;
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(txt)) !== null) {
        const target = resolveLink(rel, m[1]);
        if (target === null) continue;                 // 站外 / data: / 锚点
        if (/^\.\./.test(target)) continue;            // 越出仓库根，交由死链巡检
        const theirs = strataOf(target);
        if (theirs && theirs.id !== mine.id) {
          const line = txt.slice(0, m.index).split('\n').length;
          fail(`[X-5 反DRY] ${mine.label} 的 ${rel}:L${line} 通过 ${r.what} 引用了 ` +
               `${theirs.label} 的资源 "${m[1]}" —— 地层间禁共享 CSS/JS/字体，` +
               `请复制一份到本地层（物理隔离靠 iframe，不靠复用）`);
        }
        if (m.index === r.re.lastIndex) r.re.lastIndex++;
      }
    });

    /* (b) 命名前缀泄漏 */
    (mine.foreignPrefixes || []).forEach(function (pfx) {
      /* 锚定标识符起始：前一个字符不能是字母/数字/下划线。
         否则 refresh_rule → 误判 sh_、sd_b6_qsw_seen → 误判 qsw_。 */
      const re = new RegExp('(^|[^A-Za-z0-9_])' + pfx.replace(/_/g, '_'), 'g');
      let m, at = [];
      while ((m = re.exec(txt)) !== null) {
        at.push('L' + txt.slice(0, m.index).split('\n').length);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      if (at.length) {
        fail(`[X-5 前缀泄漏] ${mine.label} 的 ${rel} 出现外层前缀 "${pfx}" ` +
             `${at.length} 处 (${at.slice(0, 5).join(', ')}) —— 本地层应使用 ` +
             `${(mine.ownPrefixes || []).join(' / ')}`);
      }
    });
  });

  /* 跳过登记：让主理人在 CI 日志里看得见"哪些地层还没建" */
  const pending = LEDGER.STRATA.filter(function (s) { return !strataExists(s); })
                               .map(function (s) { return s.roots.join('|'); });
  note(`X-5 反DRY 巡检：已登记地层 ${LEDGER.STRATA.length} 个` +
       (pending.length ? `，尚未创建 ${pending.length} 个（${pending.join(', ')}）—— 优雅跳过` : ''));
}

/* ── ⑫ X-2 跨页年代窗口（D-2）────────────────────────────────────────
   2026 地层（素读 / 桌面壳）：绝对日期一个都不许有 —— 她只说相对时间。
   era 地层（2011 汽水屋 / 2019 镜像者）：可以有绝对日期，
   但年份必须落在自己的年代窗口内，否则就是穿帮（一个 2015 年的
   回帖出现在 2013 就关站的论坛上，ARG 玩家会数）。

   扫描面 = 静态页的【屏显面】（html 可见文本 + title + meta description，
   以及裸渲染的 .txt）。刻意不扫 js/css 源码 —— 那里的 2000 是 setTimeout
   毫秒数、2026 是注释里的 X-2 危险品警告，全是假阳性。
   主对话渲染面的 X-2 由 checkNodes() 另行把关，两者互补不重叠。      */
function htmlSurface(txt) {
  let t = txt;
  const extra = [];
  /* meta description 会出现在标签页/分享卡，算屏显面 */
  t.replace(/<meta\b[^>]*>/gi, function (m) {
    if (/name\s*=\s*["'](?:description|og:description)["']/i.test(m)) {
      const c = /content\s*=\s*["']([^"']*)["']/i.exec(m);
      if (c) extra.push(c[1]);
    }
    return m;
  });
  t = t.replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<script\b[\s\S]*?<\/script>/gi, ' ');
  t = t.replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  t = t.replace(/<[^>]+>/g, ' ');
  return t + ' ' + extra.join(' ');
}

function checkCrossPageDates(files) {
  const YEAR = /\b(19|20)\d{2}\b/g;
  const DATEISH = /\b(?:19|20)\d{2}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}/;
  let scanned = 0;

  files.forEach(function (f) {
    const rel = relOf(f);
    const ext = path.extname(f).toLowerCase();
    if (ext !== '.html' && ext !== '.txt') return;
    const st = strataOf(rel);
    if (!st) return;

    const raw = fs.readFileSync(f, 'utf8');
    const surface = ext === '.html' ? htmlSurface(raw) : raw;
    scanned++;

    YEAR.lastIndex = 0;
    const hits = [];
    let m;
    while ((m = YEAR.exec(surface)) !== null) hits.push(m[0]);
    if (!hits.length) return;

    if (!st.allowDates) {
      const dated = DATEISH.test(surface);
      fail(`[X-2 跨页] ${st.label} 的静态页 ${rel} 屏显面出现绝对年份` +
           `${dated ? '/日期串' : ''}：${[...new Set(hits)].slice(0, 4).join(', ')} ` +
           `—— 2026 地层只用相对时间，绝对日期属论坛地层`);
      return;
    }
    const bad = [...new Set(hits)].filter(function (y) {
      return st.allowYears.indexOf(parseInt(y, 10)) < 0;
    });
    if (bad.length) {
      fail(`[D-2 年代窗口] ${st.label} 的 ${rel} 出现窗口外年份：${bad.join(', ')} ` +
           `—— 本地层允许 ${Math.min.apply(null, st.allowYears)}–` +
           `${Math.max.apply(null, st.allowYears)}`);
    }
  });
  note(`X-2 跨页年代窗口：已扫静态页屏显面 ${scanned} 个`);
}

/* ── ⑬ D-3 死链巡检 ──────────────────────────────────────────────────
   判据不是"没有死链"，而是"每一条死链都是【故意的】死链"。
   故意的登记进 phase2_ledger.INTENTIONAL_DEAD_LINKS；没登记的就是忘了做。 */
function checkDeadLinks(files) {
  const white = LEDGER.INTENTIONAL_DEAD_LINKS || [];
  const ATTR = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
  let checked = 0, intentional = 0;

  files.forEach(function (f) {
    if (path.extname(f).toLowerCase() !== '.html') return;
    const rel = relOf(f);
    const txt = fs.readFileSync(f, 'utf8');
    /* 注释里的示例链接不算引用 */
    const body = txt.replace(/<!--[\s\S]*?-->/g, ' ');

    ATTR.lastIndex = 0;
    let m;
    while ((m = ATTR.exec(body)) !== null) {
      const raw = m[1];
      const target = resolveLink(rel, raw);
      if (m.index === ATTR.lastIndex) ATTR.lastIndex++;
      if (target === null) continue;
      checked++;

      if (/^\.\./.test(target)) {
        fail(`[D-3 死链] ${rel} 的 "${raw}" 越出仓库根 —— 产物内无此文件`);
        continue;
      }
      const abs = path.join(ROOT, target);
      let ok = false;
      if (fs.existsSync(abs)) {
        ok = fs.statSync(abs).isDirectory()
          ? fs.existsSync(path.join(abs, 'index.html'))
          : true;
      }
      if (ok) continue;

      const listed = white.some(function (w) { return w.from === rel && w.to === raw; });
      if (listed) { intentional++; continue; }
      fail(`[D-3 死链] ${rel} → "${raw}" 指向不存在的文件（解析为 ${target || '/'}）` +
           ` —— 若是【故意的】死链，请登记到 phase2_ledger.INTENTIONAL_DEAD_LINKS`);
    }
  });
  note(`D-3 死链巡检：已核 ${checked} 条站内引用` +
       (intentional ? `，其中 ${intentional} 条为已登记的故意死链` : '，0 条死链'));
}

/* ── ⑭ Gap-1 防漂移：deploy.yml 必须是通配发布形态 ────────────────────
   Phase 2 新建的 /qsw/ /soda/ /about 等目录，只有在 deploy.yml 通配发布
   之后才会真的进 gh-pages。这条巡检把"发布清单"钉死在 J-9 门禁里：
   谁把它改回硬编码清单，部署当场被自己的门禁拦下。                   */
function checkDeployManifest() {
  const p = path.join(ROOT, '.github', 'workflows', 'deploy.yml');
  if (!fs.existsSync(p)) { fail('[Gap-1] 未找到 .github/workflows/deploy.yml'); return; }
  const y = fs.readFileSync(p, 'utf8');

  if (/cp\s+index\.html\s+save\.html/.test(y)) {
    fail('[Gap-1 回归] deploy.yml 又出现硬编码发布清单（cp index.html save.html …）' +
         ' —— Phase 2 新目录会进不了 gh-pages，玩家访问即 404');
  }
  if (!/publish_dir:\s*\.\/publish/.test(y)) {
    fail('[Gap-1] deploy.yml 的 publish_dir 不是 ./publish');
  }
  if (y.indexOf('.nojekyll') < 0) {
    fail('[Gap-1] deploy.yml 未生成 .nojekyll —— 下划线目录会被 Jekyll 吞掉');
  }

  /* 排除清单必须与 ledger 一致：漏排 tests/ = 谜底哈希上线 */
  LEDGER.PUBLISH_EXCLUDE_DIRS.forEach(function (d) {
    const re = new RegExp("--exclude=['\"]?\\.?/?" + d.replace(/\./g, '\\.') + '\\b');
    if (!re.test(y)) {
      fail(`[Gap-1] deploy.yml 未排除 "${d}/" —— 与 phase2_ledger.PUBLISH_EXCLUDE_DIRS 不一致`);
    }
  });
  LEDGER.PUBLISH_EXCLUDE_GLOBS.forEach(function (g) {
    if (y.indexOf(g) < 0) fail(`[Gap-1] deploy.yml 未排除 "${g}"`);
  });
  /* 向后兼容：必需件必须在产物校验步骤里被点名 */
  LEDGER.PUBLISH_REQUIRED.forEach(function (n) {
    if (y.indexOf(n) < 0) {
      fail(`[Gap-1] deploy.yml 的产物校验未点名必需项 "${n}" —— 排除清单写太宽会把主站排没`);
    }
  });
  note(`Gap-1 发布清单：deploy.yml 为通配发布形态，排除 ` +
       `${LEDGER.PUBLISH_EXCLUDE_DIRS.length} 个目录 + ${LEDGER.PUBLISH_EXCLUDE_GLOBS.join('/')}，` +
       `必需件 ${LEDGER.PUBLISH_REQUIRED.length} 项已点名`);
}

/* ── 主流程 ──────────────────────────────────────────────────────────── */
function main() {
  const files = [];
  walk(ROOT, files);
  note('扫描部署文件 ' + files.length + ' 个');

  const sandbox = loadSandbox();
  const SD_DATA = sandbox.SD_DATA;

  scanAbsolutePaths(files);             // ⑨ GH Pages 子路径安全（资源引用面，无需 SD_DATA）

  /* ARG-BUILD-09 · Phase 2 全站覆盖（INS-2）—— 均不依赖 SD_DATA，
     且对尚未创建的 Phase 2 目录优雅跳过。 */
  checkDeployManifest();                // ⑭ Gap-1 发布清单防漂移
  checkStrataIsolation(files);          // ⑪ X-5 反 DRY（资源引用 + 命名前缀）
  checkCrossPageDates(files);           // ⑫ X-2 / D-2 跨页年代窗口
  checkDeadLinks(files);                // ⑬ D-3 死链

  if (!SD_DATA) { fail('无法加载 window.SD_DATA（data/sd_slice.js）'); }
  else {
    scanFilesMeta(files, SD_DATA);      // ① 元层禁词（分面）+ ⑤ 明文（文件级）
    scanRendered(extractRendered(SD_DATA));   // ②–④ 屏显红线（渲染面）
    checkBudgetAndGraph(SD_DATA);
    checkPhase2Budget(SD_DATA);                // ⑩ Phase 2 预算分区台账（2a 占位登记）
    checkNodes(SD_DATA);                       // §9 节点存在性 + 字段 + 明文纪律 + X-2
    checkDualWriteNotice(SD_DATA);             // DX-02 双写点（404.html ↔ footer_notice）
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
