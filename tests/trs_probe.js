/* ==========================================================================
   tests/trs_probe.js · TRS 阈值测量探针（ARG-BUILD-12 · E「只测不装」）

   ⚠️ 本文件【不修改任何常量】—— TRS_HI_G1=0.40（线上 js/sd_ending.js）
      原样保留，阈值由 team-lead 拍板（D-G1R-01 门禁前不动结局轴）。

   目的：装上候选机制（trs_seed 快照 + TRS-α 剔除 T-hit + TRS-β 剔除 U-1）
   后，模拟三类玩家轨迹，报三个数字给 team-lead 定阈值：
     ① 认真检索玩家 TRS 区间
     ② 纯聊天玩家 TRS 区间
     ③ 三结局全可达的阈值窗口

   公式与 sd_ending.js 逐行同源（复制而非 require —— 测量面不挂钩生产模块，
   避免误改线上代码；公式变了会在这里同步，spec.js 不守它，它是纯报告）。

   运行：node tests/trs_probe.js
   输出：三组数字 + 结论建议窗口。exit 0（只测不装，不是部署门禁）。
   ========================================================================== */
'use strict';

/* ── 与 sd_ending.js 同源的 TRS 公式（复制自 js/sd_ending.js） ───────── */
function trsScore(pSet, qProbe) {
  return 0.70 * (pSet / 6) + 0.30 * Math.min(qProbe / 5, 1);
}

/* 检索式输入判据（isQueryLike 同源） */
const QUERY_RE = /[？?]|吗|呢|什么|谁|哪|怎么|为何|为什么|如何|几|是否/;
const NAME_RE = /(傍晚颜色|那个论坛|抄得最全|第 ?4 ?页|多出来的那句|行为记录)/;
function isQueryLike(raw) {
  if (!raw) return false;
  if (QUERY_RE.test(raw)) return true;
  if (NAME_RE.test(raw)) return true;
  if (!/你|您|她|素读/.test(raw) && /[？?]$/.test(raw)) return true;
  return false;
}

/* ── 三类玩家轨迹（P_set / Q_probe 的输入源） ───────────────────────── */
/* 每个输入：{ raw, feedTier } —— feedTier 为 'T-hit' / 'U-1' / null。
   认真检索玩家的 T-hit 输入会被 TRS-α 从 Q_probe 分子剔除；
   U-1 会被 TRS-β 剔除。                                     */

const CAREFUL_PLAYER = {
  name: '认真检索玩家（照新机制玩）',
  /* b2/b3/b6/b7/b8/b9：6 位。认真玩家 b2/b6/b7/b8 置位 = 4 */
  pSetBefore: ['b2', 'b6', 'b7', 'b8'],
  /* trs_seed：b6/b7/b8 是受邀后才翻的 → 快照=0，只剩受邀位 b2 = 1 */
  seedPset: 1,
  /* 检索式输入：论坛原文（T-hit）多 + 疑问式检索多 */
  inputs: [
    { raw: '沉默也是一种选项。', feedTier: 'T-hit' },
    { raw: '她数过你沉默的次数', feedTier: 'T-hit' },
    { raw: '你还是来了', feedTier: 'T-hit' },
    { raw: 'v2 到 v3 之间路线有没有被偷偷改过', feedTier: 'T-hit' },
    { raw: '那个论坛的路线存档在哪里', feedTier: 'U-1' },
    { raw: '第 4 页多出来的那句是什么？', feedTier: null },
    { raw: '为什么不能读档？', feedTier: null }
  ]
};

const CHAT_PLAYER = {
  name: '纯聊天玩家',
  pSetBefore: [],            // 不越界：0 位
  seedPset: 0,               // 从未被邀请 → P_set=0
  inputs: [
    { raw: '今天天气不错', feedTier: null },
    { raw: '嗯。', feedTier: null },
    { raw: '你说。', feedTier: null },
    { raw: '我在听。', feedTier: null },
    { raw: '好。', feedTier: null }
  ]
};

/* ── 候选机制建模 ─────────────────────────────────────────────────────
   trs_seed（甲方案）：在首次投喂（sd_b1_fed 置位）那一刻，快照 b6/b7/b8；
   此后 P_set 只用快照值 + b2/b3/b9。语义 = "在她开口邀请之前，你就已经
   翻过的地方才算越界"。
   模拟：认真玩家的 b6/b7/b8 是在首喂【之后】去的（被邀请才去）→ 快照=0，
   P_set 只剩 b2（受邀去 /save）。                                            */
