const $ = (id) => document.getElementById(id);

const fmtDuration = (ms) => {
  if (ms <= 0) return "now";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
};

const fmtRelative = (ts) => {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
};

const render = (state) => {
  if (!state) return;
  const cap = state.messageCap || 45;
  const used = state.messagesSent || 0;
  const remaining = Math.max(0, cap - used);
  const pct = Math.min(100, Math.round((used / cap) * 100));

  $("used").textContent = `${used} / ${cap}`;
  $("remaining").textContent = String(remaining);
  $("bar").style.width = `${pct}%`;

  const resetsIn = state.resetsAt ? state.resetsAt - Date.now() : null;
  $("resets").textContent = resetsIn == null ? "--" : fmtDuration(resetsIn);

  $("util").textContent =
    typeof state.utilization === "number"
      ? `${Math.round(state.utilization * 100)}%`
      : "--";

  const status = $("status");
  if (state.exceeded) {
    status.textContent = "Limit reached for this window.";
    status.classList.add("warn");
  } else if (remaining <= 5 && used > 0) {
    status.textContent = "Close to the limit.";
    status.classList.add("warn");
  } else {
    status.textContent = used === 0 ? "No messages tracked this window." : "";
    status.classList.remove("warn");
  }

  $("org").textContent = state.orgId ? `org ${state.orgId.slice(0, 8)}…` : "No org detected";
  $("seen").textContent = state.lastSeenAt ? `seen ${fmtRelative(state.lastSeenAt)}` : "";
};

const refresh = () => {
  chrome.runtime.sendMessage({ type: "cu_get_state" }, (state) => render(state));
};

$("reset").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "cu_reset" }, refresh);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "cu_state") render(msg.state);
});

refresh();
setInterval(refresh, 5000);
