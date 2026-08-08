/* ==========================================================================
   vitest.config.mjs · Vitest 迁移（ARG-BUILD-12 · Wave 3 · P-4）

   迁移原则（用户拍板）：断言逻辑逐条保留，只是跑法换 Vitest。
   既有 4 套 node 测试（tests/spec.js + smoke_*.js）用的是自研断言器 +
   process.exit()，逐条搬进 expect() 等于重写 407 条断言 —— 风险高。
   故采用【最稳妥的轻量方案】：Vitest 只做「跑法」——
   tests/vitest.all.mjs 把既有测试作为子进程串行执行并提供统一汇总。

   ⚠️ include 只放 tests/vitest.all.mjs：
     默认 include 会匹配 tests/spec.js（*.spec.js），而它是 CJS +
     process.exit() 的部署门禁，被 Vitest 直接 import 会当场杀掉 worker。

   Web 端保持零依赖：vitest 只在 devDependencies（package.json）。
   ========================================================================== */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/vitest.all.mjs'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 180000,     // 每套子进程上限 3 分钟（正常 < 10s）
    hookTimeout: 30000,
    passWithNoTests: false
  }
});
