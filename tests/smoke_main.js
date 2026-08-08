/* ==========================================================================
   tests/smoke_main.js · 烟雾测试 ① 主对话流渲染

   在【GitHub Pages 子路径模拟】下加载真实 index.html，执行真实脚本，
   驱动一遍完整对话流，断言：

     S1  资源全部命中（0 个 404）—— 子路径部署不裸奔
     S2  页面引用零根绝对路径
     S3  对话渲染出气泡，且无未替换 token（{NAME} 等不得漏到屏上）
     S4  ★ X-2：投喂卡出处行【不含】2011 绝对历史日期，仅站名 + 楼主 ID
     S5  A-1 揭示走 pause 兜底，{gap}/{avg} 为真实实测值（非硬编码）
     S6  站内跳转 href 为相对路径 ../save.html（BUILD-11 后本页在 /sd/）
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
  console.log('  页面 URL 路径        : /' + site.page('sd/index.html'));

  try {
    const env = createEnv({
      siteRoot: site.siteRoot,
      pagePath: site.page('sd/index.html'),
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
    /* ARG-BUILD-12 · 组6（D-G1R-02）：CF-1 出处 ID 已修 —— 三张卡的楼主
       是论坛真实 ID（苏打志 / 北窗 / 闲客），不再是 ID:tsubame_02 这类
       不存在的账号。X-1：与 /qsw/ 论坛署名逐字一致。 */
    const realUids = ['苏打志', '北窗', '闲客'];
    ok(srcLines.every((s) => realUids.some((n) => s.includes(n))),
      'S4c ★组6 出处行含论坛真实楼主（苏打志/北窗/闲客，CF-1 已修）');
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
      /* ARG-BUILD-11 / S15：本页从 `/` 迁到 `/sd/`，世界数据里仍写裸名
         `save.html`，由 SD.Router.rel() 在渲染期补 `../`。断言盯的是
         【解析结果】而非数据原文 —— 83 个节点一个字都没动。 */
      ok(href === '../save.html', `S6b 跳转 href = "${href}"（rel() 补出 ../，/sd/ 下可达）`);
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
      pagePath: site.page('sd/index.html'),
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

    /* ── S15 ★ARG-BUILD-07：G-1 可玩性（arc_entry 续弧 + 结局判定挂点） ──
       切片收尾后，sd_dialogue.onEnd() 的通用「续弧接续」应把当前弧接到
       tags 含 arc_entry 的节点（SD-001），并一路走到 SD-090（幕 5 收尾）。
       全程零硬编码 ID 的接线；SD-088 判定挂点静默写入 state.ending。   */
    ok(SD.State.isRead('node:SD-001'), 'S15a ★G-1 续弧已进入（arc_entry 入口门闩已标记）');
    ok(SD.State.isRead('node:SD-002') || SD.State.isRead('node:SD-001'),
      'S15b G-1 开场对偶分支已渲染（新玩家走 SD-002「你还在。」）');
    ok(SD.State.isRead('node:SD-090'), 'S15c ★G-1 走完：SD-090（幕5 留白收尾）已播出');
    const ss085n = ((env.win.SD_DATA || {}).dialogue_nodes || [])
      .find(function (n) { return n.id === 'SS-085'; });
    ok(!!ss085n && ss085n.next === null,
      'S15d EXT-0：SS-085.next 保持 null（接续靠 arc_entry 通用能力，未硬接线）');
    const ending = SD.State.get().ending;
    ok(['E-shallow', 'E-mixed', 'E-true'].indexOf(ending) >= 0,
      `S15e ★SD-088 结局判定挂点已静默写入 state.ending（实得「${ending}」，合法三值之一）`);
    ok(SD.Ending && typeof SD.Ending.decide === 'function', 'S15f sd_ending.js 已挂载（SD.Ending.decide）');

    /* ── S16 结局判定确定性（三轴分数值域 + TRS/RET 贡献） ────────────
       只更新期望值/计数类断言；红线段落零削弱。scores() 为前台零泄漏的
       测试面，值域与贡献方向锁定公式实现。                              */
    const sc = SD.Ending.scores();
    ok(sc.att >= 0 && sc.att <= 1, `S16a ATT ∈ [0,1]（实得 ${sc.att.toFixed(3)}）`);
    ok(sc.trs >= 0 && sc.trs <= 1, `S16b TRS ∈ [0,1]（实得 ${sc.trs.toFixed(3)}）`);
    ok(sc.ret >= 0, `S16c RET ≥ 0（实得 ${sc.ret}）`);

    /* TRS：G-1 全弧驱动后 Q_probe=2（SD-021/SD-041）+ b3 经 SS-061 置位 →
       trs = 0.70×(1/6) + 0.30×min(2/5,1) ≈ 0.2367（确定性基线） */
    const trsBase = SD.Ending.trsScore();
    ok(Math.abs(trsBase - 0.2367) < 0.01,
      `S16d ★TRS 基线确定（Q_probe=2 + b3 → ≈0.2367，实得 ${trsBase.toFixed(4)}）`);
    /* b2：标记到访过 /save → TRS 应增加 0.70×(1/6) ≈ 0.1167 */
    SD.State.get().read_flags['page:/save'] = Date.now();
    SD.State.commit();
    const trsB2 = SD.Ending.trsScore();
    ok(trsB2 - trsBase > 0.10 && trsB2 - trsBase < 0.13,
      `S16e ★b2 派生位计入 TRS（+${(trsB2 - trsBase).toFixed(4)}，期望 ≈+0.1167）`);
    delete SD.State.get().read_flags['page:/save'];
    SD.State.commit();

    /* RET 系列必须在虚拟时钟内断言：S().now() 是「统一时间源」，与
       first_visit_at（虚拟时钟内写入）同源；脱离虚拟时钟后 Date.now()
       跳回真实墙钟，跨日判定会把「今天」误判成跨了日。 */
    let ret0, retSeeded, warpBefore, warpAfter;
    env.withClock(() => {
      ret0 = SD.Ending.retScore();
      /* 注入跨会话离开 → RET ≥ 1 */
      const dNow = Date.now();
      SD.State.get().leave_ts = [
        { at: dNow - 3 * 86400000, from: '/', method: 'x' },
        { at: dNow - 1 * 86400000, from: '/', method: 'x' }
      ];
      SD.State.get().timeline.first_visit_at = dNow - 4 * 86400000;
      SD.State.commit();
      retSeeded = SD.Ending.retScore();
      /* EC-02 反作弊：改时间 → 跨日 N_daycross 归零（只剩 session gap） */
      warpBefore = retSeeded;
      SD.State.setWarp(7 * 3600 * 1000);
      warpAfter = SD.Ending.retScore();
      SD.State.setWarp(0);
    });
    ok(ret0 === 0, `S16f RET 无回访记录 = 0（实得 ${ret0}）`);
    ok(retSeeded >= 2, `S16g ★跨会话回访计入 RET（注入 2 次离开 → ${retSeeded} ≥ 2）`);
    ok(warpAfter < warpBefore,
      `S16h ★改时间不能刷回访：N_daycross 归零（${warpBefore} → ${warpAfter}）`);
    ok(SD.State.hasFlag('sd_b4_warp_seen'), 'S16i 反作弊置 b4（sd_b4_warp_seen）');
    /* 复原（S16 是本环境的最后一段，复原仅为不污染后续输出） */
    env.withClock(() => {
      SD.State.get().leave_ts = [];
      SD.State.get().timeline.first_visit_at = null;
      SD.State.commit();
    });

    /* ── S17 ★回访玩家结局分化（KD-03 / D-G1-03 端到端） ─────────────
       预置「3 天前离开过」的存档 → RET ≥ 1；TRS 低（未越界）。
       KD-03 的灵魂：E-true 的门槛不是「做得多」，是「有分寸」——
       快进不细读（att<0.55）连回访玩家也拿不到真结局；认真读
       （自陈节点停留 ≥ baseline）才命中 E-true。 */
    const retStart = Date.parse('2026-03-05T12:00:00Z');
    const seedSave = {
      v: 1,
      timeline: { first_visit_at: retStart - 3 * 86400000 },
      leave_ts: [{ at: retStart - 3 * 86400000, from: '/', method: 'seed' }]
    };
    const envR = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'),
      storage: true, startMs: retStart,
      seedStore: { 'sudu_save_v1': JSON.stringify(seedSave) }
    });
    envR.runScripts();
    const logR = drive(envR, {
      name: '阿岩', freeText: '你说。', thinkMs: 1200, probePauseMs: PAUSE_MS,
      feedIndex: 0, choiceIndex: 0
    });
    const screenR = envR.doc.body.textContent;
    ok(screenR.includes('你回来了。'),
      'S17a ★回访玩家开场渲染 SD-001「你回来了。」（b5 分支）');
    ok(screenR.includes('上次你走了以后'),
      'S17b ★回访痕迹 B-K3 渲染（SD-083「上次你走了以后…」）');
    ok(envR.win.SD.State.get().ending === 'E-mixed',
      'S17c ★快进不细读：回访玩家 att<0.55 → 兜底 E-mixed（E-true 需有分寸，KD-03）');
    /* 模拟「认真读」：把自陈节点停留补到恰好 = baseline（R_dwell 每节点 1.0，
       不触发 EC-03 离席剔除），再跑一遍判定 → 应命中 E-true。 */
    const confessR = envR.win.SD.Ending.confessNodes();
    envR.withClock(() => {
      const dwR = envR.win.SD.State.get().dwell_ms;
      confessR.forEach(function (n) {
        const clean = String(n.text || '').replace(/\{[A-Za-z_:]+\}/g, '');
        dwR['node:' + n.id] = clean.length * 220;
      });
      envR.win.SD.State.commit();
    });
    const endingCareful = envR.win.SD.Ending.decide();
    ok(endingCareful === 'E-true',
      'S17d ★认真读 + 回访 + 不越界 → E-true（KD-03：真结局要求有分寸）');

    /* ── S18 ★ARG-BUILD-08：/save 常驻入口（受邀才出现） ────────────────
       这条守的是 N3：入口不是导航条，是「她递出存档之后没关的门」。
       故必须双向验证 —— 没被邀请前【不存在】，被邀请后【跨页存活】。
       清档按钮本体在存档页，验证见 smoke_save.js 场景 D。            */
    const envFresh = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
    });
    envFresh.runScripts({ settleMs: 0 });          // 只装配，不驱动对话
    const retFresh = envFresh.doc.querySelector('[data-sd-ret]');
    ok(!!retFresh, 'S18a 常驻入口容器存在于 index.html');
    ok(!envFresh.doc.querySelector('.sd-ret__a'),
      'S18b ★未被邀请 → 不渲染 /save 入口（N3：不做常驻导航）');
    ok((retFresh ? retFresh.textContent : 'x') === '',
      'S18c 未被邀请时容器为空（:empty 收边距，不占版面）');

    /* 携带「已被邀请」的真实存档重开一页 —— 模拟同一浏览器下次进来 */
    const envInvited = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'),
      storage: true, seedStore: env.localStorage._dump()
    });
    envInvited.runScripts({ settleMs: 0 });
    const retA = envInvited.doc.querySelector('.sd-ret__a');
    ok(!!retA, 'S18d ★已被邀请 → 重开页面时 /save 入口常驻（跨会话到达）');
    if (retA) {
      const rHref = retA.getAttribute('href');
      ok(rHref === '../save.html', `S18e 入口 href = "${rHref}"（rel() 补出 ../，相对路径）`);
      ok(!rHref.startsWith('/'), 'S18f 入口 href 非根绝对路径（红线⑨）');
    }
    /* R2：入口只能是一扇门，不许夹带进度 / 计数 / 完成度 */
    const retTxt = envInvited.doc.querySelector('[data-sd-ret]').textContent;
    ok(!/\d+\s*\/\s*\d+|%|进度|完成|成就/.test(retTxt),
      `S18g ★R2 入口不含任何进度/计数/成就字样（实得「${retTxt}」）`);

    /* ── S19 ★ARG-BUILD-12 · 组5.1 V-R1 引用块 + V-R5 命中反馈红线 ─────
       {FRAG} 的容器是【第三类视觉物】—— 既不是她的气泡也不是你的气泡。
       本段直测渲染器 API（引擎尚未接线，但渲染器已就位）：
         · fragBlock 产出 .sd-frag（无气泡、左侧 1px 竖线、行距紧）
         · fragHit 只做底色一闪（V-R5：禁 toast / 勾号 / 色相变化 / 音效） */
    const streamEl = env.doc.getElementById('sd-stream');
    const frag = SD.Render.fragBlock('这是从那边来的。\n第二行也保留。');
    ok(!!frag && frag.className.indexOf('sd-frag') >= 0,
      'S19a ★V-R1 fragBlock 渲染出 .sd-frag（第三类视觉物）');
    ok(!!frag && frag.className.indexOf('sd-bubble') < 0,
      'S19b ★引用块不是她的气泡也不是你的气泡（无 sd-bubble 类）');
    ok(!!frag && frag.textContent.indexOf('\n') >= 0,
      'S19c ★引用块保留原始换行（V-R1）');
    if (frag && frag.parentNode) frag.parentNode.removeChild(frag);

    /* V-R5：命中反馈只能是引用文字自身的底色一闪，无文字、无图标 */
    const frag2 = SD.Render.fragBlock('触发一闪');
    SD.Render.fragHit(frag2);
    ok(!!frag2 && frag2.classList.contains('sd-frag--hit'),
      'S19d ★V-R5 fragHit 只挂底色一闪类（sd-frag--hit）');
    const hitTxt = frag2.textContent || '';
    ok(!/已收下|✓|勾|成功|收到/.test(hitTxt),
      `S19e ★V-R5 命中反馈无文字 / 勾号 / 成功语汇（实得「${hitTxt}」）`);
    if (frag2 && frag2.parentNode) frag2.parentNode.removeChild(frag2);

    /* 引用块容器是【被动的】：文字原样进出，日期剥离是引擎 normalize()
       的职责（X-2），不放在渲染层 —— 否则两个 token 各自处理会重复/漏掉。 */
    const frag3 = SD.Render.fragBlock('她读出的那段文字');
    ok(!!frag3 && frag3.textContent === '她读出的那段文字',
      'S19f ★V-R1 容器是被动渲染（原样进出，日期剥离归引擎 normalize()，X-2 不落渲染层）');
    if (frag3 && frag3.parentNode) frag3.parentNode.removeChild(frag3);

    /* ── S20 ★ARG-BUILD-12 · 组2 投喂引擎骨架（normalize / 四层判定 / CF-3）─
       引擎机制直测。marker_table 骨架期为空（真别名等文策渊），故：
         · T-hit 不可达 → U-0/U-1/U-2 全链路可验
         · normalize 第 6 步日期剥离是 X-2 红线，必须单测（AS-3）
         · SC-029 idiolect 排除 / SD-068 b11 优先 / SC-035 a1_probe 隔离
           是 CF-3 三条执行顺序，各占一条断言                       */
    const F = env.win.SD.Feed;
    ok(!!F, 'S20a ★SD.Feed 引擎已挂载（js/sd_feed.js）');

    /* normalize 七步 + X-2 日期剥离（AS-3）。
       ⚠️ 判据用「20xx 年份」而非任意 4 位数字 —— 13:27 这类时刻残留在
       剥离后仍是 1327，它不可怕；可怕的只有 2011/2019 这类绝对年份。 */
    const normDate = F.normalize('1 楼 苏打志 ｜ 2011-02-09 13:27 沉默也是一种选项。');
    ok(!/(?:19|20)\d{2}/.test(normDate), `S20b ★normalize 剥离绝对年份（AS-3，实得「${normDate}」）`);
    ok(normDate.indexOf('沉默也是一种选项') >= 0, 'S20c ★normalize 保留正文（只剥离日期）');
    ok(F.normalize('  2011/2/9 论坛  ') === '论坛', 'S20d ★normalize 处理斜杠日期与空白');
    ok(F.normalize('2011年2月9日 归档') === '归档', 'S20e ★normalize 处理中文日期');

    /* 四层判定（Wave 2 真别名接线后：marker 13 条全量 → T-hit 可达） */
    ok(F.classify('短').tier === 'U-0', 'S20f ★U-0：规范化后 <4 字 → 忽略');
    ok(F.classify('随便聊聊今天天气').tier === 'U-2', 'S20g ★U-2：无关输入走普通聊天');
    ok(F.classify('那个论坛的路线存档在哪里').tier === 'U-1',
      'S20h ★U-1：含类词（论坛/路线/存档）→ 近场未命中');
    const tHit = F.classify('沉默也是一种选项');
    ok(tHit.tier === 'T-hit' && tHit.marker && tHit.marker.key === 'mk_silence_option',
      'S20i ★★Wave 2 T-hit 可达（真别名接线：沉默也是一种选项 → mk_silence_option）');
    ok(tHit.tier === 'T-hit' && (tHit.marker.sfNodes || []).length === 3,
      `S20i2 ★T-hit 携带 SF 反应串（${tHit.tier === 'T-hit' ? tHit.marker.sfNodes.length : 0} 句，SF-001/002/003）`);
    /* 冗余别名（含句号 / 异写）也应命中同一 marker（FD-H2） */
    ok(F.classify('沉默也是一种选项。').marker &&
       F.classify('沉默也是一种选项。').marker.key === 'mk_silence_option',
      'S20i3 ★含句号别名同样命中（normalize 删标点，FD-H2）');
    ok(F.classify('THE DOOR IS CLOSED').marker &&
       F.classify('THE DOOR IS CLOSED').marker.key === 'mk_door_closed',
      'S20i4 ★英文原文别名命中 mk_door_closed（ROT13 解码后）');

    /* {FRAG}：80 字截断 + …… + 日期剥离（AS-3） */
    const fragText = F.fragText('2011-02-09 ' + '长'.repeat(100));
    ok(fragText.indexOf('2011') < 0, 'S20j ★{FRAG} 渲染前也剥离日期（双点 X-2）');
    ok(fragText.length <= 80 + 2 && fragText.endsWith('……'),
      `S20k ★{FRAG} 80 字截断补「……」（实得 ${fragText.length} 字）`);
    ok(F.fragText('a\nb\nc\nd') === 'a\nb\nc', 'S20l ★{FRAG} 最多保留 2 处换行');

    /* U-1 节流：3 次 → 第 4 次降级 → 7 次静默 */
    ok(F.u1Lines(1).length === 3 && F.u1Lines(2).length === 3,
      'S20m ★U-1 前 3 次播完整三句');
    ok(F.u1Lines(4)[0] === '……我还是读不出来。',
      'S20n ★U-1 第 4 次起降级为单句');
    ok(F.u1Lines(7).length === 0, 'S20o ★U-1 第 7 次起完全静默');

    /* CF-3 · SC-029 idiolect 排除：命中输入不得进语料池（AS-5） */
    const inputBefore = SD.State.inputs().length;
    SD.Feed.resetSession();
    /* 手工驱动一次 SC-029 的提交（经 Dialogue 内部通路） */
    const sc029 = env.win.SD_DATA.dialogue_nodes.find((nn) => nn.id === 'SC-029');
    ok(!!sc029 && !!SD.Dialogue.node('SC-029'),
      'S20p ★CF-3 前置：SC-029 节点可达');
    /* 走 submitFree 通路模拟：喂一段论坛味输入（含类词，U-1 命中） */
    const oldGo = env.win.SD.Dialogue.go;
    env.win.SD.Dialogue.go = function () {};          // 阻断推进，只测采集
    SD.Dialogue.submitFree(sc029, sc029.free_input, '论坛里说，路线要存档');
    env.win.SD.Dialogue.go = oldGo;
    const inputsAfter = SD.State.inputs().length;
    ok(inputsAfter === inputBefore,
      `S20q ★CF-3 / AS-5：SC-029 的 U-1 命中输入未进 idiolect 语料池（${inputBefore} → ${inputsAfter}）`);

    /* CF-3 · SD-068 b11 优先：b11 判定先于投喂（提交路径已按序） */
    ok(sc029 && sc029.measure && sc029.measure.role === 'idiolect',
      'S20r ★CF-3 数据：SC-029 承担 idiolect 采集（排除逻辑生效的前提）');

    /* feed_hooks：SC-015 投喂窗口开、SC-005 排除（AS-6） */
    ok(F.hookOf('SC-015') && F.hookOf('SC-015').max_len === 140,
      'S20s ★UX-2：SC-015 投喂窗口 max_len 放宽 140（不改节点数据，FH-1）');
    ok(F.hookOf('SC-005') === null && F.hookOf('SC-057') === null,
      'S20t ★AS-6：SC-005 / SC-057 不在投喂窗口（命名 / 谜题通道唯一）');

    /* ── S21 ★ARG-BUILD-12 · 组3 结局轴修复（CF-2 验收）─────────────
       D-G1R-01 甲案已拍板：
         · trs_seed 时序快照（首次投喂那一刻快照 b6/b7/b8）
         · TRS-α：T-hit 输入从 Q_probe 分子剔除
         · TRS-β：U-1 输入同样剔除；near_miss 不进任何轴
         · trsHi() = TRS_HI_FULL（0.67）
       验收：模拟「认真检索玩家」轨迹（开归档 + 读多页 + 命中多条），
       断言 TRS < 0.67 且可达 E-true —— 我们即将鼓励的行为，系统不再惩罚。 */
    const envCf2 = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
    });
    envCf2.runScripts({ settleMs: 0 });
    const SC2 = envCf2.win.SD.State;
    const EC2 = envCf2.win.SD.Ending;

    envCf2.withClock(() => {
      /* ── 认真检索玩家轨迹 ──
         1) 首次投喂发生在翻论坛【之前】→ 快照时 b6/b7/b8 全 false */
      SC2.flag('sd_b1_fed', true);
      SC2.seedTrs();
      ok(SC2.trsSeed() && SC2.trsSeed().b6 === false && SC2.trsSeed().b7 === false &&
         SC2.trsSeed().b8 === false,
        'S21a ★trs_seed 首次投喂快照 b6/b7/b8 = 0/0/0（受邀前未翻）');

      /* 2) 受邀后翻论坛：b6/b7/b8 实时置位（受邀后行为，不入 TRS） */
      SC2.flag('sd_b6_qsw_seen', true);
      SC2.flag('sd_b7_qsw_deep', true);
      SC2.flag('sd_b8_sh_seen', true);

      /* 3) 受邀去 /save → b2 派生位 */
      SC2.get().read_flags['page:/save'] = Date.now();

      /* 4) 多次 T-hit / U-1 投喂输入（TRS-α/β 应从 Q_probe 剔除）。
            （生产里 T-hit/U-1 不进 input_history；这里用带 role 标记的
              pushInput 验证 qProbe 的防御性剔除也成立 —— 双保险。） */
      SC2.pushInput('SD-041', '沉默也是一种选项。', 'feed_hit');
      SC2.pushInput('SD-047', 'v2 到 v3 之间路线有没有被偷偷改过', 'feed_hit');
      SC2.pushInput('SD-041', '那个论坛的路线存档在哪里', 'near_miss');
      /* 5) 还有真正的检索式输入（疑问式，非投喂）→ 会计入 Q_probe */
      SC2.pushInput('SD-021', '第 4 页多出来的那句是什么？', 'sd_g1_probe');

      /* 6) ATT：认真阅读（自陈节点 dwell = baseline，无 EC-03 剔除；
            同时 markRead —— ATT R_read 分子依赖已读标记） */
      const confessCf2 = EC2.confessNodes();
      const dwCf2 = SC2.get().dwell_ms;
      confessCf2.forEach(function (n) {
        const clean = String(n.text || '').replace(/\{[A-Za-z_:]+\}/g, '');
        dwCf2['node:' + n.id] = clean.length * 220;
        SC2.markRead('node:' + n.id);
      });
      /* 7) RET：跨会话回访 */
      const dNowCf2 = Date.now();
      SC2.get().leave_ts = [
        { at: dNowCf2 - 3 * 86400000, from: '/', method: 'x' },
        { at: dNowCf2 - 1 * 86400000, from: '/', method: 'x' }
      ];
      SC2.get().timeline.first_visit_at = dNowCf2 - 4 * 86400000;
      SC2.commit();

      const scCf2 = EC2.scores();
      /* TRS 期望：P_set = b2(1) + trs_seed(0) + b9(0) = 1
         Q_probe = 1（仅 sd_g1_probe 那条，feed_hit/near_miss 被剔除）
         TRS = 0.70×(1/6) + 0.30×min(1/5,1) = 0.1167 + 0.06 = 0.1767 */
      console.log('\n  [CF-2 验收] 认真检索玩家：ATT=' + scCf2.att.toFixed(3) +
        ' TRS=' + scCf2.trs.toFixed(3) + ' RET=' + scCf2.ret);
      ok(scCf2.trs < 0.67,
        `S21b ★★CF-2 修复：认真检索玩家 TRS = ${scCf2.trs.toFixed(3)} < 0.67（现行公式会顶到 0.767 ≥ 0.67）`);
      ok(scCf2.att >= 0.55 && scCf2.ret >= 1,
        `S21c ★认真检索玩家 ATT=${scCf2.att.toFixed(3)}≥0.55 且 RET=${scCf2.ret}≥1（E-true 的另两轴达标）`);
      const endingCf2 = EC2.decide();
      ok(endingCf2 === 'E-true',
        `S21d ★★CF-2 验收：认真检索玩家可达 E-true（实得「${endingCf2}」）`);

      /* ── 反向验证：真正越界（未受邀就翻 + 检索式输入刷满）仍被挡 ──
         从未投喂（trs_seed=null）→ TRS 用实时 b6/b7/b8 = 3 + b2 = 4，
         Q_probe 5 条顶满 → TRS = 0.467 + 0.30 = 0.767 ≥ 0.67 → E-mixed */
      const envT = createEnv({
        siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
      });
      envT.runScripts({ settleMs: 0 });
      const ST2 = envT.win.SD.State;
      const ET2 = envT.win.SD.Ending;
      envT.withClock(() => {
        ST2.flag('sd_b6_qsw_seen', true);
        ST2.flag('sd_b7_qsw_deep', true);
        ST2.flag('sd_b8_sh_seen', true);
        ST2.get().read_flags['page:/save'] = Date.now();
        ['那个论坛的路线存档在哪里', '第 4 页多出来的那句是什么',
         '傍晚颜色是哪个游戏', '行为记录存在哪里', '为什么结局有分歧'].forEach(function (q) {
          ST2.pushInput('SD-021', q, 'sd_g1_probe');
        });
        const dwT = ST2.get().dwell_ms;
        ET2.confessNodes().forEach(function (n) {
          const clean = String(n.text || '').replace(/\{[A-Za-z_:]+\}/g, '');
          dwT['node:' + n.id] = clean.length * 220;
          ST2.markRead('node:' + n.id);
        });
        const dNowT = Date.now();
        ST2.get().leave_ts = [
          { at: dNowT - 3 * 86400000, from: '/', method: 'x' },
          { at: dNowT - 1 * 86400000, from: '/', method: 'x' }
        ];
        ST2.get().timeline.first_visit_at = dNowT - 4 * 86400000;
        ST2.commit();
        const scT = ET2.scores();
        ok(scT.trs >= 0.67,
          `S21e ★★真正越界（未受邀翻页 + 检索刷满）：TRS = ${scT.trs.toFixed(3)} ≥ 0.67 → 仍被 0.67 挡住（E-true 需有分寸）`);
        const endingT = ET2.decide();
        ok(endingT !== 'E-true',
          `S21f ★真正越界玩家不可达 E-true（实得「${endingT}」）`);
      });
    });

    /* ── S22 ★ARG-BUILD-12 · 组2 真别名接线端到端（T-hit 闭环）──────
       {FRAG} 引用块 → SF 反应串播报 → 记录/ 升格（feed_log）→ 回原 next。
       FM-1：链结构永不因投喂改变。GD-5：首次命中写第一行（24 字截断）。
       ⚠️ 「回原 next」验证：submitFree 内部的 go 是模块闭包，外部 override
       SD.Dialogue.go 不生效 —— 改用【合成 fi.next 哨兵】+ onEnd 打点：
       播完若 go 回到 fi.next，哨兵节点不存在 → onEnd → SD.onDialogueEnd。 */
    const envG = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
    });
    envG.runScripts({ settleMs: 0 });
    const SG = envG.win.SD.State;
    const DG = envG.win.SD.Dialogue;
    const sc029G = envG.win.SD_DATA.dialogue_nodes.find(function (nn) { return nn.id === 'SC-029'; });
    ok(!!sc029G && sc029G.free_input && sc029G.free_input.next === 'SN-030',
      'S22a 前置：SC-029（投喂窗口 · free_input.next=SN-030）');
    /* 防 onEnd 续弧跳走（哨兵验证需要 onEnd 直达 onDialogueEnd） */
    SG.markRead('node:SD-001');
    let endedG = 0;
    envG.win.SD.onDialogueEnd = function () { endedG++; };
    const sentinelFi = { enabled: true, capture: 'input_history', max_len: 60, next: '__SENTINEL__' };

    envG.withClock(() => {
      DG.submitFree(sc029G, sentinelFi, '沉默也是一种选项');
      envG.clock.runUntilIdle();
    });
    const streamG = envG.doc.getElementById('sd-stream');
    const fragsG = streamG.querySelectorAll('.sd-frag');
    ok(fragsG.length === 1, `S22b ★{FRAG} 引用块已渲染（${fragsG.length} 个）`);
    ok(!!fragsG[0] && (fragsG[0].textContent || '').indexOf('沉默也是一种选项') >= 0,
      'S22c ★{FRAG} 回显玩家原输入（日期剥离 + 原样进出）');
    const sfTextG = streamG.textContent || '';
    ok(sfTextG.indexOf('这句。我认得。') >= 0, 'S22d ★SF-001 反应已播报');
    ok(sfTextG.indexOf('……原来它一直算一个选项。我之前没往那想过。') >= 0,
      'S22e ★SF-003 反应已播报（SF 串按序播完）');
    const flG = SG.feedLog();
    ok(flG.length === 1, `S22f ★GD-5 首次命中 → 记录/ 写入 1 行（实得 ${flG.length}）`);
    ok(flG[0] && flG[0].length <= 24 && flG[0].indexOf('沉默也是一种选项') >= 0,
      `S22g ★记录行 = {FRAG} 截断 24 字（实得「${flG[0]}」）`);
    ok(SG.hasFlag('sd_b1_fed'), 'S22h ★首次投喂置位 sd_b1_fed（CF-2 快照锚点）');
    ok(SG.trsSeed() !== null, 'S22i ★trs_seed 已快照');
    ok(endedG === 1,
      `S22j ★★FM-1 播完回原 next（go 回哨兵 → onEnd 触发，实得 ${endedG} 次）`);

    /* 第二次命中同一标记 → U-3 重复投喂：「这一段我读过了。」且 feed_log 不再追加 */
    envG.withClock(() => {
      DG.submitFree(sc029G, sentinelFi, '沉默也是一种选项。');
      envG.clock.runUntilIdle();
    });
    const streamG2 = envG.doc.getElementById('sd-stream');
    ok((streamG2.textContent || '').indexOf('这一段我读过了。') >= 0,
      'S22k ★U-3 第 2 次：「这一段我读过了。」（FD-P2 喂错/重复无惩罚）');
    ok(SG.feedLog().length === 1,
      `S22l ★重复投喂不再追加记录行（feed_log 仍 ${SG.feedLog().length} 行）`);
    ok(endedG === 2, `S22m ★U-3 重复投喂同样回原 next（onEnd ${endedG} 次）`);

    /* 第三次 → 完全静默（走 U-2，含 idiolect + echo —— FD-P2） */
    envG.withClock(() => {
      DG.submitFree(sc029G, sentinelFi, '沉默也是一种选项。');
      envG.clock.runUntilIdle();
    });
    const streamG3 = envG.doc.getElementById('sd-stream');
    const sfCount = (streamG3.textContent.match(/这句。我认得。/g) || []).length;
    ok(endedG === 3 &&
       (streamG3.textContent || '').indexOf('这一段我读过了。') === (streamG3.textContent || '').lastIndexOf('这一段我读过了。') &&
       sfCount === 1,
      'S22n ★U-3 第 3 次起完全静默（不再插播，只回原 next）');

    /* ── S23 ★ARG-BUILD-12 · 组4 引导点（GD-2 / GD-3 / GD-7 / GD-10）─
       GD-2：SN-010 后 placeholder 变化（投喂窗口表驱动）
       GD-3：SC-015 卡片下方开出输入行（三张卡仍可点）
       GD-7：投喂窗口 ≥40s 无输入 → .sd-soft 软行「她在等。」
       GD-10：死锁保险（全程只沉默 / 全程只点选项 → 均能走完 173 节点） */
    const envH = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
    });
    envH.runScripts();
    const SDH = envH.win.SD;
    const dockH = envH.doc.getElementById('sd-dock');
    let sc015Shot = null;
    let guardH = 0;
    envH.withClock(() => {
      envH.clock.runUntilIdle();
      while (guardH++ < 60) {
        const cards = dockH.querySelectorAll('.sd-card');
        const choices = dockH.querySelectorAll('.sd-choice');
        const form = dockH.querySelector('.sd-inputbar');
        if (!cards.length && !choices.length && !form) break;
        const cur = SDH.Dialogue.current();
        /* GD-3 抓拍：SC-015（投喂卡）时卡片与输入行必须并存 */
        if (cur && cur.id === 'SC-015' && !sc015Shot) {
          sc015Shot = {
            cards: cards.length,
            form: !!form,
            placeholder: form ? form.querySelector('.sd-input').getAttribute('placeholder') : null
          };
        }
        const isProbe = !!(cur && cur.measure && cur.measure.role === 'a1_probe');
        envH.clock.advance(isProbe ? 9000 : 1200);
        if (choices.length) choices[0].dispatch('click');
        else if (cards.length) cards[0].dispatch('click');
        else {
          const inp = form.querySelector('.sd-input');
          inp.value = (cur && cur.free_input && cur.free_input.capture === 'name_given') ? '阿岩' : '你说。';
          form.dispatch('submit');
        }
        envH.clock.runUntilIdle();
      }
    });
    ok(!!sc015Shot, 'S23a 前置：驱动走到 SC-015（投喂卡）');
    if (sc015Shot) {
      ok(sc015Shot.cards === 3, `S23b ★GD-3 SC-015 三张卡仍在（实得 ${sc015Shot.cards}）`);
      ok(sc015Shot.form === true, 'S23c ★★GD-3 SC-015 卡片下方开出输入行（三张卡仍可点）');
      ok(sc015Shot.placeholder === '（给她看点什么）',
        `S23d ★★GD-2 placeholder 变化（SN-010 后 =（给她看点什么），实得「${sc015Shot.placeholder}」）`);
    }

    /* GD-7：投喂窗口 ≥40s 无输入 → 软行「她在等。」（事件驱动检查点） */
    const envW = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
    });
    envW.runScripts({ settleMs: 0 });
    const SDW = envW.win.SD;
    const sdSoft = envW.doc.querySelector('[data-sd-soft]');
    ok(!!sdSoft && sdSoft.textContent === '', 'S23e 前置：软行挂点初始为空');
    /* 手动进入 SD-010（投喂窗口 free_input 节点） */
    envW.withClock(() => {
      SDW.Dialogue.go('SD-010');
      envW.clock.runUntilIdle();
      const sd010n = SDW.Dialogue.current();
      ok(!!sd010n && sd010n.id === 'SD-010' && SDW.Feed.hookOf('SD-010'),
        'S23f 前置：进入投喂窗口节点 SD-010（hookOf 命中）');
      /* 40s 内（35s）不显示 */
      envW.clock.advance(35000);
      SDW.Dialogue.checkSoftWait();
      ok(sdSoft.textContent === '',
        `S23g ★GD-7 40s 内不显示软行（35s 后仍空，实得「${sdSoft.textContent}」）`);
      /* 越过 40s → 显示 */
      envW.clock.advance(6000);
      SDW.Dialogue.checkSoftWait();
      ok(sdSoft.textContent === '她在等。',
        `S23h ★★GD-7 ≥40s 无输入 → 软行「她在等。」（实得「${sdSoft.textContent}」）`);
      ok(!/喂点什么|去论坛|提示|下一步|输入|搜索/.test(sdSoft.textContent),
        'S23i ★GD-7 软行无祈使 / 疑问 / 「提示」类元层词（状态描述，R2 / GD-R1 / V-R5）');
      /* 玩家提交 → 软行清除（不覆盖 soft_countdown 之外的内容） */
      SDW.Dialogue.clearSoftWait();
      ok(sdSoft.textContent === '', 'S23j ★GD-7 玩家提交后软行清除');
    });

    /* GD-10：死锁保险回归 —— 全程只沉默（投喂窗口停 95s）走完 173 节点 */
    const envDead = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
    });
    envDead.runScripts();
    const SDD = envDead.win.SD;
    const dockD = envDead.doc.getElementById('sd-dock');
    let silentShots = 0;
    let guardD = 0;
    envDead.withClock(() => {
      envDead.clock.runUntilIdle();
      while (guardD++ < 60) {
        const cards = dockD.querySelectorAll('.sd-card');
        const choices = dockD.querySelectorAll('.sd-choice');
        const form = dockD.querySelector('.sd-inputbar');
        if (!cards.length && !choices.length && !form) break;
        const cur = SDD.Dialogue.current();
        const isFeedWindow = !!(cur && SDD.Feed && SDD.Feed.hookOf(cur.id));
        /* 投喂窗口一律沉默 95s（>90s 死锁保险阈值）再推进 */
        envDead.clock.advance(isFeedWindow ? 95000 : (cur && cur.measure && cur.measure.role === 'a1_probe' ? 9000 : 1200));
        if (isFeedWindow && choices.length) silentShots++;
        if (choices.length) choices[0].dispatch('click');
        else if (cards.length) cards[0].dispatch('click');
        else {
          const inp = form.querySelector('.sd-input');
          inp.value = (cur && cur.free_input && cur.free_input.capture === 'name_given') ? '阿岩' : '你说。';
          form.dispatch('submit');
        }
        envDead.clock.runUntilIdle();
      }
    });
    ok(silentShots > 0,
      `S23k 前置：投喂窗口 + 选项并存节点被沉默停留（${silentShots} 处）`);
    ok(SDD.State.isRead('node:SD-090'),
      'S23l ★★GD-10 全程只沉默（投喂窗口停 95s）仍走完 G-1 到 SD-090（永不软锁，R8）');

    /* GD-10 第二面：全程只点选项（不碰输入框）也走完（默认 drive 已覆盖，
       这里补一个显式断言：所有并存节点都不输入、只点选项） */
    const envOpt = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
    });
    envOpt.runScripts();
    const SDO = envOpt.win.SD;
    const dockO = envOpt.doc.getElementById('sd-dock');
    let guardO = 0;
    envOpt.withClock(() => {
      envOpt.clock.runUntilIdle();
      while (guardO++ < 60) {
        const cards = dockO.querySelectorAll('.sd-card');
        const choices = dockO.querySelectorAll('.sd-choice');
        const form = dockO.querySelector('.sd-inputbar');
        if (!cards.length && !choices.length && !form) break;
        const cur = SDO.Dialogue.current();
        const isProbe = !!(cur && cur.measure && cur.measure.role === 'a1_probe');
        envOpt.clock.advance(isProbe ? 9000 : 1200);
        if (choices.length) choices[0].dispatch('click');
        else if (cards.length) cards[0].dispatch('click');
        else {
          const inp = form.querySelector('.sd-input');
          inp.value = (cur && cur.free_input && cur.free_input.capture === 'name_given') ? '阿岩' : '你说。';
          form.dispatch('submit');
        }
        envOpt.clock.runUntilIdle();
      }
    });
    ok(SDO.State.isRead('node:SD-090'),
      'S23m ★★GD-10 全程只点选项同样走完 G-1 到 SD-090（固定选项恒可点，R8）');

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
