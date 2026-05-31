// DONT GET DISTRACTED BIRD — Focus Mode Widget
// Small floating widget that appears when focus mode is active

let widgetElement = null;
let timerInterval = null;

function getBirdSVG() {
  return `<svg width="24" height="24" viewBox="0 0 240 240" aria-hidden="true" style="flex-shrink:0;">
    <path d="M150 18 L139 43 L167 31 C181 72 190 112 182 151 L181 156 L231 207 L167 197 C150 193 131 189 117 181 C103 173 92 157 86 135 C83 125 82 118 85 110 L56 117 L18 107 L58 97 C92 68 116 30 150 18 Z" fill="#c41a1a"/>
    <path d="M58 97 C78 84 92 80 99 84 C103 100 101 110 92 118 L56 117 Z" fill="#100d0b"/>
    <path d="M122 110 L196 130 L168 170 L146 138 Z" fill="#8f1010"/>
    <path d="M101 88 L108 93 L101 98 L95 93 Z" fill="#f4f1ea"/>
  </svg>`;
}

function createWidget() {
  // Create container
  const container = document.createElement('div');
  container.id = 'dgdb-widget';
  container.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483645;
    background: #f4f1ea;
    border: 1px solid #e2dccf;
    border-radius: 3px;
    display: flex;
    align-items: stretch;
    box-shadow: 0 2px 2px rgba(16,13,11,.20);
    font-family: Archivo, system-ui, sans-serif;
    cursor: move;
    overflow: hidden;
  `;

  // Logo panel (left side, fills height)
  const logoPanel = document.createElement('div');
  logoPanel.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 40px;
    background: #100d0b;
    padding: 0;
  `;
  logoPanel.innerHTML = getBirdSVG();

  // Content panel (right side)
  const content = document.createElement('div');
  content.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
  `;

  // Timer
  const timer = document.createElement('div');
  timer.id = 'dgdb-widget-timer';
  timer.style.cssText = `
    font-family: JetBrains Mono, monospace;
    font-weight: 700;
    font-size: 13px;
    color: #100d0b;
    min-width: 45px;
  `;
  timer.textContent = '00:00';

  // Pause button (no border)
  const pauseBtn = document.createElement('div');
  pauseBtn.id = 'dgdb-widget-pause';
  pauseBtn.setAttribute('title', 'Pause focus mode');
  pauseBtn.style.cssText = `
    font-size: 16px;
    color: #100d0b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    transition: color 110ms cubic-bezier(.2,.7,.3,1);
  `;
  pauseBtn.textContent = '⏸';

  pauseBtn.addEventListener('mouseenter', () => {
    pauseBtn.style.color = '#c41a1a';
  });

  pauseBtn.addEventListener('mouseleave', () => {
    pauseBtn.style.color = '#100d0b';
  });

  pauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: 'togglePauseFocusMode' }).then(resp => {
      if (resp?.ok) {
        updatePauseButton(resp.paused);
      }
    }).catch(() => {});
  });

  // End button (no border)
  const endBtn = document.createElement('div');
  endBtn.id = 'dgdb-widget-end';
  endBtn.setAttribute('title', 'End focus mode');
  endBtn.style.cssText = `
    font-size: 16px;
    color: #100d0b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    transition: color 110ms cubic-bezier(.2,.7,.3,1);
  `;
  endBtn.textContent = '×';

  endBtn.addEventListener('mouseenter', () => {
    endBtn.style.color = '#c41a1a';
  });

  endBtn.addEventListener('mouseleave', () => {
    endBtn.style.color = '#100d0b';
  });

  endBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: 'endFocusMode' }).catch(() => {});
  });

  // Assemble widget
  content.appendChild(timer);
  content.appendChild(pauseBtn);
  content.appendChild(endBtn);
  container.appendChild(logoPanel);
  container.appendChild(content);

  return container;
}

function injectWidget() {
  if (widgetElement) return;

  widgetElement = createWidget();
  document.body.appendChild(widgetElement);
  makeDraggable(widgetElement);

  // Start timer updates
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

function removeWidget() {
  if (widgetElement) {
    widgetElement.remove();
    widgetElement = null;
  }
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

async function updateTimer() {
  if (!widgetElement) return;

  const timerEl = document.getElementById('dgdb-widget-timer');
  if (!timerEl) return;

  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getElapsedTime' });
    if (resp?.ok) {
      // Timed focus mode counts DOWN from the chosen minutes; otherwise count up.
      const secs = resp.timed
        ? Math.max(0, resp.remainingSecs || 0)
        : (resp.elapsedSecs || 0);
      const mins = Math.floor(secs / 60);
      const secsLeft = secs % 60;
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secsLeft).padStart(2, '0')}`;
      // Flag the final stretch of a timed session in brand red.
      timerEl.style.color = (resp.timed && secs <= 60) ? '#c41a1a' : '#100d0b';
    }
  } catch (err) {
    // Widget disconnected or extension context invalidated
    removeWidget();
  }
}

