// DONT GET DISTRACTED BIRD — Interstitial page controller
// FM-05 (tab variant) + FM-06 (domain variant)

(function() {
  const params = new URLSearchParams(location.search);
  const type       = params.get('type') || 'tab';         // 'tab' | 'domain'
  const dest       = params.get('dest') || '';            // destination domain (FM-06)
  const returnUrl  = params.get('returnUrl') || '';       // where to return
  const focusTabId = Number(params.get('focusTabId')) || null; // focus tab to switch to (tab variant)
  const countdown  = Math.max(1, Number(params.get('countdown')) || 5);
  const tabId      = Number(params.get('tabId')) || null;
  const tabTitle   = params.get('tabTitle') || 'this tab';

  let remaining = countdown;
  let timer = null;

  // ── Bird SVG (inline, 600px, red fill) ─────────────────────────
  const BODY  = "M150 18 L139 43 L167 31 C181 72 190 112 182 151 L181 156 L231 207 L167 197 C150 193 131 189 117 181 C103 173 92 157 86 135 C83 125 82 118 85 110 L56 117 L18 107 L58 97 C92 68 116 30 150 18 Z";
  const MASK  = "M58 97 C78 84 92 80 99 84 C103 100 101 110 92 118 L56 117 Z";
  const WING  = "M122 110 L196 130 L168 170 L146 138 Z";
  const EYE   = "M101 88 L108 93 L101 98 L95 93 Z";

  function makeBirdSVG(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 240 240" role="img" aria-label="cardinal">
      <path d="${BODY}" fill="#c41a1a"/>
      <path d="${MASK}" fill="#100d0b"/>
      <path d="${WING}" fill="#8f1010"/>
      <path d="${EYE}" fill="#1a1614"/>
    </svg>`;
  }

  // ── Ring SVG ────────────────────────────────────────────────────
  const RING_SIZE = 132;
  const RING_R = RING_SIZE / 2 - 8;
  const RING_C = 2 * Math.PI * RING_R;

  function makeRing(n, pct) {
    const offset = RING_C * (1 - pct);
    return `<svg width="${RING_SIZE}" height="${RING_SIZE}" viewBox="0 0 ${RING_SIZE} ${RING_SIZE}" class="ring-svg" aria-hidden="true">
      <circle cx="${RING_SIZE/2}" cy="${RING_SIZE/2}" r="${RING_R}" fill="none" stroke="#2a2420" stroke-width="6"/>
      <circle cx="${RING_SIZE/2}" cy="${RING_SIZE/2}" r="${RING_R}" fill="none" stroke="#c41a1a" stroke-width="6"
        stroke-linecap="butt" stroke-dasharray="${RING_C}" stroke-dashoffset="${offset}"
        transform="rotate(-90 ${RING_SIZE/2} ${RING_SIZE/2})"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="'Archivo Expanded', Archivo, sans-serif" font-weight="800"
        font-size="${RING_SIZE * 0.42}" fill="#c41a1a" class="ring-text">${n}</text>
    </svg>`;
  }

  function makeRingAnimated() {
    const startOffset = 0;
    const endOffset = RING_C;
    const animationDuration = countdown;

    return `<svg width="${RING_SIZE}" height="${RING_SIZE}" viewBox="0 0 ${RING_SIZE} ${RING_SIZE}" class="ring-svg ring-animated" aria-hidden="true">
      <defs>
        <style>
          @keyframes ringCountdown {
            from { stroke-dashoffset: 0; }
            to { stroke-dashoffset: ${endOffset}; }
          }
          .ring-progress {
            animation: ringCountdown ${animationDuration}s linear forwards;
          }
        </style>
      </defs>
      <circle cx="${RING_SIZE/2}" cy="${RING_SIZE/2}" r="${RING_R}" fill="none" stroke="#2a2420" stroke-width="6"/>
      <circle cx="${RING_SIZE/2}" cy="${RING_SIZE/2}" r="${RING_R}" fill="none" stroke="#c41a1a" stroke-width="6"
        stroke-linecap="butt" stroke-dasharray="${RING_C}" stroke-dashoffset="0"
        transform="rotate(-90 ${RING_SIZE/2} ${RING_SIZE/2})" class="ring-progress"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="'Archivo Expanded', Archivo, sans-serif" font-weight="800"
        font-size="${RING_SIZE * 0.42}" fill="#c41a1a" class="ring-text">${remaining}</text>
    </svg>`;
  }

  // ── Populate DOM ────────────────────────────────────────────────
  function init() {
    // Bird watermark
    document.getElementById('bird-wrap').innerHTML = makeBirdSVG(600);

    // Headline
    const headline = document.getElementById('headline');
    if (type === 'tab') {
      headline.textContent = "YOU GOT DISTRACTED BIRD SAYS NO!";
    } else {
      headline.innerHTML = `You're leaving<br>${esc(dest)}.`;
    }

    // Sub-text / dest line
    if (type === 'tab') {
      document.getElementById('sub-text').removeAttribute('hidden');
    } else {
      const destLine = document.getElementById('dest-line');
      destLine.removeAttribute('hidden');
      const origin = extractDomain(returnUrl);
      // Find where they're going
      destLine.innerHTML = `→ ${esc(dest)} <span class="dest-mute">· not on your list</span>`;
    }

    // Add button label
    document.getElementById('btn-add').textContent =
      type === 'tab' ? 'Add this tab to focus' : 'Add this domain to focus';

    // Initial ring
    initRing();
  }

  function initRing() {
    document.getElementById('ring-wrap').innerHTML = makeRingAnimated();
    document.getElementById('ring-wrap').setAttribute('aria-label', `${countdown} seconds remaining`);
  }

  function updateRingText() {
    const ringText = document.querySelector('.ring-text');
    if (ringText) {
      ringText.textContent = remaining;
      document.getElementById('ring-wrap').setAttribute('aria-label', `${remaining} seconds remaining`);
    }
  }

  // ── Countdown ───────────────────────────────────────────────────
  function startCountdown() {
    timer = setInterval(() => {
      remaining--;
      updateRingText();
      if (remaining <= 0) {
        clearInterval(timer);
        goBack();
      }
    }, 1000);
  }

  function stopCountdown() {
    if (timer) clearInterval(timer);
  }

  // ── Actions ─────────────────────────────────────────────────────
  function goBack() {
    stopCountdown();
    if (returnUrl || focusTabId) {
      chrome.runtime.sendMessage({ action: 'goBack', returnUrl, focusTabId }, () => {
        // SW will restore this tab's URL and switch to the focus tab;
        // also navigate directly as fallback in case SW is slow
        if (returnUrl) location.href = returnUrl;
      });
    } else {
      history.back();
    }
  }

  document.getElementById('btn-go-back').addEventListener('click', goBack);

  document.getElementById('btn-add').addEventListener('click', () => {
    stopCountdown();
    if (type === 'tab') {
      chrome.runtime.sendMessage({
        action: 'addToFocus',
        type: 'tab',
        title: tabTitle,
        returnUrl,
        destUrl: returnUrl,
      }, () => {
        // The service worker navigates us — but also go directly
        if (returnUrl) location.href = returnUrl;
      });
    } else {
      chrome.runtime.sendMessage({
        action: 'addToFocus',
        type: 'domain',
        domain: dest,
        returnUrl,
        destUrl: constructDestUrl(),
      }, () => {
        if (constructDestUrl()) location.href = constructDestUrl();
      });
    }
  });

  document.getElementById('btn-distracted').addEventListener('click', () => {
    stopCountdown();
    chrome.runtime.sendMessage({
      action: 'endFocusMode',
      destUrl: constructDestUrl() || returnUrl,
    }, () => {
      const dest = constructDestUrl() || returnUrl;
      if (dest) location.href = dest;
    });
  });

  function constructDestUrl() {
    if (type === 'domain' && dest) {
      return `https://${dest}`;
    }
    return '';
  }

  // ── Utils ────────────────────────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function extractDomain(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return ''; }
  }

  // ── Boot ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    init();
    startCountdown();
  });
})();
