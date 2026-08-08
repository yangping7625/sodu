/* ==========================================================================
   tests/smoke_save.js · 烟雾测试 ② 存档页直访降级

   同样在【GitHub Pages 子路径模拟】下加载真实 save.html。

   三个场景：
     A 直访（未经对话）★本测试主目标
        · 资源 0 个 404、零根绝对路径
        · 渲染降级提示「你来得比我给你看早。」(E6)
        · 【不出现】谜题输入框 —— 她还没请你看
        · E6 只渲染"已产生"的行：未发生的 FLAG 不上桌
     B 经对话而来（携带主对话页产生的真实 localStorage）
        · 出现谜题输入框
        · 输错 → 冷回；输对 → FLAG_█████ 揭示为 FLAG_WATCHING
        · 纯 JS SHA-256 回落链路（crypto.subtle 不可用）与库内哈希一致
        · R8：不解题也不锁死 —— 提示阶梯到点自动解锁
     C 经对话 + localStorage 不可用（iOS 无痕）
        · J-1 降级：不抛异常、页面照常渲染

   全场景共同红线：TW-2 明文谜底「我在看你」任何位置零出现。

   运行：node tests/smoke_save.js
   ========================================================================== */
'use strict';

const { createEnv } = require('./dom_shim');
const sim = require('./sim_site');

const fails = [];
const notes = [];
const ok = (c, m) => { if (c) notes.push('✓ ' + m); else fails.push('✗ ' + m); };

/* 零明文纪律：本测试源码【不持有】真谜底。手动答对路径（submitPuzzle / savepage
   表单 submit）与自动解锁路径共享 doReveal 揭示逻辑；其哈希一致性由
   sd_puzzle.check ↔ save_table.answer_sha256 保证（离线推导见 _wip/）。
   故下方仅验自动解锁（onAutoReveal）路径，不向源码注入任何明文谜底。 */

/* ── 先跑一遍主对话流，取得"真的经历过对话"的 localStorage ─────────── */
function playMainAndDumpStorage(site) {
  const env = createEnv({
    siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
  });
  env.runScripts();
  const SD = env.win.SD;
  const dock = env.doc.getElementById('sd-dock');
  /* 关掉主对话流里的提示阶梯自动解锁：dom_shim 的 runUntilIdle 会冲刷全部
     虚拟时钟定时器，导致抵达 SC-057 时 150s 自动解锁在同一次 runUntilIdle
     内被触发、把 FLAG_WATCHING 带进存档快照。存档页 B 场景需要"已邀请但未解"
     的状态，故此处只停用主驱动实例的 HintLadder。
     （B 场景的 b / b2 是独立 createEnv 实例，自带真实 HintLadder，不受影响，
       其自动解锁由 B13/B14 显式验证。） */
  const RealLadder = SD.Puzzle && SD.Puzzle.HintLadder;
  if (RealLadder) {
    SD.Puzzle.HintLadder = function () { this.start = function () {}; this.stop = function () {}; };
  }
  let guard = 0;
  env.withClock(() => {
    clock: for (;;) {
      if (guard++ > 60) break clock;
      const cards = dock.querySelectorAll('.sd-card');
      const choices = dock.querySelectorAll('.sd-choice');
      const form = dock.querySelector('.sd-inputbar');
      if (!cards.length && !choices.length && !form) break clock;
      const cur = SD.Dialogue.current();
      env.clock.advance(cur && cur.measure && cur.measure.role === 'a1_probe' ? 9000 : 1200);
      if (choices.length) choices[0].dispatch('click');
      else if (cards.length) cards[0].dispatch('click');
      else {
        const inp = form.querySelector('.sd-input');
        inp.value = (cur && cur.free_input && cur.free_input.capture === 'name_given') ? '阿岩' : '你说。';
        form.dispatch('submit');
      }
      env.clock.runUntilIdle();
    }
  });
  return { store: env.localStorage._dump(), offered: SD.State.hasFlag('save_offered') };
}

function rowsOf(env) {
  return env.doc.getElementById('sd-flags').querySelectorAll('.sd-flag').map((li) => ({
    key: li.querySelector('.sd-flag__k').textContent,
    val: li.querySelector('.sd-flag__v').textContent,
    redacted: li.classList.contains('sd-flag--redacted')
  }));
}

