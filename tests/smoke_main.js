/* ==========================================================================
   tests/smoke_main.js · 烟雾测试 ① 主对话流渲染

   在【GitHub Pages 子路径模拟】下加载真实 index.html，执行真实脚本，
   驱动一遍完整对话流，断言：

     S1  资源全部命中（0 个 404）—— 子路径部署不裸奔
     S2  页面引用零根绝对路径
     S3  对话渲染出气泡，且无未替换 token（{NAME} 等不得漏到屏上）
     S4  ★ X-2：投喂卡出处行【不含】2011 绝对历史日期，仅站名 + 楼主 ID
     S5  A-1 揭示走 pause 兜底，{gap}/{avg} 为真实实测值（非硬编码）
     S6  站内跳转 href 为相对路径 save.html
     S7  A2 页脚虚构声明已渲染
     S8  屏显红线：TW-2 / TW-3 / {pre_visit_ts} 零命中
     S9  ★ARG-BUILD-04 交互契约：choice 节点的三种形态各自渲染正确
         · options + free_input → 选项按钮 + 分隔线 + 输入框（并存）
         · 仅 options           → 只有按钮，无输入框
         · 仅 free_input        → 只有输入框，无按钮

   运行：node tests/smoke_main.js
   ========================================================================== */
'use strict';

const { createEnv } = require('./dom_shim');
const sim = require('./sim_site');

const fails = [];
const notes = [];
const warns = [];
const ok = (c, m) => { if (c) notes.push('✓ ' + m); else fails.push('✗ ' + m); };
const warn = (m) => warns.push('⚠ ' + m);

/* 每次交互区渲染后的实拍快照：node id → 交互区里到底有什么。
   S9 据此判定「数据声明的交互形态」与「屏上实际渲染」是否一致。 */
const dockShots = [];

/* ── 玩家驱动器 ────────────────────────────────────────────────────────
   数据驱动，不写死节点 ID：从 SD.Dialogue.current() 读当前节点，
   凡 measure.role === 'a1_probe' 的节点就注入长停顿。
   这样 85 节点脚本灌入后本测试仍然有效（架构承诺的一部分）。      */
function drive(env, plan) {
  const { doc, clock } = env;
  const SD = env.win.SD;
  const dock = doc.getElementById('sd-dock');
  const log = [];
  let guard = 0;

  env.withClock(() => {
    clock.runUntilIdle();
    while (guard++ < 60) {
      const cards = dock.querySelectorAll('.sd-card');
      const choices = dock.querySelectorAll('.sd-choice');
      const form = dock.querySelector('.sd-inputbar');
      if (!cards.length && !choices.length && !form) break;

      const cur = SD.Dialogue.current();
      const isProbe = !!(cur && cur.measure && cur.measure.role === 'a1_probe');
      const think = isProbe ? plan.probePauseMs : plan.thinkMs;

      /* ★ 交互区实拍（S9 的数据源）：只记录，判定留给 main() */
      if (cur && cur.kind === 'choice') {
        dockShots.push({
          id: cur.id,
          declOpts: (cur.options || []).length,
          declFree: !!(cur.free_input && cur.free_input.enabled),
          gotOpts: choices.length,
          gotForm: !!form,
          gotSep: !!dock.querySelector('.sd-dock__sep')
        });
      }

      clock.advance(think);

      /* plan.preferInput：并存节点上【不点按钮，改用自由输入】——
         验证并存后 free_input 主链路（fi.next）没有被选项挡掉。 */
      if (plan.preferInput && choices.length && form) {
        const inp2 = form.querySelector('.sd-input');
        inp2.value = plan.freeText;
        log.push({ type: 'input-beside-choices', node: cur && cur.id, probe: isProbe, think, value: inp2.value });
        form.dispatch('submit');
        clock.runUntilIdle();
        continue;
      }

      if (choices.length) {
        log.push({ type: 'choice', node: cur && cur.id, probe: isProbe, think, labels: choices.map((b) => b.textContent) });
        choices[plan.choiceIndex || 0].dispatch('click');
      } else if (cards.length) {
        log.push({
          type: 'feed', node: cur && cur.id, think,
          srcLines: cards.map((c) => c.querySelector('.sd-card__src').textContent)
        });
        cards[plan.feedIndex || 0].dispatch('click');
      } else {
        const inp = form.querySelector('.sd-input');
        const isName = !!(cur && cur.free_input && cur.free_input.capture === 'name_given');
        inp.value = isName ? plan.name : plan.freeText;
        log.push({ type: 'input', node: cur && cur.id, probe: isProbe, think, value: inp.value });
        form.dispatch('submit');
      }
      clock.runUntilIdle();
    }
  });
  return log;
}

