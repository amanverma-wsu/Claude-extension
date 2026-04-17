const STATE_KEY = "cu_tracker_state";
const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const DEFAULT_MESSAGE_CAP = 45;

const loadState = async () => {
  const { [STATE_KEY]: s } = await chrome.storage.local.get(STATE_KEY);
  return s || {
    orgId: null,
    messagesSent: 0,
    windowStart: null,
    resetsAt: null,
    utilization: null,
    exceeded: false,
    lastSeenAt: null,
    messageCap: DEFAULT_MESSAGE_CAP
  };
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

const rollWindowIfNeeded = (state, now) => {
  if (state.resetsAt && now >= state.resetsAt) {
    state.messagesSent = 0;
    state.windowStart = now;
    state.resetsAt = now + FIVE_HOURS_MS;
    state.exceeded = false;
    state.utilization = null;
  }
  return state;
};

const parseResets = (raw) => {
  if (!raw) return null;
  if (typeof raw === "number") return raw > 1e12 ? raw : raw * 1000;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
};

const handleEvent = async (payload) => {
  if (!payload) return;
  const state = await loadState();
  const now = Date.now();

  if (payload.orgId) state.orgId = payload.orgId;
  state.lastSeenAt = now;

  rollWindowIfNeeded(state, now);

  if (payload.kind === "message_sent") {
    if (!state.windowStart) {
      state.windowStart = now;
      state.resetsAt = now + FIVE_HOURS_MS;
    }
    state.messagesSent += 1;
  }

  if (payload.kind === "usage" && payload.data) {
    const d = payload.data;
    const reset = parseResets(d.resets_at || d.reset_at);
    if (reset) state.resetsAt = reset;
    if (typeof d.utilization === "number") state.utilization = d.utilization;
    if (typeof d.exceeded_limit === "boolean") state.exceeded = d.exceeded_limit;
    if (typeof d.message_limit === "number") state.messageCap = d.message_limit;
    if (typeof d.five_hour_limit === "number") state.messageCap = d.five_hour_limit;
    if (typeof d.limit === "number" && d.type && String(d.type).includes("message")) {
      state.messageCap = d.limit;
    }
    if (typeof d.used === "number") state.messagesSent = d.used;
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
    saveState({
      orgId: null,
      messagesSent: 0,
      windowStart: null,
      resetsAt: null,
      utilization: null,
      exceeded: false,
      lastSeenAt: null,
      messageCap: DEFAULT_MESSAGE_CAP
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.alarms.create("cu_tick", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "cu_tick") return;
  const state = await loadState();
  const now = Date.now();
  if (rollWindowIfNeeded(state, now) !== state || state.resetsAt) {
    await saveState(state);
    broadcast(state);
  }
});
