# Cardmarket Stock Exporter

<p align="center">
  <img src="icons/icon-128.png" alt="Cardmarket Stock Exporter Logo" width="96" height="96">
</p>

<p align="center">
  <b>Export your complete Cardmarket inventory to CSV — and bulk-update prices via CSV import.</b><br>
  Supports 8 TCG games, 5 languages. Bypasses the 300-entry pagination limit.
</p>

<p align="center">
  <a href="https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=google-chrome&logoColor=white" alt="Chrome Web Store"></a>
  <a href="https://github.com/LUPZN/cardmarket-stock-exporter/releases/latest"><img src="https://img.shields.io/github/v/release/LUPZN/cardmarket-stock-exporter?color=2563eb" alt="Latest Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="MIT License"></a>
  <a href="https://www.paypal.com/donate/?hosted_button_id=X8MG6CZK2PETS"><img src="https://img.shields.io/badge/PayPal-Donate-ffc439?logo=paypal&logoColor=white" alt="Donate via PayPal"></a>
</p>

---

## 🎯 Why This Tool?

Cardmarket does not provide a built-in way to export your full stock as CSV. Their web UI caps unsorted stock views at ~300 entries and has no bulk export button. If you manage thousands of cards, keeping an accurate inventory (quantity, unit price, total value) is painful.

This Chrome extension scrapes your own stock listings page-by-page, **per expansion**, bypassing the pagination limit, and builds a clean CSV with everything you need for accounting, insurance, or portfolio tracking.

Tested on collections with **19,000+ cards**. Works reliably.

---

## ✨ Features

### 📥 Stock Export
- **Full stock export** — handles 20,000+ cards without issues
- **8 Games supported** — Pokémon, Magic, YuGiOh, Lorcana, One Piece, Flesh and Blood, Dragon Ball Super, Digimon
- **5 Languages** — German (`/de/`), English (`/en/`), French (`/fr/`), Spanish (`/es/`), Italian (`/it/`)
- **Live progress bar** — current expansion, page number, running total
- **Cancel button** — abort mid-export, keep what was already collected
- **Auto-calculates total value** — unit price × quantity per row + grand total
- **Deduplication** — via Cardmarket article ID, no duplicate rows
- **Rate-limit aware** — automatic 10-second pause on HTTP 429
- **Excel-ready CSV** — UTF-8 BOM, semicolon separator, proper escaping

### ✏️ Bulk Price Update *(new in v2.0)*
- **Edit prices in Excel/Google Sheets**, re-upload CSV → all listings updated on Cardmarket
- **Live preview with diff** — see exactly what changes before confirming
- **Dry-Run mode** — test without actually updating
- **Max-change-% safety cap** — prevents typo disasters (default 200%)
- **Skip unchanged rows** automatically
- **~1.5 seconds per card** — 1000 updates in ~25 minutes
- **Verify mode** — re-fetch each price after update for 100% guarantee

### 🔧 Quality of Life
- 📌 **Pin to window** — detach popup so it stays open during long operations
- 🌍 Auto-detect language + game from current tab

## 📋 CSV Columns

| Column | Description |
|--------|-------------|
| `ArticleID` | Cardmarket internal article ID |
| `Name` | Card name including set code |
| `ExpansionCode` | Set code (e.g. `sv2a 063`) |
| `Expansion` | Full expansion name (e.g. `Pokémon Card 151`) |
| `Rarity` | Card rarity (Common, Uncommon, Rare, ...) |
| `Language` | Card language |
| `Condition` | Short condition (NM, EX, LP, ...) |
| `ConditionFull` | Full condition name (Near Mint, ...) |
| `ReverseHolo` | Y if Reverse Holo, N otherwise |
| `Comments` | Your listing comments |
| `Price_EUR` | Unit price in EUR |
| `Amount` | Quantity in stock |
| `Total_EUR` | Price × Amount |
| `ProductUrl` | Direct link to the card on Cardmarket |

---

## 🚀 Installation

### Option A — Chrome Web Store (recommended)

1. Open the [Chrome Web Store listing](https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID)
2. Click **"Add to Chrome"**
3. Confirm the permissions
4. Done — icon appears in the Chrome toolbar

### Option B — Manual install from source (developer mode)

