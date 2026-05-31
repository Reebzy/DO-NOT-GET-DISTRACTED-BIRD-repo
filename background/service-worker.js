// DONT GET DISTRACTED BIRD — Background Service Worker (MV3)
// Implements FM-01 through FM-07.

// ── Storage helpers ───────────────────────────────────────────────

const DEFAULT_SESSION = {
  focusMode: false,
  focusTabs: [],   // [{tabId, title, url}]
  lastFocusTabId: null,
  pendingFirstNav: false,
  focusLossTime: null,
  newWindowIds: [], // [windowId] windows created while focus mode was on
  focusStartTime: null,
  focusPaused: false,
  timedFocusEndTime: null, // absolute ms timestamp to auto-end focus, or null when untimed
};

const DEFAULT_LOCAL = {
  whitelist: [],      // [string] domains e.g. "linear.app"
  countdownSecs: 5,
  customHotkey: 'Ctrl+Shift+F',
  pauseHotkey: 'Ctrl+Shift+Space',
  timedFocusEnabled: false, // auto-end focus mode after timedFocusMinutes
  timedFocusMinutes: 15,    // duration for timed focus mode
  log: [],            // [{time, event, detail}] max 200
};

const TIMED_FOCUS_ALARM = 'timedFocusEnd';

// Sanitize a free-text minute entry into a valid positive integer (1–1440).
// Empty / non-numeric input falls back to the 15-minute default.
function clampMinutes(v) {
  if (v === '' || v == null) return 15;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 15;
  return Math.min(1440, Math.max(1, n));
}

async function getSession() {
  const data = await chrome.storage.session.get(DEFAULT_SESSION);
  return { ...DEFAULT_SESSION, ...data };
}

async function setSession(patch) {
  await chrome.storage.session.set(patch);
}

async function getLocal() {
  const data = await chrome.storage.local.get(DEFAULT_LOCAL);
  return { ...DEFAULT_LOCAL, ...data };
}

async function setLocal(patch) {
  await chrome.storage.local.set(patch);
}

async function addLog(event, detail = '') {
  const { log } = await getLocal();
  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const entry = { time, event, detail };
  const updated = [entry, ...log].slice(0, 200);
  await setLocal({ log: updated });
}

function normalizeDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function isNewTabPage(url) {
  return !url || url === '' || url.startsWith('chrome://newtab') ||
    url.startsWith('chrome://new-tab') || url === 'about:blank' ||
    url.startsWith('edge://newtab');
}

// ── Badge helpers ─────────────────────────────────────────────────

async function setBadge(on) {
  const icon = on
    ? { 16: 'assets/icon-16.png', 32: 'assets/icon-32.png', 48: 'assets/icon-48.png', 128: 'assets/icon-128.png' }
    : { 16: 'assets/icon-off-16.png', 32: 'assets/icon-off-32.png', 48: 'assets/icon-off-48.png', 128: 'assets/icon-off-128.png' };
  await chrome.action.setIcon({ path: icon }).catch(() => {});
  await chrome.action.setBadgeText({ text: on ? 'ON' : 'OFF' });
  await chrome.action.setBadgeBackgroundColor({ color: on ? '#c41a1a' : '#6b625c' });
  await chrome.action.setBadgeTextColor({ color: '#ffffff' });
}

// ── FM-01: Focus Mode toggle ──────────────────────────────────────

async function enableFocusMode() {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let focusTabs = [];
  let pendingFirstNav = false;

  if (activeTab) {
    if (isNewTabPage(activeTab.url)) {
      pendingFirstNav = true;
    } else {
      focusTabs = [{ tabId: activeTab.id, title: activeTab.title || 'Current tab', url: activeTab.url }];
    }
  }

  // Timed focus mode: snapshot the deadline at start so later setting changes
  // don't disturb a running session.
  const { timedFocusEnabled, timedFocusMinutes } = await getLocal();
  const timedMins = clampMinutes(timedFocusMinutes);
  const timedFocusEndTime = timedFocusEnabled ? Date.now() + timedMins * 60 * 1000 : null;

  await setSession({
    focusMode: true,
    focusTabs,
    lastFocusTabId: activeTab?.id ?? null,
    pendingFirstNav,
    focusLossTime: null,
    focusStartTime: Date.now(),
    focusPaused: false,
    timedFocusEndTime,
  });

  await setBadge(true);
  await addLog('session started', focusTabs[0]?.url || 'pending first navigation');

  if (timedFocusEndTime) {
    // Alarm is the reliable backstop that fires even if the worker is suspended
    // and no tab is polling. The widget poll (getElapsedTime) ends it precisely
    // on time when a focus tab is open.
    await chrome.alarms.create(TIMED_FOCUS_ALARM, { when: timedFocusEndTime }).catch(() => {});
    await addLog('timed focus armed', `${timedMins} min`);
  }

  // Inject content scripts into all existing tabs
  await injectContentScripts();

  // Broadcast focus mode state to all tabs
  broadcastToAllTabs({ action: 'focusOn' });
}

