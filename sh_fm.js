/* ==========================================================================
   sh_fm.js · 只读列表视图（ARG-BUILD-11）

   本机上有两个"打开之后是一张清单"的地方：
     · 文件   —— 六条固定条目，只读，不排序、不搜索、不切换视图
     · 归档   —— 一份离线镜像清单（v1 只有一条），点进去才载入镜像本体

   它们共用同一套"列表纸"渲染，故同住一个模块。两者都【不产出独立 HTML 页面】
   （`/fm` 是虚路径），因此不占地层、不进死链巡检、不需要子路径解析。

   三条硬纪律：
     · X-11 不做站点地图：只列剧情里被引用过的条目，永不列深层页。
       文件视图最大的自毁风险就是"顺手把站点结构列出来"。
     · 打不开必须是【纯前端行为】：点击 → 列表下方一行灰字。
       绝不依赖 HTTP 403 / 404 —— 现部署环境不支持自定义 403，同一个坑不踩第二次。
     · A4：不假装读取玩家真实文件系统，不请求任何权限，不显示条目总数（R2）。
   ========================================================================== */
(function (g) {
  'use strict';
  var SH = (g.SH = g.SH || {});
  var doc = g.document;

  /* ── 列表纸基元 ───────────────────────────────────────────────────── */

  function view(host) {
    var v = doc.createElement('div');
    v.className = 'sh-view';
    v.setAttribute('data-sh-view', '');
    host.appendChild(v);
    return v;
  }

  /* 可点条目 */
  function row(v, text, onClick) {
    var b = doc.createElement('button');
    b.setAttribute('type', 'button');
    b.className = 'sh-row';
    b.setAttribute('data-sh-row', text);
    b.textContent = text;
    b.addEventListener('click', onClick);
    v.appendChild(b);
    return b;
  }

  /* 不可点条目（列表里就是有这种行） */
  function dead(v, text) {
    var d = doc.createElement('div');
    d.className = 'sh-row sh-row--dead';
    d.setAttribute('data-sh-row', text);
    if (text) d.textContent = text;
    v.appendChild(d);
    return d;
  }

  /* 列表下方唯一的一行反馈；再点一次只替换文字，不堆积 */
  function say(v, text) {
    var m = v.querySelector('[data-sh-msg]');
    if (!m) {
      m = doc.createElement('div');
      m.className = 'sh-msg';
      m.setAttribute('data-sh-msg', '');
      v.appendChild(m);
    }
    m.textContent = text;
    return m;
  }

  /* ── 文件 ─────────────────────────────────────────────────────────
     固定六条，顺序写死。第 5 条没有名字 —— 它不是渲染 bug，
     它就是列表里的一行（SH-B2）。v1 不给它内容。 */
  function mountFile(host, api) {
    var v = view(host);

    row(v, '归档/', function () { api.open('qsw'); });

    /* 存档：具名之前，这一条【不显示】（§5.5） */
    if (api.revealed('save')) {
      row(v, '存档/', function () { api.open('save'); });
    }

    row(v, '关于本机.txt', function () {
      api.seen('about');
      api.sub('about/index.html', '关于本机.txt');
    });

    row(v, '记录/', function () {
      api.seen('log');
      say(v, '无法打开。');
    });

    dead(v, '');

    row(v, '.trash', function () {
      api.seen('trash');
      say(v, '空的。');
    });

    api.seen('fm');
    return v;
  }

  /* ── 归档 ─────────────────────────────────────────────────────────
     这一层清单不是多余的：它一次性解释掉"这台机器上为什么有个旧论坛"
     —— 是有人把它存下来的。镜像本体在下一层，点进去才载入。

     ⚠️ X-2：这一层属于 2026 设备侧，【不许出现任何绝对年份】。
     "这份镜像是哪年抓的"由镜像自己顶部的声明条去说 —— 那是它的地层，
     它有资格说年份；设备只负责把它列出来。 */
  function mountArchive(host, api) {
    var v = view(host);
    row(v, '汽水屋（离线镜像）', function () {
      api.sub('qsw/index.html', '汽水屋（离线镜像）');
    });
    return v;
  }

  SH.Views = { file: mountFile, archive: mountArchive, say: say };

})(typeof window !== 'undefined' ? window : globalThis);
