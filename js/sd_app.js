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

    /* 右下角常驻系统时钟 + 点击设时间（ARG-BUILD-05-rev）。
       无头环境无 setInterval 时静默降级，仅静态显示，不阻断。 */
    if (SD.Clock && SD.Clock.mount) SD.Clock.mount();

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

    /* /save 常驻入口：进页先判一次（上个会话被邀请过 → 这次进来门就在） */
    mountSaveEntry();

    /* 收尾：软倒计时（只显示不阻断 —— R8 / R10） */
    SD.onDialogueEnd = function () {
      var st = SD.Timeline.nextAvailableState();
      var host = document.querySelector('[data-sd-soft]');
      if (host && st.text) {
        host.textContent = '下次可访问时间：' + st.text;
      }
      /* 本会话里她刚把存档递出来 → 这一弧走完时把门留在页面上 */
      mountSaveEntry();
    };

    SD.Dialogue.start();
  });

  /* ── /save 常驻入口（ARG-BUILD-08） ────────────────────────────────
     ⚠️ N3 纪律：不做站群导航表 —— 页面之间只靠线索连接，永不靠导航。
     本入口不违反它，因为它【不是常驻导航】：
       · 她递出存档之前（save_offered 系列旗标全空），这里彻底不存在；
       · 递出之后才留下一行，语义是「她给过你这个地址」，属线索的延续，
         只不过这条线索不会随着对话流滚走 —— 这正是本次要补的「常驻到达」。
     R2：只有一个门，不显示任何进度 / 完成度 / 计数 / 成就。
     R5：小字、点线下划线、无图标无按钮，不做成产品导航栏。
     幂等：boot 与 onDialogueEnd 各调一次，重复调用不会写出第二行。 */
  function mountSaveEntry() {
    var host;
    try { host = document.querySelector('[data-sd-ret]'); } catch (e) { return; }
    if (!host) return;

    var S = SD.State;
    var invited = S.hasFlag('save_offered') ||
                  S.hasFlag('opened_save_offered') ||
                  S.hasFlag('sd_g1_save_offered');
    if (!invited) return;
    if (host.querySelector('.sd-ret__a')) return;

    var a = document.createElement('a');
    a.className = 'sd-ret__a';
    /* 相对路径（红线⑨：子路径部署可达）。
       ARG-BUILD-11 / S15：本页迁到 /sd/ 之后要多退一级，走统一解析出口。 */
    var href = 'save.html';
    try { if (SD.Router && SD.Router.rel) href = SD.Router.rel(href); } catch (e) {}
    a.setAttribute('href', href);
    a.textContent = '存档 001';
    host.appendChild(a);
  }

})(typeof window !== 'undefined' ? window : globalThis);