async function disableFocusMode(reason = '') {
  await setSession({
    focusMode: false,
    focusTabs: [],
    lastFocusTabId: null,
    pendingFirstNav: false,
    focusLossTime: null,
    newWindowIds: [],
    focusStartTime: null,
    focusPaused: false,
    timedFocusEndTime: null,
  });

  await chrome.alarms.clear(TIMED_FOCUS_ALARM).catch(() => {});
  await setBadge(false);
  await addLog('session ended', reason);

  // Notify all tabs to remove content script state
  broadcastToAllTabs({ action: 'focusOff' });
}

// ── Timed focus auto-end ──────────────────────────────────────────
// Called by the alarm (reliable backstop) and the widget poll (precise). The in-flight
// flag is set synchronously before any await, so concurrent triggers — many tabs polling
// the same expired deadline, or the alarm racing a poll — end the session exactly once.
let timedEndInProgress = false;

async function triggerTimedFocusEnd() {
  if (timedEndInProgress) return;
  timedEndInProgress = true;
  try {
    const session = await getSession();
    if (!session.focusMode || !session.timedFocusEndTime) return;

    // Capture tabs to notify before disabling clears the session.
    const targets = [];
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }).catch(() => []);
    if (activeTab?.id) targets.push(activeTab.id);
    for (const ft of session.focusTabs || []) {
      if (ft.tabId && !targets.includes(ft.tabId)) targets.push(ft.tabId);
    }

    await disableFocusMode('timer complete');
    await notifyFocusEnded(targets);
  } finally {
    timedEndInProgress = false;
  }
}

async function notifyFocusEnded(targetTabIds) {
  if (!(await hasHostAccess())) return;
  for (const tabId of targetTabIds) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab || !tab.url) continue;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
    chrome.scripting.executeScript({
      target: { tabId },
      func: showFocusEndedOverlay,
    }).catch(() => {});
  }
}

