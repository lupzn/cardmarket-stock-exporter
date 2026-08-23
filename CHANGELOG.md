# Changelog

All notable changes to **Cardmarket Stock Exporter** are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/).

---

## [2.3.0] — 2026-08-23

Every game Cardmarket sells is now exportable, and along the way several things the export and Bulk-Update relied on turned out to be wrong. Two of them were changing your listings without telling you. Prompted by a store review from Andreas Gast, who pointed out that Cardmarket had outgrown the eight games this extension offered. Thank you!

### Added

- **All 20 Cardmarket games.** The game picker previously offered 8. It now covers every game Cardmarket runs: Riftbound, Star Wars Unlimited, Final Fantasy, Cardfight!! Vanguard, Weiß Schwarz, Battle Spirits Saga, Force of Will, World of Warcraft, Star Wars: Destiny, Dragoborne, My Little Pony and The Spoils join the existing eight.
- **Per-game variant filters.** Cardmarket exposes a different set of variant filters for each game, so the export no longer assumes Pokémon's. Reverse Holo exists only for Pokémon, most games use Foil, Yu-Gi-Oh! uses First Edition, Star Wars: Destiny has "with die", and Force of Will adds Full Art and Uber Rare. The export now reads each game's own filters.
- **All 17 card languages.** Cardmarket lists 17; the filter offered 12. Dutch, Polish, Czech, Hungarian and Thai were missing, and the export's internal subdivision stopped at language 12, so stock in those languages was never checked as its own scope.
- **`FullArt`, `UberRare` and `WithDie` columns** in the stock export, for Force of Will and Star Wars: Destiny. They read `N` for every other game. Bulk-Update reads the CSV by column name, so existing sheets keep working.
- **Fast Mode now honours "verify after update".** The option existed but only ever applied to the slow modal flow; in Fast Mode it was silently ignored. It now re-reads the price from Cardmarket after writing it.
- **Rows that fall back from Fast Mode are reported.** The log now says how many rows went through the slower modal flow and why, grouped by reason. Previously this was only visible in the Cardmarket tab's developer console.

### Fixed

- **Digimon exports failed completely.** The game picker sent `DigimonCardGame`, but Cardmarket's path is `Digimon`, so every Digimon export hit an HTTP 404. One of the eight advertised games had never worked.
- **"Indonesian" filtered Polish.** The card-language checkbox labelled Indonesian sent language ID 13, which is Polish on Cardmarket. Indonesian is 16. Anyone filtering for Indonesian silently got the wrong language.
- **The condition subdivision did nothing.** When a scope hit Cardmarket's 300-listing cap, the export subdivided it by condition. Cardmarket ignores the condition parameter on the stock page entirely (verified: filtering for Mint and for Poor both return the identical, unfiltered result), so that step made seven extra requests per scope and split nothing. It is replaced by **rarity**, which does filter, and whose values are read from the page for whichever game you are exporting.
- **Bulk-Update could overwrite a card's language with German, and its condition with Near Mint.** Fast Mode filled in defaults when a value could not be read from the CSV: language fell back to ID 3 (German) and condition to `NM`, and both were then written to the live listing. The export recognised only 11 of the 17 languages, so Dutch, Polish, Czech, Hungarian, Indonesian and Thai listings were affected, as was any row whose language or condition cell was empty. Language names are now read from Cardmarket's own dropdown, which covers every interface language including French, Spanish and Italian, where none were recognised before. Where a value still cannot be resolved, Fast Mode hands that row to the slower modal flow, which edits Cardmarket's own pre-filled form and therefore updates the price while leaving language and condition untouched. Nothing is guessed any more. **If you have run a Bulk-Update on listings in those languages, or on a CSV with empty language or condition cells, check them.**
- **The listing counter is now read in every interface language.** v2.2.11 compared the export against Cardmarket's result counter by matching words like "Results" and "Ergebnisse". The German stock page says "Treffer", so the check never ran for German users and the v2.2.11 recovery was inactive for them. The count is now read from the `total-count` element Cardmarket renders identically in every language.
- **Fast Mode counted failed updates as successes.** It treated any HTTP 200 as proof the update went through. Cardmarket's AJAX endpoints return validation failures *with* status 200, so a listing whose price was never written still counted as OK. The response is now inspected, and a row that reports an error is handed to the modal flow instead.
- **A capped scope was abandoned when card languages were filtered.** Picking specific card languages in the popup put the language into the base filter, and the subdivision then stopped before it began. A set-plus-language scope over Cardmarket's 300-listing cap was silently truncated. It is now subdivided by rarity and variant like any other scope.
- **Six games had no fallback axis.** Yu-Gi-Oh!, One Piece, Digimon, Flesh and Blood, Cardfight!! Vanguard and Weiß Schwarz have no print variant, so a capped scope could not be split at all if the rarity list was unavailable. Each game now has an ordered list of axes (first edition, signed, altered as applicable), and the subdivision keeps going while a half is still capped, instead of stopping after one split.
- **Want-Lists bulk-edit could send an unrecognised language straight to Cardmarket.** An unresolved language name was passed through as-is. It is now resolved against Cardmarket's own dropdown; if that fails the field is left out and the affected entries are named in the log.
- **A blocked rarity lookup no longer stalls the run.** It retries a 429 once, refuses to treat a Cloudflare page as "this game has no rarity filter", and gives up for the rest of the run after three failures instead of paying the retry cost on every capped scope.

