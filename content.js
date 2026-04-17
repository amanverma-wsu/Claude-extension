(() => {
  const EVT = "__cu_tracker_event__";

  const s = document.createElement("script");
  s.src = chrome.runtime.getURL("inject.js");
  s.async = false;
  (document.head || document.documentElement).appendChild(s);
  s.onload = () => s.remove();

  window.addEventListener(EVT, (e) => {
    const detail = e.detail;
    if (!detail) return;
    try {
      chrome.runtime.sendMessage({ type: "cu_tracker", payload: detail });
    } catch (_) {}
  });
})();
