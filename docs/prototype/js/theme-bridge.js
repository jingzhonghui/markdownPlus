/**
 * Markdown+ 原型 — 跨 iframe 消息桥（postMessage）
 *
 * 消息协议（经 index.html 中转）：
 *   { type: 'theme', theme: 'light' | 'dark' }  主题切换
 *   { type: 'mode', mode: 'ir' | 'source' | 'split' }  编辑模式切换
 *   { type: 'sidebar', collapsed: boolean }  侧边栏折叠
 *
 * 组件（app-header / sidebar / editor / status-bar）通过本脚本：
 *   1. 监听 parent 广播并应用状态
 *   2. 向 parent 发起状态变更请求
 */
(function () {
  var theme = 'light';

  // 从 localStorage 恢复主题（同源 iframe 共享）
  try {
    var saved = localStorage.getItem('markdown-plus-proto-theme');
    if (saved === 'dark') theme = 'dark';
  } catch (e) { /* ignore */ }

  function applyTheme(value) {
    theme = value;
    document.documentElement.setAttribute('data-theme', value);
    try {
      localStorage.setItem('markdown-plus-proto-theme', value);
    } catch (e) { /* ignore */ }
    // 通知各组件（window 级别事件，供同页内其他脚本使用）
    window.dispatchEvent(new CustomEvent('proto:theme', { detail: value }));
  }

  // 向 parent 请求状态变更
  function request(action) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(action, '*');
    }
  }

  // 监听 parent 广播
  window.addEventListener('message', function (event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || !msg.type) return;

    if (msg.type === 'theme') {
      applyTheme(msg.theme);
    } else if (msg.type === 'mode') {
      window.dispatchEvent(new CustomEvent('proto:mode', { detail: msg.mode }));
    } else if (msg.type === 'sidebar') {
      window.dispatchEvent(new CustomEvent('proto:sidebar', { detail: msg.collapsed }));
    }
  });

  // 初始化主题
  applyTheme(theme);

  // 暴露给组件内脚本使用
  window.protoBridge = {
    getTheme: function () { return theme; },
    setTheme: function (value) {
      applyTheme(value);
      request({ type: 'theme', theme: value });
    },
    toggleTheme: function () {
      window.protoBridge.setTheme(theme === 'dark' ? 'light' : 'dark');
    },
    setMode: function (mode) {
      request({ type: 'mode', mode: mode });
    },
    setSidebar: function (collapsed) {
      request({ type: 'sidebar', collapsed: collapsed });
    }
  };
})();
