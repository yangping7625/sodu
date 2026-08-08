/* ==========================================================================
   sd_router.js · 页面路由（J-6）

   ⚠️ N2 纪律：这是真浏览器里的真网站，不是 SPA。
      页面切换就是"白一下，然后新页面出现"。这个廉价感是实感的一部分，不要修它。
      故本模块【不做无刷新路由】—— 它只负责：
        · 识别当前页 → 归一化 page id
        · 套用 data-site 主题（切结构，不只切颜色）
        · 启动页面级行为采集
        · 写页脚（A2 虚构声明，全站通用）

   ⚠️ N3 纪律：不做站群页脚导航表。页面之间只靠线索连接，永不靠导航。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  var PAGES = {
    'index.html': { id: '/',        site: 'assistant' },
    '':           { id: '/',        site: 'assistant' },
    'save.html':  { id: '/save',    site: 'save' },
    '404.html':   { id: '/404',     site: 'assistant' }
  };

  function fileName() {
    try {
      var p = location.pathname;
      var f = p.substring(p.lastIndexOf('/') + 1);
      return f;
    } catch (e) { return ''; }
  }

  /* 归一化：GitHub Pages 的无扩展名 URL（/save）与 /save.html 都要命中 */
  function resolve() {
    var f = fileName();
    if (PAGES[f]) return PAGES[f];
    if (/^save\/?$/.test(f)) return PAGES['save.html'];
    if (/^404\/?$/.test(f)) return PAGES['404.html'];
    return { id: '/' + f, site: 'assistant' };
  }

  /* ── ARG-BUILD-11 / S15：站内裸文件名的路径解析 ──────────────────────
     本页从 `/` 迁到了 `/sd/`，但内容层（data/sd_slice.js）里写的仍是
     `save.html` 这种【相对站点根】的裸名 —— 那是 83 个节点的世界数据，
     不为一次目录调整去动它。于是把解析收敛到这一个出口：
     渲染链接时过一遍 rel()，在 /sd/ 下补上 `../`，其余页面原样返回。

     规则刻意做窄，只认【纯裸文件名】：
       save.html          → ../save.html   （在 /sd/ 下）
       ./x  /x  #x  ?x  a/b  https://…     → 一律不动
     宁可漏一个也不要错改一个 —— 这里错了就是死链。 */
  function upPrefix() {
    try { return /\/sd\/[^/]*$/.test(location.pathname || '') ? '../' : ''; }
    catch (e) { return ''; }
  }

  function rel(href) {
    if (typeof href !== 'string' || !href) return href;
    if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(href)) return href;   // 协议
    var c = href.charAt(0);
    if (c === '#' || c === '/' || c === '?' || c === '.') return href;
    if (href.indexOf('/') >= 0) return href;                    // 已经带路径
    return upPrefix() + href;
  }

  function boot(opts) {
    opts = opts || {};
    var page = opts.page || resolve();

    /* 主题：写到 <body data-site>，由 CSS 变量驱动整套结构 */
    try { document.body.setAttribute('data-site', page.site); } catch (e) {}

    SD.State.load();
    SD.Timeline.boot();
    SD.Behavior.initPage(page.id);

    renderFooter();
    return page;
  }

  /* A2：页脚 8px 灰字虚构声明 —— 可发现，但不破坏沉浸。不做首屏弹窗。 */
  function renderFooter() {
    var host = document.querySelector('[data-sd-footer]');
    if (!host) return;
    var txt = (g.SD_DATA && g.SD_DATA.footer_notice) || '';
    var p = document.createElement('p');
    p.className = 'sd-notice';
    p.textContent = txt;
    host.appendChild(p);
  }

  SD.Router = { boot: boot, resolve: resolve, rel: rel, PAGES: PAGES };

})(typeof window !== 'undefined' ? window : globalThis);
