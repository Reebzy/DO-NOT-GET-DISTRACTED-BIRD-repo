// DONT GET DISTRACTED BIRD — Popup controller

// ── State ─────────────────────────────────────────────────────────

let state = {
  focusMode: false,
  focusTabs: [],
  whitelist: [],
  countdownSecs: 5,
  customHotkey: 'Ctrl+Shift+F',
  pauseHotkey: 'Ctrl+Shift+Space',
  log: [],
};

// ── Init ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const resp = await msg({ action: 'getState' });
  if (resp?.ok) {
    state = { ...state, ...resp.state };
  }
  render();
  bindEvents();
});

function msg(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (r) => resolve(r));
  });
}

// ── Render ────────────────────────────────────────────────────────

function render() {
  renderToggle();
  renderFocusTabs();
  renderWhitelist();
  renderCountdown();
  renderHotkey();
  renderLog();
}

function renderToggle() {
  const toggle = document.getElementById('focus-toggle');
  const on = state.focusMode;
  toggle.dataset.on = on ? 'true' : 'false';
  toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function renderFocusTabs() {
  const label = document.getElementById('focus-tabs-label');
  const list = document.getElementById('focus-tabs-list');
  const on = state.focusMode;
  const tabs = state.focusTabs || [];

  if (!on) {
    label.textContent = 'Distractions Allowed';
    list.innerHTML = `<div class="no-tabs" style="padding-bottom:10px;">no active session.</div>`;
    return;
  }

  label.textContent = tabs.length > 0 ? `Focus tabs · ${tabs.length}` : 'Focus tabs';
  list.innerHTML = '';

  if (tabs.length === 0) {
    list.innerHTML = `<div class="no-tabs">add a tab or navigate somewhere.</div>`;
    return;
  }

  for (const ft of tabs) {
    const row = document.createElement('div');
    row.className = 'tab-row';
    row.innerHTML = `
      <span class="tab-tick"></span>
      <div class="tab-info">
        <div class="tab-title">${esc(ft.title || ft.url)}</div>
        <div class="tab-url">${esc(ft.url)}</div>
      </div>
      <button class="tab-remove" data-tabid="${ft.tabId}" aria-label="Remove ${esc(ft.title || ft.url)} from focus">×</button>
    `;
    list.appendChild(row);
  }

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.height = '10px';
  list.appendChild(spacer);
}

function renderWhitelist() {
  const listEl = document.getElementById('wl-list');
  const domains = state.whitelist || [];
  listEl.innerHTML = '';

  if (domains.length === 0) {
    listEl.innerHTML = `<div class="wl-empty">no domains yet.</div>`;
    return;
  }

  for (const d of domains) {
    const row = document.createElement('div');
    row.className = 'wl-domain';
    row.innerHTML = `<span class="name">${esc(d)}</span><button class="wl-remove" data-domain="${esc(d)}" aria-label="Remove ${esc(d)}">×</button>`;
    listEl.appendChild(row);
  }
}

function renderCountdown() {
  const seg = document.getElementById('countdown-seg');
  const active = state.countdownSecs || 5;
  seg.querySelectorAll('button').forEach(btn => {
    const secs = Number(btn.dataset.secs);
    btn.setAttribute('aria-pressed', secs === active ? 'true' : 'false');
  });
}

function renderHotkey() {
  const hotkey = state.customHotkey || 'Ctrl+Shift+F';
  const display = document.getElementById('hotkey-display');
  if (display) {
    display.textContent = hotkey;
  }

  const pauseHotkey = state.pauseHotkey || 'Ctrl+Shift+Space';
  const pauseDisplay = document.getElementById('pause-hotkey-display');
  if (pauseDisplay) {
    pauseDisplay.textContent = pauseHotkey;
  }
}

function renderLog() {
  const listEl = document.getElementById('log-list');
  const clearWrap = document.getElementById('log-clear-wrap');
  const entries = state.log || [];

  if (entries.length === 0) {
    listEl.innerHTML = `<div class="log-empty">no events yet.</div>`;
    clearWrap.style.display = 'none';
    return;
  }

  clearWrap.style.display = 'block';
  listEl.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'log-list';
  for (const e of entries) {
    const line = document.createElement('div');
    line.className = 'log-entry';
    line.innerHTML = `<span class="time">${esc(e.time)}</span> · ${esc(e.event)}${e.detail ? ' · ' + esc(e.detail) : ''}`;
    container.appendChild(line);
  }
  listEl.appendChild(container);
}

// ── Events ────────────────────────────────────────────────────────

function bindEvents() {
  // Toggle
  document.getElementById('focus-toggle').addEventListener('click', async () => {
    const resp = await msg({ action: 'toggleFocus' });
    if (resp?.ok) {
      state = { ...state, ...resp.state };
      render();
    }
  });

  // Remove focus tab
  document.getElementById('focus-tabs-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.tab-remove');
    if (!btn) return;
    const tabId = Number(btn.dataset.tabid);
    await msg({ action: 'removeFocusTab', tabId });
    state.focusTabs = state.focusTabs.filter(ft => ft.tabId !== tabId);
    renderFocusTabs();
  });

  // Collapsible: whitelist
  bindCollapsible('wl-toggle', 'wl-body');
  // Collapsible: settings
  bindCollapsible('settings-toggle', 'settings-body');
  // Collapsible: log — open also shows clear button in header
  bindCollapsible('log-toggle', 'log-body', () => renderLog());

  // Whitelist add
  document.getElementById('wl-add-btn').addEventListener('click', addDomain);
  document.getElementById('wl-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDomain();
  });

  // Whitelist remove
  document.getElementById('wl-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('.wl-remove');
    if (!btn) return;
    const domain = btn.dataset.domain;
    await msg({ action: 'removeDomain', domain });
    state.whitelist = state.whitelist.filter(d => d !== domain);
    renderWhitelist();
  });

  // Countdown
  document.getElementById('countdown-seg').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-secs]');
    if (!btn) return;
    const secs = Number(btn.dataset.secs);
    await msg({ action: 'setCountdown', secs });
    state.countdownSecs = secs;
    renderCountdown();
  });

  // Hotkey record
  document.getElementById('hotkey-record-btn').addEventListener('click', () => {
    startHotkeyRecording('toggle');
  });

  // Hotkey reset
  document.getElementById('hotkey-reset-btn').addEventListener('click', async () => {
    await msg({ action: 'setHotkey', hotkey: 'Ctrl+Shift+F' });
    state.customHotkey = 'Ctrl+Shift+F';
    renderHotkey();
    showHotkeyStatus('Reset to default', false);
  });

  // Pause hotkey record
  document.getElementById('pause-hotkey-record-btn').addEventListener('click', () => {
    startHotkeyRecording('pause');
  });

  // Pause hotkey reset
  document.getElementById('pause-hotkey-reset-btn').addEventListener('click', async () => {
    await msg({ action: 'setPauseHotkey', hotkey: 'Ctrl+Shift+Space' });
    state.pauseHotkey = 'Ctrl+Shift+Space';
    renderHotkey();
    showHotkeyStatus('Reset to default', false);
  });

  // Log clear
  document.getElementById('log-clear-btn').addEventListener('click', async (e) => {
    e.stopPropagation(); // don't collapse the section
    await msg({ action: 'clearLog' });
    state.log = [];
    renderLog();
  });
}