1. Download the latest release ZIP from [Releases](https://github.com/LUPZN/cardmarket-stock-exporter/releases/latest)
2. Extract the ZIP anywhere on your computer
3. Open Chrome → `chrome://extensions`
4. Toggle **Developer mode** (top right)
5. Click **Load unpacked**
6. Select the extracted folder
7. Extension appears in the toolbar

---

## 📖 Usage

1. Log in to [cardmarket.com](https://www.cardmarket.com)
2. Open your stock page, for example:
   `https://www.cardmarket.com/en/Pokemon/Stock/Offers/Singles`
3. Click the **Cardmarket Stock Exporter** icon in the Chrome toolbar
4. The language and game are auto-detected from the current tab
5. Adjust options if needed:
   - **Max pages** — set `0` for all pages
   - **Delay (ms)** — 500ms is a good default; raise to 1000 if you hit rate limits
   - **sortBy=name_asc** — should stay enabled (unlocks full pagination)
   - **Iterate per expansion** — **required** to export more than 300 cards
6. **Tip:** click the **📌 Pin** button top-right to detach the popup into its own window — it won't close when you accidentally click elsewhere
7. Click **"Start full export"**
8. Wait for the export to finish (progress bar shows live status)
9. When finished, the CSV is downloaded to your Downloads folder:
   `cardmarket-stock-YYYY-MM-DD.csv`

### What you will see during export

```
Expansion 12/67 Pokemon-Card-151 | Page 4 | Rows 1247 | Stock 2891
```

- `12/67` — current expansion index vs total detected
- `Page 4` — current page within that expansion
- `Rows 1247` — cumulative listings collected (after deduplication)
- `Stock 2891` — sum of all Amount values (actual card count)

---

## ✏️ Bulk Price Update Workflow

1. **Export** your stock first (Export tab) — gives you a CSV with `ArticleID` + `Price_EUR` columns
2. **Edit prices in Excel/Google Sheets** — change `Price_EUR` values for the rows you want to update
3. Save as CSV (keep semicolon separator, UTF-8 encoding)
4. **Switch to "Bulk Update" tab** in the extension
5. **Upload the edited CSV** via "Datei wählen"
6. **Click "CSV analysieren + Preview"** — extension fetches current prices from Cardmarket and shows diff:
   - Green = price increase
   - Red = price decrease
   - Greyed out = unchanged (will be skipped)
7. Adjust safety options:
   - **Max Preis-Änderung (%)** — caps maximum allowed change. Default 200%. Increase if you have legitimate huge changes.
   - **Delay pro Update** — milliseconds between updates. Default 250ms. Increase if you hit rate limits.
   - **Dry-Run** — runs the entire flow but skips actual write to Cardmarket. **Test with dry-run first!**
   - **Verify nach Update** — re-fetches each updated price for 100% confirmation (slower but bulletproof)
8. **Click "Bestätige Update: X Artikel"** — confirms then runs
9. Live progress shows current article + step
10. **Cancel** anytime — already-updated articles stay updated

### Safety guarantees

- Unchanged rows are skipped automatically (only diffs are sent)
- Cap on max % change prevents accidental destructive edits
- Confirmation dialog before any live write
- Per-article error logging — see exactly which IDs failed
- Cardmarket's own form validation runs (price pattern, etc.)

---

## ❓ FAQ

### Is this tool safe? Does it steal my Cardmarket password?

No. The extension does **not** read, store, or transmit your credentials. It relies on your existing browser session cookie, same as you clicking through the site yourself. All scraping happens **locally in your browser**, the CSV is generated and downloaded **client-side only**, nothing is sent to any external server.

Source code is open — review `popup.js` yourself.

### Why does Cardmarket only show me 300 entries?

When your stock view is not sorted (the default), Cardmarket caps results at ~300 unsorted entries. The extension forces `sortBy=name_asc` and iterates each expansion individually to bypass this cap.

### The export stopped with "HTTP 429"

Cardmarket's rate limiter kicked in. The extension auto-pauses 10 seconds and retries. If it repeats, increase the **Delay** setting to 1000-2000ms and run again.

### Can I export a single expansion only?

Yes — set **Max pages** to a low number, or open a URL filtered to a specific expansion before starting.

### Does it work on cardmarket.com/fr/, /es/, /it/?

Yes. The language dropdown in the popup rewrites the URL accordingly. Just make sure you are logged in on that locale.

### Will this get my Cardmarket account banned?

The extension uses reasonable request pacing (default 500ms between pages) and respects rate limits. It performs standard `GET` requests that are indistinguishable from normal browsing, just automated. Use reasonable settings. **Use at your own risk** — the author accepts no liability.

### How does Bulk Update work technically?

The extension uses Cardmarket's own "Edit Article" modal flow — same as if you clicked the edit-pencil icon manually. It:
1. Opens the edit modal natively via Bootstrap (so all of Cardmarket's JavaScript handlers attach correctly)
2. Sets the new price in the form
3. Triggers the form submit — Cardmarket's own AJAX framework processes the update
4. (Optional) Re-fetches the price to verify

No reverse-engineering of API endpoints, no fake requests. Uses what your browser would do.

### Can I rollback a bulk update?

Not automatically — but you can re-run with the previous CSV to restore old prices. Always keep your previous CSV as backup before bulk-updating.

---

## 🛠️ Technical Details

- **Manifest V3** Chrome Extension (future-proof)
- Scraping runs in the active tab via `chrome.scripting.executeScript`
- HTML is fetched with `credentials: 'include'` to reuse your session cookies
- Live progress is exchanged via `window.__cmExportProgress` in the isolated world
- CSV is built in-memory and delivered via `chrome.downloads.download`
- No background pages, no remote code, no external analytics

### Permissions requested

| Permission | Why |
|-----------|-----|
| `activeTab` | Access the current tab when you click the icon |
| `tabs` | Find the Cardmarket tab when popup is pinned to a separate window |
| `scripting` | Inject the scraping code into the Cardmarket tab |
| `downloads` | Save the generated CSV to your Downloads folder |
| `host_permissions: cardmarket.com` | Fetch additional pages during export |

No access to any other website, no access to browsing history, no access to tabs outside cardmarket.com.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| Export returns 0 rows | Make sure you're logged in and the tab is on `/Stock/Offers/Singles` |
| Only ~300 cards exported | Enable **"Iterate per expansion"** checkbox |
| Export hangs | Pin the popup (📌 button), check browser console (F12) for errors |
| HTTP 429 errors | Increase Delay to 1000-2000ms |
| CSV opens wrong in Excel | Use **Data → From Text/CSV**, set delimiter to `;` and encoding to `UTF-8` |
| Prices look wrong | Confirm you're on the correct locale — EUR only |
| Bulk Update: "modal did not load form" | Refresh the Cardmarket tab so the page JS is fresh, then retry |
| Bulk Update hangs after first card | Refresh the Cardmarket tab and re-run — modal state can get stuck |
| Bulk Update: "verify FAIL" | Cardmarket's response was non-200 (validation error?). Check format of `Price_EUR` in CSV |

---

## ❤️ Support the Project

If this extension saves you hours of manual work, consider a small donation. Every coffee helps keep this project maintained.

<p align="center">
  <a href="https://www.paypal.com/donate/?hosted_button_id=X8MG6CZK2PETS">
    <img src="https://img.shields.io/badge/PayPal-Buy%20me%20a%20coffee-ffc439?style=for-the-badge&logo=paypal&logoColor=white" alt="Donate via PayPal">
  </a>
</p>

You can also:
- ⭐ **Star this repo** on GitHub
- 🌟 **Rate 5 stars** on the [Chrome Web Store](https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID)
- 🐦 **Share** with fellow TCG sellers

---

## 📜 License

MIT License — see [LICENSE](LICENSE).

You are free to use, modify, and distribute this extension. Attribution is appreciated but not required.

---

## 👤 Author

**LUPZN** — TCG seller and developer.

- GitHub: [@LUPZN](https://github.com/LUPZN)
- Cardmarket: [LUPZN](https://www.cardmarket.com/en/Pokemon/Users/LUPZN)

---

## ⚠️ Disclaimer

This is an unofficial tool. Not affiliated with, endorsed by, or connected to Cardmarket / Sammelkartenmarkt GmbH. All trademarks belong to their respective owners. Use at your own risk.

---

<p align="center">
  <sub>Made with ♥ by LUPZN · Built with vanilla JS, no frameworks, no tracking</sub>
</p>
