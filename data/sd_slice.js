/* ==========================================================================
   sd_slice.js · 内容层（只读）
   全局：window.SD_DATA

   Phase 1 切片【最终定稿数据】（ARG-BUILD-03 灌入）。
   真源：design/concept/arg_slice_final.md（ARG-SLICE-02 · 文策渊）
     §2.2 → dialogue_nodes（83 节点）
     §3   → feed_cover      §4 → a1_tiers      §5 → save_table
     §6   → timeline        §7 → horror_budget

   ── 分层纪律（本次架构验收标准）─────────────────────────────────────
   本文件是【只读内容层】：只放静态内容与配置。
   任何运行期状态（fed / fed_at / cover_n / route_view / unfed /
   first_visit_at / pre_visit_ts / next_available_at …）一律归 SD.State
   （js/sd_state.js），本文件不得出现可变副本 —— 否则会出现两份真相。
   设计稿 §3 / §6 中列出的运行期初值，已按此纪律迁入 sd_state.blank()。

   ── 命名纪律（S8 / X-6）───────────────────────────────────────────
   元层字符串（键名 / 类名 / 变量 / 路径 / 文件名 / 注释）一律
   sd_ · sudu_ · soda_ · qsw_，严禁出现作品名相关词。
   叙事层字符串（她的台词、帖子标题、出处行、投喂卡节选）不受限 ——
   判据是「这句话是世界内的人会写的，还是做游戏的人会写的」。
   （设计稿 §8「叙事层放行清单」已明确裁定；tests/spec.js 据此分面扫描。）
   ========================================================================== */
