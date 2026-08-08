/* ==========================================================================
   tests/smoke_shell.js · 烟雾测试 ③ 本机（ARG-BUILD-11 / 设计文档 ARG-SHELL-01）

   spec.js 是【静态扫描】—— 它读源码字符串，抓得住"写没写"，抓不住"跑不跑得起来"。
   本文件在【GitHub Pages 子路径模拟】下真的加载 index.html、真的执行 sh_*.js，
   驱动一遍窗口 / 桥接 / 存档 / 逃生舱，断言：

     A  首帧与 R8 列表纪律（素读恒在、恒第一、恒可点；存档开局无名）
     B  窗口纪律（SH-1~SH-5：同时一个、最小化不销毁、关闭真干净）
     C  桥接白名单（X-9 / BR-1~BR-4：只有素读能说话，"<" 直接丢）
     D  存档单键与 v1→v2 前向兼容（SH-7 / ST-1）
     E  移动态逃生舱（S18 / §7.8 碰撞 2：窄屏改真跳转，不套 iframe）
     F  时钟单例（X-10 / CL-3：嵌入态让位本机）+ 子侧桥接实发消息
     G  文件视图（X-11 不做站点地图 / SH-B2 空名条目 / 纯前端打不开）
     H  归档（X-2 设备侧零绝对年份）

   ⚠️ 本垫片不加载 iframe。故 iframe【内部】的行为一律不在本文件覆盖范围内 ——
      那部分由 smoke_main.js / smoke_save.js 各自裸开验证。本文件只验宿主侧。

   运行：node tests/smoke_shell.js
   ========================================================================== */
'use strict';

const { createEnv } = require('./dom_shim');
const sim = require('./sim_site');

const fails = [];
const notes = [];
const ok = (c, m) => { if (c) notes.push('✓ ' + m); else fails.push('✗ ' + m); };

/* 本机侧永不该出现的字符串（SH-6 / TW-3 / 元层禁词） */
const BANNED = ['千绘', '我在看你', '桌面壳', 'FakeOS', 'Shell', 'shell', 'desktop', 'gonglue'];

function home(site, opts) {
  const env = createEnv(Object.assign({
    siteRoot: site.siteRoot,
    pagePath: site.page('index.html'),
    storage: true
  }, opts || {}));
  /* settleMs 是 runScripts 的虚拟时钟窗口参数：
     默认跑空（FR-A 4.5s 会自动硬切）；传 0 则停在首帧，让 FR-A 可断言。 */
  env.runScripts(typeof opts === 'object' && opts && 'settleMs' in opts
    ? { settleMs: opts.settleMs } : {});
  return env;
}

function pane(env, id) { return env.doc.querySelector('[data-sh-pane="' + id + '"]'); }
function frameOf(env, id) {
  const p = pane(env, id);
  return p ? p.querySelector('[data-sh-frame]') : null;
}
function titleBar(env) {
  const t = env.doc.querySelector('[data-sh-title]');
  return t ? (t.textContent || '') : null;
}
function rowsOf(el) {
  return el.querySelectorAll('[data-sh-row]').map((r) => r.getAttribute('data-sh-row'));
}
/* 把一条消息塞进宿主的 message 监听器，source 由调用方指定 */
function say(env, source, data) {
  return env.win.dispatch('message', { data, source });
}

