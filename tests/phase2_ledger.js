/* ==========================================================================
   tests/phase2_ledger.js · Phase 2 巡检寄存器（J-9 配置真源）

   本文件是【纯声明数据】，不含扫描逻辑 —— 逻辑在 tests/spec.js。
   拆出来的三个理由：
     ① 台账要能被人读：主理人核对预算 / 地层登记时不必读扫描代码；
     ② 2a 施工者只改这里（登记席位、翻 status），不碰扫描器；
     ③ 它同时是【发布清单】的真源 —— spec.js 用它核对 deploy.yml 有没有漂移。

   ⚠️ 本文件位于 tests/ 下，【不进发布产物】。
      台账绝不能写进 html/js —— 一个 2011 论坛页里出现 "horror_seats"
      这类元层字符串，view-source: 当场穿帮（X-5 / L1）。
      这就是台账登记在测试侧而不是页面侧的原因。

   对应设计真源：
     · design/concept/arg_pages_phase2.md  §1.5.1 恐怖预算全景 / §3.1 八维 / §3.4 X-4~X-7
     · design/concept/arg_desktop_shell.md §6.4 桌面 B+4（S17）
     · design/tech/arg_phase2_readiness_audit.md  Gap-1 / Gap-2
   ========================================================================== */
'use strict';