// Injected function for the "focus mode ended" notification (runs in page context)
function showFocusEndedOverlay() {
  if (document.getElementById('dgdb-focus-ended-overlay')) return;

  const el = document.createElement('div');
  el.id = 'dgdb-focus-ended-overlay';
  el.style.cssText = `
    position:fixed;right:18px;bottom:18px;z-index:2147483646;
    background:#f4f1ea;color:#100d0b;border-left:3px solid #c41a1a;
    padding:12px 16px;display:flex;align-items:center;gap:11px;border-radius:3px;
    box-shadow:0 2px 2px rgba(16,13,11,.20);font-family:Archivo,system-ui,sans-serif;
    max-width:320px;animation:dgdb-end-in 120ms ease;
  `;
  const style = document.createElement('style');
  style.textContent = '@keyframes dgdb-end-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}';
  document.head.appendChild(style);

  const birdSVG = `<svg width="28" height="28" viewBox="0 0 240 240" aria-hidden="true">
    <path d="M150 18 L139 43 L167 31 C181 72 190 112 182 151 L181 156 L231 207 L167 197 C150 193 131 189 117 181 C103 173 92 157 86 135 C83 125 82 118 85 110 L56 117 L18 107 L58 97 C92 68 116 30 150 18 Z" fill="#c41a1a"/>
    <path d="M58 97 C78 84 92 80 99 84 C103 100 101 110 92 118 L56 117 Z" fill="#100d0b"/>
    <path d="M122 110 L196 130 L168 170 L146 138 Z" fill="#8f1010"/>
    <path d="M101 88 L108 93 L101 98 L95 93 Z" fill="#f4f1ea"/>
  </svg>`;

  el.innerHTML = birdSVG + `
    <div>
      <div style="font-family:'Archivo Expanded',Archivo,sans-serif;font-weight:800;font-size:13px;letter-spacing:.02em;">Time's up.</div>
      <div style="font-family:'JetBrains Mono',monospace;color:#c41a1a;font-size:11px;margin-top:2px;">Focus mode ended.</div>
    </div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// Host access is requested at runtime (optional_host_permissions). Content-script
// injection (the floating widget, hotkey guard, title flash, return overlay) only
// runs when granted. All blocking — interstitial redirects and the navigation lock —
// works without host access, so the extension degrades gracefully if access is denied.
async function hasHostAccess() {
  return chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false);
}

async function injectContentScripts() {
  if (!(await hasHostAccess())) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/focus-widget.js', 'content/hotkey-guard.js'],
    }).catch(() => {});
  }
}

function broadcastToAllTabs(msg) {
  chrome.tabs.query({}).then(tabs => {
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome://')) continue;
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  });
}

// ── FM-02: Window focus loss ──────────────────────────────────────

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const session = await getSession();
  if (!session.focusMode) return;

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Skip if we already recorded a focus loss (onFocusChanged can fire multiple times)
    if (session.focusLossTime) return;

    // Clicking the extension icon fires WINDOW_ID_NONE (the browser window loses focus
    // to the popup), but the popup doesn't appear in chrome.windows.getAll(). Check
    // explicitly for an open popup context first.
    const popupContexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })
      .catch(() => []);
    console.log('[DGDB] popupContexts:', popupContexts.length);
    if (popupContexts.length > 0) return;

    // Also guard against transient WINDOW_ID_NONE when switching between Chrome windows
    const wins = await chrome.windows.getAll({ populate: false });
    console.log('[DGDB] wins focused:', wins.map(w => `${w.id}:${w.focused}`).join(', '));
    if (wins.some(w => w.focused)) return;

    console.log('[DGDB] confirmed left Chrome');

    // Focus truly lost to another application
    const lossTime = Date.now();
    await setSession({ focusLossTime: lossTime });

    // Title flash on focus tabs
    for (const ft of session.focusTabs) {
      chrome.tabs.sendMessage(ft.tabId, { action: 'startTitleFlash' }).catch(() => {});
    }

    await addLog('left window');

  } else {
    // Focus returned (FM-03)
    const { focusLossTime } = session;
    const awayMs = focusLossTime ? Date.now() - focusLossTime : 0;
    const awaySecs = Math.round(awayMs / 1000);

    // Stop title flash
    for (const ft of session.focusTabs) {
      chrome.tabs.sendMessage(ft.tabId, { action: 'stopTitleFlash' }).catch(() => {});
    }
    await setSession({ focusLossTime: null });

    // Inject return overlay into the active focus tab
    const lastTabId = session.lastFocusTabId;
    if (lastTabId && await hasHostAccess()) {
      chrome.scripting.executeScript({
        target: { tabId: lastTabId },
        func: showReturnOverlay,
        args: [awaySecs],
      }).catch(() => {});
    }

    await addLog('returned to window', `away ${awaySecs}s`);

    // Check if the currently active tab in this window is a non-focus tab
    // (user may have Alt+Tabbed to a window with a non-focus tab already active)
    const [activeTab] = await chrome.tabs.query({ active: true, windowId });
    if (activeTab) {
      const isFocusTab = session.focusTabs.some(ft => ft.tabId === activeTab.id);
      if (!isFocusTab && activeTab.url && !activeTab.url.startsWith('chrome-extension://')) {
        if (activeTab.url.startsWith('chrome://') && !isNewTabPage(activeTab.url)) return;

        // Show interstitial for the non-focus tab that's now active
        const { countdownSecs } = await getLocal();
        const lastTabId = session.lastFocusTabId;
        const returnUrl = activeTab.url || '';

        const params = new URLSearchParams({
          type: 'tab',
          tabTitle: activeTab.title || 'this tab',
          returnUrl,
          focusTabId: String(lastTabId || ''),
          countdown: String(countdownSecs),
          tabId: String(activeTab.id),
        });
        const interstitialUrl = chrome.runtime.getURL(`interstitial/interstitial.html?${params}`);
        chrome.tabs.update(activeTab.id, { url: interstitialUrl }).catch(() => {});

        await addLog('tab blocked (window focus)', activeTab.title || activeTab.url || 'unknown tab');
      }
    }
  }
});

// Injected function for return overlay (runs in page context)
function showReturnOverlay(awaySecs) {
  if (document.getElementById('dgdb-return-overlay')) return;

  const el = document.createElement('div');
  el.id = 'dgdb-return-overlay';
  el.style.cssText = `
    position:fixed;right:18px;bottom:18px;z-index:2147483646;
    background:#f4f1ea;color:#100d0b;border-left:3px solid #c41a1a;
    padding:12px 16px;display:flex;align-items:center;gap:11px;border-radius:3px;
    box-shadow:0 2px 2px rgba(16,13,11,.20);font-family:Archivo,system-ui,sans-serif;
    max-width:300px;animation:dgdb-in 120ms ease;
  `;
  const style = document.createElement('style');
  style.textContent = '@keyframes dgdb-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}';
  document.head.appendChild(style);

  const birdSVG = `<svg width="28" height="28" viewBox="0 0 240 240" aria-hidden="true">
    <path d="M150 18 L139 43 L167 31 C181 72 190 112 182 151 L181 156 L231 207 L167 197 C150 193 131 189 117 181 C103 173 92 157 86 135 C83 125 82 118 85 110 L56 117 L18 107 L58 97 C92 68 116 30 150 18 Z" fill="#c41a1a"/>
    <path d="M58 97 C78 84 92 80 99 84 C103 100 101 110 92 118 L56 117 Z" fill="#100d0b"/>
    <path d="M122 110 L196 130 L168 170 L146 138 Z" fill="#8f1010"/>
    <path d="M101 88 L108 93 L101 98 L95 93 Z" fill="#f4f1ea"/>
  </svg>`;

  el.innerHTML = birdSVG + `
    <div>
      <div style="font-family:'Archivo Expanded',Archivo,sans-serif;font-weight:800;font-size:13px;letter-spacing:.02em;">You're back.</div>
      <div style="font-family:'JetBrains Mono',monospace;color:#c41a1a;font-size:11px;margin-top:2px;">Away for ${awaySecs > 0 ? awaySecs + 's' : '<1s'}</div>
    </div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── FM-05: Tab interstitial ───────────────────────────────────────

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const session = await getSession();
  if (!session.focusMode) return;

  const isFocusTab = session.focusTabs.some(ft => ft.tabId === tabId);
  if (isFocusTab) {
    await setSession({ lastFocusTabId: tabId });
    return;
  }

  // Non-focus tab activated — show interstitial
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return;
  // Skip extension pages, but allow new tab pages to show interstitial
  if (tab.url && tab.url.startsWith('chrome-extension://')) return;
  if (tab.url && tab.url.startsWith('chrome://') && !isNewTabPage(tab.url)) return;

  const { countdownSecs } = await getLocal();
  const lastTabId = session.lastFocusTabId;
  // returnUrl is where THIS tab should return to (its own URL before the interstitial)
  const returnUrl = tab.url || '';

  const params = new URLSearchParams({
    type: 'tab',
    tabTitle: tab.title || 'this tab',
    returnUrl,
    focusTabId: String(lastTabId || ''),
    countdown: String(countdownSecs),
    tabId: String(tabId),
  });
  const interstitialUrl = chrome.runtime.getURL(`interstitial/interstitial.html?${params}`);
  chrome.tabs.update(tabId, { url: interstitialUrl }).catch(() => {});

  await addLog('tab blocked', tab.title || tab.url || 'unknown tab');
});

