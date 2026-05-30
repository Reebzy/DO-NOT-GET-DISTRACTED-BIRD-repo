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
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 2px rgba(16,13,11,.20);
    font-family: Archivo, system-ui, sans-serif;
    cursor: move;
  `;

  // Logo with black background
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

  // Spacer
  const spacer = document.createElement('div');
  spacer.style.cssText = 'flex: 1;';

  // Pause button
  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'dgdb-widget-pause';
  pauseBtn.setAttribute('title', 'Pause focus mode');
  pauseBtn.style.cssText = `
    background: transparent;
    border: 1px solid #d4cdbd;
    border-radius: 2px;
    padding: 6px 8px;
    cursor: pointer;
    font-size: 13px;
    color: #100d0b;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    transition: background 110ms cubic-bezier(.2,.7,.3,1), color 110ms cubic-bezier(.2,.7,.3,1), border-color 110ms cubic-bezier(.2,.7,.3,1);
    flex-shrink: 0;
  `;
  pauseBtn.textContent = '⏸';

  pauseBtn.addEventListener('mouseenter', () => {
    pauseBtn.style.background = '#c41a1a';
    pauseBtn.style.color = '#fff';
    pauseBtn.style.borderColor = '#c41a1a';
  });

  pauseBtn.addEventListener('mouseleave', () => {
    pauseBtn.style.background = 'transparent';
    pauseBtn.style.color = '#100d0b';
    pauseBtn.style.borderColor = '#d4cdbd';
  });

  pauseBtn.addEventListener('click', async () => {
    const resp = await chrome.runtime.sendMessage({ action: 'togglePauseFocusMode' });
    if (resp?.ok) {
      updatePauseButton(resp.paused);
    }
  });

  // End button
  const endBtn = document.createElement('button');
  endBtn.id = 'dgdb-widget-end';
  endBtn.setAttribute('title', 'End focus mode');
  endBtn.style.cssText = `
    background: transparent;
    border: 1px solid #d4cdbd;
    border-radius: 2px;
    padding: 6px 8px;
    cursor: pointer;
    font-size: 13px;
    color: #100d0b;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    transition: background 110ms cubic-bezier(.2,.7,.3,1), color 110ms cubic-bezier(.2,.7,.3,1), border-color 110ms cubic-bezier(.2,.7,.3,1);
    flex-shrink: 0;
  `;
  endBtn.textContent = '×';

  endBtn.addEventListener('mouseenter', () => {
    endBtn.style.background = '#c41a1a';
    endBtn.style.color = '#fff';
    endBtn.style.borderColor = '#c41a1a';
  });

  endBtn.addEventListener('mouseleave', () => {
    endBtn.style.background = 'transparent';
    endBtn.style.color = '#100d0b';
    endBtn.style.borderColor = '#d4cdbd';
  });

  endBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'endFocusMode' }).catch(() => {});
  });

  // Assemble widget
  container.appendChild(logo);
  container.appendChild(timer);
  container.appendChild(spacer);
  container.appendChild(pauseBtn);
  container.appendChild(endBtn);

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
      const secs = resp.elapsedSecs || 0;
      const mins = Math.floor(secs / 60);
      const secsLeft = secs % 60;
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secsLeft).padStart(2, '0')}`;
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
    container.style.opacity = '0.6';
  } else {
    pauseBtn.textContent = '⏸';
    pauseBtn.setAttribute('title', 'Pause focus mode');
    container.style.opacity = '1';
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
    background: #f4f1ea;
    border: 1px solid #e2dccf;
    border-radius: 3px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 2px rgba(16,13,11,.20);
    font-family: Archivo, system-ui, sans-serif;
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

  container.appendChild(logo);
  container.appendChild(startBtn);
  return container;
}

function injectStartButton() {
  if (startButtonElement) return;
  startButtonElement = createStartButton();
  document.body.appendChild(startButtonElement);
  makeDraggable(startButtonElement);
}

function removeStartButton() {
  if (startButtonElement) {
    startButtonElement.remove();
    startButtonElement = null;
  }
}

// ── Drag functionality ──────────────────────────────────────────

function makeDraggable(element) {
  let offsetX = 0;
  let offsetY = 0;
  let isDown = false;

  element.addEventListener('mousedown', (e) => {
    isDown = true;
    offsetX = e.clientX - element.getBoundingClientRect().left;
    offsetY = e.clientY - element.getBoundingClientRect().top;
    element.style.cursor = 'grabbing';
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
    element.style.cursor = 'move';
  });

  element.addEventListener('mouseleave', () => {
    if (isDown) {
      isDown = false;
      element.style.cursor = 'move';
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
