// DONT GET DISTRACTED BIRD — Background Service Worker (MV3)
// Implements FM-01 through FM-07.

// ── Storage helpers ───────────────────────────────────────────────

const DEFAULT_SESSION = {
  focusMode: false,
  focusTabs: [],   // [{tabId, title, url}]
  lastFocusTabId: null,
  pendingFirstNav: false,
  focusLossTime: null,
};

const DEFAULT_LOCAL = {
  whitelist: [],      // [string] domains e.g. "linear.app"
  countdownSecs: 5,
  log: [],            // [{time, event, detail}] max 200
};

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

  await setSession({
    focusMode: true,
    focusTabs,
    lastFocusTabId: activeTab?.id ?? null,
    pendingFirstNav,
    focusLossTime: null,
  });

  await setBadge(true);
  await addLog('session started', focusTabs[0]?.url || 'pending first navigation');

  // Keep the service worker awake so chrome.windows.onFocusChanged fires promptly
  startKeepAlive();

  // Inject content scripts into all existing tabs
  await injectContentScripts();
}

async function disableFocusMode() {
  await setSession({
    focusMode: false,
    focusTabs: [],
    lastFocusTabId: null,
    pendingFirstNav: false,
    focusLossTime: null,
  });

  stopKeepAlive();
  await setBadge(false);
  await addLog('session ended');

  // Notify all tabs to remove content script state
  broadcastToAllTabs({ action: 'focusOff' });
}

async function injectContentScripts() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/hotkey-guard.js'],
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
// When Chrome loses focus we flash its taskbar entry (chrome.windows.drawAttention)
// and flash the focus-tab titles. When focus returns we show a passive-aggressive
// "welcome back" overlay. Both avoid OS notifications entirely, which Windows would
// not reliably display.

// Resolve the window id that holds the user's focus tab.
async function getFocusWindowId(session) {
  const tabId = session.lastFocusTabId ?? session.focusTabs[0]?.tabId;
  if (tabId == null) return null;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  return tab?.windowId ?? null;
}

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const session = await getSession();
  if (!session.focusMode) return;

  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // Already away — onFocusChanged can fire NONE more than once.
    if (session.focusLossTime) return;

    // Clicking the extension icon fires WINDOW_ID_NONE as the browser window briefly
    // loses focus to the popup. Skip if the popup is currently open.
    const popupContexts = await chrome.runtime.getContexts({ contextTypes: ['POPUP'] })
      .catch(() => []);
    if (popupContexts.length > 0) return;

    await setSession({ focusLossTime: Date.now() });

    // Flash the Chrome taskbar icon to pull the user back.
    const winId = await getFocusWindowId(session);
    if (winId != null) chrome.windows.update(winId, { drawAttention: true }).catch(() => {});

    // Flash the focus-tab titles.
    for (const ft of session.focusTabs) {
      chrome.tabs.sendMessage(ft.tabId, { action: 'startTitleFlash' }).catch(() => {});
    }
    await addLog('left window');

  } else {
    // Focus returned to a Chrome window.
    const { focusLossTime } = session;
    await setSession({ focusLossTime: null });

    // Stop the taskbar + title flashing.
    chrome.windows.update(windowId, { drawAttention: false }).catch(() => {});
    for (const ft of session.focusTabs) {
      chrome.tabs.sendMessage(ft.tabId, { action: 'stopTitleFlash' }).catch(() => {});
    }

    if (focusLossTime == null) return; // we never recorded a departure
    const awaySecs = Math.round((Date.now() - focusLossTime) / 1000);
    if (awaySecs < 1) return; // ignore sub-second focus flickers

    // Passive-aggressive welcome-back overlay on the focus tab.
    const lastTabId = session.lastFocusTabId;
    if (lastTabId) {
      chrome.scripting.executeScript({
        target: { tabId: lastTabId },
        func: showWelcomeBackOverlay,
        args: [awaySecs],
      }).catch(() => {});
    }
    await addLog('returned to window', `away ${awaySecs}s`);
  }
});