async function addDomain() {
  const input = document.getElementById('wl-input');
  let domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  if (!domain) return;
  await msg({ action: 'addDomain', domain });
  if (!state.whitelist.includes(domain)) state.whitelist.push(domain);
  input.value = '';
  renderWhitelist();
}

function bindCollapsible(toggleId, bodyId, onOpen) {
  const toggle = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  const icon = toggle.querySelector('.col-icon');

  toggle.addEventListener('click', (e) => {
    // Don't collapse if clicking the clear button inside
    if (e.target.closest('.log-clear-btn')) return;

    const open = !body.hidden;
    body.hidden = open;
    icon.textContent = open ? '+' : '−';
    toggle.setAttribute('aria-expanded', open ? 'false' : 'true');

    // Show/hide clear wrap when log section is open
    if (bodyId === 'log-body') {
      const clearWrap = document.getElementById('log-clear-wrap');
      if (!open && (state.log || []).length > 0) {
        clearWrap.style.display = 'block';
      } else {
        clearWrap.style.display = 'none';
      }
    }

    if (!open && onOpen) onOpen();
  });
}

// ── Hotkey recording ─────────────────────────────────────────────

let isRecordingHotkey = false;
let recordingType = null;

function startHotkeyRecording(type = 'toggle') {
  if (isRecordingHotkey) return;
  isRecordingHotkey = true;
  recordingType = type;

  const btnId = type === 'pause' ? 'pause-hotkey-record-btn' : 'hotkey-record-btn';
  const displayId = type === 'pause' ? 'pause-hotkey-display' : 'hotkey-display';

  const btn = document.getElementById(btnId);
  const display = document.getElementById(displayId);
  const statusEl = document.getElementById('hotkey-status');

  btn.style.background = '#f3d9d9';
  btn.style.borderColor = '#c41a1a';
  display.textContent = 'Press keys...';
  statusEl.style.display = 'none';

  const recordHandler = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();

    if (e.key === 'Escape') {
      stopHotkeyRecording();
      return;
    }

    if (e.key === 'Enter') {
      stopHotkeyRecording();
      return;
    }

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (key !== 'Control' && key !== 'Alt' && key !== 'Shift' && key !== 'Meta') {
      parts.push(key);
    }

    if (parts.length > 0) {
      const hotkey = parts.join('+');
      saveHotkey(hotkey);
      stopHotkeyRecording();
    }
  };

  document.addEventListener('keydown', recordHandler, true);

  // Store handler reference for cleanup
  btn._recordHandler = recordHandler;
}

