// ==UserScript==
// @name         学习通 自动回到旧版
// @name:en      Chaoxing Auto Switch to Old UI
// @namespace    https://github.com/<your-name>/chaoxing-back-old
// @version      1.1.2
// @description  打开学习通新版（fanyav3）页面时自动跳回旧版：已知课程页直接改 URL，不渲染新版；其余新版页自动点「回到旧版」。
// @description:en Auto-redirect Chaoxing's new (fanyav3) pages back to the classic UI.
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
      if (!clickBackOldOnce()) alert('当前页面没找到「回到旧版」入口。');
    });
  }

  const isTop = (function () {
    try { return window.top === window.self; } catch (e) { return false; }
  })();

  /* ============ 循环保护：只保护「直接跳转」，15 秒内最多 5 次 ============ */
  const LOOP_KEY = 'cx_backold_guard';

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

  /* ================= 新版课程页 -> 旧版 URL =================
     新版: /mooc2-ans-vue/fanyav3/stu | /fanyav3/studentCourse
     旧版: /mooc2-ans/mycourse/stu

     实测规律（对比新版/旧版 URL 得出）：
       * 路径：/mooc2-ans-vue/fanyav3/{stu,studentCourse}  ->  /mooc2-ans/mycourse/stu
       * 必带：courseId, clazzId, t（t 缺失 -> 服务端报「无效的参数」）
       * 可选：cpi, enc, ut
       * 额外：courseid/clazzid 重复一遍，v=2, pageHeader=0, hideHead=0, forceMooc2=true
       * enc 与 t 都是当前页面级令牌，可直接沿用，无需额外请求
     缺 t 时不做直接跳转，交给下方点击兜底。                        */
  const NEW_COURSE_ROUTE = /^\/mooc2-ans-vue\/fanyav3\/(?:stu|studentCourse)\/?$/i;

  function buildOldUrl(href) {
    try {
      const u = new URL(href);
      if (u.hostname !== 'mooc2-ans.chaoxing.com') return null;
      if (!NEW_COURSE_ROUTE.test(u.pathname)) return null;
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
      return 'https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?' + parts.join('&');
    } catch (e) { return null; }
  }

  function buildOldFromCurrent() {
    try { return buildOldUrl(location.href); } catch (e) { return null; }
  }

  /* ================= 兜底：自动点击「回到旧版」 ================= */
  // 只用新版页确认过的精确类名 + 短文本兜底；
  // 注意：旧版页里也有 class 含 backOld 的元素，泛匹配会导致来回跳转。
  const CANDIDATE_SELECTORS = ['.back-old'];
  const TEXT_RE = /^(回到旧版|返回旧版|回到旧版页面)$/;

  // 已经在旧版页就什么都不做
  function onOldPage() {
    try {
      return /^\/mooc2-ans\/mycourse\//.test(location.pathname)
        || /^\/mooc-ans\//.test(location.pathname);
    } catch (e) { return false; }
  }

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
    console.log('[回到旧版] 第 ' + attempts + ' 次点击', el.className || el.tagName);
    armSuccessWatch();
    realClick(el);
    return attempts >= MAX_ATTEMPTS;
  }

  function watchAndClick(timeoutMs) {
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
      if (tryOnce() || Date.now() > deadline) stop();
    }, 1000);
  }

  /* ================= 入口 ================= */
  (function main() {
    if (onOldPage()) return;

    // 1) 主框架上的已知新版课程页：直接跳，完全不渲染新版
    if (isTop) {
      const oldUrl = buildOldFromCurrent();
      if (oldUrl) {
        if (!guardOk()) {
          console.log('[回到旧版] 循环保护触发，本次不跳');
          return;
        }
        console.log('[回到旧版] 直接跳转 ->', oldUrl);
        location.replace(oldUrl);
        return;
      }
    }

    // 2) 其余情况：等页面渲染出「回到旧版」再点（含 iframe 内）
    function start() { watchAndClick(30000); }

    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  })();
})();
