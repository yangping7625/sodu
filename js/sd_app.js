/* ==========================================================================
   sd_app.js · 主对话页装配

   R2：前台零进度 UI。本文件不渲染任何进度 / 完成度 / 成就 / 计数。
       行为采集全程静默，唯一出口是她的台词。
   ========================================================================== */
(function (g) {
  'use strict';
  var SD = (g.SD = g.SD || {});

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  }

  ready(function () {
    SD.Router.boot();

    var stream = document.getElementById('sd-stream');
    var dock   = document.getElementById('sd-dock');
    if (!stream || !dock) return;

    SD.Render.mount(stream, dock);

    var n = SD.Dialogue.init();

    /* 节点图自检：问题只进控制台，永不打扰玩家 */
    var problems = SD.Dialogue.audit();
    if (problems.length) {
      try { console.warn('[sd_dialogue] 节点图自检发现问题：\n· ' + problems.join('\n· ')); } catch (e) {}
    }
    try {
      console.info('[sd] 节点 ' + n + ' 个 · 持久化 ' +
        (SD.State.persistent() ? '可用' : '不可用（已转内存态）'));
    } catch (e) {}

    /* 收尾：软倒计时（只显示不阻断 —— R8 / R10） */
    SD.onDialogueEnd = function () {
      var st = SD.Timeline.nextAvailableState();
      var host = document.querySelector('[data-sd-soft]');
      if (host && st.text) {
        host.textContent = '下次可访问时间：' + st.text;
      }
    };

    SD.Dialogue.start();
  });

})(typeof window !== 'undefined' ? window : globalThis);
