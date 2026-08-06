# 素读 · 轻助手（ARG《攻略》· Phase 1 最小切片骨架）

本目录是 ARG 解谜游戏《攻略》**Phase 1** 的纯静态最小切片骨架。题材为「重恐 × 轻助手」：
玩家面对一个只会读东西的 AI 助手「素读」，对话与存档里埋着可达线索。

> 命名纪律（S8 / X-6）：部署产物（玩家能访问到的文件）的**元层**字符串
> 一律用 `sd_` / `sudu_` / `soda_` / `qsw_`；**绝不**出现 `gonglue` / `gl_` / `攻略`。
> 本地目录名 `gonglue-web/` 仅作工程标识，**不进入部署产物**。
> 叙事层字符串（她的台词、帖子标题、出处行）不受此限。

---

## 目录结构

```
gonglue-web/
├── index.html          主对话页（assistant 主题）
├── save.html           存档页（save 主题 · 剧情道具）
├── 404.html            「这里没有东西。」（C3 在 GH Pages 不可行的降级终点）
├── robots.txt          Disallow: /v1/
├── favicon.svg         极简单色无字标记
├── css/
│   ├── sd_base.css     全站底座（双主题 data-site 变量 + 页脚声明）
│   ├── sd_chat.css     主对话页
│   ├── sd_save.css     存档页
│   └── sd_404.css      404 页
├── data/
│   └── sd_slice.js     内容层（只读）· 全局 window.SD_DATA（占位数据）
├── js/
│   ├── sd_state.js     状态层（J-1 · localStorage 单键 + 无痕降级）
│   ├── sd_timeline.js  时序层（J-5 · 相对时间 + 软倒计时）
│   ├── sd_idiolect.js  昵称化 + 口音 + XSS 防护
│   ├── sd_behavior.js  隐式行为采集（J-4 · A-1 命脉）
│   ├── sd_render.js    渲染层（J-3 · 全程 textContent，首字保护）
│   ├── sd_puzzle.js    谜题校验（J-7 · sha256 + 三级提示阶梯）
│   ├── sd_dialogue.js  对话节点机（J-2 · A-1 揭示槽）
│   ├── sd_router.js    路由（J-6 · data-site 主题 · 非 SPA）
│   ├── sd_app.js       主对话页装配
│   └── sd_savepage.js  存档页装配
├── tests/
│   ├── spec.js         J-9 红线扫描器（部署门禁 · 静态）
│   ├── dom_shim.js     零依赖无头 DOM 垫片 + 虚拟时钟（测试基础设施）
│   ├── sim_site.js     GitHub Pages 子路径部署模拟器
│   ├── smoke_main.js   烟雾测试 ① 主对话流渲染
│   └── smoke_save.js   烟雾测试 ② 存档页直访降级
└── .github/workflows/
    └── deploy.yml      GitHub Pages 部署
```

**架构承诺**：最终 85 节点脚本灌入时，**只替换 `data/sd_slice.js`**，`js/` 下模块零改动。

---

## 本地运行

纯静态、零依赖、零后端。任选其一：

```bash
# Python（自带）
cd gonglue-web
python -m http.server 8080
# 浏览器打开 http://localhost:8080/

# 或 Node
npx serve -l 8080 .
```

> 注意：`file://` 直接打开会因 `crypto.subtle` 不可用而走纯 JS SHA-256 回落，
> 功能正常，但建议用本地 http 服务以贴近真实环境。

---

## 红线与质量门（J-9）

部署前与本地提交前都建议跑一遍红线扫描：

```bash
node tests/spec.js
```

扫描**只覆盖会进入部署产物的文件**（html/css/js/svg/txt），明确排除
`tests/`、`README.md`、`.github/`。检查项：

1. 元层禁词 `gonglue` / `gl_` / `攻略`
2. TW-2 任何位置禁词 `我在看你`
3. TW-3 叙述泄漏 `千绘`（本切片不应出现）
4. 永不渲染的 token `{pre_visit_ts}`
5. 明文谜面泄漏 `占位答案`（源码内永不出现明文）
6. 恐怖预算 `A ≤ 2` · `B ≤ 14`
7. 对话节点图：无悬空引用、无孤儿节点
8. 谜底哈希管线：`normalize(占位答案)` 的 sha256 === `answer_sha256`
9. **GitHub Pages 子路径安全**：产物内禁止根绝对资源路径（`href`/`src`/`url()` 以 `/` 开头）

