# Chrome Web Store Submission Guide

This guide walks you through everything needed to publish DONT GET DISTRACTED BIRD on the Chrome Web Store. I've prepared everything I can — the parts below marked **[YOU]** require your Google account and cannot be done by me.

---

## Before you start

### 1. Build the extension zip

```bash
npm install
node build.js
```

This produces `dist/dont-get-distracted-bird.zip`. That's the file you upload.

### 2. Host the privacy policy

The Chrome Web Store requires a publicly accessible privacy policy URL.

**Easiest option — GitHub Pages:**
1. Push this repo to GitHub (if not already done)
2. Go to repo Settings → Pages → Source: Deploy from branch `main`, folder `/store`
3. Your privacy policy URL will be: `https://yourusername.github.io/your-repo-name/privacy-policy.html`

**Alternative:** Upload `store/privacy-policy.html` to any public web host.

### 3. Prepare screenshots

The store requires at least one screenshot (1280×800 or 640×400 px).

Take screenshots of the loaded extension:
- `01-popup-on.png` — Open the popup with Focus Mode ON and a couple of focus tabs listed
- `02-interstitial.png` — Trigger the interstitial by clicking a non-focus tab; screenshot that full-tab page
- `03-popup-off.png` — Open the popup with Focus Mode OFF ("Distractions Allowed")

Upload all three to the store listing (up to 5 screenshots allowed).

---

## Step-by-step submission

### Step 1 — Create a Chrome Web Store developer account [YOU]

1. Go to: **https://chrome.google.com/webstore/devconsole**
2. Sign in with your Google account
3. Pay the **one-time $5 USD developer registration fee**
4. Accept the developer agreement

You only pay once. This account can publish unlimited extensions.

### Step 2 — Create a new item [YOU]

1. Click **"New item"**
2. Upload `dist/dont-get-distracted-bird.zip`
3. Google will parse the manifest and pre-fill the name and version

### Step 3 — Fill in the store listing [YOU]

Copy from `store/listing.md`:

| Field | Value |
|---|---|
| **Name** | DONT GET DISTRACTED BIRD |
| **Summary** (short) | A stern cardinal guards your focus tabs. Friction, not blockade — you can always leave, but only deliberately. |
| **Description** (full) | Copy the full description section from `store/listing.md` |
| **Category** | Productivity |
| **Language** | English (United Kingdom) or English (United States) |

### Step 4 — Add screenshots [YOU]

Upload your 3 screenshots (1280×800 minimum).

Optionally upload `store/promo-tile-440x280.png` if you create one (recommended — shown in search results).

### Step 5 — Privacy practices [YOU]

In the **Privacy practices** tab:

1. **Privacy policy URL** — paste your hosted URL (e.g. `https://yourusername.github.io/repo/store/privacy-policy.html`)
2. Answer the data usage questions:
   - Does the extension collect personally identifiable information? **No**
   - Does the extension use any remote code? **No**
   - Does the extension handle user data? **No — all storage is local**

### Step 6 — Justify permissions [YOU]

Google will ask you to justify each permission. Use these:

| Permission | Justification |
|---|---|
| `tabs` | Monitor tab activation to enforce focus mode rules — required to detect when the user switches to a non-focus tab. |
| `notifications` | Send an OS-level notification when the Chrome window loses focus during a focus session. |
| `storage` | Persist the domain whitelist and settings (countdown duration) across browser sessions using chrome.storage.local. |
| `scripting` | Inject the focus interstitial page and return overlay into web pages during active focus sessions. |
| `activeTab` | Read the current tab's URL when the user activates Focus Mode to auto-assign it as the first focus tab. |
| `webNavigation` | Detect when a focus tab navigates to an off-whitelist domain so the extension can show the navigation interstitial. |

### Step 7 — Submit for review [YOU]

Click **"Submit for review"**.

**Review timeline:** Typically 3–7 business days for a new extension. Google may ask follow-up questions about permissions — respond promptly using the justifications above.

---

## After approval

- You'll receive an email when the extension is published
- Your extension will appear at: `https://chrome.google.com/webstore/detail/[extension-id]`
- To update: increment `version` in `manifest.json`, rebuild, and upload the new zip to the developer console

---

## Testing locally (before submission)

```bash
# 1. Install dependencies and build icon PNGs
npm install
node build.js

# 2. Open chrome://extensions in Chrome
# 3. Enable "Developer mode" (top right toggle)
# 4. Click "Load unpacked"
# 5. Select the root folder of this repo (where manifest.json is)
# 6. Pin the extension to the toolbar
# 7. Click the cardinal icon → toggle Focus Mode ON
```

---

## Known Chrome limitations (documented)

- **Ctrl+T / Ctrl+N** — Chrome processes these shortcuts before the page receives them in most contexts. The extension suppresses them when the page has keyboard focus (e.g. you're typing in a form), but cannot intercept them from the address bar or system level. This is a Chrome platform constraint, not a bug.
- **New tabs via middle-click** — May not always trigger the interstitial before the page begins loading. The tab activation listener will catch it within one event cycle.
- **chrome.windows.onFocusChanged** — May occasionally fire with a brief delay (~100ms) on some OS/Chrome combinations. Focus loss detection is still accurate to within one second.
