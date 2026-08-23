# Cardmarket Stock Exporter

<p align="center">
  <img src="icons/icon-128.png?v=2" alt="Cardmarket Stock Exporter Logo" width="96" height="96">
</p>

<p align="center">
  <b>Export your complete Cardmarket stock &amp; wantlists to CSV — and bulk-update prices &amp; comments via CSV import.</b><br>
  Every game Cardmarket sells · German/English UI · Fast Mode (~10×) · bypasses the 300-entry pagination limit.
</p>

<p align="center">
  <sub>✅ v2.3.0 — all 20 Cardmarket games and all 17 card languages, plus fixes for two bugs that could change a listing's language or condition during Bulk-Update. If you have bulk-updated non-German listings before, see the changelog.</sub>
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/fdhioinnlcopijnekmkpfkopeplpgdkj"><img src="https://img.shields.io/badge/Chrome%20Web%20Store-Install-4285F4?logo=google-chrome&logoColor=white" alt="Chrome Web Store"></a>
  <a href="https://github.com/LUPZN/cardmarket-stock-exporter/releases/latest"><img src="https://img.shields.io/github/v/release/LUPZN/cardmarket-stock-exporter?color=2563eb" alt="Latest Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" alt="GPL-3.0 License"></a>
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

### ✏️ Bulk Price Update *(v2.0, hardened in v2.1)*
- **Edit prices in Excel/Google Sheets**, re-upload CSV → all listings updated on Cardmarket
- **Live preview with diff** — see exactly what changes before confirming
- **Dry-Run mode** — test without actually updating
- **Max-change-% safety cap** — prevents typo disasters (default 200%)
- **Skip unchanged rows** automatically
- **~1.5 seconds per card** in modal-flow, **~300-400ms in Fast Mode** (v2.1)
- **Verify mode** — re-fetch each price after update for 100% guarantee
- **idArticle Auto-Rebind** *(new in v2.1)* — when Cardmarket re-issues an internal article ID after edits, the tool refetches by `idProduct` and matches on (language, condition, reverse-holo) to find the new ID automatically
- **Stale-Export warning** *(new in v2.1)* — flags CSVs older than 24h or runs where >5% of IDs come back 404
- **Tab-Mismatch detection** *(new in v2.1)* — compares CSV's locale/game metadata against the active Cardmarket tab and warns before running
- **Comments Bulk-Edit** *(new in v2.1)* — toggle to push CSV `Comments` back to Cardmarket alongside prices. Empty CSV comments are ignored by default (won't wipe existing).
- **⚡ Fast Mode** *(new in v2.1, opt-in)* — direct AJAX POST instead of native Bootstrap modal submit. 4-5× faster, auto-fallback to modal-flow on error.

### 📋 Want-Lists *(new in v2.1)*
- **Export all wantlists** — auto-discovers each list, paginates entries, outputs combined CSV with `WantListName` column
- **Bulk-Delete via CSV** — edit CSV, set `delete=Y` on entries to remove, re-upload. Dry-Run on by default. Use case: cleaning up years of stale "still want this" entries after you've bought them.

### 🔧 Quality of Life
- 🌐 **German / English UI** *(v2.2)* — auto-detected from your browser language, plus a manual toggle (Auto / 🇩🇪 DE / 🇬🇧 EN) in the popup. Bulk-Update status messages follow the selected UI language *(v2.2.6)*.
- 📌 **Pin to window** — detach popup so it stays open during long operations
- 🌍 Auto-detect card language + game from current tab
- **CSV header metadata** *(new in v2.1)* — files start with a `# CMSE-META | ...` line carrying export timestamp + locale + game + tool version. Used for tab-mismatch + stale-export detection.

## 📋 CSV Columns (Stock Export)

| Column | Description |
|--------|-------------|
| `ArticleID` | Cardmarket internal article ID |
| `idProduct` *(v2.1)* | Cardmarket internal product ID — used for auto-rebind on bulk-update |
| `Name` | Card name including set code |
| `ExpansionCode` | Combined set + collector code (e.g. `sv2a 063`) — kept for backwards compat |
| `SetCode` *(v2.1)* | Set code only (e.g. `sv2a`) |
| `CollectorNumber` *(v2.1)* | Collector number only (e.g. `063`, or `001/250`) |
| `Expansion` | Full expansion name (e.g. `Pokémon Card 151`) |
| `Rarity` | Card rarity (Common, Uncommon, Rare, ...) |
| `Language` | Card language |
| `Condition` | Short condition (NM, EX, LP, ...) |
| `ConditionFull` | Full condition name (Near Mint, ...) |
| `ReverseHolo` | Y if Reverse Holo, N otherwise |
| `Comments` | Your listing comments — **editable** for Bulk-Update |
| `_OriginalComments` *(v2.1)* | **Read-only reference** — leave untouched. Used for Skip-Fetch optimization (compares against `Comments` to detect user edits → fetches Cardmarket only for changed rows → drastically reduces Cloudflare load). |
| `Price_EUR` | Unit price in EUR — **editable** for Bulk-Update |
| `_OriginalPrice_EUR` *(v2.1)* | **Read-only reference** — leave untouched. Same Skip-Fetch role as `_OriginalComments`. |
| `Amount` | Quantity in stock |
| `Total_EUR` | Price × Amount |
| `ProductUrl` | Direct link to the card on Cardmarket |

The CSV starts with a metadata comment line like `# CMSE-META | exported=2026-04-29T... | lang=en | game=Magic | tool=v2.1.0`. It's parsed automatically by the Bulk-Update flow for tab-mismatch and stale-export detection. Excel and Sheets ignore it as a comment row.

## 📋 CSV Columns (Want-Lists Export, v2.1)

| Column | Description |
|--------|-------------|
| `WantListName` | Name of the wantlist this entry belongs to |
| `idWantsList` | Cardmarket internal ID of the wantlist |
| `idProduct` | Cardmarket internal product ID |
| `idWant` | Cardmarket internal want-entry ID — used for bulk-delete |
| `ProductName` | Card name |
| `Expansion` / `ExpansionCode` | Expansion info |
| `Language` | Preferred language |
| `MinCondition` | Minimum acceptable condition |
| `IsFoil` / `IsSigned` / `IsAltered` / `IsPlayset` / `IsReverseHolo` | Variant flags (Y/N) |
| `MaxPrice_EUR` | Your maximum buy price |
| `Quantity` | How many you want |
| `ProductUrl` | Direct link to the card |
| `delete` | Default `N`. Change to `Y` and re-upload to remove that entry via Bulk-Delete. |

---

## 🚀 Installation

### Option A — Chrome Web Store (recommended)

1. Open the [Chrome Web Store listing](https://chromewebstore.google.com/detail/fdhioinnlcopijnekmkpfkopeplpgdkj)
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

### Bulk-Update reports many "ArticleIDs not found" — what's wrong? *(v2.1)*

This usually means your CSV's `idArticle` values are stale. Cardmarket re-issues internal article IDs when you edit listings (price, condition, comments, even server-side stock-cleanups). Without `idProduct` in the CSV, the tool can't find the new ID.

In **v2.1**: the tool automatically refetches by `idProduct + (language, condition, reverse-holo)` and rebinds when there's a unique match. You'll see `↻NEW_ID` badges in the preview and a green "X auto-rebound" banner.

**To fix on a v2.0 CSV:** re-export with v2.1+ (the `idProduct` column is now included). Re-upload that newer CSV.

**Other causes worth ruling out:**
- Tab locale/game doesn't match the CSV's metadata (v2.1 detects this automatically)
- Listings actually got sold or deleted between export and update
- CSV was opened in Excel and IDs got mangled into scientific notation (v2.1 auto-recovers ArticleID + idProduct)

### Can I bulk-edit my listing comments? *(v2.1)*

Yes. Toggle "Comments mit-updaten" in the Bulk-Update tab. Edit the `Comments` column in your CSV, re-upload. The diff preview shows comment changes alongside price changes.

**Behavior of empty CSV cells when the toggle is on:**
- Empty CSV cell + Cardmarket has comment → **comment will be CLEARED** on Cardmarket
- Empty CSV cell + Cardmarket already empty → unchanged (skipped)
- CSV cell with text differs from Cardmarket → text written
- CSV cell matches Cardmarket → unchanged (skipped)

The preview surfaces an explicit warning if X comments would be cleared, so you can spot-check before confirming. To preserve a comment without changing it, leave the CSV row exactly as exported (don't blank the cell).

If the toggle is off, comments are completely ignored regardless of CSV content.

### How does Bulk Update work technically?

The extension uses Cardmarket's own "Edit Article" modal flow — same as if you clicked the edit-pencil icon manually. It:
1. Opens the edit modal natively via Bootstrap (so all of Cardmarket's JavaScript handlers attach correctly)
2. Sets the new price in the form
3. Triggers the form submit — Cardmarket's own AJAX framework processes the update
4. (Optional) Re-fetches the price to verify

No reverse-engineering of API endpoints, no fake requests. Uses what your browser would do.

### Can I rollback a bulk update?

Not automatically — but you can re-run with the previous CSV to restore old prices. Always keep your previous CSV as backup before bulk-updating.

### What's "Fast Mode" and is it safe? *(v2.1)*

Fast Mode skips the Bootstrap modal render/init/close cycle and POSTs directly to the form's action URL with the same FormData payload. Same endpoint, same fields, just no DOM dance. Roughly 4-5× faster (~300-400ms instead of ~1.5s per update).

Auto-fallback is built in: any per-request error (CSRF mismatch, validation error, network blip) automatically retries that single article through the safe modal-flow. So worst-case a Fast-Mode run is the same speed as modal-flow with a small overhead. The mode is **opt-in** — default is the safe modal-flow.

### How does Want-Lists Bulk-Delete work? *(v2.1)*

Same idea as Bulk-Price-Update but for wantlist entries. Export your wantlists (combined CSV with one row per entry), open in Excel, set `delete=Y` on rows you want gone, re-upload. The tool validates IDs, shows you a count, requires confirmation, then iterates each row and POSTs a remove-request to Cardmarket. Dry-Run is on by default — flip it off only after you've confirmed the count is right.

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
| Bulk Update: many "not found" *(v2.1)* | Stale `idArticle`s — re-export with v2.1 so the CSV includes `idProduct` for auto-rebind |
| Bulk Update: "Tab-Mismatch" warning *(v2.1)* | Switch the active Cardmarket tab to the same locale + game your CSV was exported from |
| Want-Lists Export returns 0 rows | Ensure you're logged in and have at least one wantlist created — the discovery step parses `/Wants` overview |
| Want-Lists Bulk-Delete: HTTP 4xx | Capture the network-trace of a manual delete and file a GitHub issue with the exact request URL + payload |
| Fast Mode: high fallback count | Switch off Fast Mode and report the response status — endpoint may have changed |

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
- 🌟 **Rate 5 stars** on the [Chrome Web Store](https://chromewebstore.google.com/detail/fdhioinnlcopijnekmkpfkopeplpgdkj)
- 🐦 **Share** with fellow TCG sellers

---

## ⏱️ Performance Expectations

Real-world numbers from a 19,000-listing collection across multiple expansions and variants:

| Operation | Default settings | With Fast Mode (v2.1) |
|-----------|------------------|------------------------|
| **Stock Export** (read-only) | ~5-10 min | n/a (read is already light) |
| **Bulk Update** — 500 prices/week (typical) | ~12 min | ~2-3 min |
| **Bulk Update** — 5,000 prices | ~2 hours | ~25-35 min |
| **Bulk Update** — 19,000 prices | ~8 hours | ~1.5-2 hours |
| **Want-Lists Export** (5 lists × 1k entries) | ~3-5 min | n/a |

Settings that affect timing:
- `Delay (ms)` — default 500ms read / 250ms write. Increase if you hit rate limits, decrease at your own risk.
- `Verify nach Update` — adds one extra fetch per article (~2× slower) for full price-confirmation
- `Cascading Filter` (auto, when needed) — adds extra requests per affected expansion

If you exceed Cardmarket's rate limits, the tool auto-pauses 10 seconds and resumes. There's no permanent failure mode for rate-limit hits.

## ⚠️ Known Limitations + Workarounds

**v2.1 idArticle Auto-Rebind covers most drift scenarios but not all.** When multiple of your listings for the same product share an identical `(language, condition, isReverseHolo)` tuple — e.g. two NM English copies with different comments — the tool can't disambiguate and will keep the entry as "not found". Workaround: re-export to refresh IDs.

**Cascading Filter coverage.** v2.3.0 cascades all 17 card languages Cardmarket currently lists (1 English, 2 French, 3 German, 4 Spanish, 5 Italian, 6 Simplified Chinese, 7 Japanese, 8 Portuguese, 9 Russian, 10 Korean, 11 Traditional Chinese, 12 Dutch, 13 Polish, 14 Czech, 15 Hungarian, 16 Indonesian, 17 Thai), then subdivides further by rarity and by the variant filters of the game you are exporting. Cardmarket may add language IDs in the future; if you hit one, file an issue with the language ID from your stock URL.

**Want-Lists Bulk-Delete endpoint.** Implemented based on the most likely Cardmarket pattern. If your account uses a different flow, the dry-run will succeed but live delete returns HTTP 4xx. Capture a network-trace of a manual delete and open an issue.

**Fast Mode auto-fallback.** Any per-request error in Fast Mode automatically falls back to the safe modal-flow for that one article. If you see consistently high fallback counts, switch off Fast Mode and report.

## 🔒 Cloudflare + Rate Limits + ToS

For full transparency:

- **Cloudflare:** Not bypassed. The extension runs in your own logged-in browser session, sending requests with your real cookies and fingerprint. Cloudflare sees a normal Chrome browser doing things a logged-in seller would do.
- **Rate limits:** Default pacing is 500ms between page reads, 250ms between writes — about 2 requests/second from a single tab. That's slower than active manual browsing. Auto-pause 10 seconds on HTTP 429.
- **Scope:** The extension can only operate on the inventory of whoever is logged in at the keyboard. It cannot scrape other users' accounts, cannot rotate proxies, cannot run headless. By design.
- **ToS:** I read §8 of the Cardmarket Terms before publishing. There's no explicit prohibition on browser-side automation of one's own actions, but Cardmarket has not officially endorsed it either. **Use at your own risk** — the author accepts no liability. If Cardmarket asks me to remove the extension or change its behavior, I will.

## 📜 License

**GNU General Public License v3.0** — see [LICENSE](LICENSE).

You are free to use, study, modify, and redistribute this extension. **Forks and derivative works must remain open-source under GPL-3.0** and disclose their source code. Commercial redistribution is allowed under the same terms. No warranty.

Previously licensed under MIT (v1.0–v2.0). Relicensed to GPL-3.0 starting v2.1 to keep derivative Chrome Web Store uploads open-source.

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
