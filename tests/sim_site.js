/* ==========================================================================
   tests/sim_site.js · GitHub Pages 子路径部署模拟器

   复刻 .github/workflows/deploy.yml 的 "Assemble clean publish dir" 步骤，
   把产物摆进一个【模拟域名根】下的【仓库子目录】：

       <tmp>/site/                     ← https://<user>.github.io/
       <tmp>/site/<repo>/index.html    ← https://<user>.github.io/<repo>/

   这样任何根绝对路径（/css/x.css）都会指向 <tmp>/site/css/x.css —— 不存在，
   如实 404；而相对路径（css/x.css）指向 <tmp>/site/<repo>/css/x.css —— 命中。
   即：本模拟器让"子路径部署会不会裸奔"变成一个可执行断言，而非人工目测。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');

/* 与 deploy.yml 保持一致的产物清单 */
const FILES = ['index.html', 'save.html', '404.html', 'robots.txt', 'favicon.svg'];
const DIRS = ['css', 'data', 'js'];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dst, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * 组装模拟站点。
 * @param {string} repo 仓库名（子路径段）。传 '' 表示用户站（根部署）。
 * @returns {{siteRoot:string, repo:string, page:(f:string)=>string, cleanup:()=>void}}
 */
function build(repo = 'sudu-reader') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-pages-sim-'));
  const siteRoot = path.join(base, 'site');
  const pub = repo ? path.join(siteRoot, repo) : siteRoot;
  fs.mkdirSync(pub, { recursive: true });

  for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(pub, f));
  for (const d of DIRS) copyDir(path.join(ROOT, d), path.join(pub, d));
  fs.writeFileSync(path.join(pub, '.nojekyll'), '');

  return {
    siteRoot,
    repo,
    publishDir: pub,
    /* 页面相对【域名根】的路径 —— 正是浏览器地址栏里 origin 之后的部分 */
    page: (f) => (repo ? repo + '/' + f : f),
    cleanup() { try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) {} }
  };
}

module.exports = { build, FILES, DIRS };