// Injected function for the passive-aggressive welcome-back overlay (page context).
function showWelcomeBackOverlay(awaySecs) {
  document.getElementById('dgdb-welcome-back')?.remove();

  // Pick a passive-aggressive line; sharper the longer you were gone.
  const lines = awaySecs >= 30
    ? [
        'Oh good, you’re back. We were starting to worry the work would finish itself.',
        'Welcome back from your little expedition. Productive, was it?',
        'There you are. Only ' + awaySecs + ' seconds of "research". Impressive restraint.',
      ]
    : [
        'Oh. You’re back. Try to make it last this time.',
        'Welcome back. The work missed you. It really did.',
        'There you are. Eyes on the prize, yeah?',
      ];
  const headline = lines[Math.floor(Math.random() * lines.length)];

  const away = awaySecs >= 60
    ? Math.floor(awaySecs / 60) + 'm ' + (awaySecs % 60) + 's'
    : awaySecs + 's';

  const wrap = document.createElement('div');
  wrap.id = 'dgdb-welcome-back';
  wrap.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;justify-content:center;
    pointer-events:none;font-family:Archivo,system-ui,sans-serif;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes dgdb-drop{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:none}}
    @keyframes dgdb-rise{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-100%)}}
  `;
  document.head.appendChild(style);

  const birdSVG = `<svg width="34" height="34" viewBox="0 0 240 240" aria-hidden="true" style="flex:none;">
    <path d="M150 18 L139 43 L167 31 C181 72 190 112 182 151 L181 156 L231 207 L167 197 C150 193 131 189 117 181 C103 173 92 157 86 135 C83 125 82 118 85 110 L56 117 L18 107 L58 97 C92 68 116 30 150 18 Z" fill="#c41a1a"/>
    <path d="M58 97 C78 84 92 80 99 84 C103 100 101 110 92 118 L56 117 Z" fill="#100d0b"/>
    <path d="M122 110 L196 130 L168 170 L146 138 Z" fill="#8f1010"/>
    <path d="M101 88 L108 93 L101 98 L95 93 Z" fill="#f4f1ea"/>
  </svg>`;

  const bar = document.createElement('div');
  bar.style.cssText = `
    pointer-events:auto;display:flex;align-items:center;gap:14px;max-width:720px;width:calc(100% - 32px);
    margin:14px 16px;padding:14px 18px;background:#100d0b;color:#f4f1ea;border-bottom:3px solid #c41a1a;
    border-radius:6px;box-shadow:0 8px 24px rgba(16,13,11,.45);animation:dgdb-drop 220ms cubic-bezier(.2,.7,.3,1);
  `;
  bar.innerHTML = birdSVG + `
    <div style="flex:1;min-width:0;">
      <div style="font-family:'Archivo Expanded',Archivo,sans-serif;font-weight:800;font-size:15px;line-height:1.25;">${headline}</div>
      <div style="font-family:'JetBrains Mono',monospace;color:#cc4444;font-size:12px;margin-top:3px;">You wandered off for ${away}.</div>
    </div>`;
  wrap.appendChild(bar);
  document.body.appendChild(wrap);

  const dismiss = () => {
    bar.style.animation = 'dgdb-rise 200ms cubic-bezier(.2,.7,.3,1) forwards';
    setTimeout(() => wrap.remove(), 220);
  };
  bar.addEventListener('click', dismiss);
  setTimeout(dismiss, 5000);
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
  if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'))) return;

  const { countdownSecs } = await getLocal();
  const lastTabId = session.lastFocusTabId;
  let returnUrl = '';
  if (lastTabId) {
    const lastTab = await chrome.tabs.get(lastTabId).catch(() => null);
    returnUrl = lastTab?.url || '';
  }

  const params = new URLSearchParams({
    type: 'tab',
    tabTitle: tab.title || 'this tab',
    returnUrl,
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

// ── New tab injection ─────────────────────────────────────────────

chrome.tabs.onCreated.addListener(async (tab) => {
  const session = await getSession();
  if (!session.focusMode) return;
  // New tabs will be caught by onActivated above
});

// Also inject hotkey guard when tabs finish loading
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

  const session = await getSession();
  if (!session.focusMode) return;

  chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/hotkey-guard.js'],
  }).catch(() => {});
});

// ── Keepalive ─────────────────────────────────────────────────────
// MV3 service workers suspend after ~30s idle, and chrome.windows.onFocusChanged
// (which fires exactly as Chrome loses focus) does not reliably wake a suspended
// worker — so the taskbar flash gets missed unless the worker is already awake.
//
// chrome.alarms cannot keep it CONTINUOUSLY alive: the minimum alarm period (>=30s,
// often clamped to 60s) is >= the 30s idle timeout, leaving dead gaps. Instead we
// "pulse": every 20s call a trivial chrome API, which resets the idle timer. As long
// as the worker is alive the pulse re-arms itself; and because the worker re-runs its
// top-level code on every wake, the pulse is restarted whenever an event wakes it.
// A backup alarm guarantees the worker is woken (and the pulse restarted) periodically.

let _keepAliveTimer = null;

async function keepAlivePulse() {
  const { focusMode } = await getSession();
  if (!focusMode) { _keepAliveTimer = null; return; }
  try { await chrome.runtime.getPlatformInfo(); } catch (e) {} // resets idle timer
  _keepAliveTimer = setTimeout(keepAlivePulse, 20000);
}

function startKeepAlive() {
  chrome.alarms.create('dgdb-keepalive', { periodInMinutes: 1 }); // backup waker
  if (!_keepAliveTimer) keepAlivePulse();
}

function stopKeepAlive() {
  chrome.alarms.clear('dgdb-keepalive');
  if (_keepAliveTimer) { clearTimeout(_keepAliveTimer); _keepAliveTimer = null; }
}

// On every wake (alarm or startup), restart the pulse if Focus Mode is active.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dgdb-keepalive' && !_keepAliveTimer) keepAlivePulse();
});
chrome.runtime.onStartup.addListener(() => { if (!_keepAliveTimer) keepAlivePulse(); });

// The worker also re-runs this top-level line on every cold start / wake.
if (!_keepAliveTimer) keepAlivePulse();

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

    case 'clearLog': {
      await setLocal({ log: [] });
      return { ok: true };
    }

    case 'goBack': {
      // Interstitial: go back to returnUrl
      if (sender.tab?.id && msg.returnUrl) {
        chrome.tabs.update(sender.tab.id, { url: msg.returnUrl }).catch(() => {});
        // Re-mark as focus tab if it was one
        const session = await getSession();
        const wasFocus = session.focusTabs.some(ft => ft.tabId === sender.tab.id);
        if (!wasFocus) {
          const returnDomain = normalizeDomain(msg.returnUrl);
          // Check if returnUrl belongs to a focus domain
          const focusDomains = session.focusTabs.map(ft => normalizeDomain(ft.url));
          if (focusDomains.includes(returnDomain)) {
            // Fine, they're going back
          }
        }
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
        // Navigate back to destination (they chose to add this)
        if (msg.destUrl && sender.tab.id) {
          chrome.tabs.update(sender.tab.id, { url: msg.destUrl }).catch(() => {});
        }
      } else if (msg.type === 'domain' && msg.domain) {
        const { whitelist } = await getLocal();
        if (!whitelist.includes(msg.domain)) {
          await setLocal({ whitelist: [...whitelist, msg.domain] });
          await addLog('domain whitelisted', msg.domain);
        }
        if (msg.destUrl && sender.tab?.id) {
          chrome.tabs.update(sender.tab.id, { url: msg.destUrl }).catch(() => {});
        }
      }
      return { ok: true };
    }

    case 'endFocusMode': {
      await disableFocusMode();
      if (msg.destUrl && sender.tab?.id) {
        chrome.tabs.update(sender.tab.id, { url: msg.destUrl }).catch(() => {});
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

    default:
      return { ok: false, error: 'unknown action' };
  }
}

// ── Init ──────────────────────────────────────────────────────────

// Set badge on install/startup
chrome.runtime.onInstalled.addListener(() => setBadge(false));
chrome.runtime.onStartup.addListener(() => setBadge(false));
