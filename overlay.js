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
      .btns { display: flex; gap: 2px; }
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
      .section { margin-bottom: 8px; }
      .section:last-child { margin-bottom: 0; }
      .srow {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 1px 0;
      }
      .slabel { opacity: 0.65; font-size: 11px; }
      .sval { font-variant-numeric: tabular-nums; font-weight: 600; font-size: 13px; }
      .sub {
        display: flex;
        justify-content: space-between;
        font-size: 10.5px;
        opacity: 0.6;
        margin-top: 2px;
      }
      .bar-wrap {
        height: 5px;
        background: rgba(0,0,0,0.08);
        border-radius: 3px;
        margin: 4px 0 2px;
        overflow: hidden;
      }
      @media (prefers-color-scheme: dark) {
        .bar-wrap { background: rgba(255,255,255,0.08); }
      }
      .bar { height: 100%; width: 0; background: #c96442; transition: width 200ms ease; }
      .bar.warn { background: #d97757; }
      .bar.danger { background: #b54a2d; }
      .muted { opacity: 0.6; font-size: 11px; text-align: center; padding: 6px 0; }
      .mini { display: none; padding: 2px 6px; font-size: 11px; font-variant-numeric: tabular-nums; }
      .collapsed .body { display: none; }
      .collapsed .hdr { border-bottom: none; }
      .collapsed .mini { display: inline; }
      .foot {
        display: flex;
        justify-content: space-between;
        font-size: 10px;
        opacity: 0.55;
        padding-top: 6px;
        border-top: 1px solid rgba(0,0,0,0.05);
        margin-top: 6px;
      }
      @media (prefers-color-scheme: dark) {
        .foot { border-top-color: rgba(255,255,255,0.06); }
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
        <div id="empty" class="muted">Open Settings → Usage on claude.ai to populate.</div>
        <div id="content" style="display:none;">
          <div class="section" id="session-section">
            <div class="srow"><span class="slabel">Current session</span><span class="sval" id="s-pct">--</span></div>
            <div class="bar-wrap"><div class="bar" id="s-bar"></div></div>
            <div class="sub"><span id="s-msgs">--</span><span id="s-reset">--</span></div>
          </div>
          <div class="section" id="weekly-section">
            <div class="srow"><span class="slabel">Weekly</span><span class="sval" id="w-pct">--</span></div>
            <div class="bar-wrap"><div class="bar" id="w-bar"></div></div>
            <div class="sub"><span></span><span id="w-reset">--</span></div>
          </div>
          <div class="foot">
            <span id="org"></span>
            <span id="seen"></span>
          </div>
        </div>
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
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  };

  const fmtRel = (ts) => {
    if (!ts) return "";
    const diff = Date.now() - ts;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    return `${Math.floor(diff / 3_600_000)}h ago`;
  };

  const setBar = (el, pct) => {
    el.style.width = `${pct}%`;
    el.classList.toggle("warn", pct >= 75 && pct < 90);
    el.classList.toggle("danger", pct >= 90);
  };

  const renderBucket = (bucket, pctEl, barEl, resetEl) => {
    if (!bucket) {
      pctEl.textContent = "--";
      resetEl.textContent = "--";
      setBar(barEl, 0);
      return;
    }
    const pct = bucket.utilization == null ? null : Math.round(bucket.utilization * 100);
    pctEl.textContent = pct == null ? "--" : `${pct}%`;
    setBar(barEl, pct || 0);
    const delta = bucket.resetsAt ? bucket.resetsAt - Date.now() : null;
    resetEl.textContent = delta == null ? "--" : `resets in ${fmtDur(delta)}`;
  };

  const render = (state) => {
    if (!state) return;
    const hasAny = state.session || state.weekly || state.messagesSent > 0;
    $("empty").style.display = hasAny ? "none" : "";
    $("content").style.display = hasAny ? "" : "none";
    if (!hasAny) return;

    renderBucket(state.session, $("s-pct"), $("s-bar"), $("s-reset"));
    renderBucket(state.weekly, $("w-pct"), $("w-bar"), $("w-reset"));

    const msgs = state.messagesSent || 0;
    $("s-msgs").textContent = msgs === 1 ? "1 message" : `${msgs} messages`;

    const miniText =
      state.session && state.session.utilization != null
        ? `${Math.round(state.session.utilization * 100)}%`
        : `${msgs} msg`;
    $("mini").textContent = miniText;

    $("org").textContent = state.orgId ? `org ${state.orgId.slice(0, 8)}…` : "";
    $("seen").textContent = state.lastSeenAt ? fmtRel(state.lastSeenAt) : "";
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
