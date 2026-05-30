# "Focus" Usage in User-Facing Text

## Overview
This document identifies all instances of the word "Focus" (capitalized or otherwise) that appear in user-facing text throughout the codebase.

---

## 1. **popup.html** — Popup UI
- **Line 62**: Button `aria-label="Toggle Focus Mode"` 
- **Line 71**: Label text "Focus tabs"
- **Line 108**: UI text "Toggle focus"
- **Line 115**: UI text "Pause focus"

## 2. **popup.js** — Popup Logic
- **Line 57**: Dynamic text replacement: `'Distractions Allowed'` (shown when Focus Mode OFF)
- **Line 62**: Dynamic label: `Focus tabs · ${tabs.length}` or `'Focus tabs'`
- **Line 79**: aria-label: `Remove ${esc(ft.title || ft.url)} from focus`

## 3. **interstitial.html** — Interstitial Page
- **Line 61**: Button text "Add this tab to focus"

## 4. **interstitial.js** — Interstitial Logic
- **Line 85**: Headline: `"YOU GOT DISTRACTED BIRD SAYS NO!"`
- **Line 103**: Dynamic button text: 
  - `'Add this tab to focus'` (tab variant)
  - `'Add this domain to focus'` (domain variant)

## 5. **hotkey-guard.js** — Content Script
- **Line 103**: Modal message: 
  ```
  "This is your <strong style="color:#100d0b;">last focus tab.</strong> 
   Closing it will end your Focus Mode session."
  ```

## 6. **focus-widget.js** — Floating Widget
- **Line 73**: Tooltip: `'Pause focus mode'`
- **Line 108**: Tooltip: `'End focus mode'`
- **Line 197**: Dynamic tooltip (paused): `'Resume focus mode'`
- **Line 201**: Dynamic tooltip (active): `'Pause focus mode'`
- **Line 256**: Tooltip: `'Start focus mode'`

## 7. **manifest.json** — Extension Metadata
- **Line 40**: Command ID: `"toggle-focus-hotkey"`
- **Line 42**: Description: `"Start/end focus mode"`
- **Line 44**: Command ID: `"toggle-pause-hotkey"`
- **Line 46**: Description: `"Pause/resume focus mode"`

## 8. **privacy-policy.html** — Documentation
- **Line 26**: Privacy text: "...`focus events` from the current browser session..."
- **Line 33**: Privacy text: "...what's needed to enforce `focus mode` in real time"
- **Line 47**: Permissions: "`focus interstitial` and return overlay..."
- **Line 48**: Permissions: "...when you toggle `Focus Mode` on."
- **Line 49**: Permissions: "...when a `focus tab` navigates to an off-whitelist domain."

---

## Summary by Category

### UI Labels & Buttons
- "Focus tabs" (popup header)
- "Toggle focus"
- "Pause focus"
- "Add this tab to focus"
- "Add this domain to focus"

### Tooltips & ARIA Labels
- "Toggle Focus Mode"
- "Pause focus mode"
- "Resume focus mode"
- "Start focus mode"
- "End focus mode"
- "...from focus"

### Modal & Messages
- "...last focus tab. Closing it will end your Focus Mode session."
- "Taking you back to your work in…"

### Commands (manifest.json)
- `toggle-focus-hotkey`
- `toggle-pause-hotkey`
- "Start/end focus mode"
- "Pause/resume focus mode"

### Documentation (privacy-policy.html)
- "focus events"
- "focus mode"
- "focus interstitial"
- "Focus Mode"
- "focus tab"

### Dynamic/Contextual
- "Distractions Allowed" (replaces "Focus tabs" when mode is OFF)
- Ring countdown text
- Elapsed time display

---

## Total Instances
- **Direct user-visible text**: ~20 instances
- **HTML attributes (aria-labels, titles)**: ~6 instances
- **Command IDs & descriptions**: ~4 instances
- **Documentation**: ~5 instances
- **Comments/internal**: ~2 instances

**Grand Total**: ~37 instances across the codebase

---

## Notes
- Most instances use "Focus" as a noun or adjective (e.g., "Focus Mode", "focus tab")
- Some instances are dynamic (generated at runtime in `popup.js` and `interstitial.js`)
- The term is fundamental to the extension's UX and appears in critical user-facing UI
- Command IDs in `manifest.json` are system-level but users see the descriptions