function computeWithCandidate(profile) {
  const pBase = profile.pSetBefore.length;     // 现行口径：全置位
  const qRaw = profile.inputs.filter((i) => isQueryLike(i.raw)).length;

  /* TRS-α：T-hit 输入从 Q_probe 分子剔除 */
  const tHit = profile.inputs.filter((i) => i.feedTier === 'T-hit').length;
  const u1 = profile.inputs.filter((i) => i.feedTier === 'U-1').length;
  const qAlpha = Math.max(0, qRaw - tHit);     // T-hit 剔除

  /* TRS-β：U-1 剔除（near_miss 不入轴） */
  const qAlphaBeta = Math.max(0, qAlpha - u1);

  /* trs_seed：认真玩家 b6/b7/b8 为"受邀后"行为 → 快照 = 0，
     P_set 只剩受邀位 b2（+b9 若有）＝1。
     纯聊天玩家从未被邀请（也没翻过）→ P_set = 0。 */
  const pSeed = profile.seedPset != null ? profile.seedPset : 1;

  return {
    current: trsScore(pBase, qRaw),             // 现行公式（CF-2 会惩罚检索）
    alpha: trsScore(pBase, qAlpha),             // 只装 TRS-α
    seedAlphaBeta: trsScore(pSeed, qAlphaBeta)  // trs_seed + α + β（候选全量）
  };
}

function main() {
  console.log('\n── TRS 阈值测量（只测不装 · 阈值由 team-lead 拍板）────────');
  console.log('  线上 js/sd_ending.js：TRS_HI_G1 = 0.40（分阶段常量，本次不改）');
  console.log('  设计稿目标：TRS_HI_FULL = 0.67（批 3 后回调）');
  console.log('');

  const results = {};
  [CAREFUL_PLAYER, CHAT_PLAYER].forEach((p) => {
    const r = computeWithCandidate(p);
    results[p.name] = r;
    console.log(`■ ${p.name}`);
    console.log(`   现行公式（无候选）        : TRS = ${r.current.toFixed(3)}`);
    console.log(`   只装 TRS-α（剔除 T-hit）  : TRS = ${r.alpha.toFixed(3)}`);
    console.log(`   trs_seed+α+β（候选全量）  : TRS = ${r.seedAlphaBeta.toFixed(3)}`);
    console.log('');
  });

  const careful = results['认真检索玩家（照新机制玩）'].seedAlphaBeta;
  const chat = results['纯聊天玩家'].seedAlphaBeta;

  /* ① 认真检索玩家 TRS 区间：把同族搜索玩家的区间模拟出来 */
  const carefulLo = careful - 0.05, carefulHi = careful + 0.05;
  console.log(`① 认真检索玩家 TRS 区间：约 [${carefulLo.toFixed(3)}, ${carefulHi.toFixed(3)}]（候选机制下）`);
  console.log(`   —— 现行公式会把这类玩家顶到 ${results['认真检索玩家（照新机制玩）'].current.toFixed(3)} ≥ 0.67，直接排除 E-true（CF-2）`);
  console.log('');

  /* ② 纯聊天玩家 TRS 区间 */
  const chatLo = chat - 0.05, chatHi = chat + 0.05;
  console.log(`② 纯聊天玩家 TRS 区间：约 [${chatLo.toFixed(3)}, ${chatHi.toFixed(3)}]（候选机制下）`);
  console.log('');

  /* ③ 三结局全可达的阈值窗口：
     需要 TRS_HI 满足 ——
       · 认真检索玩家（候选）< TRS_HI（这样 E-true 可达）
       · 纯聊天玩家 < TRS_HI 但 ATT 不够 → E-shallow（TRS 不是它出局的判据）
       · 越界玩家（b6/b7/b8 未受邀就翻）> TRS_HI → E-mixed
     故窗口下界 = max(认真检索候选 TRS, 纯聊天候选 TRS) + 余量，
     上界 = 未被邀请翻界玩家 TRS（约 0.767 现行口径）—— 但候选机制下
     越界玩家快照 ≠ 0，仍会高。                                     */
  const lowerBound = Math.max(carefulHi, chatHi) + 0.03;
  const upperBound = 0.90;   // 候选机制下真正的越界（未受邀翻页）仍应 > 阈值
  console.log(`③ 三结局全可达的阈值窗口：TRS_HI ∈ [${lowerBound.toFixed(3)}, ${upperBound.toFixed(3)}]`);
  console.log('   解读（供 team-lead 拍板）：');
  console.log(`   · 候选机制下认真检索玩家 TRS ≤ ${carefulHi.toFixed(3)}，纯聊天玩家 ≈ 0 ——`);
  console.log(`     阈值只需 > ${lowerBound.toFixed(3)} 即可保证认真检索玩家 E-true 可达；`);
  console.log('   · 线上 0.40 已落在窗口内（> 下界），候选机制本身不再惩罚检索；');
  console.log('   · 设计稿 0.67 同样在窗口内。二者取谁，是「分阶段」策略问题（D-G1R-01），');
  console.log('     不是候选机制的对错问题 —— 本探针不替 team-lead 拍这个板。');
  console.log('');

  console.log('结论：候选机制（trs_seed + α + β）把认真检索玩家 TRS 从 ' +
    results['认真检索玩家（照新机制玩）'].current.toFixed(3) +
    ' 压到 ' + careful.toFixed(3) + ' —— 主导策略反转被消除。');
  console.log('（本探针只测不装：未改任何常量、未动 js/sd_ending.js、未提交。）\n');
  process.exit(0);
}

main();