任一红线触即退出码 1（CI 阻断发布）。

### 无头烟雾测试（运行期门禁）

静态扫描看不见"页面到底能不能跑起来"。两个烟雾测试在**子路径部署模拟**下
加载真实 HTML、按真实顺序执行真实脚本，并驱动一遍完整交互：

```bash
node tests/smoke_main.js   # ① 主对话流渲染
node tests/smoke_save.js   # ② 存档页直访降级
```

零依赖（自带 DOM 垫片，不需要 jsdom / npm install）。覆盖：
资源 0 个 404、零根绝对路径、A-1 三级兜底真数校验、X-2 出处行无绝对日期、
E6 直访降级、R8 谜题到点自动解锁、J-1 无痕模式不抛异常、TW-2/TW-3 屏显红线。

> 虚拟时钟：`tests/dom_shim.js` 接管 `setTimeout` / `Date.now`，
> 因此"停顿 9 秒""静置 150 秒自动解锁"都是**瞬时**跑完的，且是**精确注入**的真值。

---

## GitHub Pages 部署

**托管决策：GitHub Pages（非 Cloudflare）。** 采用 gh-pages 分支方案。

> ⚠️ 本工作流**不会**自动推送。需主理人先完成以下步骤，且**未经明确许可不执行
> `git commit` / `git push`**。

1. 在 GitHub 新建一个仓库（建议名与作品无关，如 `sudu-reader`）。
2. 把本目录作为**独立仓库**初始化并推送（项目根 `类迷雾游戏开发` 不是 git 仓库）：
   ```bash
   cd gonglue-web
   git init
   git add -A
   git commit -m "Phase 1 skeleton"
   git branch -M main
   git remote add origin git@github.com:<用户名>/<仓库名>.git
   git push -u origin main
   ```
3. 仓库 **Settings → Pages → Source** 选 `Deploy from a branch` → `gh-pages`（由工作流自动建）。
4. 推送或手动 `Actions → deploy-pages → Run workflow` 触发。

