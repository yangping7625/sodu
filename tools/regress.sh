#!/usr/bin/env bash
# ==========================================================================
# tools/regress.sh · 一键全量回归（ARG-BUILD-12 · Wave 3 · P-2）
#
# 串行跑四套测试（零依赖：node 直跑，无需 npm install）：
#   tests/spec.js        J-9 红线扫描（部署门禁）
#   tests/smoke_main.js  烟雾① 主对话流渲染
#   tests/smoke_save.js  烟雾② 存档页直访降级
#   tests/smoke_shell.js 烟雾③ 本机（桌面壳 / 窗口 / 桥接 / 逃生舱）
# 任一失败立即退出非零（set -e）。
#
# 用法：bash tools/regress.sh
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n── %s ──\n' "$1"; }

step "J-9 红线扫描 tests/spec.js"
node tests/spec.js

step "烟雾① 主对话流 tests/smoke_main.js"
node tests/smoke_main.js

step "烟雾② 存档页 tests/smoke_save.js"
node tests/smoke_save.js

step "烟雾③ 本机 tests/smoke_shell.js"
node tests/smoke_shell.js

echo ""
echo "✓ 全量回归通过（spec + 3 smoke，共 4 套）。"