function stopHotkeyRecording() {
  if (!isRecordingHotkey) return;
  isRecordingHotkey = false;

  const btnId = recordingType === 'pause' ? 'pause-hotkey-record-btn' : 'hotkey-record-btn';
  const displayId = recordingType === 'pause' ? 'pause-hotkey-display' : 'hotkey-display';

  const btn = document.getElementById(btnId);
  const display = document.getElementById(displayId);

  if (btn._recordHandler) {
    document.removeEventListener('keydown', btn._recordHandler, true);
    btn._recordHandler = null;
  }

  btn.style.background = '';
  btn.style.borderColor = '';

  if (recordingType === 'pause') {
    display.textContent = state.pauseHotkey || 'Ctrl+Shift+P';
  } else {
    display.textContent = state.customHotkey || 'Ctrl+Shift+F';
  }

  recordingType = null;
}

async function saveHotkey(hotkey) {
  const reserved = ['Ctrl+T', 'Ctrl+N', 'Ctrl+W', 'Ctrl+Tab', 'Ctrl+Shift+Tab'];
  if (reserved.some(r => r.toLowerCase() === hotkey.toLowerCase())) {
    showHotkeyStatus('Reserved by Chrome', true);
    return;
  }

  if (recordingType === 'pause') {
    await msg({ action: 'setPauseHotkey', hotkey });
    state.pauseHotkey = hotkey;
  } else {
    await msg({ action: 'setHotkey', hotkey });
    state.customHotkey = hotkey;
  }

  renderHotkey();
  showHotkeyStatus('Saved', false);
}

function showHotkeyStatus(msg, isError) {
  const statusEl = document.getElementById('hotkey-status');
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#c41a1a' : '#100d0b';
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 2000);
}

// ── Utils ─────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