function updatePauseButton(paused) {
  const pauseBtn = document.getElementById('dgdb-widget-pause');
  const container = document.getElementById('dgdb-widget');
  if (!pauseBtn || !container) return;

  if (paused) {
    pauseBtn.textContent = '▶';
    pauseBtn.setAttribute('title', 'Resume focus mode');
    pauseBtn.style.opacity = '0.6';
  } else {
    pauseBtn.textContent = '⏸';
    pauseBtn.setAttribute('title', 'Pause focus mode');
    pauseBtn.style.opacity = '1';
  }
}

// ── Start Button Widget (appears when focus mode is OFF) ────────────

let startButtonElement = null;

function createStartButton() {
  const container = document.createElement('div');
  container.id = 'dgdb-start-widget';
  container.style.cssText = `
    position: fixed;
    top: 12px;
    right: 12px;
    z-index: 2147483645;
    width: 200px;
    background: #f4f1ea;
    border: 1px solid #e2dccf;
    border-radius: 3px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 2px rgba(16,13,11,.20);
    font-family: Archivo, system-ui, sans-serif;
    overflow: hidden;
  `;

  // Top row — the drag handle.
  const topRow = document.createElement('div');
  topRow.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: move;
  `;

  const logo = document.createElement('div');
  logo.innerHTML = getBirdSVG();
  logo.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    background: #100d0b;
    border-radius: 3px;
  `;

  const startBtn = document.createElement('div');
  startBtn.style.cssText = `
    font-size: 16px;
    color: #100d0b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    transition: color 110ms cubic-bezier(.2,.7,.3,1);
  `;
  startBtn.setAttribute('title', 'Start focus mode');
  startBtn.textContent = '▶';

  startBtn.addEventListener('mouseenter', () => {
    startBtn.style.color = '#c41a1a';
  });

  startBtn.addEventListener('mouseleave', () => {
    startBtn.style.color = '#100d0b';
  });

  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: 'toggleFocus' }).catch(() => {});
  });

  // Expand-up chevron (right side) — reveals the timed focus panel.
  const chevron = document.createElement('div');
  chevron.id = 'dgdb-start-chevron';
  chevron.setAttribute('title', 'Timed focus settings');
  chevron.style.cssText = `
    margin-left: auto;
    color: #100d0b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    transition: color 110ms cubic-bezier(.2,.7,.3,1), transform 160ms cubic-bezier(.2,.7,.3,1);
  `;
  chevron.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 15l6-6 6 6" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  chevron.addEventListener('mouseenter', () => { chevron.style.color = '#c41a1a'; });
  chevron.addEventListener('mouseleave', () => { chevron.style.color = '#100d0b'; });

  const panel = createTimedFocusPanel();

  chevron.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'flex';
    chevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  topRow.appendChild(logo);
  topRow.appendChild(startBtn);
  topRow.appendChild(chevron);
  container.appendChild(topRow);
  container.appendChild(panel);

  // Only the top row initiates dragging — the panel stays interactive.
  container._dragHandle = topRow;
  return container;
}

function injectStartButton() {
  if (startButtonElement) return;
  startButtonElement = createStartButton();
  document.body.appendChild(startButtonElement);
  makeDraggable(startButtonElement, startButtonElement._dragHandle);
}

// ── Timed focus panel (simplified in-widget version of the popup menu) ──

