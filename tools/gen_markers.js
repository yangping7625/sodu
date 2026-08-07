#!/usr/bin/env node
/* ==========================================================================
   tools/gen_markers.js · 投喂标记哈希生成器（ARG-BUILD-12 · 组2）

   ⚠️ FD-H1（本机制的技术前提）：明文别名【绝不】进入本仓库的源码，
      注释里也不行。玩家 view-source: 一次拿到全部 13 条答案 = 检索层作废。
      故明文别名清单住在 design/（不在任何 git 仓库，已核实）——
      本脚本读那份清单，输出【纯 sha256】的 data/feed_markers.js。

   用法：
     node tools/gen_markers.js <design_aliases_path>   # 指定明文清单
     node tools/gen_markers.js                          # 默认读取预设路径

   明文清单格式（每行一条）：
     mk_silence_option<TAB>别名1<TAB>别名2<TAB>...
     # 开头为注释行，忽略。
   ⚠️ 每条别名先过与 sd_feed.normalize() 完全一致的七步（含第 6 步日期剥离），
      再 sha256 —— 与运行期判定同源，否则永远匹配不上（spec.js AS-2 校验
      输出值全是 64 位十六进制）。

   本轮别名清单留空/占位（真别名等文策渊），本脚本结构已就位：
     跑一遍会生成 data/feed_markers.js（markers 为空对象），
     运行时 classify() 走 U-0/U-1/U-2，T-hit 永不命中 —— 这正是骨架期行为。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DEFAULT_ALIASES = path.join(ROOT, '..', 'design', 'tech', 'arg_build12_aliases.txt');
const OUT = path.join(ROOT, 'data', 'feed_markers.js');

/* 与 js/sd_feed.js 完全同源的七步归一化（含第 6 步日期剥离 —— X-2 红线）。
   实现必须与运行期一致：同源才能命中。日期正则与 sd_feed 同款。 */
const DATE_RE = [
  /\d{4}\s*-\s*\d{1,2}\s*-\s*\d{1,2}/g,
  /\d{4}\s*\/\s*\d{1,2}\s*\/\s*\d{1,2}/g,
  /\d{4}\s*年\s*\d{1,2}\s*月?\s*\d{0,2}\s*日?/g,
  /(?:^|[^\d])(20\d{2})(?=[^\d]|$)/g
];
function stripDates(s) {
  let out = String(s);
  for (let i = 0; i < DATE_RE.length; i++) {
    out = out.replace(DATE_RE[i], (m) => {
      if (DATE_RE[i] === DATE_RE[3] && m.length > 4) return m.charAt(0) + m.slice(-1);
      return '';
    });
  }
  return out;
}
const PUNCT_RE = /[。，、；：？！…—－「」『』""''（）()《》〈〉·.,;:?!"'\-_/\\|]/g;
function normalize(raw) {
  let s = String(raw == null ? '' : raw);
  s = s.trim();
  s = s.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  s = s.toLowerCase();
  s = s.replace(/\s+/g, '');
  s = s.replace(PUNCT_RE, '');
  s = stripDates(s);
  return s;
}

/* 读明文清单 → { key: { aliases: [...], hashes: [64hex...] } } */
function readAliases(file) {
  if (!fs.existsSync(file)) return {};
  const txt = fs.readFileSync(file, 'utf8');
  const out = {};
  txt.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('\t').map((p) => p.trim()).filter(Boolean);
    const key = parts[0];
    const aliases = parts.slice(1);
    if (!key || !aliases.length) return;
    const hashes = aliases
      .map((a) => crypto.createHash('sha256').update(normalize(a), 'utf8').digest('hex'))
      .filter((h) => /^[0-9a-f]{64}$/.test(h));
    if (hashes.length) {
      out[key] = { aliases: aliases.length, hashes: hashes };
    }
  });
  return out;
}

function main() {
  const aliasesPath = process.argv[2] || DEFAULT_ALIASES;
  const markers = readAliases(aliasesPath);

  /* 骨架期：明文清单尚未给真别名 → markers 为空。生成空表结构，
     T-hit 永不命中；运行时只走 U-0/U-1/U-2（设计 §8 组2.3）。 */
  const out =
    '/* ==========================================================================\n' +
    '   data/feed_markers.js · 投喂标记哈希表（ARG-BUILD-12 · 由 tools/gen_markers.js 生成）\n' +
    '   ⚠️ FD-H1：本文件【只存 sha256】，绝不存明文标记 —— 明文别名清单在\n' +
    '      design/（不在任何 git 仓库），运行期 view-source 拿不到任何答案。\n' +
    '      键名为 mk_*，值 = sha256(normalize(alias)) 的 64 位十六进制。\n' +
    '   ⚠️ 请勿手改：改了就与生成脚本 / 运行期判定脱源（spec.js AS-2 校验）。\n' +
    '   ========================================================================== */\n' +
    '(function (g) {\n  \'use strict\';\n' +
    '  g.SD_FEED_MARKERS = {\n    markers: {\n' +
    Object.keys(markers).map((k) =>
      '      ' + JSON.stringify(k) + ': ' + JSON.stringify(markers[k].hashes)
    ).join(',\n') +
    '    }\n  };\n' +
    '})(typeof window !== \'undefined\' ? window : globalThis);\n';

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out, 'utf8');

  const n = Object.keys(markers).length;
  console.log('gen_markers: ' + (aliasesPath !== DEFAULT_ALIASES ? 'input=' + aliasesPath : 'default') +
    ' → ' + OUT + ' (' + n + ' markers' +
    (n ? '' : ' —— 骨架期空表，真别名等文策渊') + ')');
}

main();