// ── FM-06: URL navigation lock ────────────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;
  const session = await getSession();
  if (!session.focusMode) return;

  const isFocusTab = session.focusTabs.some(ft => ft.tabId === details.tabId);

  // If it's a non-focus tab trying to navigate, show interstitial
  if (!isFocusTab && !details.url.startsWith('chrome-extension://')) {
    if (details.url.startsWith('chrome://') && !isNewTabPage(details.url)) return;

    const tab = await chrome.tabs.get(details.tabId).catch(() => null);
    if (!tab) return;
    // Skip if tab is currently at an extension page (e.g., interstitial) — don't loop
    if (tab.url && tab.url.startsWith('chrome-extension://')) return;

    const { countdownSecs } = await getLocal();
    const lastTabId = session.lastFocusTabId;
    const returnUrl = tab.url || '';

    const params = new URLSearchParams({
      type: 'tab',
      tabTitle: tab.title || 'this tab',
      returnUrl,
      focusTabId: String(lastTabId || ''),
      countdown: String(countdownSecs),
      tabId: String(details.tabId),
    });
    const interstitialUrl = chrome.runtime.getURL(`interstitial/interstitial.html?${params}`);
    chrome.tabs.update(details.tabId, { url: interstitialUrl }).catch(() => {});

    await addLog('navigation blocked (non-focus tab)', details.url);
    return;
  }

  if (!isFocusTab) return;

  const destDomain = normalizeDomain(details.url);
  if (!destDomain) return;
  if (details.url.startsWith('chrome-extension://')) return;

  // Handle pendingFirstNav — first real nav from a new-tab page becomes the focus domain
  if (session.pendingFirstNav) {
    const ft = { tabId: details.tabId, title: destDomain, url: details.url };
    await setSession({ pendingFirstNav: false, focusTabs: [ft] });
    await addLog('focus tab assigned', details.url);
    return;
  }

  const { whitelist, countdownSecs } = await getLocal();

  // Check if destination is whitelisted (subdomain matching)
  const isWhitelisted = whitelist.some(w => destDomain === w || destDomain.endsWith('.' + w));
  if (isWhitelisted) return;

  // Check if destination is already a focus tab domain
  const focusDomain = session.focusTabs
    .filter(ft => ft.tabId === details.tabId)
    .map(ft => normalizeDomain(ft.url))[0];
  if (focusDomain && (destDomain === focusDomain || destDomain.endsWith('.' + focusDomain))) return;

  // Redirect to interstitial
  const tab = await chrome.tabs.get(details.tabId).catch(() => null);
  const returnUrl = tab?.url || '';

  const params = new URLSearchParams({
    type: 'domain',
    dest: destDomain,
    returnUrl,
    countdown: String(countdownSecs),
    tabId: String(details.tabId),
  });
  const interstitialUrl = chrome.runtime.getURL(`interstitial/interstitial.html?${params}`);
  chrome.tabs.update(details.tabId, { url: interstitialUrl }).catch(() => {});

  await addLog('url blocked', `→ ${destDomain}`);
});

