(() => {
  if (window.__cu_injected) return;
  window.__cu_injected = true;

  const EVT = "__cu_tracker_event__";
  const TAG = "[claude-usage]";

  const emit = (payload) => {
    try {
      window.dispatchEvent(new CustomEvent(EVT, { detail: payload }));
    } catch (_) {}
  };

  const safeJSON = (t) => { try { return JSON.parse(t); } catch { return null; } };

  const isClaudeApi = (url) => {
    if (!url) return false;
    if (url.startsWith("/api/")) return true;
    return /^https?:\/\/[^/]*claude\.ai\/api\//i.test(url);
  };

  const isCompletion = (url) =>
    /\/(completion|append_message|retry_completion)(\?|$|\/)/i.test(url);

  const extractOrgId = (url) => {
    const m = url.match(/\/api\/organizations\/([0-9a-f-]+)/i);
    return m ? m[1] : null;
  };

  const scanForUsage = (url, data) => {
    if (!data || typeof data !== "object") return;
    const buckets = [];
    const walk = (node, path, depth) => {
      if (depth > 8 || !node) return;
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) walk(node[i], path, depth + 1);
        return;
      }
      if (typeof node !== "object") return;
      const util = node.utilization;
      const reset = node.resets_at || node.reset_at;
      if (typeof util === "number" && reset) {
        buckets.push({
          parentKey: path[path.length - 1] || "",
          pathStr: path.join("."),
          utilization: util,
          resetsAt: reset
        });
      }
      for (const k of Object.keys(node)) {
        walk(node[k], path.concat(k), depth + 1);
      }
    };
    walk(data, [], 0);
    if (buckets.length > 0) {
      emit({
        kind: "usage_buckets",
        url,
        orgId: extractOrgId(url),
        buckets,
        seenAt: Date.now()
      });
    }
  };

  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    const method =
      (init && init.method) ||
      (input && typeof input === "object" && input.method) ||
      "GET";
    const api = isClaudeApi(url);
    const completion = api && isCompletion(url);
    const isPost = String(method).toUpperCase() === "POST";

    if (api && isPost && completion) {
      emit({ kind: "message_sent", url, orgId: extractOrgId(url), seenAt: Date.now() });
    }

    const response = await origFetch.apply(this, arguments);

    try {
      if (api) {
        const ct = response.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          response.clone().text().then((t) => {
            const parsed = safeJSON(t);
            if (parsed) scanForUsage(url, parsed);
          }).catch(() => {});
        }
      }
    } catch (_) {}

    return response;
  };

  const OrigXHR = window.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OrigXHR();
    let _url = "", _method = "GET";
    const open = xhr.open;
    xhr.open = function (method, url, ...rest) {
      _method = method; _url = url;
      return open.call(this, method, url, ...rest);
    };
    const send = xhr.send;
    xhr.send = function (...args) {
      try {
        if (isClaudeApi(_url) && String(_method).toUpperCase() === "POST" && isCompletion(_url)) {
          emit({ kind: "message_sent", url: _url, orgId: extractOrgId(_url), seenAt: Date.now() });
        }
      } catch (_) {}
      return send.apply(this, args);
    };
    xhr.addEventListener("load", () => {
      try {
        if (!isClaudeApi(_url)) return;
        const ct = xhr.getResponseHeader("content-type") || "";
        if (ct.includes("application/json")) {
          const parsed = safeJSON(xhr.responseText);
          if (parsed) scanForUsage(_url, parsed);
        }
      } catch (_) {}
    });
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;

  try { console.debug(TAG, "interceptor active"); } catch (_) {}
})();
