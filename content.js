(() => {
  const EVT = "__cu_tracker_event__";
  const POLL_EVT = "__cu_poll_request__";

  window.addEventListener(EVT, (e) => {
    const detail = e.detail;
    if (!detail) return;
    try {
      chrome.runtime.sendMessage({ type: "cu_tracker", payload: detail });
    } catch (_) {}
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "cu_start_polling" && msg.url) {
      window.dispatchEvent(new CustomEvent(POLL_EVT, { detail: { url: msg.url } }));
    }
  });

  try {
    chrome.runtime.sendMessage({ type: "cu_get_endpoint" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.url) {
        window.dispatchEvent(new CustomEvent(POLL_EVT, { detail: { url: res.url } }));
      }
    });
  } catch (_) {}
})();
