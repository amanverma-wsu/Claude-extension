(() => {
  const EVT = "__cu_tracker_event__";

  const emit = (payload) => {
    try {
      window.dispatchEvent(new CustomEvent(EVT, { detail: payload }));
    } catch (_) {}
  };

  const safeParseJSON = (text) => {
    try { return JSON.parse(text); } catch { return null; }
  };

  const extractOrgId = (url) => {
    const m = url.match(/\/api\/organizations\/([0-9a-f-]+)/i);
    return m ? m[1] : null;
  };

  const scanForUsage = (url, data) => {
    if (!data || typeof data !== "object") return;
    const usageLike = {};

    const keysOfInterest = [
      "utilization",
      "remaining",
      "resets_at",
      "reset_at",
      "exceeded_limit",
      "message_limit",
      "five_hour_limit",
      "limit",
      "used",
      "type"
    ];

    const walk = (node, depth) => {
      if (depth > 6 || !node) return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item, depth + 1);
        return;
      }
      if (typeof node !== "object") return;
      for (const k of Object.keys(node)) {
        if (keysOfInterest.includes(k)) usageLike[k] = node[k];
        walk(node[k], depth + 1);
      }
    };
    walk(data, 0);

    if (Object.keys(usageLike).length > 0) {
      emit({
        kind: "usage",
        url,
        orgId: extractOrgId(url),
        data: usageLike,
        seenAt: Date.now()
      });
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const req = args[0];
      const url = typeof req === "string" ? req : (req && req.url) || "";
      if (url.includes("/api/") && url.includes("claude.ai")) {
        const ct = response.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const clone = response.clone();
          clone.text().then((t) => {
            const parsed = safeParseJSON(t);
            if (parsed) scanForUsage(url, parsed);
          }).catch(() => {});
        } else if (ct.includes("text/event-stream")) {
          emit({
            kind: "message_sent",
            url,
            orgId: extractOrgId(url),
            seenAt: Date.now()
          });
        }
      }
    } catch (_) {}
    return response;
  };

  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    let _url = "";
    const open = xhr.open;
    xhr.open = function (method, url, ...rest) {
      _url = url;
      return open.call(this, method, url, ...rest);
    };
    xhr.addEventListener("load", () => {
      try {
        if (_url && _url.includes("/api/") && _url.includes("claude.ai")) {
          const ct = xhr.getResponseHeader("content-type") || "";
          if (ct.includes("application/json")) {
            const parsed = safeParseJSON(xhr.responseText);
            if (parsed) scanForUsage(_url, parsed);
          }
        }
      } catch (_) {}
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;
})();
