const $ = (id) => document.getElementById(id);
const REFRESH_MS = 15_000;
const LIVE_TICK_MS = 1_000;
let lastState = null;

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
  lastState = state;
  const hasAny = state.session || state.weekly || state.messagesSent > 0;
  $("empty").style.display = hasAny ? "none" : "";
  $("content").style.display = hasAny ? "" : "none";

  if (hasAny) {
    renderBucket(state.session, $("s-pct"), $("s-bar"), $("s-reset"));
    renderBucket(state.weekly, $("w-pct"), $("w-bar"), $("w-reset"));
    const msgs = state.messagesSent || 0;
    $("s-msgs").textContent = msgs === 1 ? "1 message" : `${msgs} messages`;
  }

  $("org").textContent = state.orgId ? `org ${state.orgId.slice(0, 8)}…` : "No org detected";
  $("seen").textContent = state.lastSeenAt ? fmtRel(state.lastSeenAt) : "";
};

const refresh = () => {
  chrome.runtime.sendMessage({ type: "cu_get_state" }, (state) => {
    if (chrome.runtime.lastError) return;
    render(state);
  });
};

$("reset").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "cu_reset" }, refresh);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "cu_state") render(msg.state);
});

refresh();
setInterval(refresh, REFRESH_MS);
setInterval(() => {
  if (lastState) render(lastState);
}, LIVE_TICK_MS);