---

## [2.2.12] — 2026-08-23

### Fixed

- **Whole expansions could silently drop out of an export.** A transient empty/challenge response on the *first* page of a set's stock view returned zero rows without erroring — and unlike pages 2+, page 1 was never retried — so the entire set vanished from the CSV with no warning (a real case lost a 913-card set). Page 1 now retries once, like the other pages.

### Added

- **Stock completeness self-check.** After a full export, the tool now reconciles what it captured against Cardmarket's own per-set card counts (the `(N)` numbers in the expansion dropdown, e.g. `Journey Together (913)`). These numbers are identical in every Cardmarket UI language, so unlike the previous "Results" counter — which does not exist on the **German** stock UI, leaving German-language exports unprotected — this check works regardless of language. Any set that came up short gets one automatic re-scan (forced language/condition/reverse-holo subdivision), and the log ends with a clear verdict: `✓ all 36,116 cards across 151 sets exported completely`, or an explicit list of which sets are still short. **Silent under-counts are no longer possible.**

  This closes the gap behind the v2.2.11 recovery on non-English/Spanish UIs, where the result-counter it relied on was never present.

---

## [2.2.11] — 2026-08-10

### Fixed

- **Stock export no longer under-counts large or awkwardly-paginated stock.** Two Cardmarket pagination quirks could silently drop listings from the export:
  - **Sort-order pagination gap:** under some sort orders Cardmarket occasionally omits a listing between pages, even in small sets (e.g. 36 cards exporting as 35). The export now reads Cardmarket's own result counter and, when it collected fewer unique ArticleIDs than Cardmarket reports, re-runs that scope with a different sort order (`price_desc`) and merges the results by ArticleID.
  - **Exact 300-listing cap:** a scope that hit Cardmarket's 300-listing cap could look "complete" — the affected stock view serves 20 rows per page, so the old "last page full" cap check missed it — and skip the language/condition subdivision. Reaching 300 listings now always triggers subdivision.

  Together these recover listings that were previously lost. Diagnosed and verified in detail by a user (Ángel), who confirmed a full export going from 6,853 to the correct 6,964 cards. Thank you! The export now logs a short "pagination recovery" summary when it recovers anything.

---

## [2.2.10] — 2026-08-09

### Added

- **`Foil` column in the stock export.** Completes the variant flags added in v2.2.9 — the exported CSV now has a `Foil` (Y/N) column right next to `ReverseHolo`, read from each listing's foil icon on the stock page. Especially useful for Magic: The Gathering sellers, where Foil is the key variant. Requested by e-mail.

---

## [2.2.9] — 2026-08-06

### Added

- **Variant-flag columns in the stock export.** The exported CSV now has four new Y/N columns next to the existing `ReverseHolo` — **`FirstEd`, `Signed`, `Altered`, `Playset`** — read from each listing's variant icons on the stock page (the same tooltip source as reverse-holo). Requested in [#2](https://github.com/lupzn/cardmarket-stock-exporter/issues/2). The columns are informational in the export; Bulk-Update is unaffected (it still preserves these flags from Cardmarket's own data, and reads the CSV by column name, so existing sheets keep working).