// ── Window tracking ───────────────────────────────────────────────

chrome.windows.onCreated.addListener(async (window) => {
  const session = await getSession();
  if (!session.focusMode) return;
  // Track this window as "new" so we can close it if only the interstitial appears
  const newWindowIds = [...(session.newWindowIds || []), window.id];
  await setSession({ newWindowIds });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const session = await getSession();
  // Remove from tracking if it was closed
  const newWindowIds = (session.newWindowIds || []).filter(id => id !== windowId);
  await setSession({ newWindowIds });
});

// ── Tab blocking during focus mode ──────────────────────────────────

chrome.tabs.onCreated.addListener(async (tab) => {
  const session = await getSession();
  if (!session.focusMode) return;

  const { countdownSecs } = await getLocal();
  const lastTabId = session.lastFocusTabId;
  let returnUrl = '';
  if (lastTabId) {
    const lastTab = await chrome.tabs.get(lastTabId).catch(() => null);
    returnUrl = lastTab?.url || '';
  }

  const params = new URLSearchParams({
    type: 'tab',
    tabTitle: 'new tab',
    returnUrl,
    focusTabId: String(lastTabId || ''),
    countdown: String(countdownSecs),
    tabId: String(tab.id),
  });
  const interstitialUrl = chrome.runtime.getURL(`interstitial/interstitial.html?${params}`);
  chrome.tabs.update(tab.id, { url: interstitialUrl }).catch(() => {});
  await addLog('tab blocked', 'new tab');
});

// Also inject content scripts when tabs finish loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

  const session = await getSession();
  if (!session.focusMode) return;
  if (!(await hasHostAccess())) return;

  chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/focus-widget.js', 'content/hotkey-guard.js'],
  }).catch(() => {});
});

// ── Hotkey command handler ───────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-focus-hotkey') {
    await handleMessage({ action: 'toggleFocus' }, {});
  } else if (command === 'toggle-pause-hotkey') {
    await handleMessage({ action: 'togglePauseFocusMode' }, {});
  }
});

// ── Timed focus alarm ────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIMED_FOCUS_ALARM) {
    triggerTimedFocusEnd().catch(err => console.error('DGDB timed focus end error:', err));
  }
});

