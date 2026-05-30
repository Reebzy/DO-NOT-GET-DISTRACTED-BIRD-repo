# "Focus" Usage — Quick Reference Table

| File | Line | Type | User-Facing Text | Context |
|------|------|------|------------------|---------|
| **popup.html** | 14 | CSS Comment | `/* ── Focus tabs section... */` | Style section header |
| **popup.html** | 62 | ARIA Label | `"Toggle Focus Mode"` | Button accessibility |
| **popup.html** | 71 | HTML Label | `"Focus tabs"` | Section header (visible to user) |
| **popup.html** | 108 | HTML Text | `"Toggle focus"` | Settings option label |
| **popup.html** | 115 | HTML Text | `"Pause focus"` | Settings option label |
| **popup.js** | 57 | Dynamic Text | `"Distractions Allowed"` | Replaces "Focus tabs" when mode OFF |
| **popup.js** | 62 | Dynamic Label | `"Focus tabs"` or `"Focus tabs · N"` | Generated tab count label |
| **popup.js** | 79 | ARIA Label | `"Remove X from focus"` | Button removal label |
| **interstitial.html** | 61 | Button Text | `"Add this tab to focus"` | CTA button |
| **interstitial.js** | 85 | Headline (dynamic) | `"YOU GOT DISTRACTED BIRD SAYS NO!"` | Main interstitial headline |
| **interstitial.js** | 103 | Button Text (dynamic) | `"Add this tab to focus"` | Tab variant CTA |
| **interstitial.js** | 103 | Button Text (dynamic) | `"Add this domain to focus"` | Domain variant CTA |
| **hotkey-guard.js** | 103 | Modal Message | `"...last focus tab..."` | Close confirmation dialog |
| **hotkey-guard.js** | 103 | Modal Message | `"...end your Focus Mode session."` | Close confirmation dialog |
| **focus-widget.js** | 73 | Tooltip | `"Pause focus mode"` | Pause button title |
| **focus-widget.js** | 108 | Tooltip | `"End focus mode"` | Close button title |
| **focus-widget.js** | 197 | Tooltip (dynamic) | `"Resume focus mode"` | Pause btn when paused |
| **focus-widget.js** | 201 | Tooltip (dynamic) | `"Pause focus mode"` | Pause btn when active |
| **focus-widget.js** | 256 | Tooltip | `"Start focus mode"` | Play button title |
| **manifest.json** | 40 | Command ID | `"toggle-focus-hotkey"` | System command |
| **manifest.json** | 42 | Command Description | `"Start/end focus mode"` | User-visible in Chrome shortcuts |
| **manifest.json** | 44 | Command ID | `"toggle-pause-hotkey"` | System command |
| **manifest.json** | 46 | Command Description | `"Pause/resume focus mode"` | User-visible in Chrome shortcuts |
| **privacy-policy.html** | 26 | Doc Text | `"focus events"` | Privacy policy bullet |
| **privacy-policy.html** | 33 | Doc Text | `"enforce focus mode in real time"` | Privacy policy bullet |
| **privacy-policy.html** | 47 | Doc Text | `"focus interstitial"` | Permissions explanation |
| **privacy-policy.html** | 48 | Doc Text | `"Toggle Focus Mode on"` | Permissions explanation |
| **privacy-policy.html** | 49 | Doc Text | `"focus tab navigates"` | Permissions explanation |

---

## Key Observations

### High Visibility (Critical)
- **popup.html, line 71**: "Focus tabs" — Main UI label, seen every time popup opens
- **interstitial.html, line 61**: "Add this tab to focus" — Key user action button
- **manifest.json, lines 42, 46**: Command descriptions — Visible in Chrome's command palette

### Medium Visibility
- **Tooltips in focus-widget.js**: Appear on hover; critical for in-page interactions
- **Modal text in hotkey-guard.js**: Appears when user tries to close the last focus tab
- **Dynamically generated in popup.js & interstitial.js**: "Focus tabs" label count

### Low Visibility
- **Comments & CSS comments**: Not visible to end users
- **Privacy policy**: Legal documentation, less frequently accessed
- **Command IDs in manifest**: System-level, not directly visible to users

---

## UI Hierarchy by Prominence

```
1. POPUP (Most Visible)
   ├─ "Focus tabs" label (always visible)
   ├─ "Toggle Focus Mode" button
   └─ Settings: "Toggle focus", "Pause focus"

2. INTERSTITIAL (Shown on block)
   ├─ "Add this tab to focus" button
   └─ "Add this domain to focus" button (variant)

3. FLOATING WIDGET (In-page, always visible when active)
   ├─ Tooltips: "Pause focus mode", "End focus mode", "Start focus mode"
   └─ "Resume focus mode" (when paused)

4. MODAL DIALOGS (Conditional)
   └─ "last focus tab... end your Focus Mode session" (on Ctrl+W)

5. SETTINGS/DOCUMENTATION (Lower visibility)
   ├─ manifest.json descriptions
   └─ privacy-policy.html
```

---

## Search/Replace Approach

If you need to rename or refactor "Focus", consider these patterns:

1. **Token: `focusTabs`** → Search for camelCase variables (state, functions)
2. **String: `"Focus tabs"`** → Search for quoted strings
3. **Element: `#focus-`** → Search for CSS IDs/classes
4. **HTML: `aria-label="*focus*"`** → Search for accessibility attributes

All 37+ instances are documented above for reference.
