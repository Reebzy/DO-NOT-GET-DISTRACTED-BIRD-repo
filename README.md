# DONT GET DISTRACTED BIRD

A Chrome MV3 extension. A stern heraldic cardinal guards your focus tabs. Friction, not blockade.

## Quick start (local testing)

```bash
npm install
node build.js
```

Then in Chrome:
1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked** → select this folder
4. Pin the cardinal icon to your toolbar
5. Click it → toggle **Focus Mode ON**

## How it works

| Feature | Behavior |
|---|---|
| **Toggle ON** | Current tab auto-assigned as focus tab. All guards activate. |
| **Tab switch** | Non-focus tab → full-screen interstitial with countdown ring. |
| **URL navigate** | Off-whitelist domain in a focus tab → domain interstitial. |
| **Window leave** | Tab title flashes. OS notification fires. |
| **Window return** | Flash stops, notification dismissed. Overlay shows time away. |
| **Ctrl+W (last tab)** | Warning modal — confirm before ending your session. |
| **Hotkeys** | Ctrl+T/Tab/N/1-9 suppressed while focus is active (see limits below). |
| **Toggle OFF** | All guards lift immediately. Session log preserved until cleared. |

## Interstitial choices

When you navigate away from your focus context, you get 3 options:

1. **← GO BACK** — return immediately (primary)
2. **Add this tab/domain to focus** — if you actually need it
3. **I AM DISTRACTED. END FOCUS MODE.** — the honest exit

Countdown reaches zero → auto-return.

## Files

```
manifest.json           MV3 manifest
background/             Service worker (all logic)
popup/                  Extension popup (360px)
interstitial/           Full-tab interstitial page
content/                Content scripts (hotkey guard, overlays)
assets/                 SVG icons + rasterized PNGs (built)
shared/                 design-system.css (design tokens)
store/                  Chrome Web Store assets + privacy policy
build.js                Build script (SVG→PNG + zip)
SUBMIT.md               Step-by-step store submission guide
```

## Publishing to Chrome Web Store

See **SUBMIT.md** for the full step-by-step guide.

The short version: run `node build.js`, then upload `dist/dont-get-distracted-bird.zip` to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole). One-time $5 developer account fee required.

## Known Chrome limits

- **Ctrl+T / Ctrl+N** cannot be intercepted from the address bar or system level — only within-page keyboard focus. This is a Chrome platform constraint.
- **webNavigation** interstitial redirect: middle-click new tabs may load briefly before the guard fires.

## Design

Brand: cardinal red `#C41A1A` · ink `#100D0B` · bone `#F4F1EA`. No other colours.  
Type: Archivo Expanded (display) · Archivo (UI) · JetBrains Mono (data).  
Voice: blunt, terse, the bird talking to you. No emoji. No praise.
