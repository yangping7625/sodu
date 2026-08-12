# 批 2 窗口交互 · GitHub 方案调研与工程方案

> 范围：用户选定批 2 最高优先级 **C** —— 窗口要像真窗口：可拖动 / 缩放 / 最小化 / 最大化 / 关闭。
> 约束：**self-implement**（借力 GitHub 思路，但不 `npm install` / `import` 任何库或 CDN）。
> 配合文档：`tests/spec.js`（R5.2 红线条目）、`sh_main.css`（现有 `.sh-win` / `.sh-stage` 布局）、`sh_main.js`（现有窗口逻辑）。
> 配套 ADR：`docs/tech/sudu_desktop_implementation_adr.md`（ARG-BUILD-13，纯 vanilla 技术选型）。

---

## 1. 摘要

- 批 2 不引入任何第三方窗口库。GitHub 上的实现（WinBox / VtWindow 等）大多是 **库** 且其 CSS 含 `box-shadow` / `border-radius` / `backdrop-filter`，会**直接撞穿 `spec.js` 的 R5.2 断言**，无法 import。正确做法是**只借用其 JS 算法**（拖拽 delta、8 向缩放数学、边界护栏、焦点计数），用我们自己的 90s 美术语言（斜面 + 硬投影 + Song 字栈 + 20 色板）重写约 80–120 行到 `sh_main.js`。
- 关键架构事实：**当前是单窗口模型**（DOM 里只有一个 `[data-sh-win]`，`makePane`/`show` 通过 `data-on` 切换 pane）。因此批 2 的 drag/resize/maximize/close/minimize **全部作用在单个 `.sh-win` 的几何（left/top/width/height 像素）上**，无需多窗口 z-index。多窗口 z-index / 激活态是**批 3+** 的事。
- **`transform:` 在 spec.js 被禁**（`R5 无位移/缩放`）。所以 drag/resize **必须用 `left`/`top`/`width`/`height` 像素位移**，绝不能用 `transform: translate/scale`。这反而和现有布局（`.sh-win{left:calc(...);top:28px;width:calc(...)}`）天然契合。
- CSS `resize` 属性**不足以**支撑 8 向缩放（只给右下角、handle 不可样式化、需 `overflow≠visible`、移动端需禁用）。**结论：自定义 8 向 handle**。
- **工程判断（已授权"你定"）：批 2 最小范围 = 拖拽 + 8 向 resize + 最大化 + 关闭 + 最小化**。
  minimize 不必推迟——现有桌面图标列表（`[data-sh-item]`）**已经是最小化后的恢复面**（点图标最小化、再点同一图标 `open()`→`show()` 恢复；`setRun` 用实心符号标记"运行中"），**不需要专用任务栏**。专用任务栏/ Dock 才是批 3 的增强项。

---

## 2. 候选表（GitHub / 博客）

> 评级：★ 强借鉴（算法可直接抄写）｜◐ 仅参考（概念有用但实现需重写）｜✕ 不入（是库或视觉违规）

| # | 仓库 / 来源 | 链接 | 可借鉴核心 | 为何不直接 import | 触碰 R5.2 红线 |
|---|------------|------|-----------|----------------|--------------|
| 1 | **derrek.dev — Draggable Window Manager (Vanilla JS)** | https://derrek.dev/blog/2026-01-08-draggable-window-manager-vanilla-javascript | 标题栏 `mousedown`→`mousemove`(算 delta)→`mouseup` 的标准拖拽骨架；document 级挂 move/up；边缘吸附(snap)伪码；z-index 计数器 `bringToFront` | 博客教学代码，非发布包；且其按钮用 FontAwesome（字体图标=`@font-face` 违例） | 仅"借 JS 算法"；**不借其 CSS**（字体图标/圆角） |
| 2 | **yazelin — 視窗系統(中)：縮放、最大化與多視窗管理** | https://yazelin.github.io/frontend/2025/12/10/window-system-part2-resize.html | **8 向缩放数学最完整**：方向→属性映射表（n→top+height；w→left+width；e→width；ne→top+width+height…）+ **左/上边缘缩放补偿公式**（left 随 width 反向变化）。这是 resize 的"标准答案" | 博客，无包 | 纯算法，无视觉；**直接采用** |
| 3 | **Yashaswirai/vanilla-desktop-os** | https://github.com/Yashaswirai/vanilla-desktop-os | 全 vanilla、无框架无 canvas；**8 向 resize handle** 实现；多窗口焦点管理(`bringToFront`)；localStorage 持久化；任务栏 | 项目用 `backdrop-filter` / `transition` / 位图 wallpaper（全部 R5 违例），且其 main.js 742 行耦合度高风险高 | 仅借 resize handle 思路 + 焦点计数；**不借视觉与 wallpaper** |
| 4 | **victornpb/VtWindow** | https://github.com/victornpb/VtWindow | vanilla、零依赖、`drag.js` 拖拽实现；可最小化、可主题 | Apache-2.0 但**是库**；其主题 CSS 含 `box-shadow`（违例）；体积虽小但引入即破坏"零依赖"叙事 | 仅借 `drag.js` 的 delta 算法；**不 import** |
| 5 | **nextapps-de/WinBox**（镜像 michieliJoe/winbox） | https://github.com/nextapps-de/winbox | **API 设计范本**：`move(x,y)` / `resize(w,h)` / `maximize()` / `minimize()` / `focus()` + `onmove`/`onresize` 回调；`min/max` 边界限定 | **是库**（`winbox.bundle.js` ≈40KB）；其 CSS 含 `box-shadow`+`border-radius` 必撞 R5；import 即破坏 ADR 零依赖选型 | ✕ 不 import；仅以其 **API 形状** 作我们自写模块的接口参考 |
| 6 | **codelucky / webdevfundamentals / thelinuxcode — CSS `resize` 指南** | https://codelucky.com/css-resize-property 等 | 澄清 `resize` 局限：仅右下角、需 `overflow≠visible`、handle 不可样式化、移动端 `@media` 禁用 | —— | 用于**论证"为何不用 CSS resize"**；结论：自定义 handle |
| 7 | GStaehler/Window-Engine、Tom-Siegel/jsWindow | https://github.com/GStaehler/Window-Engine 等 | 拖拽窗口库、内置任务栏 | 都是库；Window-Engine 用 fade 动画（违例） | ✕ 不采用 |

