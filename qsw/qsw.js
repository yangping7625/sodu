/* qsw/archive.js — 汽水屋静态镜像的极少量页面脚本（2011 地层）
 * 与素读 / 桌面壳的 JS 完全独立（X-5 反 DRY 纪律）。
 * 仅做页面内滚动与分页冗余高亮，不涉及任何交互功能
 * （发帖 / 登录 / 回帖在原站关闭前即已停用）。
 * 不使用 Date、不读取设备时间：镜像里的时间是冻结的（§1.4.1）。
 */
(function () {
  'use strict';

  /* 回到顶部：仅页面内滚动，纯展示用途 */
  window.qswTop = function () {
    if (typeof window.scrollTo === 'function') {
      window.scrollTo(0, 0);
    }
  };

  /* 分页高亮：以 body 的 data-page 为冗余保险（HTML 已写 .cur） */
  function qswMarkActive() {
    var page = document.body.getAttribute('data-page');
    if (!page) return;
    var links = document.querySelectorAll('.pager a');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      if (href.indexOf(page) >= 0) links[i].className = 'cur';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', qswMarkActive);
  } else {
    qswMarkActive();
  }
})();
