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
     为第二起点，SD-001…SD-090 整链因此可达（与运行期行为镜像）。
     Wave 3（ARG-DIALOGUE-REV）：SO-* 开场（tags:['opening']，MVP-1）与
     SC-PAUSE-* 中断点（pause_hooks 值，MVP-6）同族补种子 —— 引擎通用
     机制进入，不写死具体 ID。 */
  nodes.forEach(function (n) {
    if ((n.tags || []).indexOf('arc_entry') >= 0) stack.push(n.id);
    if ((n.tags || []).indexOf('opening') >= 0) stack.push(n.id);
  });
  const ph = (SD_DATA && SD_DATA.pause_hooks) || {};
  Object.keys(ph).forEach(function (k) { if (ph[k]) stack.push(ph[k]); });
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
  /* 孤儿检测：puzzle_hint 节点由谜题提示阶梯注入，不在静态可达链上，放行；
     SF-* 节点由投喂引擎插播（marker 的 sf_reactions 引用），同样不在
     静态可达链上（FM-1：链结构永不因投喂改变）—— 两者同属放行类。 */
  nodes.forEach(function (n) {
    if (reach.has(n.id)) return;
    if ((n.tags || []).indexOf('puzzle_hint') >= 0) {
      note('节点 ' + n.id + '：puzzle_hint，由提示阶梯注入（不在静态可达链），放行');
      return;
    }
    if (/^SF-/.test(n.id || '')) {
      note('节点 ' + n.id + '：SF-*，由投喂引擎插播（sf_reactions 引用，不在静态可达链），放行');
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

  /* ARG-BUILD-11：/about 是零 JS 的安全区，A2 声明同样写死在 HTML 里。
     于是这条双写点升级为【三写点】—— 玩家最可能去核对"这是不是真的"
     的那一页，绝不能是三份里最旧的那一份。 */
  const ap = path.join(ROOT, 'about', 'index.html');
  if (!fs.existsSync(ap)) { note('DX-02 三写点：about/index.html 尚未创建，跳过'); return; }
  const at = fs.readFileSync(ap, 'utf8').replace(/<!--[\s\S]*?-->/g, ' ');
  if (at.indexOf(footer) < 0) {
    fail('DX-02 三写点：about/index.html 的 A2 声明与 footer_notice 不一致（改一处漏一处）');
  } else {
    note('DX-02 三写点：about/index.html 的 A2 声明与 footer_notice 逐字一致');
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

  /* ── 静态分区 ──────────────────────────────────────────────────────
     p2_2a  = Phase 2 · 2a 段（占位登记）
     shell  = ARG-BUILD-11 桌面壳（S17 追加 B+4）
     两段规则完全同构，故走同一段逻辑；新增分区只需在台账里加一项。 */
  const zero = H.zeroHorrorPaths || [];
  const STATIC_PARTS = [H.p2_2a, H.shell].filter(Boolean);
  const partStat = {};

  STATIC_PARTS.forEach(function (p2) {
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

    partStat[p2.id] = { a: a2a, b: b2a, planned: planned, built: built, def: p2 };
  });

  /* ── 全局天花板 ── */
  let aAll = 0, bAll = 0;
  for (const k in tally) { aAll += tally[k].A; bAll += tally[k].B; }
  const cap = H.ceiling;
  if (aAll > cap.A_max) fail(`恐怖预算超支：全局 A 类 ${aAll} > 天花板 ${cap.A_max}`);
  if (bAll > cap.B_max) fail(`恐怖预算超支：全局 B 类 ${bAll} > 天花板 ${cap.B_max}`);

  STATIC_PARTS.forEach(function (p) {
    const st = partStat[p.id];
    if (!st) return;
    note(`恐怖预算（${p.label}）：A ${st.a}/${p.A_max} · B ${st.b}/${p.B_max}` +
         `（planned ${st.planned} · built ${st.built}）`);
  });
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

/* ══════════════════════════════════════════════════════════════════════
   ⑮ ARG-BUILD-11 · 本机（设备壳层）红线
   ══════════════════════════════════════════════════════════════════════
   四条断言，逐条对应任务书里点名的硬红线：
     (A) R5 视觉纪律      —— 电子纸/工业手持终端，加法必须先被这里拦下
     (B) X-5 / BR-3 隔离  —— 裸开 /qsw/ 零 sh_ 字符、零握手
     (C) 素读图标恒可见   —— 那一条永远不许变成"待解锁"
     (D) SH-6 标题栏无人名 + X-9 桥接白名单 + SH-7 单键
   共同纪律：文件不存在即优雅跳过（与 Phase 2 巡检一致）。            */

const SH_CSS = 'sh_main.css';
const SH_JS = ['sh_main.js', 'sh_clock.js', 'sh_fm.js', 'sh_bridge.js'];

function readIf(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}
function stripCss(t) { return t.replace(/\/\*[\s\S]*?\*\//g, ' '); }
function stripJs(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
}

/* ── (A) R5 视觉纪律 ────────────────────────────────────────────────
   这台机器的可信度全靠"没人给它做过视觉设计"。
   一个圆角、一层阴影、一个渐变，它立刻变回一个 UI 作品。
   所以纪律写成可执行断言，而不是写在文档里靠自觉。            */
function checkShellVisual() {
  const raw = readIf(SH_CSS);
  if (raw === null) { note(`R5 视觉纪律：${SH_CSS} 不存在，优雅跳过`); return; }
  const css = stripCss(raw);

  const BAN = [
    [/border-radius/i,               'R5 全直角：不许圆角'],
    [/box-shadow/i,                  'R5 不许投影'],
    [/backdrop-filter/i,             'R5 不许毛玻璃'],
    [/filter\s*:\s*blur/i,           'R5 不许模糊'],
    [/@font-face/i,                  'R5 零字体文件'],
    [/url\s*\(/i,                    'R5 无壁纸位图：本文件 url() 数量必须恒为 0（噪点走 HTML 内联 svg）'],
    [/grid-template-columns/i,       'R5 图标区是竖排单列列表，不是网格'],
    [/flex-direction\s*:\s*row/i,    'R5 图标区不许横排'],
    [/@keyframes|animation\s*:/i,    'R5 无动画'],
    [/transform\s*:/i,               'R5 无位移 / 缩放'],
    [/cubic-bezier|ease/i,           'R5 动效仅允许 ≤100ms 的 opacity 硬切（linear）'],
  ];
  BAN.forEach(function (b) {
    if (b[0].test(css)) {
      const line = css.slice(0, css.search(b[0])).split('\n').length;
      fail(`[R5 视觉] ${SH_CSS}:L${line} 违反「${b[1]}」`);
    }
  });

  /* ── ① 渐变预算（原为硬禁 · 美术方向 v2 §16.2 · 批 1）────────────────
     壁纸斜纹 / 屏幕暗角这两层是"一块正在发光的旧屏幕"的
     全部氛围来源，而它们的零位图实现路径只有 gradient 一条 —— 换位图
     会同时撞上上面的 url() 断言和 0 元资产预算。所以不是解禁，是改成预算：
       · 出现总数 ≤4（repeating-linear / radial 各计 1；噪点是内联 SVG，不计）
       · 只允许出现在两个氛围层的规则块里（GRAD_OK）
     控件填充 / 按钮 / 标题栏一律不许用渐变 —— 那才是"UI 作品"的味道。
     想加第四个渐变层？先来改这条断言，别在 CSS 里偷偷加。            */
  const GRAD_MAX = 4;
  const GRAD_OK = ['.sh-wall', '.sh-wall::before', '.sh-vig'];
  const RULE = /([^{}]*)\{([^{}]*)\}/g;
  let gradTotal = 0, rm;
  const gradBad = [];
  while ((rm = RULE.exec(css)) !== null) {
    const n = (rm[2].match(/gradient/gi) || []).length;
    if (!n) continue;
    gradTotal += n;
    const sel = rm[1].split(';').pop().trim().replace(/\s+/g, ' ');
    if (GRAD_OK.indexOf(sel) < 0) gradBad.push(sel || '(匿名规则)');
  }
  if (gradBad.length) {
    fail(`[R5 视觉] ${SH_CSS} 渐变仅限氛围两层（壁纸 / 暗角），` +
         `禁止用于控件填充 —— 越界选择器：${[...new Set(gradBad)].join(' , ')}`);
  }
  if (gradTotal > GRAD_MAX) {
    fail(`[R5 视觉] ${SH_CSS} 渐变声明数 ${gradTotal} > ${GRAD_MAX} —— 氛围是预算，不是装饰`);
  } else {
    note(`[R5 视觉] 渐变预算 ${gradTotal}/${GRAD_MAX}，全部落在 ${GRAD_OK.join(' / ')} 内`);
  }

  /* ── ② 色板白名单 3 → 20 + ③ 扫描范围扩到 rgb() / rgba() ─────────────
     20 色 = 美术方向 v2 §4.3，壳层 17 色 + 批 1 补入的三色
     （#0c1210 暗角终点 / #141a18 硬投影 / #4a4740 高对比次级字）。
     白名单本身不许取消 —— 取消了这台机器第二天就会有第 21 个颜色。
     同时补一个真实存在的洞：原实现只认 #hex，`rgba(12,18,16,.16)`
     这类写法可以直接绕过白名单（扫描线的基色恰好就是这么写的）。
     现在 rgb()/rgba() 归一化成 hex 一起比对；hsl()/lab()/oklch() 等
     无法静态归一的写法直接判违规，免得下次换个记法又绕过去。       */
  const ALLOW = [
    '#20302c', '#2a3a35', '#beb9aa', '#e4dfd1', '#7c776b', '#3b372f',
    '#2e4a44', '#e8e4d6', '#8a867a', '#d4d0c4',
    '#16171a', '#6e6a5f', '#c6c1b2',
    '#efeee9', '#191a1c', '#8d8c86',
    '#c88a3c',
    '#0c1210', '#141a18', '#4a4740'
  ];
  const lits = (css.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map(function (s) { return s.toLowerCase(); });
  (css.match(/\brgba?\([^)]*\)/gi) || []).forEach(function (fn) {
    const n = (fn.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    if (n.length < 3 || n.some(function (x) { return !isFinite(x); })) { lits.push(fn); return; }
    lits.push('#' + n.map(function (x) {
      return ('0' + Math.round(x).toString(16)).slice(-2);
    }).join(''));
  });
  const EXOTIC = css.match(/\b(?:hsla?|hwb|lab|lch|oklab|oklch|color)\s*\(/gi) || [];
  if (EXOTIC.length) {
    fail(`[R5 视觉] ${SH_CSS} 出现无法静态归一的颜色写法：${[...new Set(EXOTIC)].join(' ')} ` +
         `—— 桌面壳只许 #hex 与 rgb()/rgba()，否则白名单形同虚设`);
  }
  const bad = [...new Set(lits)].filter(function (h) { return ALLOW.indexOf(h) < 0; });
  if (bad.length) {
    fail(`[R5 视觉] ${SH_CSS} 出现白名单外的颜色：${bad.join(', ')} ` +
         `—— 只允许美术方向 v2 §4.3 的 ${ALLOW.length} 色`);
  } else {
    note(`[R5 视觉] 颜色白名单：${new Set(lits).size} 个字面量（含 rgb/rgba 归一）全部在 ${ALLOW.length} 色内`);
  }

  /* 转场时长：> 100ms 就有了"动效设计"的味道 */
  (css.match(/transition[^;}]*/g) || []).forEach(function (d) {
    const ms = /(\d+(?:\.\d+)?)\s*ms/.exec(d);
    const s = /(\d+(?:\.\d+)?)\s*s(?![a-z])/.exec(d);
    const v = ms ? parseFloat(ms[1]) : (s ? parseFloat(s[1]) * 1000 : 0);
    if (v > 100) fail(`[R5 视觉] ${SH_CSS} 转场 ${v}ms > 100ms：「${d.trim()}」`);
  });

  /* 竖排单列：条目必须是块级堆叠 */
  if (!/\.sh-item\s*\{[^}]*display\s*:\s*block/.test(css)) {
    fail(`[R5 视觉] ${SH_CSS} 的 .sh-item 未声明 display:block —— 竖排单列列表是 R5 的核心形态`);
  }

  /* AS-7（V-R4）：桌面主容器 CSS 的 transition 声明数 ≤3。
     桌面壳只有 ≤100ms opacity 硬切这类转场；3 条是上限，再多个
     新转场就必须先砍掉旧的 —— 动效是预算，不是装饰。 */
  const transCount = (css.match(/transition\s*:/g) || []).length;
  if (transCount > 3) {
    fail(`[AS-7] ${SH_CSS} 的 transition 声明数 ${transCount} > 3（V-R4 动效预算）`);
  } else {
    note(`[AS-7] ${SH_CSS} transition 声明数 ${transCount} ≤ 3（V-R4 动效预算）`);
  }
  note(`R5 视觉纪律：${SH_CSS} 通过（0 圆角 / 0 投影 / 0 字体文件 / 0 url() / 竖排单列 ` +
       `/ 渐变限额 ≤${GRAD_MAX} 且仅氛围三层 / 色板 ${ALLOW.length} 色含 rgb·rgba 归一）`);
}

/* ── (B) X-5 / BR-3 物理隔离 ────────────────────────────────────────
   判据极硬且极好验：裸开 /qsw/，源码里一个 sh_ 都不许有，
   也不许出现任何朝外说话的动作。归档是一份 2011 年的死镜像 ——
   它不知道自己正被谁打开，这份无知就是隔离本身。               */
function checkShellIsolation(files) {
  const HANDSHAKE = /(?:window|self|globalThis|parent|top)\s*\.\s*(?:parent|top)\b|\bpostMessage\s*\(|\bwindow\s*\.\s*parent\b/;
  let scanned = 0, qswScanned = 0;

  files.forEach(function (f) {
    const rel = relOf(f);
    const ext = path.extname(f).toLowerCase();
    if (ext !== '.html' && ext !== '.js' && ext !== '.css' && ext !== '.txt') return;
    const inQsw = /^qsw\//.test(rel);
    const inAbout = /^about\//.test(rel);
    const isSave = rel === 'save.html';
    if (!inQsw && !inAbout && !isSave) return;

    const txt = fs.readFileSync(f, 'utf8');
    scanned++;

    if (inQsw) {
      qswScanned++;
      const re = /(^|[^A-Za-z0-9_])sh_/g;
      let m, at = [];
      while ((m = re.exec(txt)) !== null) {
        at.push('L' + txt.slice(0, m.index).split('\n').length);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      if (at.length) {
        fail(`[X-5 裸开判据] ${rel} 出现 "sh_" ${at.length} 处 (${at.slice(0, 5).join(', ')}) ` +
             `—— 裸开 /qsw/ 必须零 sh_ 字符、零指向 sh_* 的请求`);
      }
    }

    if (HANDSHAKE.test(stripJs(txt))) {
      const line = txt.slice(0, txt.search(HANDSHAKE)).split('\n').length;
      fail(`[BR-3 握手越权] ${rel}:L${line} 触碰了 window.parent / window.top / postMessage ` +
           `—— 只有 /sd/（经 sh_bridge.js）可以与本机握手，其余页面一律不得`);
    }
  });
  note(`X-5 / BR-3 隔离：已扫 ${scanned} 个 app 侧文件（其中 /qsw/ ${qswScanned} 个），` +
       `裸开判据与握手禁令均成立`);
}

/* ── (C) 素读图标恒可见 ─────────────────────────────────────────────
   这一条不是 UI 细节，是整台设备的信任基线：
   玩家任何时候回到第一屏，那个入口都必须在原地、可点、有名字。
   一旦它会消失/变灰/需要解锁，这台机器就变成了一个游戏关卡。   */
function checkShellHome() {
  const html = readIf('index.html');
  if (html === null) { note('素读入口恒可见：index.html 不存在，优雅跳过'); return; }
  const body = html.replace(/<!--[\s\S]*?-->/g, ' ');

  if (!/data-sh-item\s*=\s*["']sd["']/.test(body)) {
    fail('[本机第一屏] index.html 未静态包含 data-sh-item="sd" —— 素读入口必须写死在 HTML 里，不许由脚本生成');
  }
  if (!/data-sh-open\s*=\s*["']sd["']/.test(body)) {
    fail('[本机第一屏] index.html 的素读条目不可点（缺 data-sh-open="sd"）');
  }
  if (!/素读/.test(body)) {
    fail('[本机第一屏] index.html 未渲染「素读」标签 —— 入口必须恒有名字（不许是空槽）');
  }
  /* 空槽（渐进具名）只允许出现在存档那一条 */
  const slots = body.match(/data-sh-slot\s*=\s*["']([^"']+)["']/g) || [];
  slots.forEach(function (s) {
    if (!/["']save["']/.test(s)) {
      fail(`[SH-B1 越界] index.html 出现存档以外的空槽 ${s} —— v1 只有存档条目会被渐进具名`);
    }
  });

  const css = readIf(SH_CSS);
  if (css && /\[data-sh-item\s*=\s*["']sd["']\][^{]*\{[^}]*display\s*:\s*none/.test(stripCss(css))) {
    fail(`[本机第一屏] ${SH_CSS} 存在隐藏素读条目的规则 —— 它任何时候都不许消失`);
  }
  note(`素读入口恒可见：index.html 静态条目 + 可点 + 有名字，空槽仅限存档（${slots.length} 处）`);
}

/* ── (D) SH-6 标题栏 / X-9 桥接白名单 / SH-7 单键 ───────────────────
   SH-6 的真正风险不是"写错字"，而是"某天有人图省事，
   把子页传上来的字符串直接塞进标题栏" —— 那一刻人名就会上去。
   所以断言钉的是【数据通路】，不是文案。                        */
function checkShellBridge() {
  const WHITE = ['title_request', 'clock_sync', 'open_window'];
  let present = 0;

  SH_JS.forEach(function (rel) {
    const raw = readIf(rel);
    if (raw === null) return;
    present++;
    const src = stripJs(raw);

    /* SH-6：本机侧不许出现任何人名字段 */
    [['name_given', '玩家名'], ['\\bnick\\b', '昵称'], ['千绘', '角色名']].forEach(function (p) {
      const re = new RegExp(p[0]);
      if (re.test(src)) {
        fail(`[SH-6] ${rel} 引用了${p[1]}字段/字面量 —— 本机侧（含标题栏）永不渲染人名`);
      }
    });

    /* X-9：桥接消息名必须在白名单内 */
    const msgs = [];
    let m;
    const reMsg = /\bt\s*(?::|===|==)\s*['"]([a-z_]+)['"]/g;
    while ((m = reMsg.exec(src)) !== null) msgs.push(m[1]);
    [...new Set(msgs)].forEach(function (t) {
      if (WHITE.indexOf(t) < 0) {
        fail(`[X-9 桥接白名单] ${rel} 出现协议外消息 "${t}" —— 只允许 ${WHITE.join(' / ')}`);
      }
    });

    /* BR-2：桥接载荷禁含 "<"（两头都要校验） */
    if (/postMessage/.test(src) && !/indexOf\('<'\)|indexOf\("<"\)/.test(src)) {
      fail(`[BR-2] ${rel} 会 postMessage 却未见 "<" 过滤 —— 载荷禁含标签字符，两头都要挡`);
    }

    /* SH-7：只允许 sudu_save_v1 这一个键 */
    const reKey = /localStorage\s*\.\s*(?:get|set|remove)Item\s*\(\s*(['"])([^'"]*)\1/g;
    while ((m = reKey.exec(src)) !== null) {
      if (m[2] !== 'sudu_save_v1') {
        fail(`[SH-7] ${rel} 使用了额外的 localStorage 键 "${m[2]}" —— 全站只允许 sudu_save_v1`);
      }
    }
    if (/localStorage/.test(src) && /KEY\s*=/.test(src) && !/KEY\s*=\s*'sudu_save_v1'/.test(src)) {
      fail(`[SH-7] ${rel} 的存档键常量不是 'sudu_save_v1'`);
    }
  });

  if (!present) { note('本机桥接巡检：sh_*.js 尚未创建，优雅跳过'); return; }

  /* 标题栏只许由固定 app 名表驱动 —— 这是 SH-6 的执行面 */
  const main = readIf('sh_main.js');
  if (main !== null) {
    const src = stripJs(main);
    const hits = src.match(/titleEl\s*\.\s*textContent\s*=[^;]+/g) || [];
    if (!hits.length) {
      fail('[SH-6] sh_main.js 未见标题栏写入点 —— 无法验证标题来源');
    }
    hits.forEach(function (h) {
      if (!/barText\s*\(/.test(h)) {
        fail(`[SH-6] sh_main.js 标题栏被非 barText() 的来源写入：「${h.trim().slice(0, 60)}」 ` +
             `—— 标题栏只能取固定 app 名表，绝不能直接落桥接来的字符串`);
      }
    });
    if (!/function\s+fromSd\s*\(|fromSd\s*\(ev\)/.test(src)) {
      fail('[BR-4] sh_main.js 未见发件人校验（fromSd）—— 只有素读那个 iframe 可以握手');
    }
  }
  note(`本机桥接巡检：${present} 个 sh_*.js 通过（X-9 白名单三条 / BR-2 "<" 过滤 / BR-4 发件人校验 / SH-6 标题栏来源 / SH-7 单键）`);
}

/* ── (E) 可解析性：每个投产 JS 都必须真的能被解析 ───────────────────────
   血的教训（BUILD-11 实战）：sh_fm.js 里一个块注释被提前闭合（正文中间
   多了一个结束符），后面几行中文注释直接变成裸语句 —— 整个文件报废，
   "文件"和"归档"两个
   功能一起变白板。而本文件此前所有断言【全部通过】：它们读的是源码字符串，
   字符串里该有的标记一个不少，只是这份源码根本跑不起来。

   静态扫描永远看不见这种错。所以在这里补一道最基础的门：能不能解析。
   用 new Function 而非 require —— 不执行任何一行，只走解析器。      */
function checkParsable(files) {
  const skip = /[\\/](tests|_wip|tools)[\\/]/;
  const js = files.filter((f) => f.endsWith('.js') && !skip.test(f));
  let bad = 0;
  js.forEach(function (f) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch (e) { return; }
    try {
      new Function(src);                 // 只解析，不执行
    } catch (e) {
      bad++;
      fail(`[语法] ${rel} 无法解析：${e.message} ` +
           `—— 该文件在浏览器里会整体报废，其上所有静态断言都是假绿`);
    }
  });
  if (!bad) note(`JS 可解析性：${js.length} 个投产脚本全部通过解析器（静态断言的地基）`);
}

/* ── (F) CF-4 / AS-9：FR-A 首启三行 + FR-B 窗口一行 的专用标志 ──────
   ARG-BUILD-12 组1 的硬约束：
     · 新增布尔 framing_seen / framing_window_seen 落在 sudu_save_v1.shell
       （不新增 localStorage 键，SH-7）
     · FR-A/FR-B 判定【不依赖】booted_at 的"为空"语义 / win_state.sd 的
       "未 open"语义（CF-4：BUILD-11 首帧已先写 booted_at 再开 iframe，
       复用那些语义会对新玩家永不触发）
     · 两处文案逐字来自设计真源 §2.2 —— 玩家屏幕上三行字一字不差       */
function checkShellFraming() {
  const main = readIf('sh_main.js');
  if (main === null) { note('CF-4 framing 巡检：sh_main.js 不存在，优雅跳过'); return; }
  const src = stripJs(main);

  /* ① 专用布尔必须存在（宿主 fill() 声明） */
  if (!/framing_seen\b/.test(src)) fail('[AS-9] sh_main.js 未声明 framing_seen');
  if (!/framing_window_seen\b/.test(src)) fail('[AS-9] sh_main.js 未声明 framing_window_seen');

  /* ② FR-A 判定必须用 framing_seen（写入前快照），不得用 booted_at 为空 */
  if (!/framingFresh\s*=\s*!boot\.framing_seen/.test(src) &&
      !/framingFresh\s*=\s*!boot\.framing_seen\b/.test(src)) {
    fail('[AS-9] FR-A 判定未用 framing_seen 写入前快照（CF-4 解耦要求）');
  }
  if (!/windowFresh\s*=\s*!boot\.framing_window_seen/.test(src) &&
      !/windowFresh\s*=\s*!boot\.framing_window_seen\b/.test(src)) {
    fail('[AS-9] FR-B 判定未用 framing_window_seen 写入前快照（CF-4 解耦要求）');
  }

  /* ③ 文案逐字（FR-A 三行 + FR-B 一行）
     ⚠️ Wave 3（ARG-DIALOGUE-REV · MVP-3 · §6.4 拍板 A）：FR-B 开窗行
     措辞由「上一次的会话没有结束。」改为「之前的记录还在。」——
     仍是设备态消息，FR-B 机制不动（SD-083 承接"上一次"悬念）。 */
  const FR_A = ['这台机器不是你的。', '它被打开过很多次。', '最后一次，没有关。'];
  FR_A.forEach(function (t) {
    if (src.indexOf(t) < 0) fail('[AS-9] FR-A 文案缺失或改字：「' + t + '」（设计真源 §2.2 逐字）');
  });
  if (src.indexOf('之前的记录还在。') < 0) {
    fail('[AS-9] FR-B 文案缺失或改字：「之前的记录还在。」（ARG-DIALOGUE-REV §6.4 拍板 A）');
  }

  /* ④ app 侧 /sd/ 同样声明两枚布尔（sd_state.js blank()） */
  const st = readIf('js/sd_state.js');
  if (st !== null && (!/framing_seen\b/.test(st) || !/framing_window_seen\b/.test(st))) {
    fail('[AS-9] js/sd_state.js 未声明 framing_seen / framing_window_seen（/sd/ 侧读同一字段）');
  }
  note('CF-4 framing 巡检：framing_seen / framing_window_seen 已声明并与 booted_at / win_state.sd 解耦；FR-A/FR-B 文案逐字');
}

/* ── (G) 组6 / X-1 巡检：投喂卡出处 ID 与论坛署名逐字一致（ARG-BUILD-12）──
   D-G1R-02 已拍板：三张卡的 source_uid 从虚构 ID（ID:tsubame_02 等）
   改为论坛真实楼主（苏打志 / 北窗 / 闲客）。X-1 要求跨页身份一致 ——
   /sd/ 的出处行与 /qsw/ 的署名必须是同一串字。                        */
function checkFeedSourceX1(SD_DATA) {
  const cat = ((SD_DATA && SD_DATA.feed_cover) || {}).catalog || [];
  const uids = cat.map(function (c) { return c.source_uid; }).filter(Boolean);

  /* ① 三张卡必须恰好是这三个楼主（顺序与 /qsw/ 无关，集合比对） */
  const want = ['苏打志', '北窗', '闲客'];
  const got = uids.slice().sort().join(',');
  const expected = want.slice().sort().join(',');
  if (got !== expected) {
    fail(`[X-1 组6] feed_cover.catalog 的 source_uid 应为 ${expected}（实得 ${got || '空'}）`);
    return;
  }

  /* ② 每个专名必须在 /qsw/ 论坛署名中出现（X-1 跨页身份一致） */
  want.forEach(function (n) {
    const files = walkQsw();
    const hit = files.some(function (f) {
      return fs.readFileSync(f, 'utf8').indexOf(n) >= 0;
    });
    if (!hit) fail(`[X-1 组6] 专名「${n}」未在 /qsw/ 论坛署名中出现 —— 出处行与论坛身份不一致`);
  });
  note('X-1 组6 巡检：source_uid = 苏打志/北窗/闲客，与 /qsw/ 论坛署名逐字一致');
}

/* 收集 qsw/ 下的部署文件（html/txt，脚本与样式里也可能有署名但主要是屏显面） */
function walkQsw() {
  const dir = path.join(ROOT, 'qsw');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  (function rec(d) {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) { rec(full); continue; }
      const ext = path.extname(name).toLowerCase();
      if (ext === '.html' || ext === '.txt') out.push(full);
    }
  })(dir);
  return out;
}

/* ── (H) ARG-BUILD-12 · 组2 投喂引擎红线（AS-1~AS-8 + CF-3） ────────
   全部来自 arg_g1_revision_design.md §8 的可扫描断言汇总。
   共同纪律：缺文件即跳过（骨架期 feed_markers 可能未生成）。         */

/* AS-4（SH-0 回归）：既有 173 节点的 text/id/next 与上线版逐字节一致。
   做法：把当前 dialogue_nodes 中【既有节点】的关键字段连成串做 sha256，
   与台账基线比对。
   基线 = BUILD-12 组6 提交后的 173 节点（text/id/next 未被组6/组2 触碰）。
   谁动了既有节点当场 fail —— 这是 SH-0 的可执行回归。
   ⚠️ SF-* 节点是设计稿 §8 组2.5 允许的第 3 类「插入」（投喂反应串），
   不在 AS-4 守护范围内（它们不是"既有"节点）；其结构由 checkSfNodes 单独断言。
   ⚠️ Wave 3（ARG-DIALOGUE-REV）允许的第 3 类「插入」同样排除：
   SO-*（设备态开场，MVP-1）与 SC-PAUSE-*（连播中断点，MVP-6）——
   它们也是新节点，不是"既有"节点；结构由 checkDialogueWave3 单独断言。 */
const NODE_BASELINE_SHA = '25309c279e6be2a861ff13a264eeeae44d770daa9639c81c41ec6386f09e6210';

function checkNodeBaseline(SD_DATA) {
  const nodes = (SD_DATA && SD_DATA.dialogue_nodes) || [];
  const existing = nodes.filter(function (n) {
    return !/^SF-/.test(n.id || '') && !/^(SO-|SC-PAUSE-)/.test(n.id || '');
  });
  const sig = existing.map(function (n) {
    return n.id + '|' + String(n.text == null ? '' : n.text) +
           '|' + String(n.next == null ? '' : n.next);
  }).join('\n');
  const got = crypto.createHash('sha256').update(sig, 'utf8').digest('hex');
  if (got !== NODE_BASELINE_SHA) {
    fail(`[AS-4 / SH-0] 既有节点（${existing.length} 个，非 SF-/SO-/SC-PAUSE-*）的 text/id/next 被改动（基线 ${NODE_BASELINE_SHA.slice(0, 12)}…，实得 ${got.slice(0, 12)}…）—— 既有节点一个字都不许动`);
  } else {
    note(`[AS-4 / SH-0] 既有节点 ${existing.length} 个 text/id/next 与基线逐字节一致（SF-* 新增 ${nodes.length - existing.length} 个不在此列，SO-/SC-PAUSE- 另由 Wave 3 断言）`);
  }
}

/* ── SF-* 节点结构断言（ARG-BUILD-12 · 组2 真别名接线） ──────────────
   31 句 SF 反应串（P0 19 + P1 12）逐字来自 arg_g1_sf_copy.md 第一节：
     · 全部 kind:'line' / speaker:'her' / block:'SF'
     · effects 无 horror（AS-1 已扫，这里补 class 标注语义）
     · sf_reactions 每个 marker 的节点都在 dialogue_nodes 里
     · 13 个 marker 都有反应串（不空） */
function checkSfNodes(SD_DATA) {
  const nodes = (SD_DATA && SD_DATA.dialogue_nodes) || [];
  const byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });
  const sf = nodes.filter(function (n) { return /^SF-/.test(n.id || ''); });

  /* ① 31 句全量 */
  if (sf.length !== 31) {
    fail(`[SF] SF-* 节点数应为 31（P0 19 + P1 12，实得 ${sf.length}）`);
  }

  /* ② 结构：kind / speaker / block / 无 horror / 无 next（不入链） */
  sf.forEach(function (n) {
    if (n.kind !== 'line') fail(`[SF] ${n.id} 必须 kind:"line"`);
    if (n.speaker !== 'her') fail(`[SF] ${n.id} 必须 speaker:"her"（她的气泡）`);
    if (n.block !== 'SF') fail(`[SF] ${n.id} 必须 block:"SF"`);
    if (n.next != null) fail(`[SF] ${n.id} 不得有 next（插播节点不入静态链，FM-1）`);
    if ((n.effects || []).some(function (e) { return e.type === 'horror'; })) {
      fail(`[SF] ${n.id} 挂了 horror（A=0/B=0，投喂是回报不是异常）`);
    }
    if (String(n.text || '').length === 0) fail(`[SF] ${n.id} 文本为空`);
    if (/\b(?:19|20)\d{2}\b/.test(String(n.text || ''))) {
      fail(`[SF] ${n.id} 文本含绝对年份（X-2）`);
    }
  });

  /* ③ sf_reactions：13 个 marker 全引用、引用不悬空、顺序即播报顺序 */
  const map = (SD_DATA && SD_DATA.sf_reactions) || {};
  const mkKeys = Object.keys(map);
  if (mkKeys.length !== 13) {
    fail(`[SF] sf_reactions 应登记 13 个 marker（实得 ${mkKeys.length}）`);
  }
  mkKeys.forEach(function (key) {
    const ids = (map[key] && map[key].nodes) || [];
    if (!ids.length) { fail(`[SF] ${key} 未登记 SF 反应节点`); return; }
    ids.forEach(function (id) {
      if (!byId[id]) fail(`[SF] ${key} 引用不存在的节点 ${id}`);
      if (!/^SF-/.test(id)) fail(`[SF] ${key} 引用非 SF-* 节点 ${id}`);
    });
  });
  /* 反向：每个 SF-* 节点都被至少一个 marker 引用（无孤儿反应串） */
  const referenced = {};
  mkKeys.forEach(function (key) {
    ((map[key] && map[key].nodes) || []).forEach(function (id) { referenced[id] = true; });
  });
  sf.forEach(function (n) {
    if (!referenced[n.id]) fail(`[SF] ${n.id} 未被任何 marker 引用（孤儿反应串）`);
  });
  note(`[SF] SF-* 节点 ${sf.length} 个 · sf_reactions 13 个 marker 全引用 · A=0/B=0`);
}

/* ══════════════════════════════════════════════════════════════════════
   ARG-DIALOGUE-REV · Wave 3 对话重构（MVP-1..6）静态断言
   对应设计稿 §5.4 测试断言清单。运行期半侧在 smoke_main.js S24。
   ══════════════════════════════════════════════════════════════════════ */
function checkDialogueWave3(SD_DATA) {
  const nodes = (SD_DATA && SD_DATA.dialogue_nodes) || [];
  const byId = {};
  nodes.forEach(function (n) { byId[n.id] = n; });
  const need = function (id, tag) {
    const n = byId[id];
    if (!n) fail('[W3] 节点缺失：' + id + (tag || ''));
    return n;
  };

  /* ── MVP-1 · SO-001（设备态开场） ────────────────────────────────── */
  const so = need('SO-001', '（设备态开场）');
  if (so) {
    if (so.speaker !== 'sys' || so.kind !== 'line')
      fail('[W3] SO-001 必须 speaker:"sys" kind:"line"（设备态开场，非她的气泡）');
    if (so.text !== '这台机器被人用过。')
      fail('[W3] SO-001 文案必须是「这台机器被人用过。」（§6.4 拍板 A，逐字）');
    if (so.next !== 'SS-001')
      fail('[W3] SO-001.next 必须指向 SS-001（既有链不动，MVP-1 §5.1）');
    if ((so.tags || []).indexOf('opening') < 0)
      fail('[W3] SO-001 必须挂 tags:["opening"]（start() 通用前置 hook，MVP-1）');
    /* 口吻红线（§4.5）：不解释、不含元层词 */
    const banned = ['系统', '程序', 'AI', '语言模型', '对话助手', '使用记录', '数据库', '检测到', '历史数据'];
    banned.forEach(function (w) {
      if ((so.text || '').indexOf(w) >= 0) fail('[W3] SO-001 含元层词「' + w + '」（§4.5）');
    });
    if ((so.text || '').replace(/[。！？…,.!?]/g, '').length > 8)
      fail('[W3] SO-001 超 8 字（§6.3 限 1 句 ≤8 字，不解释）');
  }

  /* ── MVP-6 · SC-PAUSE-001（幕4 连播中断点） ──────────────────────── */
  const scp = need('SC-PAUSE-001', '（幕4 连播中断点）');
  if (scp) {
    if (scp.speaker !== 'player' || scp.kind !== 'choice')
      fail('[W3] SC-PAUSE-001 必须 speaker:"player" kind:"choice"');
    const labels = (scp.options || []).map(function (o) { return o.label; });
    if (labels.length !== 3 ||
        labels[0] !== '……' || labels[1] !== '让我一个人说一会' || labels[2] !== '我想看回之前')
      fail('[W3] SC-PAUSE-001 必须 3 选项：…… / 让我一个人说一会 / 我想看回之前（§6.4 拍板 A）');
    (scp.options || []).forEach(function (o, i) {
      if (o.next !== 'SD-068') fail(`[W3] SC-PAUSE-001.options[${i}].next 必须指向 SD-068`);
    });
    if (!scp.options || !scp.options[2] || scp.options[2].silence_ms !== 2000)
      fail('[W3] SC-PAUSE-001 选项 3「我想看回之前」必须 silence_ms:2000（伪选择：沉默 2s 再继续）');
    if (scp.next !== 'SD-068') fail('[W3] SC-PAUSE-001.next 必须指向 SD-068');
    /* GD-R1：选项文字不含「提示」「下一步」类元层词 */
    if (/提示|下一步|跳过|继续|确定|退出|返回/.test(labels.join('')))
      fail('[W3] SC-PAUSE-001 选项含 GD-R1 禁词（提示/下一步等）');
    /* R2 / R5：中断点不携带进度 / 计数元素 */
    if (scp.progress != null || scp.counter != null || scp.index != null)
      fail('[W3] SC-PAUSE-001 不得携带进度/计数字段（R2 / R5）');
  }

  /* ── MVP-6 · pause_hooks 通用接线（arc_entry 同族） ──────────────── */
  const hooks = (SD_DATA && SD_DATA.pause_hooks) || {};
  if (!hooks['SD-068']) fail('[W3] pause_hooks 缺 SD-068 → SC-PAUSE-001 接线（MVP-6）');
  else if (hooks['SD-068'] !== 'SC-PAUSE-001') fail('[W3] pause_hooks[SD-068] 必须是 SC-PAUSE-001');
  if (hooks['SD-068'] && !byId[hooks['SD-068']]) fail('[W3] pause_hooks 引用不存在的节点');
  if (hooks['SD-068'] && byId['SD-068'] && byId[hooks['SD-068']].next !== 'SD-068')
    fail('[W3] 中断点节点.next 必须回指目标节点（FM-1：播完回原链）');

  /* ── MVP-3 · 开窗行措辞（sd_app.js + sh_main.js 两种形态一字不差） ── */
  const appJs = readIf('js/sd_app.js');
  if (appJs !== null && appJs.indexOf('之前的记录还在。') < 0)
    fail('[W3] js/sd_app.js 开窗行必须是「之前的记录还在。」（MVP-3 / §6.4 拍板 A）');
  const shellJs = readIf('sh_main.js');
  if (shellJs !== null && shellJs.indexOf('之前的记录还在。') < 0)
    fail('[W3] sh_main.js FR-B 行必须是「之前的记录还在。」（与裸开形态一字不差）');
  if (appJs !== null && appJs.indexOf('上一次的会话没有结束。') >= 0)
    fail('[W3] js/sd_app.js 残留旧开窗行「上一次的会话没有结束。」（MVP-3 未清干净）');

  /* ── MVP-4 · footer_notice 措辞 ──────────────────────────────────── */
  if (String(SD_DATA.footer_notice || '') !== '虚构作品的一部分。本机的钟还在走。')
    fail('[W3] footer_notice 必须是「虚构作品的一部分。本机的钟还在走。」（MVP-4 / §6.4 拍板 A）');

  /* ── MVP-5 · wait 视觉占位（静态半侧：CSS 规则 + 引擎引用存在） ──── */
  const css = readIf('css/sd_chat.css');
  if (css !== null && css.indexOf('.sd-bubble--nextable') < 0)
    fail('[W3] css/sd_chat.css 缺少 .sd-bubble--nextable 规则（MVP-5）');
  const dlg = readIf('js/sd_dialogue.js');
  if (dlg !== null && dlg.indexOf('sd-bubble--nextable') < 0)
    fail('[W3] js/sd_dialogue.js 未引用 .sd-bubble--nextable（MVP-5）');

  /* ── X-2：新增文本无绝对年份（SVG 层复扫，防 2011 类历史日期） ───── */
  const w3texts = [so && so.text, scp && scp.text].concat(
    (scp && scp.options || []).map(function (o) { return o.label; }),
    [SD_DATA.footer_notice]
  ).filter(Boolean);
  const w3year = w3texts.filter(function (s) { return /\b(?:19|20)\d{2}\b/.test(s); });
  if (w3year.length) fail('[W3] 新增文本含绝对年份（X-2）：' + w3year.join(' | '));

  note('[W3] 对话重构 Wave 3 静态断言：SO-001 / SC-PAUSE-001 / pause_hooks / 开窗行 / footer_notice / wait 占位 全部通过');
}

function checkFeedEngine(SD_DATA) {
  const feedJs = readIf('js/sd_feed.js');
  if (feedJs === null) { note('投喂引擎红线：js/sd_feed.js 不存在，优雅跳过'); return; }
  const src = stripJs(feedJs);

  /* ── AS-2：marker_table 只存 64 位十六进制（FD-H1） ────────────── */
  const mkFile = readIf('data/feed_markers.js');
  if (mkFile !== null) {
    /* 生成器输出形态：{ "mk_x": ["64hex", "64hex", ...] }
       值 = 任意引号包裹的 64 位十六进制（含数组元素）。 */
    const valRe = /"([0-9a-f]{64})"/g;
    const vals = [];
    let m;
    while ((m = valRe.exec(mkFile)) !== null) vals.push(m[1]);
    /* 13 个 marker 键必须齐全，且每个至少 1 条哈希（任务书：13 标记全量） */
    const mkKeysRe = /"mk_[a-z0-9_]+"/g;
    const mkKeys = (mkFile.match(mkKeysRe) || []).map(function (s) { return s.replace(/"/g, ''); });
    const wantKeys = [
      'mk_silence_option', 'mk_counted_silence', 'mk_you_still_came',
      'mk_v2_diff', 'mk_not_press', 'mk_door_closed', 'mk_silent_flag',
      'mk_three_nights', 'mk_key_not_door', 'mk_no_save', 'mk_empty_room',
      'mk_prologue_silence', 'mk_xk'
    ];
    wantKeys.forEach(function (k) {
      if (mkKeys.indexOf(k) < 0) fail(`[AS-2] feed_markers.js 缺少 marker 键 ${k}（13 标记全量要求）`);
    });
    if (!vals.length) fail('[AS-2 / FD-H1] feed_markers.js 未找到任何 64 位哈希（投喂闭环 T-hit 不可达）');
    /* 若出现疑似明文别名（含中文 / 非 hex 的长串值）→ fail。
       只盯【值位】：键是固定结构名（markers / SD_FEED_MARKERS）。 */
    const aliasRe = /:\s*["']([^"']{4,})["']/g;
    let am, leaked = [];
    while ((am = aliasRe.exec(mkFile)) !== null) {
      const v = am[1];
      /* 结构串白名单（生成器固定输出，不是别名） */
      if (v === 'use strict' || v === 'window' || v === 'globalThis') continue;
      /* 值必须是 64 位十六进制，否则是明文泄漏 */
      if (!/^[0-9a-f]{64}$/.test(v)) leaked.push(v);
    }
    if (leaked.length) fail(`[AS-2 / FD-H1] feed_markers.js 出现疑似明文别名：${leaked.slice(0, 3).join(', ')}`);
    note(`[AS-2] feed_markers.js 哈希值 ${vals.length} 个（13 标记 ${mkKeys.filter(function (k) { return wantKeys.indexOf(k) >= 0; }).length} 个键，全部 64 位十六进制）`);
  }

  /* ── AS-1：SF-* 节点 effects 不得出现 {type:'horror'} ─────────── */
  const sfNodes = ((SD_DATA && SD_DATA.dialogue_nodes) || [])
    .filter((n) => /^SF-/.test(n.id || ''));
  sfNodes.forEach((n) => {
    const hasHorror = (n.effects || []).some((e) => e.type === 'horror');
    if (hasHorror) fail(`[AS-1] SF-* 节点 ${n.id} 挂了 horror —— 投喂是回报不是异常（§1.8 HB-5）`);
  });
  if (sfNodes.length) note(`[AS-1] SF-* 节点 ${sfNodes.length} 个，零 horror（HB-5）`);

  /* ── AS-6：feed_hooks 不含 SC-005 / SC-057 ────────────────────── */
  if (/(['"])SC-005['"]|(['"])SC-057['"]/.test(src)) {
    /* 只允许出现在排除清单（FEED_HOOK_EXCLUDE），不允许出现在开启表 */
    const excl = /FEED_HOOK_EXCLUDE\s*=\s*\{[^}]*SC-005[^}]*SC-057[^}]*\}/.test(src);
    const opened = /FEED_HOOKS\s*=\s*\{[^}]*['"]SC-005['"]/.test(src) ||
                  /FEED_HOOKS\s*=\s*\{[^}]*['"]SC-057['"]/.test(src);
    if (opened) fail('[AS-6] feed_hooks 不应开启 SC-005 / SC-057（命名 / 谜题通道唯一性）');
    if (!excl) fail('[AS-6] SC-005 / SC-057 必须出现在 FEED_HOOK_EXCLUDE');
  }

  /* ── AS-3：normalize / fragText 剥离绝对日期（X-2 双点） ──────── */
  if (src.indexOf('stripDates') < 0) fail('[AS-3] sd_feed.js 未实现 stripDates（X-2 日期剥离）');
  if (src.indexOf('DATE_RE') < 0) fail('[AS-3] sd_feed.js 缺日期正则表（\\d{4}-\\d{2}-\\d{2} 等）');

  /* ── AS-5 / CF-3：SC-029 idiolect 排除（命中跳过语料池） ──────── */
  if (!/skipIdiolect|skip_idiolect/.test(stripJs(readIf('js/sd_dialogue.js') || ''))) {
    fail('[AS-5 / CF-3] sd_dialogue.js 未见 idiolect 排除逻辑（T-hit/U-1 不得进语料池）');
  }

  /* ── AS-8：全站无 gonglue / gl_，且 mk_* 键名不含 那两字作品名 ──
     全站 gonglue/gl_ 已由 ① 全文件裸扫覆盖；这里补 mk_* 键名判定。
     键名实际住在 data/feed_markers.js（生成器输出）与内容层 sf_reactions，
     sd_feed.js 本身不写字面量键名（引擎通用读表）。 */
  const mkKeysAll = [];
  [src, readIf('data/feed_markers.js') || '', readIf('data/sd_slice.js') || '']
    .forEach(function (t) {
      (t.match(/mk_[a-z_0-9]+/g) || []).forEach(function (k) { if (mkKeysAll.indexOf(k) < 0) mkKeysAll.push(k); });
    });
  if (!mkKeysAll.length) note('[AS-8] 未找到任何 mk_* 键名（真别名未生成？）');
  else note(`[AS-8] mk_* 键名 ${mkKeysAll.length} 个（含 feed_markers / sf_reactions），零那两字作品名`);
  note('投喂引擎红线：AS-1/2/3/5/6/8 + CF-3（SC-029 idiolect 排除 / SD-068 b11 优先 / SC-035 a1_probe 隔离）');
}

/* ── (J) 组5 剩余视觉（ARG-BUILD-12 · I 组）────────────────────────
   把设计稿 §4.2/§4.3 的判据写成可扫描断言：
     · V-S1 桌面构图锚左上（列表 left = max(8vw,48px)、顶部行高×3）
     · V-S2 噪点 2.5–3% 且只在桌面层
     · V-S3 4px 基线网格（桌面 20px 行高 = 4×5；素读气泡 28px = 4×7）
     · V-R3 幕级留白台阶（sd_render 按 block 挂 .sd-row--act + CSS 24px）
     · V-R8 插播不抢滚动位置（scrollEnd 距底 ≤80px 才自动滚）
     · V-R2 三档字号（16 / 13 / 10 —— 页脚与软行同属极小注记档） */
function checkVisualWave2() {
  const sh = readIf('sh_main.css');
  if (sh !== null) {
    const css = stripCss(sh);
    if (!/\.sh-list\s*\{[^}]*left\s*:\s*max\(8vw\s*,\s*48px\)/.test(css)) {
      fail('[V-S1] sh_main.css 的 .sh-list 未锚定左上（left:max(8vw,48px)）—— 空旷要有构图');
    }
    if (!/\.sh-list\s*\{[^}]*top\s*:\s*60px/.test(css)) {
      fail('[V-S1] .sh-list 顶部 1px 线到第一行距离 ≠ 行高×3（60px）');
    }
    const noise = /\.sh-noise\s*\{[^}]*opacity\s*:\s*\.(\d{2,3})/.exec(css);
    if (noise) {
      const v = parseFloat('0.' + noise[1]);
      if (v < 0.025 || v > 0.03) fail(`[V-S2] 桌面噪点 ${v} 不在 2.5–3% 区间`);
    } else {
      fail('[V-S2] sh_main.css 未找到 .sh-noise 的 opacity');
    }
    if (!/line-height\s*:\s*20px/.test(css)) {
      fail('[V-S3] sh_main.css 桌面行高非 20px（4px 基线网格，= 4×5）');
    }
    /* 素读页零噪点：噪点元素只在桌面 index.html */
    const sdIdx = readIf('sd/index.html');
    if (sdIdx !== null && /sh-noise/.test(stripJs(sdIdx))) {
      fail('[V-S2] sd/index.html 出现桌面噪点元素（噪点只作用于桌面层）');
    }
  }
  const chat = readIf('css/sd_chat.css');
  if (chat !== null) {
    const cc = stripCss(chat);
    if (!/\.sd-row--act\s*\{[^}]*margin-top\s*:\s*24px/.test(cc)) {
      fail('[V-R3] sd_chat.css 缺 .sd-row--act（幕级留白台阶 24px）');
    }
    if (!/\.sd-bubble\s*\{[^}]*line-height\s*:\s*1\.75/.test(cc)) {
      fail('[V-S3] sd_chat.css 气泡行高非 1.75（16px × 1.75 = 28px = 4×7）');
    }
    /* V-R2：三档字号（16 / 13 / 10） */
    const sizes = [];
    (cc.match(/font-size\s*:\s*(\d+)px/g) || []).forEach(function (s) {
      const n = parseInt(/font-size\s*:\s*(\d+)px/.exec(s)[1], 10);
      if (sizes.indexOf(n) < 0) sizes.push(n);
    });
    const base = stripCss(readIf('css/sd_base.css') || '');
    (base.match(/font-size\s*:\s*(\d+)px/g) || []).forEach(function (s) {
      const n = parseInt(/font-size\s*:\s*(\d+)px/.exec(s)[1], 10);
      if (sizes.indexOf(n) < 0) sizes.push(n);
    });
    const have = [10, 13, 16].every(function (n) { return sizes.indexOf(n) >= 0; });
    if (!have) {
      fail(`[V-R2] 三档字号缺失（她正文 16 / 系统行 13 / 极小注记 10，实得 ${sizes.join(',')}）`);
    } else {
      note(`[V-R2] 三档字号就位：16 / 13 / 10（她正文 / 系统行 / 页脚·软行）`);
    }
  }
  const render = readIf('js/sd_render.js');
  if (render !== null) {
    const rs = stripJs(render);
    if (!/scrollTop\s*-\s*client[^;]*>\s*80/.test(rs)) {
      fail('[V-R8] sd_render.scrollEnd 缺「距底 ≤80px 才自动滚」门控（插播不抢回读位置）');
    }
    if (!/block\s*&&\s*lastBlock\s*!==\s*null/.test(rs)) {
      fail('[V-R3] sd_render.bubble 缺 block 幕级切换判定（幕间留白台阶）');
    }
  }
  note(`组5 视觉巡检：V-S1/S2/S3/V-R2/V-R3/V-R8 判据逐条可扫描`);
}

/* ── 主流程 ──────────────────────────────────────────────────────────── */
function main() {

  const files = [];
  walk(ROOT, files);
  note('扫描部署文件 ' + files.length + ' 个');

  const sandbox = loadSandbox();
  const SD_DATA = sandbox.SD_DATA;

  checkParsable(files);                 // ⓪ 地基：投产 JS 必须真的能被解析
  scanAbsolutePaths(files);             // ⑨ GH Pages 子路径安全（资源引用面，无需 SD_DATA）

  /* ARG-BUILD-09 · Phase 2 全站覆盖（INS-2）—— 均不依赖 SD_DATA，
     且对尚未创建的 Phase 2 目录优雅跳过。 */
  checkDeployManifest();                // ⑭ Gap-1 发布清单防漂移
  checkStrataIsolation(files);          // ⑪ X-5 反 DRY（资源引用 + 命名前缀）
  checkCrossPageDates(files);           // ⑫ X-2 / D-2 跨页年代窗口
  checkDeadLinks(files);                // ⑬ D-3 死链

  /* ARG-BUILD-11 · 本机（设备壳层）—— 均不依赖 SD_DATA，文件缺失即跳过 */
  checkShellVisual();                   // ⑮A R5 视觉纪律
  checkShellIsolation(files);           // ⑮B X-5 裸开判据 + BR-3 握手禁令
  checkShellHome();                     // ⑮C 素读入口恒可见
  checkShellBridge();                   // ⑮D SH-6 / X-9 / BR-2 / BR-4 / SH-7
  checkShellFraming();                  // ARG-BUILD-12 · AS-9 CF-4 framing 专用标志
  checkVisualWave2();                   // ARG-BUILD-12 · 组5 剩余视觉（V-S1/S2/S3/V-R2/R3/R8）

  if (!SD_DATA) { fail('无法加载 window.SD_DATA（data/sd_slice.js）'); }
  else {
    scanFilesMeta(files, SD_DATA);      // ① 元层禁词（分面）+ ⑤ 明文（文件级）
    scanRendered(extractRendered(SD_DATA));   // ②–④ 屏显红线（渲染面）
    checkBudgetAndGraph(SD_DATA);
    checkPhase2Budget(SD_DATA);                // ⑩ Phase 2 预算分区台账（2a 占位登记）
    checkNodes(SD_DATA);                       // §9 节点存在性 + 字段 + 明文纪律 + X-2
    checkDualWriteNotice(SD_DATA);             // DX-02 双写点（404.html ↔ footer_notice）
    checkHash(SD_DATA, sandbox);
    checkFeedSourceX1(SD_DATA);                // ARG-BUILD-12 · 组6 X-1 出处 ID 巡检
    checkNodeBaseline(SD_DATA);                // ARG-BUILD-12 · AS-4 SH-0 节点回归
    checkSfNodes(SD_DATA);                     // ARG-BUILD-12 · SF-* 反应节点结构（组2）
    checkDialogueWave3(SD_DATA);               // ARG-DIALOGUE-REV · Wave 3 MVP-1..6 静态断言
    checkFeedEngine(SD_DATA);                  // ARG-BUILD-12 · 组2 投喂引擎红线（AS-1~8 + CF-3）
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