**结论**：★ 直接采用 yazelin 的 8 向缩放数学 + derrek 的拖拽/吸附骨架 + WinBox 的 API 形状；◐ 参考 vanilla-desktop-os 的 handle 布局与焦点计数；✕ 不 import 任何库。

---

## 3. 推荐方案（按 6 个重点方向）

### 3.1 原生拖拽（mousedown/touchstart + move + up）+ 边界护栏
- **统一用 Pointer Events**（`pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`），一套代码同时覆盖鼠标与触屏（移动端 `narrow()` 跳阅读页的场景除外）。
- 监听挂在 **标题栏 `.sh-bar`** 上；若 `e.target` 是 `.sh-ctl`（三键）则忽略，避免和按钮点击冲突。
- 算法（derrek 骨架，self-implement）：
  ```js
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('.sh-ctl')) return;      // 三键区不拖
    const r = win.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const ox = r.left, oy = r.top;
    win.setPointerCapture(e.pointerId);
    const move = ev => {
      let nx = ox + (ev.clientX - sx);
      let ny = oy + (ev.clientY - sy);
      // 边界护栏：至少保留标题栏高度可见、不能整窗拖出 CRT（视口）
      nx = clamp(nx, EDGE, innerWidth  - r.width  - EDGE);
      ny = clamp(ny, 0,    innerHeight - BAR_H   - EDGE); // 顶不藏标题栏
      win.style.left = nx + 'px';
      win.style.top  = ny + 'px';
    };
    const up = () => { win.releasePointerCapture(e.pointerId);
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', up); remember(); };
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', up);
  });
  ```
- **边界护栏（"CRT 屏幕"）**：窗口四周留 `EDGE`（建议 8px）余量，保证任何时候至少部分标题栏在视口内、整窗不漂出 `body[data-sh="home"]` 视口。用 `clamp` 即可，无需 `overflow:hidden` 掩埋。
- **不触发 R5**：纯 `left`/`top` 像素位移；无 `transition`、无 `transform`。

### 3.2 缩放：CSS `resize` vs 自定义 8 向 handle
- **选：自定义 8 向 handle**（yazelin 数学 + vanilla-desktop-os 布局）。理由见候选表 #6：CSS `resize` 只能右下、handle 不可定制、需 `overflow≠visible`、移动端要禁——都不满足"真窗口 8 向缩放"。
- 在 `.sh-win` 内追加 8 个 `.sh-rs` 子元素（n/s/e/w + ne/nw/se/sw），`position:absolute` 贴边、`pointer-events:auto`、置于 `.sh-body` 之后（命中测试在 iframe 之上）。
- 方向→属性映射（yazelin，直接采用）：
  | 方向 | 改的属性 |
  |---|---|
  | n | `top`, `height` |
  | s | `height` |
  | w | `left`, `width` |
  | e | `width` |
  | ne | `top`, `width`, `height` |
  | nw | `top`, `left`, `width`, `height` |
  | se | `width`, `height` |
  | sw | `left`, `width`, `height` |