function createTimedFocusPanel() {
  const panel = document.createElement('div');
  panel.id = 'dgdb-tf-panel';
  panel.style.cssText = `
    display: none;
    flex-direction: column;
    gap: 9px;
    padding: 10px 12px;
    border-top: 1px solid #e2dccf;
    background: #f4f1ea;
  `;

  // Row 1 — label + toggle
  const row1 = document.createElement('div');
  row1.style.cssText = `display: flex; align-items: center; gap: 10px;`;
  const lbl1 = document.createElement('span');
  lbl1.textContent = 'Timed focus';
  lbl1.style.cssText = `font-size: 11.5px; color: #100d0b; font-weight: 600; flex: 1; white-space: nowrap;`;
  const toggle = buildMiniToggle();
  row1.appendChild(lbl1);
  row1.appendChild(toggle.el);

  // Row 2 — minutes (only when enabled)
  const row2 = document.createElement('div');
  row2.style.cssText = `display: none; align-items: center; gap: 10px;`;
  const lbl2 = document.createElement('label');
  lbl2.textContent = 'Minutes';
  lbl2.setAttribute('for', 'dgdb-tf-minutes');
  lbl2.style.cssText = `font-size: 11.5px; color: #100d0b; font-weight: 600; flex: 1;`;
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.id = 'dgdb-tf-minutes';
  input.value = '15';
  input.style.cssText = `
    width: 56px; text-align: center; font-family: 'JetBrains Mono', monospace;
    font-size: 12px; padding: 6px 8px; border: 1px solid #e2dccf; border-radius: 3px;
    background: #fff; color: #100d0b; outline: none;
  `;
  input.addEventListener('focus', () => { input.style.borderColor = '#c41a1a'; });
  input.addEventListener('blur', () => { input.style.borderColor = '#e2dccf'; });
  row2.appendChild(lbl2);
  row2.appendChild(input);

  panel.appendChild(row1);
  panel.appendChild(row2);

  function applyState(enabled, minutes) {
    toggle.set(enabled);
    row2.style.display = enabled ? 'flex' : 'none';
    if (document.activeElement !== input) input.value = String(minutes);
  }

  // Populate from stored state so the widget mirrors the popup.
  chrome.runtime.sendMessage({ action: 'getState' }).then((resp) => {
    if (resp?.ok && resp.state) {
      applyState(!!resp.state.timedFocusEnabled, resp.state.timedFocusMinutes ?? 15);
    }
  }).catch(() => {});

  toggle.el.addEventListener('click', (e) => {
    e.stopPropagation();
    const next = !toggle.isOn();
    toggle.set(next);
    row2.style.display = next ? 'flex' : 'none';
    chrome.runtime.sendMessage({ action: 'setTimedFocus', enabled: next }).catch(() => {});
  });

  // Keep typing/clicks inside the input from bubbling to the drag handle.
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); });
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') input.blur();
  });
  input.addEventListener('change', commitMinutes);
  input.addEventListener('blur', commitMinutes);

  function commitMinutes() {
    chrome.runtime.sendMessage({ action: 'setTimedFocus', minutes: input.value }).then((resp) => {
      if (resp?.ok && typeof resp.timedFocusMinutes === 'number') {
        input.value = String(resp.timedFocusMinutes);
      }
    }).catch(() => {});
  }

  return panel;
}

// Compact ON/OFF toggle styled to match the design system, built with inline styles
// (content scripts can't rely on the popup's stylesheet being present).
function buildMiniToggle() {
  const el = document.createElement('div');
  el.setAttribute('role', 'switch');
  el.style.cssText = `
    display: inline-flex; align-items: center; height: 26px; border: 2px solid #d4cdbd;
    border-radius: 3px; overflow: hidden; background: #fff; cursor: pointer;
    user-select: none; flex-shrink: 0;
  `;
  const on = document.createElement('span');
  const off = document.createElement('span');
  on.textContent = 'ON';
  off.textContent = 'OFF';
  const segCss = `width: 34px; height: 100%; display: grid; place-items: center;
    font-family: 'Archivo Expanded', Archivo, sans-serif; font-weight: 800; font-size: 10px; letter-spacing: .06em;`;
  on.style.cssText = segCss;
  off.style.cssText = segCss;
  el.appendChild(on);
  el.appendChild(off);

  let state = false;
  function render() {
    el.setAttribute('aria-checked', state ? 'true' : 'false');
    if (state) {
      el.style.borderColor = '#c41a1a';
      on.style.background = '#c41a1a'; on.style.color = '#fff';
      off.style.background = 'transparent'; off.style.color = '#b3a99c';
    } else {
      el.style.borderColor = '#d4cdbd';
      on.style.background = 'transparent'; on.style.color = '#b3a99c';
      off.style.background = '#d9d3c6'; off.style.color = '#100d0b';
    }
  }
  render();

  return {
    el,
    set: (v) => { state = !!v; render(); },
    isOn: () => state,
  };
}

function removeStartButton() {
  if (startButtonElement) {
    startButtonElement.remove();
    startButtonElement = null;
  }
}

// ── Drag functionality ──────────────────────────────────────────

function makeDraggable(element, handle = element) {
  let offsetX = 0;
  let offsetY = 0;
  let isDown = false;

  handle.addEventListener('mousedown', (e) => {
    isDown = true;
    offsetX = e.clientX - element.getBoundingClientRect().left;
    offsetY = e.clientY - element.getBoundingClientRect().top;
    handle.style.cursor = 'grabbing';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    element.style.left = x + 'px';
    element.style.right = 'auto';
    element.style.top = y + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDown = false;
    handle.style.cursor = 'move';
  });

  handle.addEventListener('mouseleave', () => {
    if (isDown) {
      isDown = false;
      handle.style.cursor = 'move';
    }
  });
}

// Listen for focus state changes
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'focusOn') {
    injectWidget();
    removeStartButton();
  } else if (msg.action === 'focusOff') {
    removeWidget();
    injectStartButton();
  } else if (msg.action === 'focusPausedChanged') {
    updatePauseButton(msg.paused);
  }
});

// Check initial state on load
setTimeout(async () => {
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getState' });
    if (resp?.ok && resp?.state) {
      if (resp.state.focusMode) {
        injectWidget();
        if (resp.state.focusPaused) {
          updatePauseButton(true);
        }
      } else {
        injectStartButton();
      }
    }
  } catch (err) {
    console.log('[DGDB] Widget init error:', err.message);
  }
}, 100);
