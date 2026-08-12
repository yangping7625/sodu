#!/usr/bin/env bash
# ==========================================================================
# tools/publish.sh · 一键发布（ARG-BUILD-12 · Wave 3 · P-1）
#
# 发布纪律（与 .github/workflows/deploy.yml 同源）：
#   gh-pages 只推【临时干净目录】（排除 tests/ .github/ README.md promo/
#   tools/），加 .nojekyll，独立 git init + 强推 HEAD:gh-pages。
#
# 流程：
#   输入代理端口（默认 7890）
#   ① push main（代理参数）
#   ② 重建干净发布目录 → /c/ghpages_pub<N>（git ls-files 只拷已跟踪文件）
#   ③ 独立 git init + 强推 HEAD:gh-pages
#   ④ curl 验活六路：/ /sd/ /qsw/ /save.html /about/ /data/feed_markers.js
#
# 安全说明：发布目录恒用【唯一新号】（现有最大数值 +1），不清理旧目录；
#   脚本内不做任何 rm（本机 rm 被 safe-delete 包装拦截，且新目录无需清）。
#
# 用法：
#   bash tools/publish.sh                # 全流程（push main + 发布 + 验活）
#   PUB_DRY_RUN=1 bash tools/publish.sh  # 只重建目录 + 验活，不 push（安全演练）
#   E2E=1 bash tools/publish.sh          # 发布后跑 tools/e2e_shell.mjs
#   PUB_WAIT=45 bash tools/publish.sh    # 自定义线上生效等待秒数（默认 15）
# ==========================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

DRY="${PUB_DRY_RUN:-0}"
PROXY_PORT_DEFAULT=7890

# 预取 git 值（此刻 cwd = 仓库根；不用 git -C —— 该参数在含中文的
# Windows 路径上会触发 Git 的编码问题，报 "cannot change to" 假失败）。
REMOTE="$(git remote get-url origin)"
REMOTE_NORM="$(echo "$REMOTE" | sed -E 's#^.*[:/]([^/:]+/[^/:]+)$#\1#')"
OWNER="${REMOTE_NORM%/*}"
REPO="${REMOTE_NORM##*/}"; REPO="${REPO%.git}"
HEAD_LINE="$(git log --oneline -1)"

# ── 代理端口：优先取 $1，否则交互读（默认 7890）─────────────────────
if [ -n "${1:-}" ]; then
  PORT="${1}"
else
  read -r -p "代理端口（默认 ${PROXY_PORT_DEFAULT}）: " PORT_IN
  PORT="${PORT_IN:-${PROXY_PORT_DEFAULT}}"
fi
PROXY="http://127.0.0.1:${PORT}"

echo "══ ① push main（代理 ${PROXY}）"
if [ "$DRY" = "1" ]; then
  echo "  [DRY] 跳过 git push origin main"
else
  git -c http.proxy="${PROXY}" push origin main
fi

# ── ② 重建干净发布目录 ────────────────────────────────────────────────
# 取下一个可用目录号：/c/ghpages_pub<N>（现有纯数字后缀最大值 +1）。
NEXT=0
for d in /c/ghpages_pub*; do
  [ -d "$d" ] || continue
  num="${d##*/ghpages_pub}"
  case "$num" in
    ''|*[!0-9]*) continue ;;   # 只认纯数字后缀（忽略 publish/publish2 等杂名）
  esac
  if [ "$num" -gt "$NEXT" ]; then NEXT="$num"; fi
done
NEXT=$((NEXT + 1))
PUB="/c/ghpages_pub${NEXT}"
echo "══ ② 重建干净发布目录 → ${PUB}"
mkdir -p "$PUB"

# git ls-files：只拷【已跟踪】文件，按发布面排除（与 deploy.yml 同源）。
EXCLUDE=('tests/' '.github/' 'README.md' 'promo/' 'tools/')
git ls-files -z | while IFS= read -r -d '' f; do
  skip=0
  for ex in "${EXCLUDE[@]}"; do
    case "$f" in
      "$ex"|"$ex"*) skip=1; break ;;
    esac
  done
  [ "$skip" = "1" ] && continue
  mkdir -p "$PUB/$(dirname "$f")"
  cp -p "$f" "$PUB/$f"
done
touch "$PUB/.nojekyll"

# 发布必需件点名校验（与 deploy.yml / phase2_ledger 同款防漂移）。
MISSING=0
for f in index.html save.html 404.html robots.txt favicon.svg css data js sd sh_main.css sh_main.js; do
  if [ ! -e "$PUB/$f" ]; then echo "  ✗ MISSING $PUB/$f"; MISSING=1; fi
done
if [ "$MISSING" -ne 0 ]; then
  echo "发布目录必需件缺失，中止。"; exit 1
fi
echo "  发布目录就绪（$(find "$PUB" -type f | wc -l | tr -d ' ') 个文件）："
ls "$PUB" | tr '\n' ' '; echo ""

# ── ③ 独立 git init + 强推 HEAD:gh-pages ─────────────────────────────
echo "══ ③ 强推 gh-pages"
if [ "$DRY" = "1" ]; then
  echo "  [DRY] 跳过 git init/push gh-pages"
else
  (
    cd "$PUB"
    git init -q
    git add -A
    git commit -q -m "ARG-BUILD-12 publish: ${HEAD_LINE}"
    git branch -M gh-pages
    git remote add origin "${REMOTE}" 2>/dev/null || true
    git -c http.proxy="${PROXY}" push -f origin gh-pages
  )
fi

# ── ④ curl 验活六路 ──────────────────────────────────────────────────
# 线上地址从 remote 派生：https://<owner>.github.io/<repo>/；PUB_BASE 可覆盖。
BASE="${PUB_BASE:-https://${OWNER}.github.io/${REPO}/}"
WAIT="${PUB_WAIT:-15}"
PATHS=('/' '/sd/' '/qsw/' '/save.html' '/about/' '/data/feed_markers.js')

echo "══ ④ 验活六路 → ${BASE}"
echo "  等待线上生效（${WAIT}s）…"
if command -v sleep >/dev/null 2>&1; then sleep "$WAIT"; else echo "  （当前环境无 sleep，跳过等待）"; fi
ALL_OK=1
for p in "${PATHS[@]}"; do
  # Windows curl 写 /dev/null 会报 exit 23，但 -w 状态码仍正常输出；
  # || true 防 set -e 中断（状态码才是本步骤要的值）。
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "${BASE}${p#/}" || true)"
  printf '  %-30s %s\n' "${p}" "${code}"
  case "$code" in
    200|301|302|304) ;;
    *) ALL_OK=0 ;;
  esac
done
if [ "$ALL_OK" = "0" ]; then
  echo "  ⚠ 存在非 2xx/3xx 路径，请人工核对线上。"
else
  echo "  ✓ 六路全部 200/3xx。"
fi

# ── ⑤（可选）发布后跑 E2E（tools/e2e_shell.mjs，需 playwright-core）──
if [ "${E2E:-0}" = "1" ]; then
  echo "══ ⑤ E2E（tools/e2e_shell.mjs · playwright-core + 系统 Edge）"
  node tools/e2e_shell.mjs || echo "  ⚠ E2E 未通过（不阻断发布结果，请人工核对）"
fi

echo ""
echo "完成。发布目录：${PUB}  HEAD：${HEAD_LINE}"