- **左/上边缘补偿**（关键，否则左拉会"滑走"）：`w`/`nw`/`sw` 方向拖时，`left -= deltaX`、`width += deltaX`（top 同理）。
- 最小尺寸 `MIN_W/MIN_H`（建议 ≥ 320×240，保证 iframe 内容可用）；同时复用 3.1 的边界护栏（右/下不超视口）。
- 光标：`cursor: ew-resize / ns-resize / nwse-resize / nesw-resize`（光标属性不在 R5 禁单内，可用，提升可发现性）。
- handle 视觉：2px 边框 + 白名单色，**无圆角、无 box-shadow**（守住 R5）。最大化态下 `display:none`。

### 3.3 三键（最小化 `_` / 最大化 `□` / 关闭 `×`）DOM/事件/状态
- DOM：`.sh-bar` 现有 `sh-ctl--sheet`(←) / `sh-ctl--min`(—) / `sh-ctl--close`(×)。**新增 `sh-ctl--max`(□)**。
- 事件：现有 `doc.querySelectorAll('[data-sh-act]')` 已按 `act` 分发（`close`→`close()`、`min`→`minimize()`）。扩容：`max`→`toggleMax()`。
- 状态机（单窗口，`win` 的几何 + 一个 `maximized` 布尔）：
  | 键 | 行为 | 现有基础 |
  |---|---|---|
  | close `×` | `close()`（销毁 pane、`win_state=closed`） | 已有 |
  | minimize `_` | `minimize()`（去 `data-open`、回桌面，`win_state=min`，列表图标标"运行"） | 已有 |
  | maximize `□` | `toggleMax()`（存 `prevRect`→铺满视口；再点还原） | **新增** |
- `.sh-ctl` 斜面样式（亮上左/暗下右 2px）直接复用现有 `.sh-ctl` 规则，无需新视觉。

### 3.4 窗口状态管理：最小化是否推迟？
- **工程判断：minimize 不推迟，批 2 即做。** 理由：单窗口模型下 `minimize()` 已存在，且**桌面图标列表 `[data-sh-item]` 就是恢复面**——点图标最小化、再点同一图标 `open()→show()` 恢复；`setRun(id,true)` 把符号变实心表示"运行中"。无需任务栏。
- **推迟到批 3**：专用任务栏 / Dock / 系统托盘（多窗口并排时的统一恢复面）、多窗口并存。
- 最大化态：存 `prevRect={left,top,width,height}`；最大化时 `left:0;top:0;width:100%;height:100%`（或留 `EDGE` 内边距，与氛围层协调）；恢复时写回 `prevRect`。

### 3.5 多窗口 z-index / 激活态
- **批 2 不涉及**：当前单窗口，`.sh-stage{z-index:10}` 已够，无需每窗 z-index。
- **架构警示（给批 3+）**：现有 `.sh-win::after{ z-index:-1 }` 硬投影**依赖 `.sh-win` 不是 stacking context**。一旦给 `.sh-win` 加 `z-index`（多窗口焦点需要），`::after` 会沉到"窗口背景之上、内容之下"，投影糊脸。
  - 解法 A：多窗口时每窗包一层 `.sh-stage`（z-index 挂 stage 上），`.sh-win` 保持无 z-index；
  - 解法 B：把硬投影从 `.sh-win::after` 移到 `.sh-stage::after`（stage 级阴影）。
  - 批 2 单窗口下**此冲突不触发**，但写 drag/resize 时**绝不给 `.sh-win` 加 `z-index`**。

### 3.6 现有 `sh_main.js` 窗口逻辑是否需要重构
- **无需重构核心，仅增量扩展**：
  - `makePane` / `show` / `open` / `minimize` / `close` 全部保留（单窗口 pane 切换模型不变）。
  - 新增：`toggleMax()`、`enableDrag()`、`enableResize()`（挂到 `.sh-bar` 与 8 个 handle）。
  - `remember()` 扩展：在写入 `win_state` 的同时写入 `win_geom = {x,y,w,h,max}`（见 3.7）。
  - `show()` 恢复几何：若 `win_geom` 存在，应用 `left/top/width/height`（内联像素会覆盖 `.sh-win` 的 `calc()` 默认与 `≥1440 clamp()`，符合"用户几何优先"预期）。
- **不破坏** `narrow()` 移动端路径（窄屏仍跳阅读页，drag/resize 仅桌面态启用）。

### 3.7 几何持久化（推荐做，低成本）
- 在 `remember()` 的 `patch` 回调里写入 `sh.win_geom = {x,y,w,h,max}`；`show()`/`open()` 时读回并应用内联像素。
- 落在现有 localStorage 预算内（`win_state` 同层），零新增依赖。
- 作用：用户拖好/缩好的窗口，下次回来还在原位——"像真窗口"的关键体验。

---

## 4. 断言 / 红线影响清单（对照 `spec.js`）

现有 R5.2 红线条目（`tests/spec.js` L996–1106）：

