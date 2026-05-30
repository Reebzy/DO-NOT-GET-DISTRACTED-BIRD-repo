// DONT GET DISTRACTED BIRD — Content Script: Hotkey guard + title flash + last-tab modal
// Injected into all tabs when Focus Mode is ON.

(function() {
  if (window.__dgdbGuardActive) return;
  window.__dgdbGuardActive = true;

  let titleFlashInterval = null;
  const originalTitle = document.title;

  // ── FM-02: Title flash ──────────────────────────────────────────
  function startTitleFlash() {
    if (titleFlashInterval) return;
    let toggle = false;
    titleFlashInterval = setInterval(() => {
      document.title = toggle ? '⚠️ Get Back to Work!' : originalTitle;
      toggle = !toggle;
    }, 1000);
  }

  function stopTitleFlash() {
    if (titleFlashInterval) {
      clearInterval(titleFlashInterval);
      titleFlashInterval = null;
    }
    document.title = originalTitle;
  }

  // ── FM-04: Hotkey suppression ───────────────────────────────────
  // NOTE: Ctrl+T/N/W cannot be intercepted at the system level — Chrome handles
  // these before the page receives them in most contexts. This suppresses them
  // when the page has focus (e.g. typing in a page, clicking links).
  // Ctrl+W is handled separately via the last-tab guard below.
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;

    const key = e.key.toLowerCase();

    // Suppress: Ctrl+T, Ctrl+N, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+1-9
    const suppress = (
      key === 't' ||
      key === 'n' ||
      key === 'tab' ||
      (key >= '1' && key <= '9')
    );

    if (suppress) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    // Ctrl+W — check if this is the last focus tab
    if (key === 'w') {
      e.preventDefault();
      e.stopImmediatePropagation();
      showLastTabGuard();
    }
  }, true);

  // ── FM-04: Last-tab close warning modal ──────────────────────────
  function showLastTabGuard() {
    if (document.getElementById('dgdb-modal-scrim')) return;

    chrome.runtime.sendMessage({ action: 'isLastFocusTab' }, (resp) => {
      if (!resp?.isLast) {
        // Not the last focus tab — close this tab via the service worker (we already prevented the default)
        chrome.runtime.sendMessage({ action: 'closeCurrentTab' });
        return;
      }
      renderLastTabModal();
    });
  }

  function renderLastTabModal() {
    if (document.getElementById('dgdb-modal-scrim')) return;

    const birdSVG = `<svg width="22" height="22" viewBox="0 0 240 240" aria-hidden="true">
      <path d="M150 18 L139 43 L167 31 C181 72 190 112 182 151 L181 156 L231 207 L167 197 C150 193 131 189 117 181 C103 173 92 157 86 135 C83 125 82 118 85 110 L56 117 L18 107 L58 97 C92 68 116 30 150 18 Z" fill="#c41a1a"/>
      <path d="M58 97 C78 84 92 80 99 84 C103 100 101 110 92 118 L56 117 Z" fill="#100d0b"/>
      <path d="M122 110 L196 130 L168 170 L146 138 Z" fill="#8f1010"/>
      <path d="M101 88 L108 93 L101 98 L95 93 Z" fill="#f4f1ea"/>
    </svg>`;

    const scrim = document.createElement('div');
    scrim.id = 'dgdb-modal-scrim';
    scrim.style.cssText = `
      position:fixed;inset:0;z-index:2147483647;background:rgba(16,13,11,.62);
      display:grid;place-items:center;font-family:Archivo,system-ui,sans-serif;
    `;
    scrim.innerHTML = `
      <div style="width:380px;background:#f4f1ea;color:#100d0b;border-radius:6px;overflow:hidden;
        box-shadow:0 2px 2px rgba(16,13,11,.20);border:1px solid #d4cdbd;">
        <div style="display:flex;align-items:center;gap:10px;padding:16px 18px 0;">
          ${birdSVG}
          <span style="font-family:'Archivo Expanded',Archivo,sans-serif;font-weight:800;font-size:13px;">DONT GET DISTRACTED BIRD</span>
        </div>
        <div style="padding:12px 18px 0;">
          <h2 style="font-family:'Archivo Expanded',Archivo,sans-serif;font-weight:800;font-size:20px;margin:6px 0 6px;">Close it?</h2>
          <p style="font-size:13px;color:#8a817b;margin:0;line-height:1.5;">
            This is your <strong style="color:#100d0b;">last focus tab.</strong> Closing it will end your Focus Mode session.
          </p>
        </div>
        <div style="display:flex;gap:10px;padding:18px;">
          <button id="dgdb-end-close" style="flex:1;background:#c41a1a;color:#fff;border:none;padding:12px;
            font-family:'Archivo Expanded',Archivo,sans-serif;font-weight:800;font-size:13px;border-radius:3px;
            letter-spacing:.03em;cursor:pointer;">End session &amp; close</button>
          <button id="dgdb-cancel" style="flex:1;background:transparent;color:#100d0b;border:1px solid #d4cdbd;
            padding:11px;font-family:Archivo,sans-serif;font-weight:600;font-size:13px;border-radius:3px;cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(scrim);

    document.getElementById('dgdb-end-close').addEventListener('click', () => {
      scrim.remove();
      chrome.runtime.sendMessage({ action: 'endFocusModeAndClose' });
    });

    document.getElementById('dgdb-cancel').addEventListener('click', () => {
      scrim.remove();
    });

    // Not dismissible by clicking outside — only via buttons (NFR-D-09)
  }

  // ── Message listener ────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'startTitleFlash') startTitleFlash();
    if (msg.action === 'stopTitleFlash') stopTitleFlash();
    if (msg.action === 'focusOff') {
      stopTitleFlash();
      window.__dgdbGuardActive = false;
    }
  });
})();
