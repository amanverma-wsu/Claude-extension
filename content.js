(() => {
  const EVT = "__cu_tracker_event__";
  window.addEventListener(EVT, (e) => {
    const detail = e.detail;
    if (!detail) return;
    try {
      chrome.runtime.sendMessage({ type: "cu_tracker", payload: detail });
    } catch (_) {}
  });
  chrome.runtime.onMessage.addListener(() => {});
})();