---

## [2.2.8] — 2026-07-16

Fixes Bulk-Update on Cardmarket's newer stock-page markup, plus a pinned-tab targeting bug. Both reported in [#1](https://github.com/lupzn/cardmarket-stock-exporter/issues/1).

### Fixed

- **Fast Mode works on Cardmarket's new stock markup again.** In the same rollout that moved rows from `articleRow<id>` to `stockRow<id>` (see v2.2.6), Cardmarket also moved the CSRF token (`__cmtkn`) off the stock page and into each edit modal. Fast Mode's direct update read that token from the page DOM, found nothing (`__cmtkn missing`), fell back to the modal flow and timed out. It now reads the token from the page when present and otherwise fetches a single edit modal once, caches the token, and reuses it for the whole run — so Fast Mode is markup-independent and works on both the old and new stock pages. (Diagnosed from a user console dump: `cmtknInputs: 0`, `stockRows: 20`, `articleRows: 0`.)
- **Pinned popup no longer targets the wrong tab.** When the popup was pinned into its own window, it kept using the originally-pinned tab without checking it was still on Cardmarket. If that tab had navigated elsewhere, `chrome.scripting.executeScript` failed with Chrome's raw *"Cannot access contents of the page…"*. `getTargetTab()` now re-validates the pinned tab against the extension's host permission (`https://www.cardmarket.com/*`), falls back to a real Cardmarket tab, and returns nothing when none is open — so you get a clear "open your Cardmarket stock page" message instead of the cryptic Chrome error.

---

## [2.2.7] — 2026-07-13

Export gains targeted set selection, and the remaining German-only log lines are now localized.

### Added

