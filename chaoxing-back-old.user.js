// ==UserScript==
// @name         学习通 自动回到旧版
// @name:en      Chaoxing Auto Switch to Old UI
// @namespace    https://github.com/<your-name>/chaoxing-back-old
// @version      1.3.0
// @description  打开学习通新版（fanyav3）页面时自动跳回旧版：已知课程页直接改 URL；直跳失败会自动退回并改为点击「回到旧版」按钮；仍失败则给出浮动按钮兜底。
// @description:en Auto-redirect Chaoxing's new (fanyav3) pages back to the classic UI, with click and manual fallbacks.
// @author       <your-name>
// @license      MIT
// @homepageURL  https://github.com/<your-name>/chaoxing-back-old
// @supportURL   https://github.com/<your-name>/chaoxing-back-old/issues
// @match        *://*.chaoxing.com/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
  'use strict';

  /* ================= 开关 ================= */
  const DISABLE_KEY = 'cx_backold_disabled';

  function getDisabled() {
    try {
      if (typeof GM_getValue === 'function') return GM_getValue(DISABLE_KEY, false) === true;
      return localStorage.getItem(DISABLE_KEY) === '1';
    } catch (e) { return false; }
  }
  function setDisabled(v) {
    try {
      if (typeof GM_setValue === 'function') GM_setValue(DISABLE_KEY, v);
      else localStorage.setItem(DISABLE_KEY, v ? '1' : '0');
    } catch (e) { /* ignore */ }
  }

  if (getDisabled()) return;

  const LOG = '[回到旧版]';

  /* ================= 菜单（放在开关判断之前，关闭后也能重新开启） ================= */
  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('关闭「自动回到旧版」', function () {
      setDisabled(true);
      alert('已关闭，刷新页面生效。');
    });
    GM_registerMenuCommand('开启「自动回到旧版」', function () {
      setDisabled(false);
      alert('已开启，刷新页面生效。');
    });
    GM_registerMenuCommand('现在手动跳旧版', function () {
      const u = buildOldFromCurrent();
      if (u) { location.replace(u); return; }
      if (!clickBackOldOnce()) showManualButton('当前页面没找到「回到旧版」入口');
    });
    GM_registerMenuCommand('清除跳转状态', function () {
      clearState();
      alert('已清除，下次打开页面重新从直跳开始。');
    });
  }
  const isTop = (function () {
    try { return window.top === window.self; } catch (e) { return false; }
  })();

  /* ================= 跨跳转状态（sessionStorage，同标签页有效） =================
     { src: 新版页地址, ts: 时间戳, mode: 'direct' | 'click', tries: 直跳尝试次数 }   */
  const STATE_KEY = 'cx_backold_state';
  const LOOP_KEY = 'cx_backold_guard';

  function readState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeState(s) {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  function clearState() {
    try { sessionStorage.removeItem(STATE_KEY); } catch (e) { /* ignore */ }
  }

  /* ============ 循环保护：直接跳转 15 秒内最多 5 次 ============ */
  function guardOk() {
    try {
      const now = Date.now();
      let s;
      try { s = JSON.parse(sessionStorage.getItem(LOOP_KEY) || '{}'); } catch (e) { s = {}; }
      if (!s.t || now - s.t > 15000) s = { t: now, n: 0 };
      s.n = (s.n || 0) + 1;
      sessionStorage.setItem(LOOP_KEY, JSON.stringify(s));
      return s.n <= 5;
    } catch (e) { return true; }
  }

  /* ================= 新版页面 -> 旧版 URL =================
     映射来自官方 backOld 实现（反编译所得）：

       backOld: function () {
         var t = new URLSearchParams(window.location.search);
         t.delete("pageHeader"); t.delete("v");
         var e = "/mooc2-ans/mycourse/stu?" + t + "&courseid=" + courseId
               + "&clazzid=" + clazzId + "&v=2&pageHeader=-1&hideHead=0&forceMooc2=true";
         window.top.location = e;
       }

     所以规律就是：保留全部原参数（包括 t / enc / ut），只改路径、去 pageHeader/v、
     补 courseid/clazzid/v=2/pageHeader/hideHead/forceMooc2。

     路由表：
       新版 /mooc2-ans-vue/fanyav3/stu            学生 -> /mooc2-ans/mycourse/stu
       新版 /mooc2-ans-vue/fanyav3/studentCourse   学生 -> /mooc2-ans/mycourse/stu
       新版 /mooc2-ans-vue/fanyav3/tch            教师 -> /mooc2-ans/mycourse/tchcourse
       其余 fanyav3 路由（application/index/teachCalendar）无已知映射 -> 走点击兜底

     注：`t` 是必需项，缺了服务端返回「无效的参数」；不要则不做直跳。  */
  const ROUTE_MAP = [
    { re: /^\/mooc2-ans-vue\/fanyav3\/(?:stu|studentCourse)\/?$/i, old: '/mooc2-ans/mycourse/stu' },
    { re: /^\/mooc2-ans-vue\/fanyav3\/tch\/?$/i, old: '/mooc2-ans/mycourse/tchcourse' },
  ];

  function buildOldUrl(href) {
    try {
      const u = new URL(href);
      if (u.hostname !== 'mooc2-ans.chaoxing.com') return null;

      let oldPath = null;
      for (let i = 0; i < ROUTE_MAP.length; i++) {
        if (ROUTE_MAP[i].re.test(u.pathname)) { oldPath = ROUTE_MAP[i].old; break; }
      }
      if (!oldPath) return null;

      const q = u.searchParams;
      const courseId = q.get('courseId') || q.get('courseid');
      const clazzId = q.get('clazzId') || q.get('clazzid');
      const t = q.get('t');
      if (!courseId || !clazzId || !t) return null;   // 缺 t 跳过去也是「无效的参数」

      const parts = [
        'courseId=' + encodeURIComponent(courseId),
        'clazzId=' + encodeURIComponent(clazzId),
      ];
      const cpi = q.get('cpi');
      const enc = q.get('enc');
      const ut = q.get('ut');
      if (cpi) parts.push('cpi=' + encodeURIComponent(cpi));
      if (enc) parts.push('enc=' + encodeURIComponent(enc));
      parts.push('t=' + encodeURIComponent(t));
      if (ut) parts.push('ut=' + encodeURIComponent(ut));
      parts.push('courseid=' + encodeURIComponent(courseId));
      parts.push('clazzid=' + encodeURIComponent(clazzId));
      parts.push('v=2', 'pageHeader=0', 'hideHead=0', 'forceMooc2=true');
      return 'https://mooc2-ans.chaoxing.com' + oldPath + '?' + parts.join('&');
    } catch (e) { return null; }
  }

  function buildOldFromCurrent() {
    try { return buildOldUrl(location.href); } catch (e) { return null; }
  }

  function onOldPage() {
    try {
      return /^\/mooc2-ans\/mycourse\//.test(location.pathname)
        || /^\/mooc-ans\//.test(location.pathname);
    } catch (e) { return false; }
  }

  /* ================= 备用方案 A：自动点击「回到旧版」 ================= */
  // 只用新版页确认过的精确类名 + 短文本兜底；
  // 注意：旧版页里也有 class 含 backOld 的元素，泛匹配会导致来回跳转。
  const CANDIDATE_SELECTORS = ['.back-old'];
  const TEXT_RE = /^(回到旧版|返回旧版|回到旧版页面)$/;

  const MAX_ATTEMPTS = 8;
  let attempts = 0;
  let done = false;

  // 一旦页面开始卸载/跳转，说明点成功了
  function armSuccessWatch() {
    try {
      window.addEventListener('beforeunload', function () { done = true; }, { once: true });
      window.addEventListener('pagehide', function () { done = true; }, { once: true });
    } catch (e) { /* ignore */ }
  }

  function findBackOld(root) {
    if (!root || !root.querySelector) return null;
    for (let i = 0; i < CANDIDATE_SELECTORS.length; i++) {
      try {
        const el = root.querySelector(CANDIDATE_SELECTORS[i]);
        if (el) return el;
      } catch (e) { /* ignore */ }
    }
    // 文本兜底：只认短文本，避免误点整块容器
    const nodes = root.querySelectorAll('a,button,span,div');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const t = (el.textContent || '').trim();
      if (t && t.length <= 8 && TEXT_RE.test(t) && el.children.length <= 1) return el;
    }
    return null;
  }

  function visible(el) {
    try {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
    } catch (e) { return false; }
  }

  function realClick(el) {
    try {
      const o = { bubbles: true, cancelable: true, view: window };
      el.dispatchEvent(new MouseEvent('mousedown', o));
      el.dispatchEvent(new MouseEvent('mouseup', o));
      el.dispatchEvent(new MouseEvent('click', o));
      return true;
    } catch (e) {
      try { el.click(); return true; } catch (e2) { return false; }
    }
  }

  // 返回 true 表示已经不需要再尝试
  function clickBackOldOnce() {
    if (done) return true;
    if (attempts >= MAX_ATTEMPTS) { done = true; return true; }
    const el = findBackOld(document);
    if (!el || !visible(el)) return false;
    // 关键：等本帧自身加载完成再点，否则 Vue 的点击事件还没绑定，点了白点
    if (document.readyState !== 'complete') return false;
    attempts++;
    console.log(LOG, '第 ' + attempts + ' 次点击', el.className || el.tagName);
    armSuccessWatch();
    realClick(el);
    return attempts >= MAX_ATTEMPTS;
  }

  /* ================= 备用方案 B：浮动按钮（最后手段） ================= */
  function showManualButton(reason) {
    if (!isTop || done) return;
    if (document.getElementById('cx-backold-manual')) return;
    try {
      const btn = document.createElement('div');
      btn.id = 'cx-backold-manual';
      btn.textContent = '回到旧版';
      btn.title = reason || '自动跳转未成功，点击手动切换';
      btn.style.cssText = [
        'position:fixed', 'right:18px', 'bottom:18px', 'z-index:2147483647',
        'padding:10px 16px', 'border-radius:8px', 'cursor:pointer',
        'background:#ff6b35', 'color:#fff', 'font-size:14px', 'font-weight:600',
        'box-shadow:0 4px 14px rgba(0,0,0,.28)', 'user-select:none',
        'font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
      ].join(';');
      btn.addEventListener('click', function () {
        console.log(LOG, '手动兜底按钮被点击');
        // 依次尝试：点击按钮 -> 改 URL -> 都不行就提示
        if (clickBackOldOnce()) { btn.textContent = '正在跳转…'; return; }
        const oldUrl = buildOldFromCurrent();
        if (oldUrl) { location.replace(oldUrl); return; }
        btn.textContent = '未找到入口，请手动点右上角';
        setTimeout(function () { btn.textContent = '回到旧版'; }, 3000);
      });
      (document.body || document.documentElement).appendChild(btn);
      console.log(LOG, '已显示手动兜底按钮：', reason || '');
    } catch (e) { /* ignore */ }
  }

  /* ================= 点击兜底主循环 ================= */
  function watchAndClick(timeoutMs, onFail) {
    const deadline = Date.now() + (timeoutMs || 30000);
    let stopped = false;
    let obs = null;
    let timer = null;

    function stop() {
      stopped = true;
      try { if (obs) obs.disconnect(); } catch (e) { /* ignore */ }
      if (timer) clearInterval(timer);
    }
    function tryOnce() {
      if (stopped) return true;
      if (clickBackOldOnce()) { stop(); return true; }
      return false;
    }

    try {
      obs = new MutationObserver(tryOnce);
      obs.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }

    // 间隔稍长：给 Vue 绑定事件、iframe 完成跳转留出时间
    timer = setInterval(function () {
      if (tryOnce() || Date.now() > deadline) {
        const failed = !done;
        stop();
        if (failed && typeof onFail === 'function') onFail();
      }
    }, 1000);
  }

  /* ================= 备用方案 A 的入口：改点击模式 ================= */
  function startClickMode() {
    function start() {
      watchAndClick(30000, function () {
        if (!done && !onOldPage()) {
          showManualButton('自动点击「回到旧版」未成功，已给出浮动按钮');
        }
      });
    }
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }

  /* ================= 落地校验：直跳是否真的成功 =================
     服务端在参数不合法时会返回旧版路径 + 正文「无效的参数」，
     这种情况要退回新版页、改用点击兜底。                              */
  const INVALID_RE = /无效的参数|无效参数|参数错误|非法参数|无权操作|没有权限/;

  function verifyLanding() {
    const st = readState();
    if (!st || st.mode !== 'direct') return;
    if (Date.now() - (st.ts || 0) > 30000) { clearState(); return; }

    let polling = true;
    const deadline = Date.now() + 8000;

    function check() {
      if (!polling) return;
      let text = '';
      try { text = (document.body ? document.body.innerText : '') || ''; } catch (e) { text = ''; }
      text = text.trim();

      if (!text) {
        if (Date.now() > deadline) { polling = false; return; }   // 内容一直为空，放过
        setTimeout(check, 500);
        return;
      }

      if (!INVALID_RE.test(text)) {        // 落地正常
        polling = false;
        clearState();
        return;
      }

      polling = false;
      const tries = (st.tries || 1);
      console.log(LOG, '直跳落地页无效（第 ' + tries + ' 次），切换到点击兜底');
      if (tries >= 3) {
        clearState();
        showManualButton('直跳连续失败，请手动点右上角「回到旧版」');
        return;
      }
      writeState({ src: st.src, ts: Date.now(), mode: 'click', tries: tries + 1 });
      if (st.src) location.replace(st.src);   // 回到新版页，下次进来走点击
    }

    if (document.readyState === 'complete') check();
    else window.addEventListener('load', check, { once: true });
  }

  /* ================= 入口 ================= */
  (function main() {
    // 0) 已经在旧版页：只做「直跳是否真的成功」的校验
    if (onOldPage()) { verifyLanding(); return; }

    const st = readState();

    // 1) 上一轮直跳失败过 -> 本次直接走点击兜底（备用方案 A）
    if (st && st.mode === 'click' && st.src === location.href) {
      console.log(LOG, '改用点击兜底（此前直跳失败 ' + (st.tries || 1) + ' 次）');
      startClickMode();
      return;
    }

    // 2) 已知新版课程页：直接改 URL（最快，不渲染新版）
    if (isTop) {
      const oldUrl = buildOldFromCurrent();
      if (oldUrl) {
        if (!guardOk()) {
          console.log(LOG, '循环保护触发，本次不直跳，改用点击');
          startClickMode();
          return;
        }
        console.log(LOG, '直接跳转 ->', oldUrl);
        writeState({ src: location.href, ts: Date.now(), mode: 'direct', tries: (st && st.tries ? st.tries : 1) });
        location.replace(oldUrl);
        return;
      }
    }

    // 3) 其余情况：等页面渲染出「回到旧版」再点（含 iframe 内）
    startClickMode();
  })();

})();