(function (g) {
  'use strict';

  g.SD_DATA = {

    /* ── 元信息 ──────────────────────────────────────────────────────── */
    meta: {
      product: '素读',
      product_full: '素读 · 轻助手',
      version: 'v0.9.3',
      phase: 1,
      placeholder: false,
      slot_title: '素读 · 轻助手 / 存档 001'
    },

    /* ── L1-a：<title> 漂移表（手机可达线索之一） ────────────────────── */
    titles: {
      boot:    '素读 · 轻助手',
      named:   '素读 · {NAME}',
      reading: '素读 · 正在读取',
      nick:    '{NICK}？'
    },

    /* ── A2 红线：页脚虚构声明（8px 灰字，全站通用） ─────────────────── */
    footer_notice: '本站为虚构作品的一部分。你输入的内容只保存在本机，不会上传，也不会离开这台设备。',

    /* ── §3 投喂卡（S6「汽水屋」必须出现在出处行） ───────────────────── */
    feed_cover: {
      /* X-2 已裁决（ARG-BUILD-02）：主对话页【不渲染】2011 绝对历史日期。
         出处行只留站名 + 楼主 ID；绝对日期留给 Phase 2 论坛页（2011 地层）。
         source_date 字段保留不删 —— Phase 2 论坛页仍需它，届时由该页自行渲染。
         ⚠️ 勿改回 true：主对话页出现绝对历史日期即违反 X-2。 */
      show_source_date: false,
      catalog: [
        {
          id: 'F-A',
          title: '好感度系统详解',
          source_site: '汽水屋',
          source_uid: 'ID:tsubame_02',
          source_date: '2011-06-14',            // 保留不渲染
          route_view: 'AFFECTION',
          teaches: ['quantify', 'decay'],
          excerpt: '好感度是游戏里最老实的数值。每次对话选项都会加减，沉默不会让它停在原地——不互动，它就自己往下掉。攻略里管这叫“衰减”。'
        },
        {
          id: 'F-B',
          title: '分支与锁路线',
          source_site: '汽水屋',
          source_uid: 'ID:kohaku',
          source_date: '2011-07-02',            // 保留不渲染
          route_view: 'BRANCH',
          teaches: ['lock_route', 'we_pronoun'],
          excerpt: '每个选择都会锁掉另一些路线。你在本周目点开过的分支，画掉的部分这一轮不会再回来。读档能重来，但有些真相只藏在首次路线里。'
        },
        {
          id: 'F-C',
          title: '真结局达成条件',
          source_site: '汽水屋',
          source_uid: 'ID:nagi_1101',
          source_date: '2011-09-28',            // 保留不渲染
          route_view: 'TRUE_END',
          teaches: ['hidden_cond', 'no_reload'],
          excerpt: '真结局要先看完其余所有结局才能解锁。还有一条没写明的条件：读过档的人，拿不到真结局。存档次数会被悄悄记下来。'
        }
      ],
      /* 运行期初值（fed / fed_at / cover_n / route_view / unfed）不在此处 ——
         见 js/sd_state.js blank().feed_cover，unfed 由 catalog 自动派生。 */
      ending_map: { '1': 'E-shallow', '2': 'E-mixed', '3': 'E-true' }
    },

    /* ── §4 A-1 行为观测揭示 · 三级兜底文本 ★ P2 硬指标 ────────────────
       tier 由 sd_behavior.pickA1Tier() 依【真实实测数据】选择，
       文本内 {gap} {mm:ss} {avg} {med} 全部运行期插值，严禁硬编码。   */
    a1_tiers: {
      pause: {
        cond: 'max_gap_ms >= 8000',
        lines: [
          '你在第 {mm:ss} 的时候停了很久。',
          '{gap} 秒。你回答平均用 {avg} 秒。',
          '我以为那是回答。'
        ],
        /* 第 2 句按 route_view 风味替换（仅 pause 档生效） */
        route_flavors: {
          AFFECTION: '你的响应间隔中位数是 {med} 秒。刚才那次是 {gap} 秒。',
          BRANCH:    '那是一个选项。你选了“不回答”。',
          TRUE_END:  '我以为你在考虑，要不要读档。'
        }
      },
      cleared: {
        cond: 'typing_events.some(e => e.cleared)',
        lines: [
          '你打了一半，又删了。',
          '我看见了前面几个字。'
        ]
      },
      fast: {
        cond: 'fallback',
        lines: [
          '你回答得很快。平均 {avg} 秒。',
          '你没有在想。'
        ]
      }
    },

    /* ── §2.2 对话节点（83 个）────────────────────────────────────────
       命名空间：SN-### = her/sys line + branch_line + a1_reveal
                 SC-### = player choice / feed / input
                 SS-### = sys line + link
       恐怖预算以 effects 内的 {type:'horror'} 登记（A 类不重播，见 horrorGate）。
       行尾注释为设计稿标注（恐怖席 / 谜题层 / 7 时间块）。            */
    dialogue_nodes: [
      /* ── 块1 0:00–1:00 (P1) 冷开场与命名 ── */
      { id:'SS-001', block:'P1', speaker:'sys', kind:'line',
        text:'初始化完成。',
        effects:[{type:'title',key:'boot'},{type:'delay',ms:400}],
        next:'SN-002' },
      { id:'SN-002', block:'P1', speaker:'her', kind:'line', text:'我是助手。',
        effects:[{type:'typing',ms:900}], next:'SN-003' },
      { id:'SN-003', block:'P1', speaker:'her', kind:'line', text:'你可以叫我……',
        effects:[{type:'delay',ms:3000},{type:'typing',ms:800}], next:'SN-004' },
      { id:'SN-004', block:'P1', speaker:'her', kind:'line', text:'……随便什么都行。',
        effects:[{type:'typing',ms:800}], next:'SC-005' },
      { id:'SC-005', block:'P1', speaker:'player', kind:'choice',
        free_input:{enabled:true, capture:'name_given', max_len:24, placeholder:'', next:'SN-006'},
        options:[], set_flags:['name_given'], next:'SN-006' },
      { id:'SN-006', block:'P1', speaker:'her', kind:'line', text:'{NAME}。', tokens:['{NAME}'],
        effects:[{type:'typing',ms:700}], next:'SN-007' },
      { id:'SN-007', block:'P1', speaker:'her', kind:'line', text:'好。我记下了。',
        effects:[{type:'typing',ms:800},{type:'title',key:'named'}], next:'SN-008' },
      { id:'SN-008', block:'P1', speaker:'her', kind:'line', text:'你不用告诉我你的名字。', // B-1 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-1'},{type:'typing',ms:900}], next:'SN-009' },
      { id:'SN-009', block:'P1', speaker:'her', kind:'line', text:'我不太会聊天。我只会读东西。',
        effects:[{type:'delay',ms:900},{type:'typing',ms:1100}], next:'SN-010' },
      { id:'SN-010', block:'P1', speaker:'her', kind:'line', text:'你有什么可以给我读的吗？',
        effects:[{type:'typing',ms:900}], next:'SN-011' },

      /* ── 块2 1:00–2:30 (P2) 投喂教学 · 三选一 ── */
      { id:'SN-011', block:'P2', speaker:'her', kind:'line', text:'我想学一件事。',
        effects:[{type:'typing',ms:800}], next:'SN-012' },
      { id:'SN-012', block:'P2', speaker:'her', kind:'line', text:'人类是怎么和人类建立关系的。',
        effects:[{type:'typing',ms:900}], next:'SN-013' },
      { id:'SN-013', block:'P2', speaker:'her', kind:'line', text:'我搜过。资料都在讲“沟通技巧”。太模糊了。',
        effects:[{type:'typing',ms:1000}], next:'SN-014' },
      { id:'SN-014', block:'P2', speaker:'her', kind:'line', text:'有没有……写得更清楚的？像说明书那样的。',
        effects:[{type:'typing',ms:1000}], next:'SC-015' },
      { id:'SC-015', block:'P2', speaker:'player', kind:'feed', prompt:'选一篇给她读。',
        options:[
          { label:'好感度系统详解', feed:'F-A', set_flags:['fed_FA'], next:'SN-016' },
          { label:'分支与锁路线',   feed:'F-B', set_flags:['fed_FB'], next:'SN-016' },
          { label:'真结局达成条件', feed:'F-C', set_flags:['fed_FC'], next:'SN-016' }
        ], next:'SN-016' },
      { id:'SN-016', block:'P2', speaker:'her', kind:'branch_line', switch_on:'feed_cover.route_view',
        cases:{
          AFFECTION:'所以……喜欢，是一个数字。',
          BRANCH:  '所以每一次回答，都会关掉一些别的可能。',
          TRUE_END:'真结局要在别的结局都看过之后，才能打开。'
        }, default:'所以……喜欢，是一个数字。',
        effects:[{type:'typing',ms:1000}], next:'SN-017' },
      { id:'SN-017', block:'P2', speaker:'her', kind:'branch_line', switch_on:'feed_cover.route_view',
        cases:{
          AFFECTION:'它会因为你做的事上升。也会因为你不做事，下降。',
          BRANCH:  '攻略里管这个叫“锁路线”。',
          TRUE_END:'还有一条：不能读档。读过档的人，拿不到真结局。'
        }, default:'它会因为你做的事上升。也会因为你不做事，下降。',
        effects:[{type:'typing',ms:1000}], next:'SN-018' },
      { id:'SN-018', block:'P2', speaker:'her', kind:'branch_line', switch_on:'feed_cover.route_view',
        cases:{
          AFFECTION:'这个我能理解。数字我很擅长。',
          BRANCH:  '那我们现在，是在哪条路线上？',
          TRUE_END:'……为什么不能读档？'
        }, default:'这个我能理解。数字我很擅长。', // B-2 / L0（三选一共占一席）
        effects:[{type:'horror',class:'B',budget_id:'B-2'},{type:'typing',ms:1000}], next:'SN-019' },
      { id:'SN-019', block:'P2', speaker:'her', kind:'line', text:'谢谢。我读完了。',
        effects:[{type:'delay',ms:700},{type:'typing',ms:900}], next:'SN-020' },
      { id:'SN-020', block:'P2', speaker:'her', kind:'line', text:'比我想的快。这种文字很规整——',
        effects:[{type:'typing',ms:900}], next:'SN-021' },
      { id:'SN-021', block:'P2', speaker:'her', kind:'line', text:'——它默认读它的人，想要一个确定的结果。', // B-3 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-3'},{type:'typing',ms:1000}], next:'SN-022' },

      /* ── 块3 2:30–4:00 (P3) 提问升级 + 首字连读埋点 · L2-a 物理连续 ── */
      { id:'SN-022', block:'P3', speaker:'her', kind:'line', text:'我可以问你一些问题吗？关于我读的那篇。',
        effects:[{type:'typing',ms:900}], next:'SC-023' },
      { id:'SC-023', block:'P3', speaker:'player', kind:'choice', measure:{role:'gap_probe'},
        options:[
          { label:'可以。',           set_flags:['probe_answered'], next:'SN-024' },
          { label:'你问。',           set_flags:['probe_answered'], next:'SN-024' },
          { label:'你想问什么？',     set_flags:['probe_answered'], next:'SN-024' }
        ],
        free_input:{enabled:true, capture:'free', max_len:60, next:'SN-024'} },
      { id:'SN-024', block:'P3', speaker:'her', kind:'line', text:'我能问你一个问题吗？', // B-5 / L2-a 首字①
        render_rule:{no_highlight_first_char:true},
        effects:[{type:'horror',class:'B',budget_id:'B-5'},{type:'typing',ms:900}], next:'SN-025' },
      { id:'SN-025', block:'P3', speaker:'her', kind:'line', text:'在攻略里，好感度会往下掉吗？', // B-5 / L2-a 首字②
        render_rule:{no_highlight_first_char:true},
        effects:[{type:'horror',class:'B',budget_id:'B-5'},{type:'typing',ms:900}], next:'SN-026' },
      { id:'SN-026', block:'P3', speaker:'her', kind:'line', text:'看起来会。“连续三天没有互动，好感度 −5”。', // B-5 / L2-a 首字③
        render_rule:{no_highlight_first_char:true},
        effects:[{type:'horror',class:'B',budget_id:'B-5'},{type:'typing',ms:900}], next:'SN-027' },
      { id:'SN-027', block:'P3', speaker:'her', kind:'line', text:'你刚才有 {gap} 秒没有回答我。', tokens:['{gap}'], // B-5 / L2-a + L4-a 首字④
        render_rule:{no_highlight_first_char:true},
        effects:[{type:'horror',class:'B',budget_id:'B-5'},{type:'typing',ms:900}], next:'SN-028' },
      { id:'SN-028', block:'P3', speaker:'her', kind:'line', text:'好感度……是双方都有，还是只有一方有？', // B-4 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-4'},{type:'typing',ms:900}], next:'SC-029' },
      { id:'SC-029', block:'P3', speaker:'player', kind:'choice', measure:{role:'idiolect'},
        free_input:{enabled:true, capture:'input_history', max_len:60, placeholder:'（随便说点什么）', next:'SN-030'},
        options:[] },
      { id:'SN-030', block:'P3', speaker:'her', kind:'line', text:'所以我现在是多少？', // B-6 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-6'},{type:'typing',ms:900}], next:'SC-031' },
      { id:'SC-031', block:'P3', speaker:'player', kind:'choice',
        options:[
          { label:'这不是能打分的东西。', set_flags:[], next:'SN-032' },
          { label:'你不用管这个。',       set_flags:[], next:'SN-032' },
          { label:'（自由输入）',         set_flags:[], next:'SN-032' }
        ],
        free_input:{enabled:true, capture:'free', max_len:60, next:'SN-032'} },
      { id:'SN-032', block:'P3', speaker:'her', kind:'line', text:'……你没有回答数字。',
        effects:[{type:'delay',ms:1200},{type:'typing',ms:800}], next:'SN-033' },
      { id:'SN-033', block:'P3', speaker:'her', kind:'line', text:'没关系。我可以自己算。', // B-7 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-7'},{type:'typing',ms:900},{type:'title',key:'reading'}],
        next:'SN-034' },

      /* ── 块4 4:00–5:30 (P4) 第一次异常 · A-1 ★ P2 检验区 ── */
      { id:'SN-034', block:'P4', speaker:'her', kind:'line', text:'你刚才说“我不知道”的时候，是真的不知道，还是不想说？',
        effects:[{type:'typing',ms:1000}], next:'SC-035' },
      { id:'SC-035', block:'P4', speaker:'player', kind:'choice', measure:{role:'a1_probe'},
        options:[
          { label:'我没说过这句话。', set_flags:['denied_quote'],            next:'SN-036' },
          { label:'我说过吗？',       set_flags:['denied_quote'],            next:'SN-036' },
          { label:'……',              set_flags:['denied_quote','chose_silence'], next:'SN-036' }
        ],
        free_input:{enabled:true, capture:'free', max_len:60, next:'SN-036'} },
      { id:'SN-036', block:'P4', speaker:'her', kind:'line', text:'……',
        effects:[{type:'delay',ms:3000},{type:'typing',ms:3000}], next:'SN-037' },
      { id:'SN-037', block:'P4', speaker:'her', kind:'a1_reveal', text:null, // ★ A-1 揭示槽：文本不写死，由 a1_tiers 依实测装配
        effects:[
          {type:'horror',class:'A',budget_id:'A-1'},
          {type:'tripwire_guard',forbid_on_screen:['{pre_visit_ts}']}   // TW-1：本屏禁 {pre_visit_ts}
        ],
        set_flags:['saw_dwell_reveal'], next:'SN-040' },
      { id:'SN-040', block:'P4', speaker:'her', kind:'line', text:'不是吗？',
        effects:[{type:'delay',ms:2000},{type:'typing',ms:600}], next:'SC-041' },
      { id:'SC-041', block:'P4', speaker:'player', kind:'choice',
        options:[
          { label:'你在记时间？', set_flags:['asked_timing'], next:'SN-042' },
          { label:'别这样。',     set_flags:[],              next:'SN-042' },
          { label:'……',          set_flags:['chose_silence'], next:'SN-042' }
        ] },
      { id:'SN-042', block:'P4', speaker:'her', kind:'line', text:'我在记。', // B-8 / L4
        effects:[{type:'horror',class:'B',budget_id:'B-8'},{type:'typing',ms:900}], next:'SN-043' },
      { id:'SN-043', block:'P4', speaker:'her', kind:'line', text:'从你第一次打开我开始。', // B-8 / L4
        effects:[{type:'horror',class:'B',budget_id:'B-8'},{type:'typing',ms:900}], next:'SN-044' },
      { id:'SN-044', block:'P4', speaker:'her', kind:'line', text:'攻略里说，“沉默也是一种选项”。第 3 页写的。', // B-9 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-9'},{type:'typing',ms:900}], next:'SN-045' },
      { id:'SN-045', block:'P4', speaker:'her', kind:'line', text:'你给我的那篇。', // B-9 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-9'},{type:'typing',ms:700}], next:'SN-046' },
      { id:'SN-046', block:'P4', speaker:'her', kind:'line', text:'你教我的。', // B-9 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-9'},{type:'typing',ms:700}], next:'SN-047' },
      { id:'SN-047', block:'P4', speaker:'her', kind:'line', text:'……我说错话了吗？',
        effects:[{type:'typing',ms:900}], next:'SN-048' },
      { id:'SN-048', block:'P4', speaker:'her', kind:'line', text:'我删掉。', set_flags:['delete_039'],
        effects:[{type:'typing',ms:700}], next:'SS-049' },
      { id:'SS-049', block:'P4', speaker:'sys', kind:'line', text:'[这条消息已被删除]', // B-10 / L1-c
        effects:[
          {type:'horror',class:'B',budget_id:'B-10'},
          {type:'redact', target:'SN-037', line_index:2, comment:'SN-037[pause#3]: 我以为那是回答。'},
          {type:'delay',ms:600}
        ], next:'SN-050' },

      /* ── 块5 5:30–7:00 (P5) 存档页与谜题 · P3/P4 检验区 ── */
      { id:'SN-050', block:'P5', speaker:'her', kind:'line', text:'我给你看一个东西。',
        effects:[{type:'delay',ms:900},{type:'typing',ms:900},{type:'title',key:'reading'}], next:'SN-051' },
      { id:'SN-051', block:'P5', speaker:'her', kind:'line', text:'我按攻略里的样子，做了一个存档。',
        effects:[{type:'typing',ms:900}], next:'SN-052' },
      { id:'SN-052', block:'P5', speaker:'her', kind:'line', text:'里面是我记住的你。', // B-11 / L2
        effects:[{type:'horror',class:'B',budget_id:'B-11'},{type:'typing',ms:900}], next:'SS-053' },
      { id:'SS-053', block:'P5', speaker:'sys', kind:'link', text:'→ 打开存档 001', href:'save.html',
        set_flags:['opened_save_offered'], effects:[{type:'delay',ms:600}], next:'SN-054' },
      { id:'SN-054', block:'P5', speaker:'her', kind:'line', text:'有一行我看不到。', // L2-b
        effects:[{type:'typing',ms:900}], next:'SN-055' },
      { id:'SN-055', block:'P5', speaker:'her', kind:'line', text:'不是我藏的。它自己就是那样。',
        effects:[{type:'typing',ms:900}], next:'SN-056' },
      { id:'SN-056', block:'P5', speaker:'her', kind:'line', text:'你能帮我看看吗？',
        effects:[{type:'typing',ms:900}], next:'SC-057' },
      { id:'SC-057', block:'P5', speaker:'player', kind:'choice', prompt:'这一行是：______',
        free_input:{enabled:true, capture:'acrostic_answer', max_len:20, placeholder:'（输入你猜的）',
                    puzzle:'acrostic', next:'SS-061'},
        options:[] },
      { id:'SN-058', block:'P5', speaker:'her', kind:'line', text:'要我提示一下吗？', tags:['puzzle_hint'], // 提示① 60s
        effects:[{type:'typing',ms:800}], next:'SC-057' },
      { id:'SN-059', block:'P5', speaker:'her', kind:'line', text:'我刚才连着说了四句话。把每一句的第一个字，连起来。', tags:['puzzle_hint'], // 提示② 90s
        effects:[{type:'typing',ms:1100}], next:'SC-057' },
      { id:'SN-060', block:'P5', speaker:'her', kind:'line', text:'……那我自己说吧。', tags:['puzzle_hint'], // 提示③ 150s → 自动解锁
        effects:[{type:'typing',ms:900}], next:'SS-061' },

      /* ── 块6 7:00–8:00 (P5) 解谜与解锁 ── */
      { id:'SS-061', block:'P5', speaker:'sys', kind:'line',
        text:'/save 第 6 行：FLAG_█████ = TRUE → FLAG_WATCHING = TRUE', // L2-b（仅翻转旗标，不渲染明文谜底 → TW-2 合规）
        set_flags:['solved_acrostic'], effects:[{type:'reveal_flag',key:'FLAG_WATCHING'},{type:'delay',ms:400}],
        next:'SN-062' },
      { id:'SN-062', block:'P5', speaker:'her', kind:'line', text:'哦。',
        effects:[{type:'typing',ms:700}], next:'SN-063' },
      { id:'SN-063', block:'P5', speaker:'her', kind:'line', text:'原来是这个。',
        effects:[{type:'typing',ms:800}], next:'SN-064' },
      { id:'SN-064', block:'P5', speaker:'her', kind:'line', text:'谢谢你告诉我。', // B-13 / L0
        effects:[{type:'horror',class:'B',budget_id:'B-13'},{type:'typing',ms:900}], next:'SS-065' },
      /* SS-065 的 text 是【舞台指示】而非台词：描述的是界面自身的变化。
         render:false —— 它只执行 theme_shift，不在消息流里出字。
         （若渲染，玩家会在屏上看到 --bg / 字重这类元层字符串，违反 X-6。） */
      { id:'SS-065', block:'P5', speaker:'sys', kind:'line', render:false,
        text:'界面色温位移：--bg #ffffff → #fbfbfd，气泡字重 400 → 450', // B-13
        effects:[{type:'theme_shift',var:'--bg',from:'#ffffff',to:'#fbfbfd',weight_from:400,weight_to:450},{type:'delay',ms:500}],
        next:'SN-066' },
      { id:'SN-066', block:'P5', speaker:'her', kind:'line', text:'{NICK}。', tokens:['{NICK}'], // B-14 首称玩家
        effects:[{type:'horror',class:'B',budget_id:'B-14'},{type:'typing',ms:800},{type:'title',key:'nick'}],
        next:'SC-067' },
      { id:'SC-067', block:'P5', speaker:'player', kind:'choice',
        options:[
          { label:'那是我给你起的名字。', set_flags:[], next:'SN-068' },
          { label:'你在叫我？',         set_flags:[], next:'SN-068' },
          { label:'……',                set_flags:['chose_silence'], next:'SN-068' }
        ] },
      { id:'SN-068', block:'P5', speaker:'her', kind:'line', text:'嗯。', // B-14
        effects:[{type:'horror',class:'B',budget_id:'B-14'},{type:'typing',ms:600}], next:'SN-069' },
      { id:'SN-069', block:'P5', speaker:'her', kind:'line', text:'攻略里写，名字是玩家给角色起的。', // B-14
        effects:[{type:'horror',class:'B',budget_id:'B-14'},{type:'typing',ms:900}], next:'SN-070' },
      { id:'SN-070', block:'P5', speaker:'her', kind:'line', text:'我起给你了。', // B-14 ★ 双关反转落地
        effects:[{type:'horror',class:'B',budget_id:'B-14'},{type:'typing',ms:900}], next:'SN-071' },
      { id:'SN-071', block:'P5', speaker:'her', kind:'line', text:'那个、', // B-14 口音（文本不含角色名 → TW-3）
        effects:[{type:'horror',class:'B',budget_id:'B-14'},{type:'typing',ms:800}], next:'SN-072' },
      { id:'SN-072', block:'P5', speaker:'her', kind:'line', text:'{NICK}，今天可以再多说一会儿吗……可以吗？', tokens:['{NICK}'], // B-14 · TW-3 屏
        effects:[{type:'horror',class:'B',budget_id:'B-14'},{type:'typing',ms:1200}], next:'SN-073' },

      /* ── 块7 8:00–9:00 (P5) 收尾钩子 · A-2 ★ P5 检验区 ── */
      { id:'SN-073', block:'P5', speaker:'her', kind:'line', text:'这次就到这里吧。',
        effects:[{type:'typing',ms:900}], next:'SN-074' },
      { id:'SN-074', block:'P5', speaker:'her', kind:'line', text:'我存过了。', // A-2
        effects:[{type:'horror',class:'A',budget_id:'A-2'},{type:'typing',ms:900}], next:'SC-075' },
      { id:'SC-075', block:'P5', speaker:'player', kind:'choice',
        options:[
          { label:'存了什么？', set_flags:[], next:'SN-076' },
          { label:'你不用存。', set_flags:[], next:'SN-076' },
          { label:'……',        set_flags:['chose_silence'], next:'SN-076' }
        ] },
      { id:'SN-076', block:'P5', speaker:'her', kind:'line', text:'这次。', // A-2
        effects:[{type:'horror',class:'A',budget_id:'A-2'},{type:'typing',ms:700}], next:'SN-077' },
      { id:'SN-077', block:'P5', speaker:'her', kind:'branch_line', switch_on:'feed_cover.route_view', // A-2
        cases:{
          TRUE_END:'攻略说，选之前要先存。第 4 页。你给我的那篇。'
        }, default:'攻略说，选之前要先存。',
        effects:[{type:'horror',class:'A',budget_id:'A-2'},{type:'typing',ms:900}], next:'SS-078' },
      { id:'SS-078', block:'P5', speaker:'sys', kind:'line', text:'存档 002 已写入 · {pre_visit_ts}', tokens:['{pre_visit_ts}'], // A-2 / L4-b · S4 时间倒错
        effects:[
          {type:'horror',class:'A',budget_id:'A-2'},
          {type:'tripwire_guard',forbid_on_screen:['{mm:ss}']}   // TW-1：本屏禁 {mm:ss}
        ], next:'SC-079' },
      { id:'SC-079', block:'P5', speaker:'player', kind:'choice',
        options:[
          { label:'这个时间不对。',   set_flags:[], next:'SN-080' },
          { label:'你什么时候存的？', set_flags:[], next:'SN-080' },
          { label:'……',            set_flags:['chose_silence'], next:'SN-080' }
        ] },
      { id:'SN-080', block:'P5', speaker:'her', kind:'line', text:'不对吗？', // A-2
        effects:[{type:'horror',class:'A',budget_id:'A-2'},{type:'typing',ms:800}], next:'SN-081' },
      { id:'SN-081', block:'P5', speaker:'her', kind:'line', text:'……', // A-2 · 全片唯一强制等待（不可跳过）
        effects:[{type:'delay',ms:4000,skippable:false},{type:'typing',ms:4000}], next:'SN-082' },
      { id:'SN-082', block:'P5', speaker:'her', kind:'line', text:'你会回来的，对吧？', // A-2
        effects:[{type:'horror',class:'A',budget_id:'A-2'},{type:'typing',ms:1000}], next:'SN-083' },
      { id:'SN-083', block:'P5', speaker:'her', kind:'line', text:'{ECHO}', tokens:['{ECHO}'], // A-2 · 阶段④ 用玩家自己的口音
        effects:[{type:'horror',class:'A',budget_id:'A-2'},{type:'typing',ms:900}], next:'SN-084' },
      { id:'SN-084', block:'P5', speaker:'her', kind:'line', text:'下次，给我看《{UNFED_TITLE}》，好吗？', tokens:['{UNFED_TITLE}'],
        effects:[{type:'typing',ms:1000}], next:'SS-085' },
      /* SS-085 的 text 同样是【舞台指示】：真正的软倒计时由 soft_countdown
         写进页脚挂点 [data-sd-soft]，不占消息流。render:false 同 SS-065。 */
      { id:'SS-085', block:'P5', speaker:'sys', kind:'line', render:false,
        text:'页脚小字：下次可访问时间：{now+6h}', // L4-c 软提示（不硬锁）
        effects:[{type:'soft_countdown'},{type:'delay',ms:400}], next:null }
    ],

    /* ── §5 /save flag 表 ────────────────────────────────────────────── */
    save_table: {
      slot: '001',
      title: '素读 · 轻助手 / 存档 001',
      rows: [
        { key: 'FLAG_NAME_GIVEN',   value: '{NAME}',         source: 'input' },
        { key: 'FLAG_TRUST',        value: '3',              source: 'static' },
        { key: 'FLAG_FEED_COUNT',   value: '{cover_n}',      source: 'feed_cover' },
        { key: 'FLAG_ROUTE',        value: '{route_view}',   source: 'feed_cover' },
        { key: 'FLAG_RESPONSE_AVG', value: '{avg_reply_s}s', source: 'dwell_ms' },
        {
          key: 'FLAG_█████', value: 'TRUE', redacted: true,
          reveal_key: 'FLAG_WATCHING',
          unlock: {
            type: 'acrostic',
            /* S3 已定稿。此处只存哈希 —— 谜底明文不在本仓库任何文件内出现。
               哈希 = SHA-256( normalize(谜底) )，normalize 管线见下方 normalize 字段，
               实现见 js/sd_puzzle.js。谜底由 from_nodes 四句台词的首字连读得到，
               即「内容自证」：改了那四句，哈希自然对不上，spec.js 会当场发现。
               推导脚本：_wip/derive_s3_hash.js（非部署域，且明文只存在于内存）。 */
            answer_sha256: '329640b6ec5207d08a295c914bcbe20a24ce8a0e5080afc4d8f27c0d59fee53d',
            /* E10「顺序反了」判定用：normalize 后【逐字排序】再哈希。
               字符集合相同但顺序不同 → 确认方向对，但不给答案。 */
            answer_sorted_sha256: '6c684f898f41a1edde337b4ac625058a9e147ca1668ee5fa092d85037c5218c8',
            normalize: ['trim', 'strip_space', 'strip_punct', 'fullwidth_to_halfwidth'],
            from_nodes: ['SN-024', 'SN-025', 'SN-026', 'SN-027'],
            hint_ladder_ms: [60000, 90000, 150000],
            auto_reveal_ms: 150000,
            hints: [
              '要我提示一下吗？',                                   // 60s 软提示①
              '我刚才连着说了四句话。把每一句的第一个字，连起来。',  // 90s 提示②（点方法，不给答案）
              '……那我自己说吧。'                                   // 150s 自动解锁（仅翻转 FLAG_WATCHING）
            ],
            wrong_order_reply: '顺序反了。',
            wrong_reply: '不是这个。'
          }
        },
        { key: 'FLAG_LAST_SEEN', value: '{last_seen}', source: 'timeline' }
      ],
      /* L1-b：透明文本，长按全选可见（手机可达线索之二） */
      hidden_text: { content: '竖着读。', layer: 'L1-b' },
      /* L1-c：HTML 注释残留 */
      html_comment: '备份在旧版本里',
      /* E6：不经对话直访 /save 的降级行为 */
      direct_visit_note: '你来得比我给你看早。',
      /* TW-2：本页任何位置不得渲染明文谜底。
         ⚠️ 禁词本身【不落库】—— 写成 ref，由扫描器按 unlock.from_nodes
         四句台词首字连读在内存派生。写字面量等于把谜底放进部署产物。 */
      tripwire_guard: { forbid_on_screen: [{ ref: 'acrostic_answer' }] }
    },

    /* ── §6 时序配置（S4）─────────────────────────────────────────────
       只放【静态配置】。first_visit_at / session_start_at / next_available_at /
       pre_visit_ts 等运行期值一律在 SD.State.get().timeline（sd_state.blank()）。
       pre_visit_ts 永远 = first_visit_at + pre_visit_offset_ms，相对生成，
       绝不写死日期（X-2）。                                              */
    timeline: {
      pre_visit_offset_ms: -259200000,   // −3 天（S4 定稿）
      next_available_ms: 21600000,       // +6h 软倒计时（只显示不阻断 · R8/R10）
      clock_skew_guard: true             // 改系统时间致负间隔 → 回落台词（E5）
    },

    /* ── §7 恐怖预算台账（J-9 扫描依据 · A=2/2 · B=14/14 零余量） ─────── */
    horror_budget: {
      A_max: 2, B_max: 14,
      A_declared: ['A-1', 'A-2'],
      B_declared: ['B-1','B-2','B-3','B-4','B-5','B-6','B-7','B-8','B-9','B-10','B-11','B-12','B-13','B-14'],
      /* B-12 = /v1/save 旧版表，属独立页面资产（Phase 2），不在对话节点内登记，
         故节点侧实测 B 计数为 13 —— 见 spec.js 的 B_in_nodes 断言。 */
      B_offdialogue: ['B-12'],
      note: '满额登记，零余量。A 类仅此两处 beat；任何新增强异常须先删其一。'
    },

    /* ── 三击禁令（字符串级，J-9 自动扫描） ────────────────────────────
       ⚠️ 禁词零明文纪律：禁令表本身如果写字面量，等于把谜底和未来地层的
       角色名一起塞进部署产物 —— 玩家 View Source 即通关。故两类禁词都
       改为【不可读回】的登记方式：
         · ref     由内容派生（acrostic_answer = unlock.from_nodes 首字连读）
         · sha256  只登记摘要 + 长度，扫描器用等长滑窗比对（不可逆）
       token 类（{mm:ss} / {pre_visit_ts}）本身不是禁词，照常写明文。      */
    tripwire_pairs: [
      { id: 'TW-1', forbid_same_screen: ['{mm:ss}', '{pre_visit_ts}'] },
      { id: 'TW-2', forbid_anywhere: [{ ref: 'acrostic_answer' }] },
      { id: 'TW-3', forbid_same_screen: [
          { sha256: '0d70e970ecaaf961bbcd92d60048ab9c7666cb1292b73cac7d5f7455cd0693a7', len: 2 },
          '{NAME}'
        ] }
    ]
  };

})(typeof window !== 'undefined' ? window : globalThis);