- **Targeted set export.** A new "Load my sets" section on the Export tab reads the expansions you actually hold in stock (from Cardmarket's `idExpansion` filter), lists them as checkboxes with a per-set card count, and lets you export only the sets you tick — instead of the whole stock. Counts come from Cardmarket's filter labels when present, otherwise from a light per-set page-1 scan (shown with a `~` when estimated). Partial exports get a filename marker (`…-Pokemon-v2.2.7-3sets.csv`, or the set name for a single set). The existing "Start full export" flow is unchanged, and a targeted run never falls back to a full export.

### Changed

- **All Bulk-Update and Want-Lists log/status messages now follow the selected UI language.** v2.2.6 localized the core analyze-phase lines; this release covers the rest — fetch/preview progress, Slow-Mode/Cloudflare guidance, comment-update warnings, diagnostics, recovery, "update done", and the entire Want-Lists tab. On an English UI the logs are now English throughout (~74 message strings via the `tl()` helper).

---

## [2.2.6] — 2026-07-11

Critical fix: Cardmarket changed their stock-page markup — the extension could no longer read the `ArticleID`, which broke Bulk-Update for everyone. Reported in [#1](https://github.com/LUPZN/cardmarket-stock-exporter/issues/1).

### Fixed

- **ArticleID extraction rewritten for Cardmarket's current markup.** Cardmarket removed the `id="articleRow<id>"` attribute (rows are now `stockRow<id>` and several CSS classes are obfuscated), so every export produced an **empty `ArticleID` column** — and Bulk-Update rejected every row as *"invalid (missing ID)"* before it ever checked your `Price_EUR`/`Comments` edits (hence the confusing "0 user-edits"). `parseRow` now resolves the article ID from, in order: (1) the edit-pencil link's `data-modal="…Article_EditArticleModal?…idArticle=X"`, (2) the amount input's `name="groupCountAmount<id>"`, (3) the row's `onclick`/`stockRow<id>` blob, (4) legacy `articleRow<id>` fallback. Triple-redundant, so a single future markup tweak won't break it again.
- Stock Export and Bulk-Update both work again with no workflow change — just re-export once with this version.

### Changed

- **Bulk-Update log/status messages now follow the selected UI language.** On an English UI the core analyze-phase messages (CSV read, price comparison, skip-fetch summary, "no edits detected", "X rows invalid", "nothing to do", wrong-CSV/column errors, etc.) were still shown in German — confusing for non-German users (also surfaced via #1). Added a lightweight inline bilingual helper (`tl()`) driven by the current UI locale.

### Notes

- Only the ID extraction was affected; card name, price, `idProduct`, condition, language etc. were always read correctly, so **Want-Lists and the CSV structure are unchanged**.
- Remaining verbose Export/Want-Lists log lines are still German-only and will be localized in v2.2.7.

---

## [2.2.5] — 2026-05-06

Codebase audit + variant-flag preservation hardening.

### Fixed

- **`directUpdate` now preserves all variant flags** (`isFoil`, `isSigned`, `isAltered`, `isFirstEd`, `isPlayset`) from the article's current Cardmarket state, not just `isReverseHolo` from CSV. Previously these flags were never sent → CM may have stripped them silently for foil/signed/altered cards. Now `fetchArticleState` reads each flag's checkbox/input from the modal-form HTML and pipes the values through to `directUpdate` so the listing keeps its variant attributes after bulk price/comment update.
- **Robust form-detection** propagated to all 4 modal-parsing call sites (was already in 2 of them: `fetchArticleState`, `fastUpdate`; now also in `parseCurrentPrice` and `openModalAndGetFormCore`'s mutation observer + shown-handler). Consistent `form[id^="Edit"] || closest("form") of input[name="price"]` fallback everywhere.

### Internal

- i18n key coverage audit: all 82 keys referenced in popup.js + popup.html exist in both DE and EN messages.json (no missing translations).
- 20 unused i18n keys retained in messages.json for future log-message localization (csv_*, update_*, wants_*, cf_*).

---

## [2.2.4] — 2026-05-06

Reverse-Holo bulk-update fix + Fast-Mode form-detection robustness.

### Fixed

- **Reverse-Holo cards silently skipped/dropped during bulk-update.** Reported by LUPZN. Root cause: `directUpdate()` (the verified Direct AJAX endpoint) never passed the `isReverseHolo` form field to `/AjaxAction/Article_EditSingleArticle`, so Cardmarket either rejected the update or stripped the reverse-holo flag from the listing. Fixed: `directUpdate` now passes `isReverseHolo` (`1`/`0` derived from CSV's `ReverseHolo` Y/N column) on every update, plus pass-through fields for `isFoil` / `isSigned` / `isAltered` / `isFirstEd` / `isPlayset` if available on the update object.
- **Fast Mode form-detection** updated to match v2.2.3's robust selector. Previous `form[id^="Edit"]` query missed extension-articles and any other modal whose form-id pattern differs. Now falls back to "any form containing `input[name="price"]`".

---

## [2.2.3] — 2026-05-06

Likely fix for the extension-set bulk-update issue.

### Fixed

- **Robust modal-form detection.** Previous selector `form[id^="Edit"]` missed extension-articles whose form id pattern differs. Now falls back to "any form containing an `input[name="price"]`" — should catch regular articles, extension articles, language-variants, and any future form-id changes from Cardmarket.
- Comments-textarea lookup also relaxed to fall back to document-level if no enclosing form is found.

### Added — Diagnostics

- When the modal-form parser fails for any article, captures up to 3 sample diagnostics: article ID, all form IDs found, all input/textarea names found, plus first 800 chars of HTML. Logged to popup + browser console for paste-back debugging.

### v2.2.2 (rolled into 2.2.3)

Diagnostic release for the extension-set bulk-update issue surfaced by LUPZN. Verified via DevTools trace that the modal URL is identical for ext-articles (`/Modal/Article_EditArticleModal?idArticle=X`) and returns 200 OK — root cause is form-detection, not endpoint mismatch.

---

## [2.2.2] — 2026-05-06

Diagnostic release for extension-set bulk-update issue.

### Investigation

User-reported (LUPZN, follow-up): comment edits on extension/expansion sets (e.g. "Black Bolt JP: Ergänzungen", SetCode `x-...`) are silently skipped during bulk-update **even when the "Comments mit-updaten" toggle is ON** — regular sets get their comments updated correctly in the same run. The v2.2.1 silent-skip-warning fix did not address this case. Suspected root cause: the `/Modal/Article_EditArticleModal?idArticle=X` endpoint may return no edit-form for extension-article IDs → fetch returns null → status "not found" → row not applied. Cannot confirm without a DevTools network trace.

### Added — Diagnostics

- **Per-Expansion status breakdown** after analyze. Lists every expansion with a row count breakdown: ok / not-found / unchanged / capped. Surfaces patterns like "expansion X has 100% not-found" immediately.
- **Extension-set auto-detection** — expansions matching `/erg[äa]nzung|extension/i` with 100% not-found rows trigger a special diagnostic block requesting a DevTools network trace of the modal-load URL.
- **Sample articleIDs** for problematic expansions: prints first 3 `articleId / idProduct / language / condition / expansion` tuples for direct DevTools inspection.

---

## [2.2.1] — 2026-05-06

Defensive fix for users who forget the "Update comments" toggle.

### Fixed

- **Silent-skip of comment-only edits when "Update comments" toggle was OFF.** Pre-existing bug surfaced by LUPZN's investigation: the v2.1 Skip-Fetch optimization treated comment-only edits as "no change" when the toggle was off, even if the user had actually edited the Comments column. Now the analyzer detects when `Comments` differs from `_OriginalComments` even with the toggle off, counts those rows, and surfaces a loud red warning in the preview area listing affected articles. The user must now either enable the toggle or explicitly accept that comment edits will be ignored.
- Diagnostic logs now show up to 3 sample silent-skip cases with article ID, expansion, old comment, new comment for quick verification.

> Note: this fix is **defensive** — it does NOT address the toggle-ON extension-set bug. See v2.2.2 for that investigation.

---

## [2.2.0] — 2026-05-03

i18n release — UI now supports German + English with auto-detection from browser locale plus manual override toggle.

### Added

- **`_locales/de/messages.json` + `_locales/en/messages.json`** — Chrome standard i18n dictionaries with ~100 keys covering UI labels, buttons, hints, banners, progress text, and key log/error messages.
- **i18n.js** helper module — hybrid approach combining `chrome.i18n.getMessage()` (browser-locale-based) with `chrome.storage.local` override for in-popup language toggle.
- **🌐 UI Language toggle** in popup header — Auto / 🇩🇪 DE / 🇬🇧 EN. Override persists across sessions via `chrome.storage.local`.
- **`storage` permission** added to manifest for persisting the user's preferred UI language.

### Changed

- `manifest.json` — `name`, `description`, `default_title` now use `__MSG_*__` placeholders. `default_locale: "de"` set as fallback.
- `popup.html` — all visible UI strings (labels, buttons, hints, options) now carry `data-i18n*` attributes for runtime translation.
- `popup.js` — wired i18n init at startup, replaced key user-visible strings with `t()` helper calls (progress text, error logs, status banners, button labels).

### Compatibility

- Existing v2.1 installs auto-update without data loss. Stored UI language preference: defaults to "auto" (browser locale).
- Existing CSV exports remain compatible — CSV column structure unchanged.
- Some verbose internal log messages remain in German for v2.2 and will be fully translated in v2.3.

---

## [2.1.0] — 2026-04-29

Major release driven by community feedback from Reddit (r/Cardmarket) and direct user reports. Focus: hardening Bulk-Update against real-world edge cases + Want-Lists support + speed.

### Added — Stock Export

- **CSV Header Metadata**
  CSV files now begin with a comment line `# CMSE-META | exported=ISO | lang=XX | game=XX | tool=vX.Y.Z`. Used by Bulk-Update to detect tab-mismatch and stale-export warnings. Backwards compatible — old CSVs still parse fine.
- **`idProduct` column**
  New column extracted from row markup (multiple fallback sources: data attributes, hidden inputs, edit-link href, onclick blobs). Required for the new idArticle auto-rebind feature.
- **`SetCode` + `CollectorNumber` columns**
  Parsed from `ExpansionCode` (e.g. `sv2a 063` → `sv2a` + `063`). `ExpansionCode` is preserved for backwards compatibility. Handles edge formats like `001/250` and pure-numeric collector numbers.
- **Cascading Filter for >300-listing expansions**
  When an expansion's listings exceed Cardmarket's per-query cap (~300 with sortBy), the scraper now auto-splits by `idLanguage` → `idCondition` → `isReverseHolo` until each sub-query stays under the cap. Power sellers with thousands of variants per set will no longer silently lose entries.

### Added — Bulk Update

- **idArticle Auto-Rebind**
  When the price-fetch returns 404 for a stale `idArticle`, the tool now refetches `/Stock/Offers/Singles?idProduct={idProduct}` and tries to match an active listing on `(language, condition, isReverseHolo)`. Unique match → automatic rebind, original ID seamlessly replaced under the hood. Multi-match or no-match → kept as "not found" for safety. The preview UI shows a `↻NEW_ID` badge on rebound rows and a green banner with the rebind count.
- **Stale-Export Sanity Check**
  Two new warnings:
  - CSV older than 24h → `⚠ CSV ist Xh alt — empfohlen: vor Bulk-Update neu exportieren`
  - More than 5% of IDs not found after rebind attempts → recommendation to re-export
- **Tab-Mismatch Detection**
  Compares CSV's `lang`/`game` metadata against the active Cardmarket tab. Mismatch shows a confirm dialog before continuing — prevents the common failure mode of "exported from `/de/Pokemon/`, ran update on `/en/Magic/`, all 5000 IDs 404'd."
- **Comments Bulk-Edit**
  New "Comments mit-updaten" toggle. When enabled, abweichende `Comments` in the CSV are written back to Cardmarket along with prices. Safety default: empty CSV comments are ignored (won't accidentally wipe existing comments). Diff preview shows a second row per article when comments will change, with truncated old/new text and full text in the tooltip.
- **⚡ Fast Mode / Direct Mode (opt-in, recommended for >100 items)**
  Direct AJAX POST to `/{lang}/{game}/AjaxAction/Article_EditSingleArticle` — verified via DevTools network trace. Skips modal-fetch + modal-render + Bootstrap-init entirely. **1 POST per article instead of 2-3**. ~10× faster than modal-flow, ~70% less Cloudflare load. Eliminates "modal did not load form within 5s" errors entirely. Auto-fallback to modal-flow on any per-request error.
  **Production-verified:** 1201 cards price-update in single run with 0 errors using Fast Mode + Slow Mode (LUPZN, 2026-05-01). Second run: 1900+ cards Comments-bulk-update successful (LUPZN, 2026-05-02). Recommended setup for >1000 items: ⚡ Fast Mode + 🐢 Slow Mode + Pin-to-Window, **keep popup in foreground for the full run, do not use Cardmarket manually during the run** (no tab switching, no parallel edits).
- **🐢 Slow Mode (recommended for >500 items)**
  Reduces request rate to ~1 req/2s — stays under Cloudflare Bot Management thresholds. Sequential batches with explicit pauses. Trade-off: ~40 min wall-time for 1200 items, but bulletproof success rate. Auto-warns if >500 items submitted without Slow Mode active.
- **🛡️ Cloudflare Detection + Cascade-Abort**
  Detects CF challenge responses (status 403/520/521/522/524, body markers like "Just a moment", "Checking your browser"), backs off with exponential pause (5s/10s/15s/20s/up to 90s for CF-specific codes). If 20 consecutive fetch fails detected → auto-abort with clear recovery instructions (close tabs, wait 10-15 min, clear cookies, re-login, retry with Slow Mode).
- **♻️ Skip-Fetch Optimization**
  CSV exports now include `_OriginalPrice_EUR` + `_OriginalComments` reference columns. On re-import, only rows where the user actually edited a field get fetched from Cardmarket. 1500 rows with 50 edits → 50 fetches instead of 1500. Massive reduction in CF-load.
- **🎯 Set-Filter (pre-fetch)**
  After CSV analysis, a checkbox panel shows all expansions with their edit-counts + total card-counts. User can deselect sets to skip — selected-out sets are not fetched and not updated. Live-updates the [Bestätige Update]-button count as user toggles.
- **idProduct Recovery from Excel**
  Same scientific-notation salvage as `ArticleID` now applies to `idProduct` (Excel mangles long IDs into `1.23e+10` format).

### Added — Want-Lists (new feature)

- **Want-Lists Export**
  Brand-new `📋 Wants` tab. Auto-discovers all your wantlists from `/Wants`, then paginates each `/Wants/EditWantsList/{id}` to build a combined CSV. Columns: `WantListName, idWantsList, idProduct, idWant, ProductName, Expansion, ExpansionCode, Language, MinCondition, IsFoil, IsSigned, IsAltered, IsPlayset, IsReverseHolo, MaxPrice_EUR, Quantity, ProductUrl, delete`. Use case: cleaning up old wantlists after years of buying.
- **Want-Lists Bulk-Delete via CSV**
  Edit the exported CSV in Excel/Sheets, set `delete=Y` on rows you want gone, re-upload. Tool validates IDs, shows preview, requires confirmation before live delete. Dry-Run is on by default for safety.

### Changed

- **License: MIT → GPL-3.0** (relicensed starting v2.1). Forks and derivative Chrome Web Store uploads must now remain open-source under GPL-3.0 and disclose their source. Existing v1.0–v2.0 releases stay under MIT.
- `manifest.json` version bumped 2.0.0 → 2.1.0
- `parseCsv` now skips comment lines (lines starting with `#`) and surfaces metadata as third return value
- `scrapePages` signature changed from `(idExpansion, label, ...)` to `(filterObj, label, ...)` and returns `{added, capSuspect, totalPagesSeen, pagesFetched}` instead of just `added`. Driven by Cascading Filter requirements.

### Compatibility

- v2.0 CSVs (without `# CMSE-META` header, without `idProduct`/`SetCode`/`CollectorNumber` columns) still parse and bulk-update — `idProduct` will simply be empty for those rows, which means **no auto-rebind** is possible. Re-export with v2.1 is recommended for active sellers.
- New CSV columns are appended; existing column positions unchanged. Excel/Sheets workflows that reference columns by name continue to work.

### Known limitations

- **Popup must stay in foreground during Export/Bulk-Update — and Cardmarket must NOT be used manually during the run.** Chrome MV3 terminates popup-context on blur, killing the scrape/update loop silently. Manual Cardmarket activity (clicks, edits, second tab, mobile app) collides with scraper fetches (CSRF rotation, session conflicts, CF rate-spike) → run aborts. **Recommended setup:** open Cardmarket in one Chrome window (Tab A), click **📌 Pin-to-Window** to detach the extension into its own window (B, 720×1000), place A + B side-by-side, and let the run finish — do not switch the Cardmarket tab, do not minimize window B, do not interact with Cardmarket anywhere else until done. Service-Worker migration planned for v2.2.
- **Want-Lists Bulk-Delete endpoint** is based on the most likely Cardmarket pattern (`POST /Wants/EditWantsList/{id}` with `action=remove`). If your account uses a different flow, please file an issue with a DevTools network-trace of a manual delete.
- **Fast Mode** assumes the form's `action` URL accepts the same FormData payload as the Bootstrap modal submit. Auto-fallback to modal-flow on any error keeps the run safe, but if you see consistently high fallback counts, switch off Fast Mode and report the response status.
- **Cascading Filter language IDs** cover IDs 1-12 (DE, EN, FR, ES, IT, S-CN, JP, KO, RU, PT + buffer). New Cardmarket languages added later may need a manifest bump.

### Acknowledgements

This release exists thanks to detailed feedback from r/Cardmarket users:
- Cascading-filter request from a user pointing out variant-rich expansions
- idArticle-drift technical writeup from an experienced API user
- Bug report on "262 ArticleIDs not found" that turned out to be the same drift issue
- Want-Lists export request (cited by 2 different users in the same thread)
- Comments bulk-edit request (also cited by 2 different users)
- Direct-AJAX speed suggestion from a Cardmarket-API power user

---

## [2.0.0] — earlier

- Initial Bulk Price Update via CSV-Import
- 8 games, 5 languages
- Pin-to-window
- Auto-pause on HTTP 429
- Excel-formula-wrapped IDs (avoid scientific-notation mangling)
- Live diff preview, dry-run mode, max-change-% safety cap
- Verify mode (re-fetch each price after update)

## [1.0.0] — initial

- Stock-only export to CSV
- Per-expansion iteration to bypass 300-entry cap
- 8 games, 5 languages

---

Maintained by [LUPZN](https://github.com/lupzn). Issues + PRs welcome.
