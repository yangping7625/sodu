/* ARG-BUILD-12 · Wave 3 · P-3：桌面壳 → 素读 iframe 端到端复核
   从 _wip/e2e_shell.mjs 迁入 tools/（发布脚本 E2E=1 可选调用）。

   覆盖单测 dom_shim 覆盖不到的：FR-A 首启 / FR-B iframe 内 1.2s /
   父子通信 / iframe 隔离 / framing_seen 二次访问不重现。

   依赖（Web 端零依赖，此为开发工具）：
     · playwright-core —— 安装于【隔离 workspace】，勿装进仓库根：
         mkdir -p /c/ghpages_e2e_ws && cd /c/ghpages_e2e_ws && npm init -y && npm install playwright-core
       （本脚本不 import 安装目录，只要求系统能 resolve 到 playwright-core。
         最简路径：在仓库根临时 `npm install --no-save playwright-core` 后删除，
         或用 NODE_PATH 指向隔离 workspace 的 node_modules。）
     · 系统 Edge（channel: 'msedge'，Windows 自带 / 或已安装 Microsoft Edge）。
     · 截图默认写到系统临时目录（sodu-e2e/），可用 E2E_SHOT_DIR 覆盖；
       【绝不写入仓库】—— 不留未跟踪临时文件（发布纪律）。

   用法：
     node tools/e2e_shell.mjs
     E2E_SHOT_DIR=C:/some/dir node tools/e2e_shell.mjs   # 自定义截图目录
 */
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile, mkdir } from 'fs/promises';
import { extname, join, normalize, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = normalize(join(__dirname, '..'));
const PORT = 8123;
const BASE = `http://127.0.0.1:${PORT}`;
const SHOT_DIR = process.env.E2E_SHOT_DIR
  || join(tmpdir(), 'sodu-e2e');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, BASE).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const full = normalize(join(ROOT, p));
    if (!full.startsWith(normalize(ROOT))) { res.writeHead(403); res.end('403'); return; }
    const data = await readFile(full);
    res.writeHead(200, { 'Content-Type': MIME[extname(full)] || 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    res.writeHead(404); res.end('404');
  }
});

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

server.listen(PORT, async () => {
  console.log(`server @ ${BASE}`);
  console.log(`截图目录: ${SHOT_DIR}（在仓库外）`);
  let browser;
  try {
    await mkdir(SHOT_DIR, { recursive: true });
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
    page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 160)));

    console.log('\n── ① 首次访问：FR-A 首启三行 ──');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await wait(600);
    const body1 = await page.textContent('body');
    ok('FR-A 三行渲染（含句号逐字）',
      body1.includes('这台机器不是你的。') && body1.includes('它被打开过很多次。') && body1.includes('最后一次，没有关。'));

    console.log('\n── ② 任意键硬切 → 桌面 + iframe ──');
    await page.keyboard.press('Enter');
    await wait(900);
    ok('桌面壳条目列表出现', await page.isVisible('.sh-list'));
    const iframeCount = await page.locator('iframe[src*="sd/"]').count();
    ok('素读窗口 iframe 打开（宽屏形态）', iframeCount === 1, 'count=' + iframeCount);

    console.log('\n── ③ FR-B 窗口一行（父层 chrome）+ iframe 素读 ──');
    await wait(350);
    const winline = page.locator('[data-sh-winline]');
    const frbVisible = (await winline.count()) > 0 && (await winline.isVisible());
    await wait(1500);
    const frbGone = (await page.locator('[data-sh-winline]').count()) === 0;
    /* ARG-DIALOGUE-REV · MVP-3（§6.4 拍板 A）：开窗行措辞已改 */
    ok('FR-B「之前的记录还在。」出现（1.2s 窗口）', frbVisible);
    ok('FR-B 1.2s 后硬切消失', frbGone);
    await wait(400);
    const sdFrame = page.frames().find(f => f.url().includes('/sd/'));
    const sdContent = sdFrame ? await sdFrame.evaluate(() => document.body.textContent || '') : '';
    ok('素读对话流渲染（SO-001 设备态开场或正文）',
      sdContent.includes('这台机器被人用过。') || sdContent.length > 30, 'len=' + sdContent.length);

    console.log('\n── ④ 截图留证（仓库外）──');
    const shot1 = join(SHOT_DIR, `e2e_shell_first_${Date.now()}.png`);
    const shot2 = join(SHOT_DIR, `e2e_shell_second_${Date.now()}.png`);
    await page.screenshot({ path: shot1 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await wait(900);
    await page.screenshot({ path: shot2 });
    ok('截图已存（' + basename(shot1) + ' / ' + basename(shot2) + '）', true);

    console.log('\n── ⑤ 二次访问：FR-A 不重现（framing_seen）──');
    const body2 = await page.textContent('body');
    ok('FR-A 不再出现', !body2.includes('这台机器不是你的。'));
    ok('二次访问直接桌面 + iframe 自动开', (await page.locator('iframe[src*="sd/"]').count()) === 1);

    console.log('\n── ⑥ console 错误收集 ──');
    ok('零 console/page 错误', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));

    await ctx.close();
  } catch (e) {
    fail++;
    console.log('  ✗ 脚本异常:', e.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
    console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
    process.exit(fail ? 1 : 0);
  }
});
