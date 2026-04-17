const STATE_KEY = "cu_tracker_state";
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

const emptyState = () => ({
  orgId: null,
  session: null,
  weekly: null,
  messagesSent: 0,
  sessionStart: null,
  lastSeenAt: null
});

const loadState = async () => {
  const { [STATE_KEY]: s } = await chrome.storage.local.get(STATE_KEY);
  return s || emptyState();
};

const saveState = (s) => chrome.storage.local.set({ [STATE_KEY]: s });

const broadcast = (state) => {
  chrome.runtime.sendMessage({ type: "cu_state", state }).catch(() => {});
  chrome.tabs.query({ url: "https://claude.ai/*" }, (tabs) => {
    for (const t of tabs || []) {
      if (t.id != null) {
        chrome.tabs.sendMessage(t.id, { type: "cu_state", state }).catch(() => {});
      }
    }
  });
};

const parseResets = (raw) => {
  if (raw == null) return null;
  if (typeof raw === "number") return raw > 1e12 ? raw : raw * 1000;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
};

const normalizeUtil = (u) => {
  if (typeof u !== "number" || !isFinite(u)) return null;
  return u > 1 ? u / 100 : u;
};

const classifyBucket = (b) => {
  const k = (b.parentKey || "").toLowerCase();
  const p = (b.pathStr || "").toLowerCase();
  if (/(five_hour|5_hour|5h|session|current)/.test(k + " " + p)) return "session";
  if (/(seven_day|7_day|7d|week)/.test(k + " " + p)) return "weekly";
  const delta = b.resetsAt - Date.now();
  if (delta > 0 && delta <= 8 * 60 * 60 * 1000) return "session";
  if (delta > 8 * 60 * 60 * 1000 && delta <= 14 * 24 * 60 * 60 * 1000) return "weekly";
  return null;
};

const rollSessionIfNeeded = (state, now) => {
  if (state.session && state.session.resetsAt && now >= state.session.resetsAt) {
    state.session = null;
    state.messagesSent = 0;
    state.sessionStart = null;
  }
  if (state.weekly && state.weekly.resetsAt && now >= state.weekly.resetsAt) {
    state.weekly = null;
  }
  return state;
};

const handleEvent = async (payload) => {
  if (!payload) return;
  const state = await loadState();
  const now = Date.now();

  if (payload.orgId) state.orgId = payload.orgId;
  state.lastSeenAt = now;

  rollSessionIfNeeded(state, now);

  if (payload.kind === "message_sent") {
    if (!state.sessionStart) state.sessionStart = now;
    state.messagesSent += 1;
    if (!state.session) {
      state.session = { utilization: null, resetsAt: now + FIVE_HOURS_MS };
    }
  }

  if (payload.kind === "usage_buckets" && Array.isArray(payload.buckets)) {
    for (const raw of payload.buckets) {
      const resetsAt = parseResets(raw.resetsAt);
      const utilization = normalizeUtil(raw.utilization);
      if (resetsAt == null) continue;
      const bucket = { utilization, resetsAt };
      const kind = classifyBucket({ ...raw, resetsAt });
      if (kind === "session") state.session = bucket;
      else if (kind === "weekly") state.weekly = bucket;
    }
  }

  await saveState(state);
  broadcast(state);
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "cu_tracker") {
    handleEvent(msg.payload);
    sendResponse({ ok: true });
    return true;
  }
  if (msg && msg.type === "cu_get_state") {
    loadState().then((s) => sendResponse(s));
    return true;
  }
  if (msg && msg.type === "cu_reset") {
    saveState(emptyState()).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.alarms.create("cu_tick", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "cu_tick") return;
  const state = await loadState();
  const before = JSON.stringify(state);
  rollSessionIfNeeded(state, Date.now());
  if (JSON.stringify(state) !== before) {
    await saveState(state);
  }
  broadcast(state);
});