| 红线 | 批 2 触碰？ | 处理 |
|---|---|---|
| `border-radius`（R5 全直角） | handle/按钮保持直角 | 不引入圆角 |
| `box-shadow`（R5 不许投影） | **不碰** | 硬投影仍走 `.sh-win::after` 纯色块；handle 只用边框 |
| `backdrop-filter`（R5 不许毛玻璃） | 不碰 | —— |
| `@font-face`（R5 零字体文件） | 不碰 | 三键用文本字形 `□` `×` `—` 或 CSS 画法，不引图标字体 |
| `url()`（必须恒为 0） | 不碰 | 无位图；handle/按钮纯 CSS |
| `grid-template-columns`（竖排单列） | 不碰 | 列表维持单列 |
| `@keyframes`/`animation:`（R5 无动画） | **drag/maximize 必须瞬时**（无 keyframe） | maximize 瞬时切换，不做展开动画 |
| `transform:`（R5 无位移/缩放） | **用 left/top/width/height 像素**，绝不用 translate/scale | drag/resize 全走几何属性 |
| 渐变预算 ≤4（仅氛围三层） | 不碰 | —— |
| 20 色白名单 | handle/按钮只用白名单色 | 新增 `□` 等无需新色 |
| `transition` ≤3（AS-7，当前 2） | 默认 0 新增；如需 maximize 轻微过渡，最多用掉 1 个名额（剩 0） | 建议**不加**，保持瞬时 |

**净影响**：批 2 在 `sh_main.js`（JS）里新增 ~80–120 行，**完全不新增任何 CSS 红线条目**；`sh_main.css` 仅新增 8 个 `.sh-rs` handle 的直角边框样式（白名单色），regress 仍应 0 fail。

---

## 5. 批 2 最小范围建议（工程判断）

**决策（team-lead 授权"你定"）：批 2 = 拖拽 + 8 向 resize + 最大化 + 关闭 + 最小化。**

- **包含**（按用户"像真窗口"诉求，且成本低）：
  1. 拖拽：标题栏 Pointer Events + 边界护栏（clamp 在视口内）。
  2. 8 向 resize：8 个 `.sh-rs` handle + yazelin 缩放数学 + 左/上补偿 + 最小尺寸。
  3. 最大化 `□`：`toggleMax()`，存 `prevRect` 瞬时铺满视口。
  4. 关闭 `×`：复用现有 `close()`。
  5. 最小化 `_`：复用现有 `minimize()` + 列表恢复面（**无需任务栏**，故不推迟）。
  6. 几何持久化 `win_geom`：低成本，强烈建议同批落地。
- **推迟到批 3**：专用任务栏 / Dock / 系统托盘、多窗口并存与 z-index 焦点管理（届时处理 `.sh-win::after` 的 stacking context 冲突）、壁纸位图内容（仍受 `url()` 红线条目约束，需另议解禁路径）。

**为什么把 minimize 放进批 2**（与 team-lead 初步倾向不同，供拍板）：
- 现有单窗口 + 桌面图标列表已天然构成"最小化→列表→再点恢复"闭环，`minimize()` 与 `setRun` 都已就绪，几乎零新增成本；
- 用户要的是"三键都像真窗口"，拆成两批反而让批 2 看起来"还差一个键"；
- 真正的"任务栏"是**多窗口**时代的产物，批 2 仍是单窗口，强行做任务栏属于过度建设。

**风险与待确认**：
1. `.sh-win` 在批 2 **严禁加 `z-index`**（守护 `.sh-win::after` 硬投影）；多窗口焦点留批 3。
2. `≥1440 clamp()` 与用户内联像素几何的优先级：内联 style 胜出（符合预期），需 `show()` 恢复时显式应用 `win_geom`。
3. iframe 会吞掉覆盖其上的指针事件——handle 须为 `.sh-win` 直接子元素且渲染在 `.sh-body` 之后、贴边放置，确保命中测试在 iframe 之上。
4. 若 team-lead 坚持"批 2 只做拖拽+最大化+8向resize、minimize 推批 3"，则仅移除第 5 项，其余不变——但工程上不推荐。

---

## 附：参考算法出处（self-implement，非 import）
- 拖拽/吸附骨架：derrek.dev/blog/2026-01-08-draggable-window-manager-vanilla-javascript
- 8 向缩放数学 + 左/上补偿：yazelin.github.io/frontend/2025/12/10/window-system-part2-resize.html
- 8 向 handle 布局 + 焦点计数：github.com/Yashaswirai/vanilla-desktop-os
- 拖拽 delta 实现：github.com/victornpb/VtWindow (`drag.js`)
- 窗口 API 形状（move/resize/maximize/minimize/focus）：github.com/nextapps-de/winbox（仅作接口参考，不引入）
- CSS `resize` 局限论证：codelucky.com/css-resize-property 等
