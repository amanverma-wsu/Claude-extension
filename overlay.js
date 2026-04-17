(() => {
  if (window.__cu_overlay_mounted) return;
  window.__cu_overlay_mounted = true;

  const POS_KEY = "cu_overlay_pos";
  const HIDDEN_KEY = "cu_overlay_hidden";

  const host = document.createElement("div");
  host.id = "cu-usage-overlay-host";
  host.style.cssText = "position:fixed;z-index:2147483647;top:16px;right:16px;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 12px;
        color: #1f1f1f;
        background: rgba(255,255,255,0.96);
        border: 1px solid #e6e4df;
        border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.12);
        width: 240px;
        user-select: none;
        backdrop-filter: blur(6px);
      }
      @media (prefers-color-scheme: dark) {
        .panel {
          color: #f5f3ef;
          background: rgba(28,27,26,0.94);
          border-color: #3a3835;
          box-shadow: 0 6px 24px rgba(0,0,0,0.5);
        }
      }
      .hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        cursor: grab;
        border-bottom: 1px solid rgba(0,0,0,0.06);
      }
      .hdr:active { cursor: grabbing; }
      .title { font-weight: 600; font-size: 12px; }
      .btns { display: flex; gap: 4px; }
      .btn {
        background: transparent;
        border: none;
        color: inherit;
        opacity: 0.6;
        cursor: pointer;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 12px;
      }
      .btn:hover { opacity: 1; background: rgba(0,0,0,0.06); }
      @media (prefers-color-scheme: dark) {
        .btn:hover { background: rgba(255,255,255,0.08); }
      }
      .body { padding: 8px 10px 10px; }
      .row { display: flex; justify-content: space-between; padding: 2px 0; }
      .label { opacity: 0.65; }
      .value { font-variant-numeric: tabular-nums; font-weight: 500; }
      .bar-wrap {
        height: 5px;
        background: rgba(0,0,0,0.08);
        border-radius: 3px;
        margin: 6px 0 4px;
        overflow: hidden;
      }
      @media (prefers-color-scheme: dark) {
        .bar-wrap { background: rgba(255,255,255,0.08); }
      }
      .bar { height: 100%; width: 0; background: #c96442; transition: width 200ms ease; }
      .bar.warn { background: #d97757; }
      .bar.danger { background: #b54a2d; }
      .status {
        font-size: 10.5px;
        opacity: 0.65;
        margin-top: 4px;
        min-height: 12px;
      }
      .status.warn { color: #c96442; opacity: 1; }
      .collapsed .body { display: none; }
      .collapsed { width: auto; }
      .collapsed .hdr { border-bottom: none; }
      .mini {
        display: none;
        padding: 2px 8px 2px 4px;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
      }
      .collapsed .mini { display: inline; }
      .reopen {
        position: fixed;
        top: 16px;
        right: 16px;
        background: rgba(255,255,255,0.9);
        border: 1px solid #e6e4df;
        border-radius: 20px;
        padding: 4px 10px;
        font-size: 11px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }
    </style>
    <div class="panel" part="panel">
      <div class="hdr" id="hdr">
        <span class="title">Claude Usage</span>
        <span class="mini" id="mini">--</span>
        <div class="btns">
          <button class="btn" id="collapse" title="Collapse">–</button>
          <button class="btn" id="hide" title="Hide">×</button>
        </div>
      </div>
      <div class="body">
        <div class="row"><span class="label">Used</span><span class="value" id="used">--</span></div>
        <div class="row"><span class="label">Remaining</span><span class="value" id="remaining">--</span></div>
        <div class="bar-wrap"><div class="bar" id="bar"></div></div>
        <div class="row"><span class="label">Resets in</span><span class="value" id="resets">--</span></div>
        <div class="row"><span class="label">Utilization</span><span class="value" id="util">--</span></div>
        <div class="status" id="status"></div>
      </div>
    </div>
  `;

  const $ = (id) => shadow.getElementById(id);
  const panel = shadow.querySelector(".panel");
  const hdr = $("hdr");

  const fmtDur = (ms) => {
    if (ms == null) return "--";
    if (ms <= 0) return "now";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  };

  const render = (state) => {
    if (!state) return;
    const cap = state.messageCap || 45;
    const used = state.messagesSent || 0;
    const remaining = Math.max(0, cap - used);
    const pct = Math.min(100, Math.round((used / cap) * 100));

    $("used").textContent = `${used} / ${cap}`;
    $("remaining").textContent = String(remaining);
    const bar = $("bar");
    bar.style.width = `${pct}%`;
    bar.classList.toggle("warn", pct >= 75 && pct < 90);
    bar.classList.toggle("danger", pct >= 90);

    $("resets").textContent = state.resetsAt ? fmtDur(state.resetsAt - Date.now()) : "--";
    $("util").textContent =
      typeof state.utilization === "number"
        ? `${Math.round(state.utilization * 100)}%`
        : "--";

    $("mini").textContent = `${used}/${cap}`;

    const status = $("status");
    if (state.exceeded) {
      status.textContent = "Limit reached for this window.";
      status.classList.add("warn");
    } else if (remaining <= 5 && used > 0) {
      status.textContent = "Close to the limit.";
      status.classList.add("warn");
    } else {
      status.textContent = used === 0 ? "Waiting for activity…" : "";
      status.classList.remove("warn");
    }
  };

  const refresh = () => {
    try {
      chrome.runtime.sendMessage({ type: "cu_get_state" }, (state) => {
        if (chrome.runtime.lastError) return;
        render(state);
      });
    } catch (_) {}
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "cu_state") render(msg.state);
  });

  let dragging = false;
  let sx = 0, sy = 0, ox = 0, oy = 0;

  hdr.addEventListener("mousedown", (e) => {
    if (e.target.closest(".btn")) return;
    dragging = true;
    const rect = host.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY;
    ox = rect.left; oy = rect.top;
    host.style.right = "auto";
    host.style.left = `${ox}px`;
    host.style.top = `${oy}px`;
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const nx = Math.max(0, Math.min(window.innerWidth - 40, ox + (e.clientX - sx)));
    const ny = Math.max(0, Math.min(window.innerHeight - 40, oy + (e.clientY - sy)));
    host.style.left = `${nx}px`;
    host.style.top = `${ny}px`;
  });

  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    const r = host.getBoundingClientRect();
    chrome.storage.local.set({ [POS_KEY]: { left: r.left, top: r.top } });
  });

  $("collapse").addEventListener("click", () => {
    panel.classList.toggle("collapsed");
  });

  $("hide").addEventListener("click", () => {
    host.style.display = "none";
    chrome.storage.local.set({ [HIDDEN_KEY]: true });
    showReopenBadge();
  });

  const showReopenBadge = () => {
    if (document.getElementById("cu-reopen-badge")) return;
    const b = document.createElement("button");
    b.id = "cu-reopen-badge";
    b.textContent = "Claude Usage";
    b.style.cssText =
      "position:fixed;z-index:2147483647;top:16px;right:16px;" +
      "background:rgba(255,255,255,0.9);border:1px solid #e6e4df;" +
      "border-radius:20px;padding:4px 10px;font-size:11px;cursor:pointer;" +
      "box-shadow:0 2px 8px rgba(0,0,0,0.1);font-family:-apple-system,sans-serif;";
    b.addEventListener("click", () => {
      host.style.display = "";
      b.remove();
      chrome.storage.local.set({ [HIDDEN_KEY]: false });
    });
    document.documentElement.appendChild(b);
  };

  chrome.storage.local.get([POS_KEY, HIDDEN_KEY], (res) => {
    const pos = res[POS_KEY];
    if (pos) {
      host.style.right = "auto";
      host.style.left = `${pos.left}px`;
      host.style.top = `${pos.top}px`;
    }
    if (res[HIDDEN_KEY]) {
      host.style.display = "none";
      showReopenBadge();
    }
  });

  refresh();
  setInterval(refresh, 3000);
})();
