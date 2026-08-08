/* ==========================================================================
   tests/vitest.all.mjs · Vitest 迁移 wrapper（ARG-BUILD-12 · Wave 3 · P-4）

   为什么是「wrapper 子进程串行」而不是「把 407 条断言搬进 expect()」：
     · 既有 4 套测试（spec.js / smoke_main / smoke_save / smoke_shell）用
       自研断言器（fails/notes 数组 + 逐条文案），且以 process.exit(1/0)
       收尾 —— 在 Vitest worker 内进程内跑会当场杀掉 worker；
     · 重写 407 条 = 重写断言本身，违背「断言逻辑逐条保留」的迁移原则；
     · 子进程串行跑 = 与 CI / 本地 node 直跑完全同构，零语义漂移，
       同时获得 Vitest 的统一汇总输出（每套 ✓/✗ + 退出码）。

   跑法：npx vitest run            （走本 wrapper，依赖 devDependencies）
   保留跑法：npm run test:node      （node 直跑四套，零依赖，等价 regress.sh）
   全量回归：bash tools/regress.sh

   断言总数由子进程自身输出（spec notes + 3 smoke ✓），本 wrapper 只汇总
   四套的通过/失败 —— 这正是「跑法换 Vitest、断言逐条保留」的落点。
   ========================================================================== */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/* 四套既有测试：相对仓库根的路径 + 说明。顺序与 regress.sh / CI 一致。 */
const SUITES = [
  ['tests/spec.js', 'J-9 红线扫描（部署门禁）'],
  ['tests/smoke_main.js', '烟雾① 主对话流渲染'],
  ['tests/smoke_save.js', '烟雾② 存档页直访降级'],
  ['tests/smoke_shell.js', '烟雾③ 本机（桌面壳）']
];

function runSuite(rel) {
  return spawnSync(process.execPath, [join(ROOT, rel)], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 150000
  });
}

describe('素读 · 全量回归（node 子进程串行 · 断言逐条保留）', () => {
  for (const [rel, label] of SUITES) {
    it(`[${rel}] ${label}`, () => {
      const r = runSuite(rel);
      /* 子进程原样输出（保真：既有文案 / ✓✗ / 计数全部透传） */
      if (r.stdout) process.stdout.write(r.stdout);
      if (r.stderr) process.stderr.write(r.stderr);
      if (r.error) {
        expect(r.error).toBeUndefined();   // 超时 / spawn 失败
        return;
      }
      expect(r.status, `${rel} 退出码应为 0`).toBe(0);
    });
  }
});
