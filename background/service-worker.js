// DONT GET DISTRACTED BIRD — Background Service Worker (MV3)
// Implements FM-01 through FM-07.

// ── Storage helpers ───────────────────────────────────────────────

const DEFAULT_SESSION = {
  focusMode: false,
  focusTabs: [],   // [{tabId, title, url}]
  lastFocusTabId: null,
  pendingFirstNav: false,
  focusLossTime: null,
  notifId: null,
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
    notifId: null,
  });

  await setBadge(true);
  await addLog('session started', focusTabs[0]?.url || 'pending first navigation');

  // Inject content scripts into all existing tabs
  await injectContentScripts();
}

async function disableFocusMode() {
  const { notifId } = await getSession();
  if (notifId) chrome.notifications.clear(notifId);

  await setSession({
    focusMode: false,
    focusTabs: [],
    lastFocusTabId: null,
    pendingFirstNav: false,
    focusLossTime: null,
    notifId: null,
  });

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

    console.log('[DGDB] confirmed left Chrome — creating notification');

    // Focus truly lost to another application
    const lossTime = Date.now();
    await setSession({ focusLossTime: lossTime });

    // Title flash on focus tabs
    for (const ft of session.focusTabs) {
      chrome.tabs.sendMessage(ft.tabId, { action: 'startTitleFlash' }).catch(() => {});
    }

    // OS notification
    const notifId = 'dgdb-focus-loss-' + Date.now();
    await chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icon-48.png'),
      title: 'DONT GET DISTRACTED BIRD',
      message: 'YOU GOT DISTRACTED WHAT ARE YOU DOING GET BACK HERE DONT DO IT',
      requireInteraction: true,
    }).catch(err => console.warn('[DGDB] notification error:', err));
    await setSession({ notifId });
    await addLog('left window');

  } else {
    // Focus returned (FM-03)
    const { focusLossTime, notifId } = session;
    const awayMs = focusLossTime ? Date.now() - focusLossTime : 0;
    const awaySecs = Math.round(awayMs / 1000);

    // Stop title flash and dismiss notification
    for (const ft of session.focusTabs) {
      chrome.tabs.sendMessage(ft.tabId, { action: 'stopTitleFlash' }).catch(() => {});
    }
    if (notifId) chrome.notifications.clear(notifId);
    await setSession({ focusLossTime: null, notifId: null });

    // Inject return overlay into the active focus tab
    const lastTabId = session.lastFocusTabId;
    if (lastTabId) {
      chrome.scripting.executeScript({
        target: { tabId: lastTabId },
        func: showReturnOverlay,
        args: [awaySecs],
      }).catch(() => {});
    }

    await addLog('returned to window', `away ${awaySecs}s`);
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

// ── Block Ctrl+T (new tab) during focus mode ─────────────────────

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

// ── Block Ctrl+N (new window) during focus mode ───────────────────

chrome.windows.onCreated.addListener(async (window) => {
  const session = await getSession();
  if (!session.focusMode) return;
  if (window.type !== 'normal') return;

  let focusWindowId = null;
  if (session.lastFocusTabId) {
    const focusTab = await chrome.tabs.get(session.lastFocusTabId).catch(() => null);
    if (focusTab) {
      if (focusTab.windowId === window.id) return;
      focusWindowId = focusTab.windowId;
    }
  }

  chrome.windows.remove(window.id).catch(() => {});
  if (focusWindowId) chrome.windows.update(focusWindowId, { focused: true }).catch(() => {});
  await addLog('window blocked', 'new window');
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
      // Restore this tab to its previous URL
      if (sender.tab?.id && msg.returnUrl) {
        chrome.tabs.update(sender.tab.id, { url: msg.returnUrl }).catch(() => {});
      }
      // Switch back to the last active focus tab (tab variant only)
      if (msg.focusTabId) {
        chrome.tabs.update(msg.focusTabId, { active: true }).catch(() => {});
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
      } else if (msg.type === 'domain' && msg.domain) {
        const { whitelist } = await getLocal();
        if (!whitelist.includes(msg.domain)) {
          await setLocal({ whitelist: [...whitelist, msg.domain] });
          await addLog('domain whitelisted', msg.domain);
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

    case 'keepalive':
      return { ok: true };

    default:
      return { ok: false, error: 'unknown action' };
  }
}

// ── Init ──────────────────────────────────────────────────────────

// Set badge on install/startup
chrome.runtime.onInstalled.addListener(() => setBadge(false));
chrome.runtime.onStartup.addListener(() => setBadge(false));