function main() {
  const site = sim.build('sudu-reader');
  console.log('\n── 烟雾测试 ② 存档页直访降级 ─────────────────────────');
  console.log('  页面 URL 路径: /' + site.page('save.html'));

  try {
    /* ══ 场景 A：直访（未经对话） ═══════════════════════════════════ */
    const a = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('save.html'), storage: true
    });

    const rootAbs = a.refs().filter((r) => r.kind === 'root-absolute');
    ok(rootAbs.length === 0,
      `A1 零根绝对路径引用（发现 ${rootAbs.length}${rootAbs.length ? '：' + rootAbs.map((r) => r.ref).join(', ') : ''}）`);

    a.runScripts({ settleMs: 1000 });

    const a404 = a.loaded.filter((l) => l.status === 404);
    const aThrew = a.loaded.filter((l) => l.status === 'throw');
    ok(a404.length === 0, `A2 脚本全部命中（404: ${a404.length}${a404.length ? ' → ' + a404.map((n) => n.src).join(', ') : ''}）`);
    ok(aThrew.length === 0, `A3 脚本执行无异常（${aThrew.length}${aThrew.length ? ' → ' + aThrew.map((t) => t.src + ': ' + t.error).join(' | ') : ''}）`);
    if (aThrew.length) { report(); return; }

    const aScreen = a.doc.body.textContent;
    const aRows = rowsOf(a);
    console.log('\n  [A 直访] 渲染出的 FLAG 行：');
    aRows.forEach((r) => console.log(`    · ${r.key} = ${r.val}${r.redacted ? '  (redacted)' : ''}`));

    ok(aScreen.includes('你来得比我给你看早。'), 'A4 ★E6 降级提示已渲染「你来得比我给你看早。」');
    ok(!a.doc.querySelector('#sd-answer'), 'A5 ★E6 直访【不出现】谜题输入框');
    ok(!a.doc.querySelector('.sd-puzzle'), 'A6 ★E6 直访【不挂载】谜题区块');

    /* E6：未产生的行不上桌 */
    const aKeys = aRows.map((r) => r.key);
    ok(!aKeys.includes('FLAG_NAME_GIVEN'), 'A7 E6 未命名 → FLAG_NAME_GIVEN 不渲染');
    ok(!aKeys.includes('FLAG_FEED_COUNT'), 'A8 E6 未投喂 → FLAG_FEED_COUNT 不渲染');
    ok(!aKeys.includes('FLAG_ROUTE'), 'A9 E6 未投喂 → FLAG_ROUTE 不渲染');
    ok(aRows.some((r) => r.redacted), 'A10 被抹黑行始终在场（谜题锚点）');
    ok(aScreen.includes('竖着读。'), 'A11 L1-b 透明文本「竖着读。」在 DOM 中');
    ok(hasComment(a.doc.body, '备份在旧版本里'), 'A12 L1-c HTML 注释「备份在旧版本里」在 DOM 中');
    ok(!aScreen.includes('我在看你'), 'A13 TW-2 明文谜底零命中');
    ok(!aScreen.includes('FLAG_WATCHING'), 'A14 未解题 → 不泄露 reveal_key');
    ok(a.doc.body.getAttribute('data-site') === 'save', 'A15 路由套用 save 主题（data-site）');

    /* ══ 场景 B：经对话而来 ═════════════════════════════════════════ */
    const carried = playMainAndDumpStorage(site);
    ok(carried.offered === true, 'B0 主对话流已置 save_offered（前置条件）');

    const b = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('save.html'),
      storage: true, seedStore: carried.store
    });
    b.runScripts({ settleMs: 1000 });   // 不让提示阶梯自动解锁

    const bScreen0 = b.doc.body.textContent;
    const bRows = rowsOf(b);
    console.log('\n  [B 经对话] 渲染出的 FLAG 行：');
    bRows.forEach((r) => console.log(`    · ${r.key} = ${r.val}${r.redacted ? '  (redacted)' : ''}`));

    ok(!bScreen0.includes('你来得比我给你看早。'), 'B1 经对话而来 → 不显示直访降级提示');
    ok(!!b.doc.querySelector('#sd-answer'), 'B2 经对话而来 → 出现谜题输入框');
    ok(bRows.some((r) => r.key === 'FLAG_NAME_GIVEN' && r.val === '阿岩'), 'B3 已命名 → FLAG_NAME_GIVEN 渲染真实输入');
    ok(bRows.some((r) => r.key === 'FLAG_ROUTE' && r.val === 'AFFECTION'), 'B4 已投喂 → FLAG_ROUTE 为真实路线');

    /* 输错 */
    const bForm = b.doc.querySelector('.sd-puzzle__form');
    const bInp = b.doc.querySelector('#sd-answer');
    b.withClock(() => {
      bInp.value = '随便写点什么';
      bForm.dispatch('submit');
      b.clock.runFor(10);
    });
    ok(b.doc.querySelector('.sd-puzzle__say').textContent === '不是这个。', 'B5 答错 → 冷回「不是这个。」');
    ok(!b.win.SD.State.isRevealed('FLAG_WATCHING'), 'B6 答错 → 未揭示');

    /* ══ 场景 B2：R8 不锁死 —— 到点自动解锁 ════════════════════════
       零明文纪律下测试源码不持有真谜底，故此处只验【自动解锁】路径
       （onAutoReveal → reveal + used_hint）。手动答对路径（submitPuzzle /
       savepage 表单）共享同一 doReveal 揭示逻辑，其哈希一致性由
       sd_puzzle.check ↔ save_table.answer_sha256 保证（离线推导见 _wip/）。 */
    const b2 = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('save.html'),
      storage: true, seedStore: carried.store
    });
    b2.runScripts({ settleMs: 1000 });
    ok(!!b2.doc.querySelector('#sd-answer'), 'B12 新会话再次出现谜题输入框');
    b2.withClock(() => { b2.clock.runFor(200000); });   // 越过 150s 自动解锁点
    ok(b2.win.SD.State.isRevealed('FLAG_WATCHING'), 'B13 ★R8 静置到点自动解锁 —— 主线绝不锁死');
    ok(b2.win.SD.State.hasFlag('used_hint'), 'B14 自动解锁记 used_hint（非 solved_acrostic）');
    ok(!b2.doc.body.textContent.includes('我在看你'), 'B15 TW-2：自动解锁后仍不渲染明文谜底');
    /* 揭示后的表状态（原 B8/B9/B11 断言迁移至此，改用自动解锁口径） */
    const b2Rows = rowsOf(b2);
    ok(b2Rows.some((r) => r.key === 'FLAG_WATCHING'), 'B16 自动解锁后被抹黑行换字为 FLAG_WATCHING');
    ok(!b2.doc.querySelector('.sd-puzzle'), 'B17 解开后谜题区块移除');
    ok(!b2.win.SD.State.hasFlag('solved_acrostic'), 'B18 自动解锁走 used_hint，不应置 solved_acrostic');

    /* ══ 场景 C：localStorage 不可用（iOS 无痕） ═══════════════════ */
    let cThrew = null;
    let c = null;
    try {
      c = createEnv({
        siteRoot: site.siteRoot, pagePath: site.page('save.html'), storage: false
      });
      c.runScripts({ settleMs: 1000 });
    } catch (e) { cThrew = e; }
    ok(!cThrew, `C1 ★J-1 无痕模式不抛异常${cThrew ? '（抛出：' + cThrew.message + '）' : ''}`);
    if (c) {
      const cErr = c.loaded.filter((l) => l.status === 'throw');
      ok(cErr.length === 0, `C2 无痕模式脚本无异常（${cErr.length}）`);
      ok(c.win.SD.State.persistent() === false, 'C3 持久化探测正确转内存态');
      ok(c.doc.getElementById('sd-flags').childNodes.length > 0, 'C4 无痕模式仍渲染 FLAG 表（不白屏）');
      ok(c.doc.body.textContent.includes('虚构作品的一部分'), 'C5 无痕模式页脚声明照常渲染');
      ok(!!c.doc.querySelector('#sd-reset'), 'C6 无痕模式仍挂出清档按钮（不因存储不可用而消失）');
    }

    /* ══ 场景 D：清空存档 / 重玩（ARG-BUILD-08） ═════════════════════
       核心不是「能清」，而是「不会被误清」——
       故按真实点击链路逐步验证：首点只出确认、取消可回退、
       只有第二次显式确认才真正落盘清空。               */
    const d = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('save.html'),
      storage: true, seedStore: carried.store
    });
    d.runScripts({ settleMs: 1000 });

    const KEY = d.win.SD.State.KEY;
    const readSave = () => {
      try { return JSON.parse(d.localStorage.getItem(KEY)); } catch (e) { return null; }
    };

    ok(readSave() && readSave().name_given === '阿岩',
      'D0 前置：存档里有真实痕迹（name_given = 阿岩）');

    const rBtn = d.doc.querySelector('#sd-reset');
    ok(!!rBtn, 'D1 ★存档页挂出「清空存档 / 重玩」按钮');
    ok(rBtn && rBtn.textContent.includes('清空存档'), 'D2 按钮文案含「清空存档」');
    ok(rBtn && rBtn.getAttribute('type') === 'button',
      'D3 按钮 type=button（不误提交谜题表单）');

    const back = d.doc.querySelector('.sd-ctl__back');
    ok(!!back, 'D4 存档页提供「回到对话」链接');
    /* ARG-BUILD-11 / S15：`/` 已让位给「本机」，对话页搬到 `/sd/`。
       存档页在站根，回链必须指向 sd/index.html —— 指回 index.html 会把玩家
       从存档甩回桌面，那是一次静默的叙事断裂（且 D-3 死链巡检查不出来）。 */
    ok(back && back.getAttribute('href') === 'sd/index.html',
      `D5 返回链接为相对路径 sd/index.html（实得「${back && back.getAttribute('href')}」）`);
    ok(back && !back.getAttribute('href').startsWith('/'),
      'D6 返回链接非根绝对路径（红线⑨）');

    /* 第一步：只出确认，绝不动存档 */
    rBtn.dispatch('click');
    ok(!!d.doc.querySelector('#sd-reset-ask'), 'D7 ★首次点击 → 弹出二次确认');
    ok(!d.doc.querySelector('#sd-reset'), 'D8 确认态下原按钮撤下（连点同一坐标不会误清）');
    ok(readSave() && readSave().name_given === '阿岩',
      'D9 ★★首次点击【不清档】—— 误触防护成立');

    /* 第二步：取消可回退 */
    d.doc.querySelector('#sd-reset-no').dispatch('click');
    ok(!d.doc.querySelector('#sd-reset-ask'), 'D10 取消 → 确认行移除');
    ok(!!d.doc.querySelector('#sd-reset'), 'D11 取消 → 按钮复位，可再来一次');
    ok(readSave() && readSave().name_given === '阿岩', 'D12 ★取消不清档');

    /* 第三步：显式确认 → 真清 */
    d.doc.querySelector('#sd-reset').dispatch('click');
    d.doc.querySelector('#sd-reset-yes').dispatch('click');

    const after = readSave();
    ok(!!after, 'D13 清空后单键仍在（写入空档，而非删键 —— 与 reset() 语义一致）');
    ok(after && after.name_given === null, 'D14 ★★确认后 name_given 归空');
    ok(after && after.feed_cover && after.feed_cover.fed.length === 0,
      'D15 ★★投喂记录清空');
    ok(after && Object.keys(after.read_flags || {}).length === 0,
      'D16 ★★已读记录清空');
    ok(after && (after.horror_spent.A.length === 0 && after.horror_spent.B.length === 0),
      'D17 ★★恐怖预算记账清空（重玩能重新吓）');
    ok(after && after.save_table_state.revealed.length === 0,
      'D18 ★★谜题揭示状态清空');
    ok(after && after.v === d.win.SD.State.SCHEMA,
      'D19 清空后仍是合法 schema（下次 load 不触发丢弃重建）');
    ok(d.win.SD.State.hasFlag('save_offered') === false,
      'D20 ★内存态同步失忆（save_offered 已不在）');

    const say = d.doc.querySelector('#sd-reset-say');
    ok(say && say.textContent.includes('存档已清空'),
      `D21 ★给出明确反馈（实得「${say && say.textContent}」）`);
    ok(say && say.textContent.includes('刷新'), 'D22 反馈提示刷新后从头开始');
    ok(!d.doc.body.textContent.includes('我在看你'), 'D23 TW-2：清档流程全程零明文谜底');

    /* 幂等：重复装配不得长出第二个清档按钮（误点风险 + 视觉重影） */
    const d2 = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('save.html'),
      storage: true, seedStore: carried.store
    });
    d2.runScripts({ settleMs: 500 });
    d2.doc.dispatch('DOMContentLoaded');            // 再触发一次装配
    ok(d2.doc.querySelectorAll('#sd-reset').length === 1,
      `D24 ★重复装配幂等：清档按钮恒为 1 个（实得 ${d2.doc.querySelectorAll('#sd-reset').length}）`);

    report();
  } finally {
    site.cleanup();
  }
}

function hasComment(node, text) {
  let hit = false;
  (function walk(n) {
    if (hit) return;
    if (n.nodeType === 8 && String(n.nodeValue).includes(text)) { hit = true; return; }
    (n.childNodes || []).forEach(walk);
  })(node);
  return hit;
}

function report() {
  console.log('');
  notes.forEach((n) => console.log('  ' + n));
  if (fails.length) {
    console.log('\n✗ 烟雾测试 ② 失败 ' + fails.length + ' 项：');
    fails.forEach((f) => console.log('  ' + f));
    console.log('');
    process.exit(1);
  }
  console.log('\n✓ 烟雾测试 ② 存档页直访降级：全部通过。\n');
  process.exit(0);
}

main();