// ── Message handler ───────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse).catch(err => {
    console.error('DGDB message error:', err);
    sendResponse({ ok: false, error: err.message });
  });
  return true; // keep channel open for async
});

async function handleMessage(msg, sender) {
  switch (msg.action) {

    case 'toggleFocus': {
      const { focusMode } = await getSession();
      if (focusMode) await disableFocusMode();
      else await enableFocusMode();
      const newSession = await getSession();
      const local = await getLocal();
      return { ok: true, state: { ...newSession, ...local } };
    }

    case 'getState': {
      const session = await getSession();
      const local = await getLocal();
      return { ok: true, state: { ...session, ...local } };
    }

    case 'removeFocusTab': {
      const session = await getSession();
      const updated = session.focusTabs.filter(ft => ft.tabId !== msg.tabId);
      await setSession({ focusTabs: updated });
      return { ok: true };
    }

    case 'addFocusTab': {
      const session = await getSession();
      const already = session.focusTabs.some(ft => ft.tabId === msg.tab.tabId);
      if (!already) {
        await setSession({ focusTabs: [...session.focusTabs, msg.tab] });
      }
      await addLog('tab added to focus', msg.tab.url);
      return { ok: true };
    }

    case 'addDomain': {
      const { whitelist } = await getLocal();
      const domain = msg.domain.replace(/^www\./, '').toLowerCase().trim();
      if (!whitelist.includes(domain)) {
        await setLocal({ whitelist: [...whitelist, domain] });
        await addLog('domain whitelisted', domain);
      }
      return { ok: true };
    }

    case 'removeDomain': {
      const { whitelist } = await getLocal();
      await setLocal({ whitelist: whitelist.filter(d => d !== msg.domain) });
      return { ok: true };
    }

    case 'setCountdown': {
      await setLocal({ countdownSecs: msg.secs });
      return { ok: true };
    }

    case 'setTimedFocus': {
      const patch = {};
      if (typeof msg.enabled === 'boolean') patch.timedFocusEnabled = msg.enabled;
      if (msg.minutes != null) patch.timedFocusMinutes = clampMinutes(msg.minutes);
      if (Object.keys(patch).length > 0) await setLocal(patch);
      const local = await getLocal();
      return {
        ok: true,
        timedFocusEnabled: local.timedFocusEnabled,
        timedFocusMinutes: local.timedFocusMinutes,
      };
    }

    case 'clearLog': {
      await setLocal({ log: [] });
      return { ok: true };
    }

    case 'goBack': {
      // Check if the interstitial is in a newly created window
      let shouldCloseWindow = false;
      let focusWindowId = null;
      const session = await getSession();

      if (msg.focusTabId && sender.tab?.windowId) {
        const focusTab = await chrome.tabs.get(msg.focusTabId).catch(() => null);
        if (focusTab && focusTab.windowId !== sender.tab.windowId) {
          focusWindowId = focusTab.windowId;
          // Close the window only if it was created during this focus session
          if ((session.newWindowIds || []).includes(sender.tab.windowId)) {
            shouldCloseWindow = true;
          }
        }
      }

      // Restore this tab to its previous URL (only if staying in same window)
      if (!shouldCloseWindow && sender.tab?.id && msg.returnUrl) {
        await chrome.tabs.update(sender.tab.id, { url: msg.returnUrl }).catch(() => {});
      }

      // Switch back to the last active focus tab (tab variant only)
      if (msg.focusTabId) {
        await chrome.tabs.update(msg.focusTabId, { active: true }).catch(() => {});
      }

      // Bring the focus window to the foreground
      if (focusWindowId) {
        chrome.windows.update(focusWindowId, { focused: true }).catch(() => {});
      }

      // Close the interstitial window if it was newly created
      if (shouldCloseWindow && sender.tab?.windowId) {
        chrome.windows.remove(sender.tab.windowId).catch(() => {});
      }

      return { ok: true };
    }

    case 'addToFocus': {
      // Interstitial: add current tab/domain to focus
      const session = await getSession();
      if (msg.type === 'tab' && sender.tab) {
        const ft = { tabId: sender.tab.id, title: msg.title || sender.tab.title, url: msg.returnUrl || sender.tab.url };
        const already = session.focusTabs.some(f => f.tabId === ft.tabId);
        if (!already) await setSession({ focusTabs: [...session.focusTabs, ft] });
        await addLog('tab added to focus', ft.url);
        // Navigate the tab back to the original URL
        if (msg.destUrl && sender.tab?.id) {
          await chrome.tabs.update(sender.tab.id, { url: msg.destUrl }).catch(() => {});
        }
      } else if (msg.type === 'domain' && msg.domain) {
        const { whitelist } = await getLocal();
        if (!whitelist.includes(msg.domain)) {
          await setLocal({ whitelist: [...whitelist, msg.domain] });
          await addLog('domain whitelisted', msg.domain);
        }
        // Navigate to the destination domain
        if (msg.destUrl && sender.tab?.id) {
          await chrome.tabs.update(sender.tab.id, { url: msg.destUrl }).catch(() => {});
        }
      }
      return { ok: true };
    }

    case 'endFocusMode': {
      await disableFocusMode();
      if (msg.destUrl && sender.tab?.id) {
        await chrome.tabs.update(sender.tab.id, { url: msg.destUrl }).catch(() => {});
      }
      return { ok: true };
    }

    case 'endFocusModeAndClose': {
      // Last-tab close guard: end session then close tab
      await disableFocusMode();
      if (sender.tab?.id) {
        chrome.tabs.remove(sender.tab.id).catch(() => {});
      }
      return { ok: true };
    }

    case 'isLastFocusTab': {
      const session = await getSession();
      const tabId = msg.tabId ?? sender.tab?.id;
      const isLast =
        (session.focusTabs.length === 1 && session.focusTabs[0].tabId === tabId) ||
        (session.pendingFirstNav && session.lastFocusTabId === tabId);
      return { ok: true, isLast };
    }

    case 'closeCurrentTab': {
      if (sender.tab?.id) {
        chrome.tabs.remove(sender.tab.id).catch(() => {});
      }
      return { ok: true };
    }

    case 'getElapsedTime': {
      const session = await getSession();

      // Timed focus: end precisely when the deadline passes (a focus tab is polling us).
      if (session.focusMode && session.timedFocusEndTime && Date.now() >= session.timedFocusEndTime) {
        await triggerTimedFocusEnd();
        return { ok: true, elapsedSecs: 0, timed: true, remainingSecs: 0, ended: true };
      }

      const elapsed = session.focusMode && session.focusStartTime && !session.focusPaused
        ? Math.floor((Date.now() - session.focusStartTime) / 1000)
        : 0;

      let timed = false;
      let remainingSecs = null;
      if (session.focusMode && session.timedFocusEndTime) {
        timed = true;
        remainingSecs = Math.max(0, Math.ceil((session.timedFocusEndTime - Date.now()) / 1000));
      }

      return { ok: true, elapsedSecs: elapsed, timed, remainingSecs };
    }

    case 'togglePauseFocusMode': {
      const session = await getSession();
      if (!session.focusMode) return { ok: false, error: 'focus mode not active' };
      const newPaused = !session.focusPaused;
      await setSession({ focusPaused: newPaused });
      broadcastToAllTabs({ action: 'focusPausedChanged', paused: newPaused });
      return { ok: true, paused: newPaused };
    }

    case 'getHotkey': {
      const { customHotkey } = await getLocal();
      return { ok: true, hotkey: customHotkey || 'Ctrl+Shift+F' };
    }

    case 'setHotkey': {
      await setLocal({ customHotkey: msg.hotkey });
      return { ok: true };
    }

    case 'getPauseHotkey': {
      const { pauseHotkey } = await getLocal();
      return { ok: true, hotkey: pauseHotkey || 'Ctrl+Shift+Space' };
    }

    case 'setPauseHotkey': {
      await setLocal({ pauseHotkey: msg.hotkey });
      return { ok: true };
    }

    case 'keepalive':
      return { ok: true };

    default:
      return { ok: false, error: 'unknown action' };
  }
}

// ── Init ──────────────────────────────────────────────────────────

// Set badge on install/startup. Session state (incl. focusMode) resets on browser
// restart, so drop any timed-focus alarm that outlived its session.
chrome.runtime.onInstalled.addListener(() => {
  setBadge(false);
  chrome.alarms.clear(TIMED_FOCUS_ALARM).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  setBadge(false);
  chrome.alarms.clear(TIMED_FOCUS_ALARM).catch(() => {});
});