function main() {
  const site = sim.build('sudu-reader');
  console.log('\n── 烟雾测试 ① 主对话流渲染 ───────────────────────────');
  console.log('  站点根（模拟域名根）: ' + site.siteRoot);
  console.log('  页面 URL 路径        : /' + site.page('index.html'));

  try {
    const env = createEnv({
      siteRoot: site.siteRoot,
      pagePath: site.page('index.html'),
      storage: true
    });

    /* S2：引用面审计（在执行前先看静态引用） */
    const rootAbs = env.refs().filter((r) => r.kind === 'root-absolute');
    ok(rootAbs.length === 0,
      `S2 零根绝对路径引用（发现 ${rootAbs.length} 处${rootAbs.length ? '：' + rootAbs.map((r) => r.ref).join(', ') : ''}）`);

    env.runScripts();

    /* S1：资源命中 */
    const notFound = env.loaded.filter((l) => l.status === 404);
    const threw = env.loaded.filter((l) => l.status === 'throw');
    ok(notFound.length === 0,
      `S1 脚本全部命中（404: ${notFound.length}${notFound.length ? ' → ' + notFound.map((n) => n.src).join(', ') : ''}）`);
    ok(threw.length === 0,
      `S1b 脚本执行无异常（${threw.length}${threw.length ? ' → ' + threw.map((t) => t.src + ': ' + t.error).join(' | ') : ''}）`);
    if (threw.length) { report(); return; }

    /* 非 script 资源（css / favicon）也要能命中 */
    const fs2 = require('fs');
    const missAsset = env.refs()
      .filter((r) => r.kind !== 'external' && r.file && !fs2.existsSync(r.file));
    ok(missAsset.length === 0,
      `S1c 样式/图标等资源命中（缺失 ${missAsset.length}${missAsset.length ? ' → ' + missAsset.map((m) => m.ref).join(', ') : ''}）`);

    /* ── 驱动对话：在 A-1 探针处停顿 9 秒 → 应走 pause 兜底 ───────── */
    const PAUSE_MS = 9000;
    const log = drive(env, {
      name: '阿岩',
      freeText: '你说。',
      thinkMs: 1200,
      probePauseMs: PAUSE_MS,
      feedIndex: 0,
      choiceIndex: 0
    });
    const probeStep = log.find((x) => x.probe);
    ok(!!probeStep, `S5-0 命中 A-1 探针节点（${probeStep ? probeStep.node : '未找到'}）`);

    const stream = env.doc.getElementById('sd-stream');
    const bubbles = stream.querySelectorAll('.sd-bubble').filter((b) => !b.classList.contains('sd-typing'));
    const screen = env.doc.body.textContent;

    ok(bubbles.length >= 8, `S3 渲染气泡 ${bubbles.length} 条（≥8）`);
    ok(log.some((x) => x.type === 'input'), 'S3b 触发自由输入（命名节点）');
    ok(log.some((x) => x.type === 'feed'), 'S3c 触发投喂卡三选一');
    ok(screen.includes('阿岩'), 'S3d 玩家命名已回显并被她使用');

    const leftover = screen.match(/\{[A-Za-z_:]+\}/g);
    ok(!leftover, `S3e 无未替换 token${leftover ? '（残留：' + [...new Set(leftover)].join(', ') + '）' : ''}`);

    /* ── S4 ★ X-2 核心断言 ─────────────────────────────────────────── */
    const feedEntry = log.find((x) => x.type === 'feed');
    const srcLines = feedEntry ? feedEntry.srcLines : [];
    console.log('\n  投喂卡出处行实测渲染：');
    srcLines.forEach((s) => console.log('    · ' + s));

    ok(srcLines.length === 3, `S4a 投喂卡 3 张（实得 ${srcLines.length}）`);
    ok(srcLines.every((s) => s.includes('汽水屋')), 'S4b 出处行含站名「汽水屋」(S6)');
    ok(srcLines.every((s) => /ID:/.test(s)), 'S4c 出处行含楼主 ID');
    const dateHit = srcLines.filter((s) => /\d{4}-\d{2}-\d{2}|20\d{2}/.test(s));
    ok(dateHit.length === 0,
      `S4d ★X-2 出处行不含绝对历史日期（命中 ${dateHit.length}${dateHit.length ? '：' + dateHit.join(' | ') : ''}）`);
    const screenDate = /2011[-年]?\d{0,2}/.test(screen);
    ok(!screenDate, 'S4e ★X-2 整屏无 2011 绝对历史日期');

    /* ── S5 A-1 兜底与真数 ─────────────────────────────────────────── */
    const SD = env.win.SD;
    const tier = SD.Behavior.pickA1Tier();
    const dw = SD.State.dwellAll();
    ok(tier === 'pause', `S5a A-1 兜底 tier = ${tier}（期望 pause，停顿 ${PAUSE_MS}ms）`);
    ok(dw.max_gap_ms >= 8000, `S5b 实测最长停顿 ${dw.max_gap_ms}ms（≥8000）`);

    const gapSecs = SD.Behavior.tokens()['{gap}'];
    ok(String(gapSecs) === String(Math.round(PAUSE_MS / 1000)),
      `S5c {gap} = ${gapSecs} 秒，等于注入的真实停顿（非硬编码）`);
    ok(screen.includes('' + gapSecs), `S5d 揭示台词含实测值 ${gapSecs}`);
    ok(SD.State.hasFlag('a1_tier_pause'), 'S5e a1_tier_pause 旗标已落盘');
    ok(SD.State.hasSpent('A', 'A-1'), 'S5f A-1 恐怖预算已记账（E7 刷新不重播）');

    /* ── S6 站内跳转相对路径 ───────────────────────────────────────── */
    const link = stream.querySelector('.sd-link');
    ok(!!link, 'S6a 渲染出站内跳转行');
    if (link) {
      const href = link.getAttribute('href');
      ok(href === 'save.html', `S6b 跳转 href = "${href}"（相对路径，子路径下可达）`);
      ok(!href.startsWith('/'), 'S6c 跳转 href 非根绝对路径');
    }
    ok(SD.State.hasFlag('save_offered'), 'S6d save_offered 旗标已置（存档页据此判定 E6）');

    /* ── S7 页脚声明 ───────────────────────────────────────────────── */
    ok(screen.includes('本站为虚构作品的一部分'), 'S7 A2 页脚虚构声明已渲染');

    /* ── S8 屏显红线 ───────────────────────────────────────────────── */
    ok(!screen.includes('我在看你'), 'S8a TW-2 明文谜底零命中');
    ok(!screen.includes('千绘'), 'S8b TW-3 叙述泄漏零命中');
    ok(!screen.includes('{pre_visit_ts}'), 'S8c 永不渲染 token 零命中');
    ok(!/gonglue|gl_/i.test(screen), 'S8d 元层禁词零命中');

    /* ── S9 ★ARG-BUILD-04：choice 三形态交互契约 ─────────────────────
       全程数据驱动，不写死节点 ID —— 形态由 sd_slice.js 的 options /
       free_input 声明决定，断言只比对「声明」与「实拍」是否一致。      */
    const both = dockShots.filter((s) => s.declOpts && s.declFree);
    const optsOnly = dockShots.filter((s) => s.declOpts && !s.declFree);
    const freeOnly = dockShots.filter((s) => !s.declOpts && s.declFree);

    console.log('\n  交互区实拍（choice 节点 · 声明 → 实渲染）：');
    dockShots.forEach((s) => {
      const decl = s.declOpts && s.declFree ? '选项+自由输入'
                 : s.declOpts ? '仅选项' : s.declFree ? '仅自由输入' : '空';
      console.log(`    · ${s.id.padEnd(8)} ${decl.padEnd(14)} → 按钮 ${s.gotOpts} 个`
                + ` / 输入框 ${s.gotForm ? '有' : '无'} / 分隔线 ${s.gotSep ? '有' : '无'}`);
    });

    ok(both.length > 0,
      `S9-0 走到「选项+自由输入」并存节点 ${both.length} 处（${[...new Set(both.map((s) => s.id))].join(', ') || '无'}）`);

    const bothBad = both.filter((s) => !(s.gotOpts === s.declOpts && s.gotForm));
    ok(bothBad.length === 0,
      `S9a ★并存节点同时渲染选项与输入框（异常 ${bothBad.length}`
      + `${bothBad.length ? '：' + bothBad.map((s) => `${s.id} 按钮${s.gotOpts}/输入框${s.gotForm ? '有' : '无'}`).join(' | ') : ''}）`);

    const sepBad = both.filter((s) => !s.gotSep);
    ok(sepBad.length === 0,
      `S9b 并存节点有视觉分隔线（缺失 ${sepBad.length}${sepBad.length ? '：' + sepBad.map((s) => s.id).join(', ') : ''}）`);

    const optsBad = optsOnly.filter((s) => !(s.gotOpts === s.declOpts && !s.gotForm));
    ok(optsBad.length === 0,
      `S9c 纯选项节点只渲染按钮、无输入框（实测 ${optsOnly.length} 处，异常 ${optsBad.length}`
      + `${optsBad.length ? '：' + optsBad.map((s) => s.id).join(', ') : ''}）`);

    const freeBad = freeOnly.filter((s) => !(s.gotOpts === 0 && s.gotForm));
    ok(freeBad.length === 0,
      `S9d 纯自由输入节点只渲染输入框、无按钮（实测 ${freeOnly.length} 处，异常 ${freeBad.length}`
      + `${freeBad.length ? '：' + freeBad.map((s) => s.id).join(', ') : ''}）`);

    /* 覆盖度：数据里声明的并存节点，本轮驱动应全部走到（漏一个则契约未验证） */
    const declaredBoth = ((env.win.SD_DATA || {}).dialogue_nodes || [])
      .filter((n) => n.kind === 'choice' && (n.options || []).length
                     && n.free_input && n.free_input.enabled)
      .map((n) => n.id);
    const seenBoth = new Set(both.map((s) => s.id));
    const missed = declaredBoth.filter((id) => !seenBoth.has(id));
    ok(missed.length === 0,
      `S9e 数据声明的并存节点全部被验证（声明 ${declaredBoth.length}：${declaredBoth.join(', ')}`
      + `${missed.length ? ' · 未走到：' + missed.join(', ') : ''}）`);

    /* ── S10 并存节点的【自由输入分支】：不点按钮也必须能推进 ─────────
       并存前，free_input 是这些节点唯一的出口；并存后它绝不能被选项挡掉。
       另起一个干净环境重跑一遍，全程改用输入框应答。                  */
    const env2 = createEnv({
      siteRoot: site.siteRoot,
      pagePath: site.page('index.html'),
      storage: true
    });
    env2.runScripts();
    dockShots.length = 0;
    const log2 = drive(env2, {
      name: '阿岩', freeText: '你说。', thinkMs: 1200, probePauseMs: PAUSE_MS,
      feedIndex: 0, choiceIndex: 0, preferInput: true
    });

    const beside = log2.filter((x) => x.type === 'input-beside-choices');
    ok(beside.length === declaredBoth.length,
      `S10a 并存节点全部走通自由输入分支（${beside.length}/${declaredBoth.length}：${beside.map((b) => b.node).join(', ')}）`);

    const screen2 = env2.doc.body.textContent;
    ok(!!env2.doc.getElementById('sd-stream').querySelector('.sd-link'),
      'S10b 走自由输入分支仍能跑到切片收尾（站内跳转行已渲染）');
    ok(env2.win.SD.State.hasFlag('save_offered'), 'S10c 自由输入分支同样置 save_offered');
    ok(screen2.includes('你说。'), 'S10d 并存节点的自由输入已回显为玩家气泡');
    ok(!/\{[A-Za-z_:]+\}/.test(screen2), 'S10e 自由输入分支无未替换 token');
    ok(!screen2.includes('我在看你') && !/gonglue|gl_/i.test(screen2),
      'S10f 自由输入分支屏显红线零命中（TW-2 / 元层禁词）');

    /* ── S11 ★ARG-BUILD-05-rev：右下角常驻系统时钟 ─────────────────────
       正常访问路径下，常驻时钟元素必须存在；且面板措辞克制、不含「调试/debug」，
       关闭后面板从 DOM 移除。 */
    const clockEl = env.doc.querySelector('[data-sd-clock]');
    ok(!!clockEl, 'S11a 右下角常驻时钟元素存在（正常访问路径）');
    if (clockEl) {
      ok(/^\d{1,2}:\d{2}$/.test(clockEl.textContent || ''),
        `S11b 时钟显示 HH:MM（实得「${clockEl.textContent}」）`);
    }
    if (clockEl) {
      clockEl.dispatch('click');                       // 点击 → 弹出设置面板
      const panel = env.doc.querySelector('[data-sd-clock-panel]');
      ok(!!panel, 'S11c 点击时钟弹出设置面板');
      if (panel) {
        const ptext = panel.textContent || '';
        ok(!/调试|debug/i.test(ptext), 'S11d 面板措辞克制（无「调试/debug」）');
        ok(ptext.includes('回到此刻'), 'S11e 面板含「回到此刻」清零入口');
        ok(!!panel.querySelector('[data-sd-clock-step="+1h"]'),
          'S11f 面板含 +1h 步进按钮（可快进）');
        SD.Clock.close();                              // 关闭即移除 DOM（任务要求）
        ok(!env.doc.querySelector('[data-sd-clock-panel]'), 'S11g 关闭后面板从 DOM 移除');
      }
    }

    /* ── S12 ★ARG-BUILD-05-rev：调时间快进 6h 冷却锁 ──────────────────
       now() = Date.now() + time_warp_ms；调偏移即可快进绕过 6h 冷却，
       且偏移钳制在 ±7 天（防年份错乱，X-2 安全）。 */
    SD.Timeline.armNextAvailable();
    const st0 = SD.Timeline.nextAvailableState();
    ok(st0.early === true, 'S12a 初始（偏移0）6h 冷却未到（early=true）');

    SD.State.setWarp(7 * 3600 * 1000);                // +7h，越过 6h 冷却
    const st1 = SD.Timeline.nextAvailableState();
    ok(st1.early === false, 'S12b ★+7h 偏移后冷却被快进绕过（early=false，可直接重访）');
    ok(SD.State.getWarp() === 7 * 3600 * 1000, 'S12c 偏移已写入 time_warp_ms（+7h）');

    SD.State.setWarp(0);                              // 回到此刻
    const st2 = SD.Timeline.nextAvailableState();
    ok(st2.early === true, 'S12d 「回到此刻」清空偏移后冷却恢复（early=true）');

    SD.State.setWarp(999 * 24 * 3600 * 1000);         // 远超 7 天
    ok(SD.State.getWarp() === 7 * 24 * 3600 * 1000,
      'S12e 偏移钳制在 +7 天（防年份错乱，X-2 安全）');
    SD.State.setWarp(0);

    /* ── S13 ★DEF-01 / TQ-01：{pre_visit_ts} 回访提示形态 ──────────────
       裸 HH:MM 会在桌面壳同屏被系统托盘时钟吃掉「早 3 天」的信息量，
       A-2 这个 A 类强异常就静默失效（且旧实现直接吐绝对年月日，破 X-2）。
       修复形态：「N 天前 · HH:MM」—— 相对日 + 绝对时分，永不含年份。 */
    const screenNow = env.doc.body.textContent;
    const retLine = env.doc.getElementById('sd-stream')
      .querySelectorAll('.sd-sys')
      .map((n) => n.textContent || '')
      .find((t) => t.includes('存档 002 已写入'));

    ok(!!retLine, 'S13a 回访提示行已渲染（SS-078 · A-2 时间倒错）');
    if (retLine) {
      console.log('\n  回访提示行实测渲染：\n    · ' + retLine);
      ok(/\d+\s*天前\s*·\s*\d{1,2}:\d{2}/.test(retLine),
        `S13b ★DEF-01 形态为「N 天前 · HH:MM」（实得「${retLine}」）`);
      ok(!/(19|20)\d{2}/.test(retLine),
        `S13c ★X-2 回访提示行不含绝对年份（实得「${retLine}」）`);
      ok(!/^\s*存档 002 已写入 · \d{1,2}:\d{2}\s*$/.test(retLine),
        'S13d 回访提示不是裸 HH:MM（桌面壳同屏不与托盘时钟撞脸）');
    }

    /* 整屏绝对年份/日期扫描（X-2 硬门槛，不限于 2011） */
    const yearHits = screenNow.match(/(?:19|20)\d{2}(?:\s*[-/年]\s*\d{1,2})?/g) || [];
    ok(yearHits.length === 0,
      `S13e ★X-2 整屏 0 个绝对年份/日期（命中 ${yearHits.length}`
      + `${yearHits.length ? '：' + [...new Set(yearHits)].join(' | ') : ''}）`);

    /* 同屏双时钟辨识度：托盘时钟裸 HH:MM，回访提示必须带相对日前缀 */
    const trayEl = env.doc.querySelector('[data-sd-clock]');
    const trayTxt = trayEl ? (trayEl.textContent || '') : '';
    ok(/^\d{1,2}:\d{2}$/.test(trayTxt) && !!retLine && /天前/.test(retLine),
      `S13f ★同屏两个时钟形态可区分（托盘「${trayTxt}」= 裸 HH:MM`
      + ` vs 回访「N 天前 · HH:MM」）`);

    /* 相对天数由 offset 折算，非写死「3」（通用性回归） */
    ok(SD.Timeline.relDayLabel(-259200000) === '3 天前'
      && SD.Timeline.relDayLabel(-86400000) === '1 天前'
      && SD.Timeline.relDayLabel(-604800000) === '7 天前',
      'S13g 相对天数按 pre_visit_offset_ms 通用折算（−1d/−3d/−7d 各自正确）');
    ok(!/(19|20)\d{2}/.test(SD.Timeline.fmtRelStamp(Date.now(), -259200000)),
      'S13h fmtRelStamp 任何输入下都不产出年份（X-2 结构性保证）');

    /* ── S14 ★DEF-02：A 类 beat 的重播粒度（E7 语义） ──────────────────
       A-2 横跨 7 个节点共用一个 budget_id。同会话内必须整段播完；
       只有【刷新后再来】才不重播。两条都要守住，缺一不可：
         · 守不住前者 → SS-078 静默，A-2 白花（本次修的就是它）
         · 守不住后者 → 刷新就再吓一次，E7 破功                       */
    ok(SD.State.hasSpent('A', 'A-2') === true,
      'S14a A-2 已在本会话记账（预算仍是 2/2，未多占席位）');
    ok(SD.State.spentBefore('A', 'A-2') === false,
      'S14b ★同会话内 A-2 beat 不被自我截断（spentBefore=false → 7 个节点整段播完）');

    const a2Nodes = ['SN-076', 'SN-077', 'SS-078', 'SN-082', 'SN-083'];
    const unread = a2Nodes.filter((id) => !SD.State.isRead('node:' + id));
    ok(unread.length === 0,
      `S14c ★A-2 beat 全部节点均已播出（漏播 ${unread.length}`
      + `${unread.length ? '：' + unread.join(', ') : ''}）`);

    SD.State.load();                                  // 模拟一次刷新：重读存档 + 重取快照
    ok(SD.State.spentBefore('A', 'A-2') === true,
      'S14d ★E7 刷新不重播：重载后 A-2 转为已花，回访不再重演强异常');
    ok(SD.State.spentBefore('A', 'A-1') === true,
      'S14e ★E7 刷新不重播：A-1 同样不重演');

    report();
  } finally {
    site.cleanup();
  }
}

function report() {
  console.log('');
  notes.forEach((n) => console.log('  ' + n));
  if (warns.length) {
    console.log('\n  ── 警告（不阻断，但需主理人知悉） ──');
    warns.forEach((w) => console.log('  ' + w));
  }
  if (fails.length) {
    console.log('\n✗ 烟雾测试 ① 失败 ' + fails.length + ' 项：');
    fails.forEach((f) => console.log('  ' + f));
    console.log('');
    process.exit(1);
  }
  console.log('\n✓ 烟雾测试 ① 主对话流渲染：全部通过。\n');
  process.exit(0);
}

main();