function main() {
  const site = sim.build('sudu-reader');
  console.log('\n── 烟雾测试 ③ 本机 ───────────────────────────────────');
  console.log('  站点根（模拟域名根）: ' + site.siteRoot);
  console.log('  页面 URL 路径        : /' + site.page('index.html'));

  try {
    /* ══ A · 首帧与列表纪律 ═══════════════════════════════════════ */
    const env = home(site);

    const rootAbs = env.refs().filter((r) => r.kind === 'root-absolute');
    ok(rootAbs.length === 0,
      `A1 零根绝对路径引用（红线⑨，发现 ${rootAbs.length}${rootAbs.length ? '：' + rootAbs.map((r) => r.ref).join(', ') : ''}）`);

    const notFound = env.loaded.filter((l) => l.status === 404);
    const threw = env.loaded.filter((l) => l.status === 'throw');
    ok(notFound.length === 0,
      `A2 脚本全部命中（404: ${notFound.length}${notFound.length ? ' → ' + notFound.map((n) => n.src).join(', ') : ''}）`);
    /* ★ 这一条是本文件存在的首要理由：注释块提前闭合、少个括号这类错误
         静态扫描一个都看不见，但会让整个 app 变成一块白板。 */
    ok(threw.length === 0,
      `A3 ★脚本执行零异常（${threw.length}${threw.length ? ' → ' + threw.map((t) => t.src + ': ' + t.error).join(' | ') : ''}）`);
    if (threw.length) { report(); return; }

    const items = env.doc.querySelectorAll('[data-sh-item]').map((li) => li.getAttribute('data-sh-item'));
    ok(items.length === 4 && items.join(',') === 'sd,qsw,fm,save',
      `A4 列表恒为四条且顺序固定（实得 ${items.join(', ')}）`);

    const sdBtn = env.doc.querySelector('[data-sh-open="sd"]');
    ok(!!sdBtn, 'A5 ★R8 素读入口恒可点（静态存在于 index.html，不由 JS 生成）');
    ok(sdBtn && (sdBtn.textContent || '').includes('素读'), 'A6 ★R8 素读入口恒有名字');

    ok(!!env.doc.querySelector('[data-sh-slot="save"]'),
      'A7 存档条目开局是空槽（P-c：那一行本来就在，只是还没有名字）');
    const saveLi = env.doc.querySelector('[data-sh-item="save"]');
    ok(saveLi && !saveLi.querySelector('[data-sh-open]'),
      'A8 未具名的存档条目不可点（§5.5）');

    /* 首帧：P-a 第一次拿到这台机器时素读是开着的 */
    ok(env.doc.querySelector('[data-sh-win]').getAttribute('data-open') === '1',
      'A9 ★P-a 首帧自动打开素读');
    ok(titleBar(env) === '素读', `A10 标题栏 = 「素读」（实得「${titleBar(env)}」）`);

    /* X-5：app 必须是 iframe 载入，不是 SPA 内联 */
    const sdFrame = frameOf(env, 'sd');
    ok(!!sdFrame, 'A11 ★X-5 素读以 iframe 载入（物理隔离，非 SPA 路由）');
    ok(sdFrame && sdFrame.getAttribute('src') === 'sd/index.html',
      `A12 iframe src 为相对路径 sd/index.html（实得「${sdFrame && sdFrame.getAttribute('src')}」）`);

    const clockEl = env.doc.querySelector('[data-sh-clock]');
    ok(!!clockEl, 'A13 本机的钟已挂在最外层 document');
    ok(clockEl && /^\d{1,2}:\d{2}$/.test(clockEl.textContent || ''),
      `A14 ★CL-1 只显示 HH:MM，无日期/星期/年份（实得「${clockEl && clockEl.textContent}」）`);

    const screenA = env.doc.body.textContent;
    const hitA = BANNED.filter((w) => screenA.includes(w));
    ok(hitA.length === 0, `A15 ★屏显禁词零命中（命中 ${hitA.length}${hitA.length ? '：' + hitA.join(', ') : ''}）`);
    const yearA = screenA.match(/(?:19|20)\d{2}/g) || [];
    ok(yearA.length === 0, `A16 ★X-2 本机屏显零绝对年份（命中 ${yearA.length}）`);

    /* ══ B · 窗口纪律 ════════════════════════════════════════════ */
    const SH = env.win.SH;

    SH.Home.open('fm');
    ok(SH.Home.visible() === 'fm', 'B1 切到文件');
    const on = env.doc.querySelectorAll('[data-sh-pane]').filter((p) => p.getAttribute('data-on') === '1');
    ok(on.length === 1, `B2 ★SH-1 同时只有一个窗口可见（实得 ${on.length}）`);
    ok(!!pane(env, 'sd'), 'B3 被盖住的素读 pane 仍在 DOM（不销毁）');
    ok(env.doc.querySelector('[data-sh-item="sd"]').getAttribute('data-run') === '1',
      'B4 SH-4 后台中的 app 条目标记为运行中');

    /* 最小化：iframe 必须是同一个实例，否则玩家的滚动位置和输入全没了 */
    const frameBefore = frameOf(env, 'sd');
    SH.Home.open('sd');
    SH.Home.minimize();
    ok(SH.Home.visible() === null, 'B5 最小化后无可见窗口');
    ok(env.doc.querySelector('[data-sh-win]').getAttribute('data-open') === null,
      'B6 最小化后窗口收起');
    ok(!!pane(env, 'sd'), 'B7 ★SH-3 最小化【不销毁】pane');
    SH.Home.open('sd');
    ok(frameOf(env, 'sd') === frameBefore,
      'B8 ★★重开复用同一个 iframe 实例（进度与滚动位置都还在）');

    /* 关闭：SH-5 必须真的干净 —— 不挽留、不改标题、不留残影、不弹任何东西 */
    const domBefore = env.doc.body.querySelectorAll('[data-sh-pane]').length;
    SH.Home.close();
    ok(!pane(env, 'sd'), 'B9 ★SH-5 关闭后 pane 真的从 DOM 移除');
    ok(env.doc.body.querySelectorAll('[data-sh-pane]').length === domBefore - 1,
      'B10 关闭只移除自己那一个，不误伤别的窗口');
    ok(env.doc.querySelector('[data-sh-item="sd"]').getAttribute('data-run') === null,
      'B11 关闭后条目的运行标记清掉');
    ok(titleBar(env) === '', 'B12 关闭后标题栏清空');
    ok(env.doc.title === '本机', `B13 ★SH-5 关闭后标签页标题复位为「本机」（实得「${env.doc.title}」）`);
    /* 不弹任何东西：关闭不许留下确认条 / 提示 / 挽留文案 */
    const afterClose = env.doc.body.textContent;
    ok(!/确定|真的要|再想想|别走|还在/.test(afterClose),
      'B14 ★SH-5 关闭不挽留、不弹确认（那一击留给以后）');
    /* 关闭【禁止】登记恐怖席位 */
    const spentAfterClose = JSON.parse(env.localStorage.getItem('sudu_save_v1')).horror_spent || { B: [] };
    ok((spentAfterClose.B || []).indexOf('SH-B5') < 0, 'B15 关闭动作不登记任何新席位');

    /* ══ C · 桥接白名单 ══════════════════════════════════════════ */
    SH.Home.open('sd');
    const f = frameOf(env, 'sd');
    const kid = { _isSd: true };                 // 冒充素读 iframe 的 contentWindow
    f.contentWindow = kid;
    const alien = { _isAlien: true };            // 冒充别的地层（/qsw/ 之类）

    const titleBefore = titleBar(env);
    say(env, alien, { t: 'title_request', v: '归档想改标题' });
    ok(titleBar(env) === titleBefore,
      'C1 ★BR-3/BR-4 非素读来源的消息被完全忽略（归档不知道自己被谁打开）');

    say(env, kid, { t: 'title_request', v: '素读 · 轻助手' });
    ok(env.doc.title === '素读 · 轻助手',
      `C2 素读的 title_request 落到标签页标题（实得「${env.doc.title}」）`);
    /* 桥接原文是「素读 · 轻助手」，标题栏必须仍是那张固定 app 名表里的
       「素读」二字 —— 桥接来的字符串只准落到标签页标题，绝不准落标题栏。 */
    ok(titleBar(env) !== '素读 · 轻助手' && /^素[\s\u2009\u3000]?读$/.test(titleBar(env)),
      `C3 ★SH-6 标题栏恒由固定 app 名表驱动，不落桥接原文（实得「${titleBar(env)}」）`);

    say(env, kid, { t: 'title_request', v: '<img src=x onerror=1>' });
    ok(env.doc.title === '素读 · 轻助手',
      'C4 ★BR-2 载荷含 "<" 被丢弃（标题未被改写）');
    ok(!/<img|onerror/.test(env.doc.body.textContent),
      'C5 ★BR-1 桥接无法注入任何标记进 DOM');

    say(env, kid, { t: 'inject_css', v: 'body{display:none}' });
    say(env, kid, { t: 'eval', v: 'alert(1)' });
    ok(env.doc.querySelector('[data-sh-win]').getAttribute('data-open') === '1',
      'C6 ★X-9 白名单之外的消息类型一律丢弃，不回消息、不报错');

    /* SH-6 硬门槛：标题栏永远不许出现人名 */
    say(env, kid, { t: 'title_request', v: '千绘' });
    ok(titleBar(env).indexOf('千绘') < 0,
      `C7 ★★SH-6 标题栏永不渲染人名（实得「${titleBar(env)}」）`);

    /* SH-B3：漂移只在 app 名内部（"素读" 两个字之间），不改字、不加字 */
    const barNow = titleBar(env);
    ok(/^素[\s\u2009\u3000]?读$/.test(barNow),
      `C8 ★SH-B3 漂移只在 app 名内部（实得「${barNow}」，仍是"素读"两个字）`);

    /* open_window：只【具名】，不替玩家开窗（自己弹窗 = 显式进度提示，破 R2） */
    const visBefore = SH.Home.visible();
    say(env, kid, { t: 'open_window', v: 'save' });
    ok(!env.doc.querySelector('[data-sh-slot="save"]'),
      'C9 ★SH-B1 open_window 把存档条目【具名】（空槽已替换）');
    ok(!!env.doc.querySelector('[data-sh-open="save"]'),
      'C10 具名后的存档条目可点');
    ok(SH.Home.visible() === visBefore,
      'C11 ★★R2 只具名、不替玩家开窗（自己弹出来的窗口 = 显式进度提示）');
    const savedB = JSON.parse(env.localStorage.getItem('sudu_save_v1')).horror_spent.B;
    ok(savedB.indexOf('SH-B1') >= 0, 'C12 SH-B1 席位已登记进存档（不回显给玩家）');

    /* ══ D · 存档单键与前向兼容 ══════════════════════════════════ */
    const keys = Object.keys(env.localStorage._dump());
    ok(keys.length === 1 && keys[0] === 'sudu_save_v1',
      `D1 ★★SH-7 全站只有 sudu_save_v1 一个键（实得 ${keys.length} 个：${keys.join(', ')}）`);

    /* 老玩家的 v1 存档（没有 shell / apps）载入后必须一个字段都不丢 */
    const legacy = {
      v: 1, created_at: 1, updated_at: 2,
      name_given: '阿岩', time_warp_ms: 3600000,
      path_flags: { save_offered: true },
      horror_spent: { A: ['A-1'], B: ['B-2'] },
      dwell_ms: { 'node:SD-001': 4200 }
    };
    const envL = home(site, { seedStore: { 'sudu_save_v1': JSON.stringify(legacy) } });
    const after = JSON.parse(envL.localStorage.getItem('sudu_save_v1'));
    ok(after.name_given === '阿岩' && after.dwell_ms['node:SD-001'] === 4200
       && after.horror_spent.A[0] === 'A-1',
      'D2 ★★v1→v2 只做加法：老存档字段一个不丢（"她忘了你"不能白白浪费）');
    ok(after.shell && after.apps, 'D3 shell / apps 两个顶层子对象已补齐');
    ok(after.time_warp_ms === 3600000,
      `D4 ★ST-1 time_warp_ms 留在顶层，未被搬进 shell（实得 ${after.time_warp_ms}）`);
    ok(!('sd' in after.apps),
      'D5 ★apps.sd 不存在也不许有（素读的状态永远在顶层）');
    ok(after.v === 1, 'D6 schema 版本号未跳变（app 侧读得懂）');
    /* 老玩家早就被邀请过 → 一进来存档条目就该是具名的（N1 直链降级兜底） */
    ok(!envL.doc.querySelector('[data-sh-slot="save"]'),
      'D7 ★裸开 /sd/ 玩到过存档的老玩家，回本机时那一条已具名（回读存档兜底）');

    /* ══ E · 移动态逃生舱 ════════════════════════════════════════ */
    const envM = home(site, { viewport: 480 });
    ok(envM.doc.querySelector('[data-sh-win]').getAttribute('data-open') === null,
      'E1 ★窄屏首帧不自动跳走（手机上第一屏就是这张列表）');
    ok(!frameOf(envM, 'sd'), 'E2 窄屏首帧未建任何 iframe');

    const hrefBefore = envM.win.location.href;
    envM.win.SH.Home.open('sd');
    ok(envM.win.location.href === 'sd/index.html',
      `E3 ★★S18 窄屏改真跳转（实得「${envM.win.location.href}」，原「${hrefBefore}」）`);
    ok(!frameOf(envM, 'sd'),
      'E4 ★窄屏不套 iframe（键盘弹起时输入框不被遮挡 —— 这不是降级，是设备形态）');

    /* 内建视图没有独立页面可跳，窄屏下照样走窗口 */
    envM.win.location.href = hrefBefore;
    envM.win.SH.Home.open('fm');
    ok(envM.win.SH.Home.visible() === 'fm' && !!pane(envM, 'fm'),
      'E5 内建视图（文件）在窄屏下仍走窗口，不跳转');
    ok(envM.win.location.href === hrefBefore, 'E6 打开内建视图不触发任何跳转');

    /* ══ F · 时钟单例 + 子侧桥接实发 ═════════════════════════════ */
    const envBare = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'), storage: true
    });
    envBare.runScripts();
    ok(!!envBare.doc.querySelector('[data-sd-clock]'),
      'F1 裸开 /sd/ → 页面自己挂钟（N1 直链是合法入口，不能没有钟）');
    ok(envBare.win.SD.Bridge.active === false,
      'F2 ★裸开时桥接完全静默（不发消息、不改任何行为）');
    ok(envBare.outbox.length === 0, 'F3 裸开时零 postMessage');

    const envIn = createEnv({
      siteRoot: site.siteRoot, pagePath: site.page('sd/index.html'),
      storage: true, embedded: true
    });
    envIn.runScripts();
    ok(!envIn.doc.querySelector('[data-sd-clock]'),
      'F4 ★★X-10 / CL-3 开在窗口里 → 页面让位，整页只有一个钟');
    ok(envIn.win.SD.Bridge.active === true, 'F5 嵌入态桥接激活');

    const titles = envIn.outbox.filter((m) => m.data && m.data.t === 'title_request');
    ok(titles.length > 0,
      `F6 ★嵌入态下页面的标题变更被顺给本机（实发 ${titles.length} 条 title_request）`);
    const badPayload = envIn.outbox.filter((m) => {
      const v = m.data && m.data.v;
      return typeof v !== 'string' && typeof v !== 'number';
    });
    ok(badPayload.length === 0,
      `F7 ★BR-1 子侧只发纯字符串/数值载荷（异常 ${badPayload.length} 条）`);
    const ltPayload = envIn.outbox.filter((m) => String((m.data || {}).v || '').indexOf('<') >= 0);
    ok(ltPayload.length === 0, `F8 ★BR-2 子侧自己也过滤 "<"（异常 ${ltPayload.length} 条）`);
    const badType = envIn.outbox.filter((m) =>
      ['title_request', 'open_window'].indexOf((m.data || {}).t) < 0);
    ok(badType.length === 0,
      `F9 ★X-9 子侧只发白名单内的消息类型（越界 ${badType.length} 条）`);
    const longPayload = envIn.outbox.filter((m) => String((m.data || {}).v || '').length > 60);
    ok(longPayload.length === 0, 'F10 载荷长度受限（≤60，父侧再截一次）');

    /* CL-2：本机改时间 → 已载入的 app 必须收到 clock_sync */
    const envC = home(site);
    envC.win.SH.Home.open('sd');
    const cf = frameOf(envC, 'sd');
    const inbox = [];
    cf.contentWindow = { postMessage: (d) => inbox.push(d) };
    envC.win.SH.Clock.open();
    const stepBtn = envC.doc.querySelector('[data-sh-step="+1h"]');
    ok(!!stepBtn, 'F11 时间面板含 +1h 步进');
    stepBtn.dispatch('click');
    ok(inbox.length > 0 && inbox[0].t === 'clock_sync',
      `F12 ★★CL-2 改时间立刻广播 clock_sync（收到 ${inbox.length} 条）`);
    ok(inbox.length > 0 && inbox[0].v === 3600000,
      `F13 广播的是偏移量本身（实得 ${inbox.length ? inbox[0].v : 'n/a'}）`);
    const panelTxt = envC.doc.querySelector('[data-sh-panel]').textContent;
    ok(!/调试|debug/i.test(panelTxt), 'F14 时间面板措辞克制（无「调试/debug」）');
    ok(!/(19|20)\d{2}/.test(panelTxt), `F15 ★X-2 时间面板零绝对年份`);

    /* ══ G · 文件视图 ════════════════════════════════════════════ */
    const envF = home(site);
    envF.win.SH.Home.open('fm');
    const fmView = pane(envF, 'fm').querySelector('[data-sh-view]');
    ok(!!fmView, 'G1 文件视图已渲染');
    const fmRows = rowsOf(fmView);
    ok(fmRows.length === 5,
      `G2 未具名时文件列表 5 条（存档那一条尚不显示，§5.5）—— 实得 ${fmRows.length}：${fmRows.join(' | ')}`);
    ok(fmRows.indexOf('存档/') < 0, 'G3 ★存档未具名前，文件视图不显示它');
    ok(fmRows.indexOf('') >= 0, 'G4 ★SH-B2 列表里有一条没有名字的条目');
    /* X-11：不做站点地图 —— 只列剧情引用过的东西，不许列深层页 */
    const leak = fmRows.filter((r) => /\.html|\/(qsw|sd|save|about)\//.test(r));
    ok(leak.length === 0,
      `G5 ★★X-11 文件列表不泄漏站点结构（命中 ${leak.length}${leak.length ? '：' + leak.join(', ') : ''}）`);

    /* 打不开必须是纯前端行为，绝不依赖 HTTP 403/404 */
    const logRow = fmView.querySelector('[data-sh-row="记录/"]');
    logRow.dispatch('click');
    const msg = fmView.querySelector('[data-sh-msg]');
    ok(!!msg && msg.textContent === '无法打开。',
      `G6 ★「打不开」是纯前端一行灰字（实得「${msg && msg.textContent}」）`);
    ok(envF.win.location.href.indexOf('记录') < 0, 'G7 点不可达条目不发起任何跳转');
    fmView.querySelector('[data-sh-row=".trash"]').dispatch('click');
    ok(fmView.querySelectorAll('[data-sh-msg]').length === 1,
      'G8 反馈行只替换文字，不堆积（列表下方永远只有一行）');
    ok(fmView.querySelector('[data-sh-msg]').textContent === '空的。',
      'G9 再点一条 → 反馈行内容已更新');

    /* ══ G16 · 组2 真别名接线：记录/ 升格（FM-3 / GD-5 · ARG-BUILD-12）══
       首次命中后素读侧写入 feed_log（{FRAG} 截断 24 字）→ 本机侧读同源键
       （ST-2：不走 postMessage），文件 › 记录/ 从「无法打开。」升格为可打开，
       内有一行；后续命中多一行（无序号 / 总数 / 时间戳 · R2 / V-F2）。 */
    const envL2 = home(site, { seedStore: {
      'sudu_save_v1': JSON.stringify({ v: 1, created_at: 1, updated_at: 2,
        shell: { booted_at: 1000, framing_seen: true, framing_window_seen: true, win_state: {} },
        feed_log: ['沉默也是一种选项', '她数过你沉默的次数'] })
    } });
    envL2.win.SH.Home.open('fm');
    const fmView2 = pane(envL2, 'fm').querySelector('[data-sh-view]');
    const logRow2 = fmView2.querySelector('[data-sh-row="记录/"]');
    ok(!!logRow2, 'G16 ★GD-5 记录/ 行恒在列表（不消失、无「新」标记）');
    logRow2.dispatch('click');
    const logView = fmView2.querySelector('[data-sh-log]');
    ok(!!logView, 'G17 ★★GD-5 首次命中后记录/ 从「无法打开。」升格为可打开');
    ok(!fmView2.querySelector('[data-sh-msg]') ||
       fmView2.querySelector('[data-sh-msg]').textContent !== '无法打开。',
      'G18 ★升格后不再报「无法打开。」');
    const logRows = logView.querySelectorAll('[data-sh-logrow]').map((r) => r.getAttribute('data-sh-logrow'));
    ok(logRows.length === 2 && logRows[0] === '沉默也是一种选项' && logRows[1] === '她数过你沉默的次数',
      `G19 ★记录内容 = {FRAG} 逐行（实得 ${logRows.join(' / ') || '空'}）`);
    const logTxt = logView.textContent || '';
    ok(!/共\s*\d|第\s*\d|条|:|\d{1,2}:\d{2}/.test(logTxt.replace('← 上一层', '')),
      'G20 ★★R2 / V-F2 记录无总数 / 序号 / 时间戳（实得「' + logTxt.trim().slice(0, 40) + '」）');
    /* 返回上一层 */
    logView.querySelector('[data-sh-up]').dispatch('click');
    ok(!fmView2.querySelector('[data-sh-log]'), 'G21 「上一层」关闭记录视图');
    ok(fmView2.getAttribute('data-hidden') === null, 'G22 回到一级列表');

    /* 二级：内建列表 → 内嵌一份页面，顶端留「上一层」 */
    fmView.querySelector('[data-sh-row="关于本机.txt"]').dispatch('click');
    const lvl = pane(envF, 'fm').querySelector('[data-sh-lvl]');
    ok(!!lvl, 'G10 点开条目进入二级层');
    ok(!!lvl.querySelector('[data-sh-up]'), 'G11 二级层顶端有「上一层」');
    const sub = lvl.querySelector('[data-sh-subframe]');
    ok(sub && sub.getAttribute('src') === 'about/index.html',
      `G12 ★二级层同样用 iframe 载入（实得「${sub && sub.getAttribute('src')}」）`);
    ok(fmView.getAttribute('data-hidden') === '1', 'G13 进入二级层时一级列表让位');
    lvl.querySelector('[data-sh-up]').dispatch('click');
    ok(!pane(envF, 'fm').querySelector('[data-sh-lvl]'), 'G14 「上一层」移除二级层');
    ok(fmView.getAttribute('data-hidden') === null, 'G15 回到一级列表');

    /* ══ H · 归档 ════════════════════════════════════════════════ */
    envF.win.SH.Home.open('qsw');
    const arcView = pane(envF, 'qsw').querySelector('[data-sh-view]');
    const arcRows = rowsOf(arcView);
    ok(arcRows.length === 1, `H1 归档清单 v1 只有一条（实得 ${arcRows.length}）`);
    const arcYear = arcRows.join(' ').match(/(?:19|20)\d{2}/g) || [];
    ok(arcYear.length === 0,
      `H2 ★★X-2 归档清单属于设备侧，零绝对年份（命中 ${arcYear.length}${arcYear.length ? '：' + arcYear.join(', ') : ''}）`);
    arcView.querySelector('[data-sh-row]').dispatch('click');
    const arcSub = pane(envF, 'qsw').querySelector('[data-sh-subframe]');
    ok(arcSub && arcSub.getAttribute('src') === 'qsw/index.html',
      `H3 ★X-5 镜像本体经 iframe 载入（实得「${arcSub && arcSub.getAttribute('src')}」）`);
    ok(titleBar(envF) === '归档',
      `H4 ★SH-6 归档窗口标题栏恒为 app 名，不随内容变（实得「${titleBar(envF)}」）`);

    /* 全程终检：本机侧屏显禁词 / 年份 */
    const finalTxt = envF.doc.body.textContent;
    const hitF = BANNED.filter((w) => finalTxt.includes(w));
    ok(hitF.length === 0, `H5 ★全程屏显禁词零命中（命中 ${hitF.length}${hitF.length ? '：' + hitF.join(', ') : ''}）`);
    ok((finalTxt.match(/(?:19|20)\d{2}/g) || []).length === 0, 'H6 ★全程屏显零绝对年份');

    /* ══ I · 组1 背景 framing（FR-A 首启三行 / FR-B 窗口一行 · ARG-BUILD-12）══
       CF-4：专用布尔 framing_seen / framing_window_seen，与 booted_at 解耦。
       dom_shim 不加载 iframe，故 FR-B 的 1.2s 延后 / 裸开自渲染在 smoke_main 覆盖；
       这里验父层 chrome 渲染 + 首启置位 + 二次不再出现。 */
    const envFr = home(site, { settleMs: 0 });
    const framing = envFr.doc.querySelector('[data-sh-framing]');
    ok(!!framing, 'I1 ★FR-A 首次访问渲染首启三行（占满视口的设备屏）');
    const framTxt = framing ? framing.textContent : '';
    ok(framTxt.includes('这台机器不是你的。') &&
       framTxt.includes('它被打开过很多次。') &&
       framTxt.includes('最后一次，没有关。'),
      'I2 ★FR-A 三行逐字（设计真源 §2.2）');
    ok(framing && !/跳过|正在启动|进度|%|logo|版本/i.test(framTxt),
      'I3 ★FR-A R5 禁令：无跳过按钮 / 进度 / logo / 版本号');
    ok(framing && framing.className.indexOf('sh-framing') >= 0 &&
       !framing.querySelector('button') && !framing.querySelector('img'),
      'I4 ★FR-A 是纯文字设备屏：无按钮 / 无位图（CSS 级 R5 由 spec.js ⑮A 扫描）');

    /* 任意键硬切 → 桌面 + 素读窗口自动开（P-a 不变） */
    envFr.doc.dispatch('click');
    envFr.clock.runFor(100);
    ok(!envFr.doc.querySelector('[data-sh-framing]'),
      'I5 ★FR-A 任意键硬切后从 DOM 移除');
    ok(envFr.doc.querySelector('[data-sh-win]').getAttribute('data-open') === '1',
      'I6 ★FR-A 退出后素读窗口自动打开（P-a 不变）');
    const frSave = JSON.parse(envFr.localStorage.getItem('sudu_save_v1'));
    ok(frSave.shell.framing_seen === true,
      'I7 ★FR-A 播过即置位 framing_seen（CF-4 专用布尔，非 booted_at）');
    ok(frSave.shell.booted_at != null,
      'I8 ★booted_at 语义未变（首帧快照与 framing_seen 解耦，仍正常写入）');

    /* 第二次访问：不再出现（已置位） */
    const envFr2 = home(site, { seedStore: {
      'sudu_save_v1': JSON.stringify({ v: 1, created_at: 1, updated_at: 2,
        shell: { booted_at: 1000, framing_seen: true, framing_window_seen: true, win_state: {} } })
    }, settleMs: 0 });
    ok(!envFr2.doc.querySelector('[data-sh-framing]'),
      'I9 ★FR-A 第二次访问不再出现');

    /* FR-B 窗口一行：父层 chrome 渲染，1.2s 硬切消失；置位 framing_window_seen */
    const envFrb = home(site, { settleMs: 0 });
    envFrb.win.SH.Home.open('sd');
    const winLine = envFrb.doc.querySelector('[data-sh-winline]');
    ok(!!winLine, 'I10 ★FR-B 素读窗口首开渲染窗口一行（父层 chrome）');
    ok(winLine && winLine.textContent === '上一次的会话没有结束。',
      `I11 ★FR-B 文案逐字（实得「${winLine && winLine.textContent}」）`);
    const winTxt = envFrb.doc.body.textContent;
    ok(!winTxt.includes('dialogue_nodes') && !winTxt.includes('SS-001'),
      'I12 ★FR-B 不进 dialogue_nodes / 不渲染节点 ID（设备命名空间）');
    envFrb.clock.runFor(1300);
    ok(!envFrb.doc.querySelector('[data-sh-winline]'),
      'I13 ★FR-B 1.2s 后硬切消失');
    const frbSave = JSON.parse(envFrb.localStorage.getItem('sudu_save_v1'));
    ok(frbSave.shell.framing_window_seen === true,
      'I14 ★FR-B 播过即置位 framing_window_seen');
    ok(frbSave.shell.win_state.sd === 'open',
      'I15 ★win_state.sd 语义未变（FR-B 判定不依赖它，它照常记录窗口态）');

    report();
  } finally {
    site.cleanup();
  }
}

function report() {
  console.log('');
  notes.forEach((n) => console.log('  ' + n));
  if (fails.length) {
    console.log('\n✗ 烟雾测试 ③ 失败 ' + fails.length + ' 项：');
    fails.forEach((f) => console.log('  ' + f));
    console.log('');
    process.exit(1);
  }
  console.log('\n✓ 烟雾测试 ③ 本机：全部通过。\n');
  process.exit(0);
}

main();