/* 年份区间小工具（地层年代窗口用） */
function years(from, to) {
  const out = [];
  for (let y = from; y <= to; y++) out.push(y);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
   1. 发布清单（Gap-1 真源）
   ══════════════════════════════════════════════════════════════════════
   deploy.yml 改为【通配发布 + 排除清单】之后，"哪些东西不进玩家产物"
   就成了一条必须防漂移的红线：漏排 tests/ = 谜底哈希上线，
   漏排 promo/ = 封面大图上线（同时破 0 元预算 / 图≤25）。

   下面两张表是真源，spec.js 的 checkDeployManifest() 会拿它们去核对
   .github/workflows/deploy.yml —— 两边对不上直接 fail。            */

/* 永不进发布产物的目录（同时也是 J-9 扫描的排除项 —— 扫描面 == 发布面） */
const PUBLISH_EXCLUDE_DIRS = [
  '.git',          // 版本库自身
  '.github',       // CI 配置
  'node_modules',  // 依赖（本项目零依赖，防御性）
  'tests',         // ⚠️ 含谜底哈希与断言，绝不上线
  'promo',         // ⚠️ 封面源图，只进仓库不发布（0 元预算 / 图≤25）
  'design',        // 设计真源（当前在仓库外，防御性登记）
  'publish',       // 产物目录自身，防自包含
];

/* 永不进发布产物的文件模式（按 basename 匹配） */
const PUBLISH_EXCLUDE_GLOBS = ['*.md'];   // README 等开发者文档

/* 向后兼容硬清单：通配发布之后，这些【仍然必须】出现在产物根。
   Gap-1 的回归守卫 —— 防止有人把排除清单写太宽把主站排没了。 */
const PUBLISH_REQUIRED = [
  'index.html', 'save.html', '404.html', 'robots.txt', 'favicon.svg',
  'css', 'data', 'js',
];

/* ══════════════════════════════════════════════════════════════════════
   2. 地层登记表（X-5 / X-2 / D-1 / D-2 的执行面）
   ══════════════════════════════════════════════════════════════════════
   一个"地层"= 一个年代 + 一套自己的 CSS/JS + 一个自己的命名前缀。
   X-5 纪律：地层之间【不共享任何资源】，物理隔离靠 iframe。

   ⚠️ 前缀巡检是【单向】的，这是刻意的设计，不是偷懒：
      X-5 原文只禁"汽水屋使用 sudu_ 前缀 / 引用主站 CSS-JS"，
      反向不禁 —— 素读侧记录"玩家看过汽水屋"的旗标本来就该叫
      sd_b6_qsw_seen（它是素读的状态，不是汽水屋的资产）。
      若反向也禁，js/sd_ending.js 的 b6/b8/b9 旗标会全部误报。
      故：era 地层禁用素读/桌面壳前缀；素读地层不反向police。

   ⚠️ 前缀匹配锚定在【标识符起始处】（前面不是字母/数字/下划线），
      否则 refresh_rule 会被当成 sh_ 泄漏、sd_b6_qsw_seen 会被当成
      qsw_ 泄漏 —— 这两个假阳性在现网代码里真实存在，已实测。       */
const STRATA = [
  {
    id: 'assistant',
    label: '素读 · 2026 地层',
    /* '' = 仓库根级散件（index/save/404/robots/favicon） */
    roots: ['', 'css', 'data', 'js', 'about', 'v1'],
    ownPrefixes: ['sd_', 'sudu_'],
    foreignPrefixes: [],            // 单向纪律，见上方说明
    allowDates: false,              // X-2：主对话/存档/404 永不渲染绝对日期
    allowYears: [],
  },
  {
    id: 'qsw',
    label: '汽水屋 · 2011 地层（顶部含 2019 镜像声明条）',
    roots: ['qsw'],
    ownPrefixes: ['qsw_', 'soda_'],
    foreignPrefixes: ['sudu_', 'sd_', 'sh_', 'xk_'],
    allowDates: true,
    /* 2009 开站 → 2013 关站；2019 = 镜像抓取年（§1.4.1 镜像壳） */
    allowYears: years(2009, 2013).concat([2019]),
  },
  {
    id: 'soda',
    label: '游戏残影 · relic 地层（B3 条件项）',
    roots: ['soda'],
    ownPrefixes: ['soda_'],
    foreignPrefixes: ['sudu_', 'sd_', 'sh_', 'qsw_', 'xk_'],
    allowDates: true,
    allowYears: years(2009, 2013),
  },
  {
    id: 'xk',
    label: '镜像者 · 2019 地层（D2）',
    roots: ['xk'],
    ownPrefixes: ['xk_', 'soda_'],
    foreignPrefixes: ['sudu_', 'sd_', 'sh_', 'qsw_'],
    allowDates: true,
    /* 镜像者会谈论 2011–2013 的旧论坛，故旧年份同样在窗口内 */
    allowYears: years(2009, 2013).concat([2019]),
  },
  {
    id: 'files',
    label: '桌面壳 · 文件区（2026 设备地层）',
    roots: ['files'],
    ownPrefixes: ['sh_'],
    /* ⚠️ 知识缺口：桌面壳与素读是否算两个地层（即 /files/ 是否禁 sd_），
       arg_desktop_shell.md 未明写。此处【不禁 sd_】取保守解，
       真正的穿帮向量（跨地层 CSS/JS 引用）由资源引用巡检覆盖。
       待主理人裁决后再收紧。 */
    foreignPrefixes: ['qsw_', 'xk_'],
    allowDates: false,              // CL-1：设备侧永不显示日期/年份
    allowYears: [],
  },
];

/* ══════════════════════════════════════════════════════════════════════
   3. 恐怖预算分区台账
   ══════════════════════════════════════════════════════════════════════
   分区的意义：切片的 A2/B14 是【零余量】红线，不能被后续阶段的席位
   稀释；反过来后续阶段也不许"寄生"到切片已登记的席位上（HB-5）。
   故每一段独立记账，另设一条全局天花板。

   ⚠️ 两处【尚未平账】的账目差，本台账不替设计做主，只登记 + 提请裁决：
     (a) arg_pages_phase2.md §2.4 "平账后最终分配"表内：
         §1 扩张页集 13 + §2 单页做深 8 = 21，但该表合计写的是 ≈20。
         差 1 席，需文策渊或主理人确认以哪个为准。
     (b) 主理人口径"G-1 P-2 划拨 6 席"与 data/sd_slice.js 现实登记的
         3 席（B-K1/K2/K3）不一致。可能是"P-2 池共 6 席、G-1 先用 3"，
         也可能是台账口径不同。
   在裁决落地之前，本文件只做【可验证的断言】：分段满额 + 席位唯一 +
   全局天花板不破。不臆造中间层数字。                                */
const HORROR = {
  /* 全局天花板：Phase 1 切片 B14 + S12 追加 B20 + S17 桌面 B+4 = B38；
     A 类总额 4（其中 2 席冻结给 Phase 3 的 A-3 / A-4，Phase 2 实装 A=0）。 */
  ceiling: { A_max: 4, B_max: 38 },

  /* ── 3a. 动态分区：席位从 data/sd_slice.js 实际 effects 里数出来 ──
     （这两段的断言早已在 spec.js 中生效，此处仅登记元信息） */
  dynamic: [
    { id: 'slice', label: '切片段（SN-/SC-/SS-）', A: 2, B: 14, zeroMargin: true },
    { id: 'g1', label: 'G-1 段（SD-）· P-2 划拨', A: 0, B: 3, zeroMargin: true },
  ],

  /* ── 3b. 静态分区：Phase 2 · 2a 段（8×B）──────────────────────────
     来源 arg_pages_phase2.md §1.5.1：A2:2 A3:2 A4:1 A5:1 B1:1 C4:1 = 8。
     ⭐ 这些页面【尚未创建】，此处先占位登记 —— 目的正是让 2a 开工时
        直接核对，而不是临时去偷占切片的 16 席（HB-5）。

     status：'planned' = 未施工 ｜ 'built' = 已落地
     probe ：台账 ↔ 现实的防漂移探针
       · {type:'path'}    新页面：planned 时该路径必须【不存在】；
                                 built 时必须【存在】。
       · {type:'content'} 寄生改造（B1/C4 挂在已存在的页面上，不能用
                          路径存在性判断）：改用页面内的落地标记串判断。
       · {type:'none'}    无法自动判定，只靠人工翻 status。            */
  p2_2a: {
    id: 'p2_2a',
    label: 'Phase 2 · 2a 段（A组汽水屋 + B1 存档残影 + C4 404 第二行）',
    A_max: 0,          // HB-2 + "Phase 2 实际实装 A 类 = 0"
    B_max: 8,
    zeroMargin: true,  // 平账即零余量：要加必须指名替换
    seats: [
      {
        id: 'B-P2-A2-1', owner: 'A2', cls: 'B', status: 'planned',
        desc: '主线物证帖 · 第 3 页那句话真的在（可验证性核心）',
        probe: { type: 'path', path: 'qsw/t/1024' },
      },
      {
        id: 'B-P2-A2-2', owner: 'A2', cls: 'B', status: 'planned',
        desc: '主线物证帖 · 楼层/UID/注册日期的静态遗留物异常',
        probe: { type: 'path', path: 'qsw/t/1024' },
      },
      {
        id: 'B-P2-A3-1', owner: 'A3', cls: 'B', status: 'planned',
        desc: '争论帖 · R2 档残影（§2.4 已由 2 席降为 1 席 + 1 席氛围）',
        probe: { type: 'path', path: 'qsw/t/1187' },
      },
      {
        id: 'B-P2-A3-2', owner: 'A3', cls: 'B', status: 'planned',
        desc: '争论帖 · 被删回复只剩占位（冷恐怖遗留物）',
        probe: { type: 'path', path: 'qsw/t/1187' },
      },
      {
        id: 'B-P2-A4-1', owner: 'A4', cls: 'B', status: 'planned',
        desc: '死寂帖 · 零回复三楼即止',
        probe: { type: 'path', path: 'qsw/t/0993' },
      },
      {
        id: 'B-P2-A5-1', owner: 'A5', cls: 'B', status: 'planned',
        desc: 'R3 遗物 .txt · 文末密文',
        probe: { type: 'path', path: 'qsw/dl/soda_walkthrough_v3.txt' },
      },
      {
        id: 'B-P2-B1-1', owner: 'B1', cls: 'B', status: 'planned',
        desc: '/save 存档残影 · PLAY TIME 记的是对话时长（寄生改造）',
        probe: { type: 'content', path: 'save.html', marker: 'PLAY TIME' },
      },
      {
        id: 'B-P2-C4-1', owner: 'C4', cls: 'B', status: 'planned',
        desc: '404 第二行台词（寄生改造）',
        probe: { type: 'content', path: '404.html', marker: '你在找什么' },
      },
    ],
  },

  /* ── 3c. HB-3 / AB-1：恒为 H=0 的页面（安全区）────────────────────
     /about 必须先真的安全 —— 2b 建站时一个 B 类都不许放。
     任何席位若把 owner 指到这些路径上，直接 fail。 */
  zeroHorrorPaths: ['about', 'about.html', 'about/index.html'],
};

/* ══════════════════════════════════════════════════════════════════════
   4. 故意死链白名单（D-3）
   ══════════════════════════════════════════════════════════════════════
   D-3 的判据不是"没有死链"，而是"每一条死链都是【故意的】死链"。
   403/未抓全的镜像页这类叙事性死链登记在此；未登记的死链 = 忘了做。
   格式：{ from:'相对源文件', to:'链接原文', why:'叙事理由' }         */
const INTENTIONAL_DEAD_LINKS = [
  // 例（2c 镜像页上线后）：
  // { from: 'qsw/mirror.html', to: '../qsw/t/2001', why: 'D1：镜像没抓全这一页' },
];

module.exports = {
  PUBLISH_EXCLUDE_DIRS,
  PUBLISH_EXCLUDE_GLOBS,
  PUBLISH_REQUIRED,
  STRATA,
  HORROR,
  INTENTIONAL_DEAD_LINKS,
};