部署工作流（`.github/workflows/deploy.yml`）会：
- 先跑 J-9 红线扫描作为门禁；
- 只发布干净产物（html/css/js/data/favicon.svg/robots.txt），**排除 README.md 与 tests/**；
- 加 `.nojekyll`，避免下划线目录被当 Jekyll 处理。

---

## 境内实测准备 & 测试说明要点

**可达性**：GitHub Pages 在大陆通常可达，但稳定性随运营商/时段波动，需实测。
建议在**多个网络**下验证：家宽（电信/联通/移动各一）、手机 4G/5G、公司网。

**测试要点清单**：
- [ ] 移动优先：iPhone Safari / Android Chrome 实机，输入框常驻可见、零横向滚动。
- [ ] iOS 无痕模式：localStorage 不可写时降级内存态，对话不报错、不抛异常（J-1 try/catch）。
- [ ] A-1 三级兜底全跑通（J-4 命脉）：
  - 兜底①：在 PC-012 选项处**停顿 ≥ 8 秒** → 应走 `pause` 链，`{gap}`/`{mm:ss}` 为真数；
  - 兜底②：打字 ≥ 2 字后**清空** → 应走 `cleared` 链；
  - 兜底③：全程飞快、无删改 → 应走 `fast` 链。
  - 验证 `{gap}`/`{avg}` 来自真实测量，非硬编码。
- [ ] 行为采集静默（R2）：前台零进度 UI，唯一出口是她的台词。
- [ ] 首字保护：每句首字不被任何元素包裹（L2-a 谜题物理前提，`assertFirstCharPlain`）。
- [ ] XSS：在输入框输入 `<script>` 或 `<img onerror>` —— 不执行、只作纯文本回显。
- [ ] 存档页：经对话走到 `save.html` 出现谜题输入；直接访问 `/save` 显示降级提示
      「你来得比我给你看早。」（E6）。
- [ ] 谜题：占位答案通过校验揭出 `FLAG_WATCHING=TRUE`；三级提示到点自动解锁（R8 主线不锁死）。
- [ ] L1-b 透明文本「竖着读。」：长按全选可见；L1-c HTML 注释「备份在旧版本里」在 DOM 中。
- [ ] 404：`/不存在的路径` 或 `/404` 显示「这里没有东西。」并可回开头。
- [ ] `robots.txt` 含 `Disallow: /v1/`；`favicon.svg` 正常加载。

**C3 / X-7 限制说明（GH Pages 不可行项的替代干净度）**：
- **C3（_headers 返真 403）**：GH Pages **不支持** `_headers` 文件级响应头 → 降级用 **404**。
  替代**干净**：404 页同为 assistant 主题、不解释、可回开头，不暴露任何"这里本该有东西"的暗示。
- **X-7（_headers 改 Last-Modified）**：同样不支持 → **仅靠镜像壳吸收**（用 CDN/反向代理层改写，
  不在仓库内做）。仓库内不引入任何 `_headers`，避免误以为生效而实则无效。

---

## 已知限制 / 待主理人裁决

- ~~**X-2 冲突**~~ → **已裁决（ARG-BUILD-02）**：`feed_cover.show_source_date` 置 **`false`**。
  主对话页投喂卡出处行只渲染「汽水屋 · ID:xxx」，**不渲染 2011 绝对历史日期**。
  绝对日期留给 Phase 2 论坛页（2011 地层）；`source_date` 字段保留不删，供该页自行渲染。
  回归防线：`tests/smoke_main.js` 的 S4d / S4e 断言（出处行与整屏均不得出现绝对历史日期）。
- **S3 谜底**：`save_table.rows` 中被抹黑行的 `answer_sha256` 是**占位答案**哈希（标 `todo_s3`），
  源码零明文。定稿只换那一行 + 置 `KNOWN=''` 于 `tests/spec.js`。
- **恐怖预算**：Phase 1 仅实装 A-1 链路验证 P2；B 类资产随 85 节点脚本一并灌入。
- **⚠️ PC-012 选项被吞（待裁决）**：`data/sd_slice.js` 的 `PC-012` 同时声明了
  `options`（3 个）与 `free_input`，但 `sd_render.freeInput()` 开头的 `clearDock()`
  会把刚渲染的选项清空 —— 玩家实际只看得到输入框，三个选项从未出现。
  与 `sd_dialogue.attachInlineInput()` 的注释意图（"输入框挂在选项下方"）相悖。
  `tests/smoke_main.js` 会把它报为**警告**（不阻断）。
  **裁决项**：(a) 修 `freeInput()` 增加"不清空"参数使两者共存；(b) 改数据，PC-012 二选一。
  ⚠️ 85 节点脚本灌入前必须定夺，否则任何"选项 + 自由输入"节点都会静默丢选项。
- **⚠️ 404 页在深层路径下会裸奔（待裁决）**：GH Pages 对**任意深度**的不存在路径
  都下发同一个 `404.html`，而页内相对路径按**当前 URL**解析：
  `/<repo>/v1/` → `css/sd_base.css` 解析成 `/<repo>/v1/css/sd_base.css` → 404 → 无样式，
  且「回到开头」`href="./"` 会回到 `/<repo>/v1/` 而非站点首页。
  ⚠️ `robots.txt` 的 `Disallow: /v1/` 正是引玩家去踩这条路径的 ARG 面包屑。
  **建议**：把 404 页做成自包含（内联样式、去掉外部 css/favicon 引用）+ 内联脚本
  由 `location.pathname` 第一段推出站点根，修正「回到开头」链接。
  未改动，因 404 是 C3 降级终点，属叙事面，需主理人 / 文策确认。

---

## 明确不做什么（硬约束）

- 不接真实 LLM（脚本化"AI"，纯数据驱动）。
- 不收集真实个人信息（输入只存本机，A2 页脚已声明）。
- 0 元预算（无付费服务、无后端）。
- `fenglue-web/`、`game/` 零改动（R1 不换皮：不复用沨镇任何人物/地名/编号/事件/文案）。
