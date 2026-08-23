const btnRun = document.getElementById('run');
const btnDetach = document.getElementById('detach');
const statusEl = document.getElementById('status');
const maxPagesEl = document.getElementById('maxPages');
const delayEl = document.getElementById('delay');
const langEl = document.getElementById('lang');
const gameEl = document.getElementById('game');

// v2.3.0: Version dauerhaft, aber dezent in der Fusszeile anzeigen. Vorher stand sie nirgends
// im Popup — bei Support-Anfragen war die erste Rueckfrage immer "welche Version hast du?".
try {
  const verEl = document.getElementById('verLabel');
  if (verEl) verEl.textContent = 'v' + chrome.runtime.getManifest().version;
} catch (e) { /* ausserhalb des Extension-Kontexts egal */ }

// v2.3.0: Nach einem gelungenen Export die Bitte um Unterstuetzung mit der tatsaechlichen
// Leistung fuellen. Eine abstrakte Bitte ("Gefaellt dir das Tool?") uebersieht man; eine
// konkrete Zahl ("34.754 Karten, 8.839 € Warenwert, 12 Minuten") wird gelesen.
function showSupportResult(cards, valueEur, minutes) {
  const head = document.getElementById('supportHead');
  const sub = document.getElementById('supportSub');
  if (!head || !sub) return;
  const isEn = ((window.i18n && window.i18n.currentLocale && window.i18n.currentLocale()) || 'de') === 'en';
  const nf = new Intl.NumberFormat(isEn ? 'en-US' : 'de-DE');
  head.textContent = tl(
    `Gerade exportiert: ${nf.format(cards)} Karten, ${nf.format(Math.round(valueEur))} € Warenwert.`,
    `Just exported: ${nf.format(cards)} cards worth €${nf.format(Math.round(valueEur))}.`
  );
  sub.textContent = tl(
    `Das lief ${minutes} Minuten ohne dein Zutun. Das Tool ist kostenlos, werbefrei und wird von einer Person nebenbei gepflegt — beides hier hilft dabei:`,
    `That ran for ${minutes} minutes without you. The tool is free, ad-free and maintained by one person on the side — either of these helps:`
  );
}
const useSortByEl = document.getElementById('useSortBy');
const perExpansionEl = document.getElementById('perExpansion');
const abortBtn = document.getElementById('abort');
const progressEl = document.getElementById('progress');
const progFillEl = document.getElementById('progFill');
const progTextEl = document.getElementById('progText');
const keepOpenHintEl = document.getElementById('keepOpenHint');
// v2.2.7: gezielter Set-Export
const btnLoadSets = document.getElementById('btnLoadSets');
const setExportList = document.getElementById('setExportList');
const setExportControls = document.getElementById('setExportControls');
const setExportAll = document.getElementById('setExportAll');
const setExportNone = document.getElementById('setExportNone');
const btnExportSets = document.getElementById('btnExportSets');

// v2.2: i18n shorthand
const t = (key, vars) => (window.i18n ? window.i18n.getMsg(key, vars || []) : key);

// v2.2.6: inline bilingual log helper — picks DE/EN by current UI locale.
// Used for the many free-text log/status messages that would otherwise stay
// hardcoded German even on an English UI (reported in issue #1). Cheaper than
// one messages.json key per line; supports interpolation at the call site.
const tl = (de, en) => {
  const loc = (window.i18n && window.i18n.currentLocale && window.i18n.currentLocale()) || 'de';
  return loc === 'en' ? en : de;
};

// v2.2: i18n init — load locale, populate uiLang dropdown, apply translations
(async () => {
  if (!window.i18n) return;
  await window.i18n.loadLocale();
  window.i18n.applyI18n();
  const uiLangEl = document.getElementById('uiLang');
  if (uiLangEl) {
    const { uiLocale } = await chrome.storage.local.get('uiLocale');
    uiLangEl.value = uiLocale || 'auto';
    uiLangEl.addEventListener('change', async () => {
      await window.i18n.setLocale(uiLangEl.value);
    });
  }
})();

// Detect detached mode + target tab from URL params
const urlParams = new URLSearchParams(location.search);
const isDetached = urlParams.get('detached') === '1';
const forcedTabId = urlParams.get('tabId') ? parseInt(urlParams.get('tabId'), 10) : null;

// v2.2.8: only ever hand back a tab we can actually script (mirrors
// host_permissions). A pinned/forced tab is reused ONLY if it is still on
// www.cardmarket.com; otherwise find a real Cardmarket tab, and return null if
// there is none — callers then show a clear "open your stock page" message
// instead of Chrome's raw "Cannot access contents of the page" error (issue #1).
const CM_TAB_URL = 'https://www.cardmarket.com/*';
const CM_HOST_RE = /^https:\/\/www\.cardmarket\.com\//i;
async function getTargetTab() {
  if (forcedTabId) {
    try {
      const t = await chrome.tabs.get(forcedTabId);
      if (t && CM_HOST_RE.test(t.url || '')) return t;   // pinned tab still on Cardmarket
    } catch { /* tab was closed */ }
    // pinned tab drifted off Cardmarket → fall through and find a real one
  }
  const active = await chrome.tabs.query({ active: true, currentWindow: true, url: CM_TAB_URL });
  if (active.length) return active[0];
  const any = await chrome.tabs.query({ url: CM_TAB_URL });
  if (any.length) return any[0];
  return null;
}

if (isDetached) {
  btnDetach.style.display = 'none';
  keepOpenHintEl.style.display = 'none';
  document.title = 'Cardmarket Stock Exporter (pinned)';
  // v2.1: detached → make body resizable + larger default
  document.body.classList.add('detached');
} else {
  btnDetach.addEventListener('click', async () => {
    try {
      const tab = await getTargetTab();
      // v2.1: größeres detached-fenster (vorher 400x780)
      const width = 720, height = 1000;
      await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html') + `?detached=1${tab?.id ? '&tabId=' + tab.id : ''}`,
        type: 'popup',
        width,
        height,
      });
      window.close();
    } catch (e) {
      log(t('log_pin_error', [e.message]), 'err');
    }
  });
}

abortBtn.addEventListener('click', async () => {
  try {
    const tab = await getTargetTab();
    if (!tab) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.__cmExportStop = true; },
    });
    log(t('log_abort_requested'), 'err');
  } catch (e) { log(t('log_abort_error', [e.message]), 'err'); }
});

const log = (msg, cls = '') => {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  statusEl.appendChild(d);
  statusEl.scrollTop = statusEl.scrollHeight;
};

// Prefill lang + game from target tab URL
// v2.1: locale-auto-detect — wenn Tab-locale erkannt, footer-locale-dropdown setzen + auto-note anzeigen
const localeAutoNote = document.getElementById('localeAutoNote');
let userOverrodeLocale = false;
langEl.addEventListener('change', () => {
  userOverrodeLocale = true;
  if (localeAutoNote) { localeAutoNote.textContent = t('locale_manual'); localeAutoNote.style.color = '#fbbf24'; }
});
(async () => {
  try {
    const tab = await getTargetTab();
    const m = (tab?.url || '').match(/cardmarket\.com\/([^/]+)\/([^/]+)\//);
    if (m) {
      if ([...langEl.options].some(o => o.value === m[1]) && !userOverrodeLocale) {
        langEl.value = m[1];
        if (localeAutoNote) { localeAutoNote.textContent = `${t('locale_auto')} (${m[1]})`; localeAutoNote.style.color = '#6ee7b7'; }
      }
      if ([...gameEl.options].some(o => o.value === m[2])) gameEl.value = m[2];
    }
  } catch {}
})();

// v2.1: Card-language-filter (multi-select checkboxes)
const cardLangFilterEl = document.getElementById('cardLangFilter');
function getSelectedCardLangIds() {
  if (!cardLangFilterEl) return [];
  return [...cardLangFilterEl.querySelectorAll('input[type="checkbox"][data-lang-id]:checked')].map(cb => cb.getAttribute('data-lang-id'));
}
// v2.3.0: Der Sprachfilter ist eingeklappt. Damit man trotzdem sieht, ob gefiltert wird,
// zeigt die Kopfzeile die aktuelle Auswahl — sonst wuerde ein vergessener Haken zu einem
// unerklaerlich kleinen Export fuehren, ohne dass man den Grund sieht.
function updateLangSummary() {
  const el = document.getElementById('langSummary');
  if (!el || !cardLangFilterEl) return;
  const picked = [...cardLangFilterEl.querySelectorAll('input[data-lang-id]:checked')]
    .map(cb => cb.parentElement?.querySelector('span')?.textContent?.trim() || '');
  if (!picked.length) {
    el.textContent = tl('alle Sprachen', 'all languages');
    el.style.color = '';
  } else {
    el.textContent = picked.length <= 3
      ? picked.join(', ')
      : tl(`${picked.length} Sprachen`, `${picked.length} languages`);
    el.style.color = 'var(--accent)';
  }
}
if (cardLangFilterEl) {
  cardLangFilterEl.addEventListener('change', updateLangSummary);
  setTimeout(updateLangSummary, 0);
}

const langSelectAll = document.getElementById('langSelectAll');
const langSelectNone = document.getElementById('langSelectNone');
const langSelectAsian = document.getElementById('langSelectAsian');
if (langSelectAll) langSelectAll.addEventListener('click', (e) => {
  e.preventDefault();
  cardLangFilterEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
  updateLangSummary();
});
if (langSelectNone) langSelectNone.addEventListener('click', (e) => {
  e.preventDefault();
  cardLangFilterEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateLangSummary();
});
if (langSelectAsian) langSelectAsian.addEventListener('click', (e) => {
  e.preventDefault();
  // Asiatische Sprachen: 6=S-CN, 7=JP, 10=KR, 11=T-CN, 16=ID, 17=TH
  // v2.2.13: 13 ist Polnisch, nicht Indonesisch — Indonesisch ist 16, Thai neu dazu.
  const asianIds = ['6', '7', '10', '11', '16', '17'];
  cardLangFilterEl.querySelectorAll('input[type="checkbox"][data-lang-id]').forEach(cb => {
    cb.checked = asianIds.includes(cb.getAttribute('data-lang-id'));
  });
  updateLangSummary();
});

function buildBasePath() {
  return `/${langEl.value}/${gameEl.value}/Stock/Offers/Singles`;
}

// v2.2.13: Cardmarket bietet je Spiel unterschiedliche Varianten-Filter an. Diese Liste wurde
// gegen die Stock-Seite jedes einzelnen Spiels verifiziert (Stand 08/2026) — sie ist NICHT geraten.
// Fuer die Kaskade zaehlt davon nur die "Druckvariante", weil sie den Bestand grob halbiert:
// Reverse Holo bei Pokemon, Foil bei den meisten anderen. Signed/Altered/FirstEd sind zu selten,
// um einen 300er-Scope sinnvoll zu teilen. Spiele ohne Druckvariante bekommen null (Stufe entfaellt).
// v2.3.0: Liste statt Einzelwert. Die Kaskade arbeitet die Achsen der Reihe nach ab, solange ein
// Scope ueber dem 300er-Cap bleibt. Reihenfolge = Trennschaerfe: zuerst die Druckvariante (halbiert
// den Bestand grob), danach seltenere Merkmale. Jeder Eintrag existiert nachweislich als Filter auf
// der Stock-Seite des jeweiligen Spiels — geprueft gegen cardmarket.com.
const GAME_SPLIT_PARAMS = {
  Pokemon:           ['isReverseHolo', 'isFirstEd', 'isSigned'],
  Magic:             ['isFoil', 'isSigned'],
  YuGiOh:            ['isFirstEd', 'isSigned'],
  OnePiece:          ['isSigned', 'isAltered'],
  Lorcana:           ['isFoil', 'isSigned'],
  Riftbound:         ['isFoil'],
  DragonBallSuper:   ['isFoil', 'isSigned'],
  Digimon:           ['isSigned', 'isAltered'],
  FleshAndBlood:     ['isSigned', 'isAltered'],
  StarWarsUnlimited: ['isFoil', 'isSigned'],
  FinalFantasy:      ['isFoil', 'isSigned'],
  Vanguard:          ['isSigned', 'isAltered'],
  WeissSchwarz:      ['isSigned', 'isAltered'],
  BattleSpiritsSaga: ['isFoil', 'isSigned'],
  FoW:               ['isFoil', 'isFirstEd', 'isSigned'],
  WoW:               ['isFoil', 'isSigned'],
  StarWarsDestiny:   ['isWithDie', 'isSigned'],
  Dragoborne:        ['isFoil', 'isSigned'],
  MyLittlePony:      ['isFoil', 'isSigned'],
  Spoils:            ['isFoil', 'isSigned'],
};

function getSplitParams() {
  // Unbekanntes Spiel (z.B. neu bei Cardmarket) → keine Varianten-Stufe, Rest laeuft weiter.
  return Object.prototype.hasOwnProperty.call(GAME_SPLIT_PARAMS, gameEl.value)
    ? GAME_SPLIT_PARAMS[gameEl.value]
    : [];
}

btnRun.addEventListener('click', () => runExport(parseInt(maxPagesEl.value, 10) || 0));

// ---- v2.2.7: Gezielter Set-Export ----
const escSetHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function updateExportSetsBtn() {
  if (!btnExportSets || !setExportList) return;
  const n = setExportList.querySelectorAll('input[type="checkbox"]:checked').length;
  btnExportSets.textContent = t('btn_export_sets', [n]);
  btnExportSets.disabled = n === 0;
}

function renderSetPicker(allSets) {
  // v2.3.0: Sets ohne Bestand ausblenden. Cardmarkets Dropdown fuehrt jede Erweiterung auf,
  // auch die mit null Karten — die stehen dann als "Arceus 0" in der Liste, lassen sich nicht
  // exportieren (der Export ueberspringt sie ohnehin) und verwaessern nur die Auswahl.
  // Unbekannte Kartenzahl (null) bleibt drin, die koennte Bestand haben.
  const hidden = (allSets || []).filter(s => s.count === 0).length;
  const sets = (allSets || []).filter(s => s.count !== 0);
  if (hidden > 0) {
    log(tl(`${hidden} Set(s) ohne Bestand ausgeblendet.`, `${hidden} set(s) with no stock hidden.`));
  }
  if (!sets || sets.length === 0) {
    setExportList.style.display = 'none';
    setExportControls.style.display = 'none';
    log(t('log_no_sets_found'), 'err');
    return;
  }
  const header = `<div style="display:flex;align-items:center;gap:6px;padding:5px 8px;font-size:9.5px;color:var(--fg-faint);border-bottom:1px solid var(--line);font-weight:600;letter-spacing:.06em;position:sticky;top:0;background:var(--sunken)">
      <span style="width:14px"></span>
      <span style="flex:1">SET</span>
      <span style="min-width:60px;text-align:right">${tl('KARTEN', 'CARDS')}</span>
    </div>`;
  const rowsHtml = sets.map(s => {
    const safeId = 'setx_' + String(s.id).replace(/[^a-zA-Z0-9]/g, '_');
    const countTxt = (s.approx ? '~' : '') + (s.count != null ? s.count : '?');
    return `<label style="display:flex;align-items:center;gap:6px;padding:5px 8px;margin:0;border-bottom:1px solid var(--line-soft);cursor:pointer">
      <input type="checkbox" id="${safeId}" data-set-id="${escSetHtml(s.id)}" data-set-name="${escSetHtml(s.name)}" style="width:14px;height:14px;flex-shrink:0">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escSetHtml(s.name)}</span>
      <span style="color:var(--warn);font-weight:600;min-width:60px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums">${countTxt}</span>
    </label>`;
  }).join('');
  setExportList.innerHTML = header + rowsHtml;
  setExportList.style.display = 'block';
  setExportControls.style.display = 'block';
  setExportList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.addEventListener('change', updateExportSetsBtn));
  updateExportSetsBtn();
  log(t('log_sets_loaded', [sets.length]), 'ok');
}

async function loadStockSets() {
  if (!btnLoadSets) return;
  btnLoadSets.disabled = true;
  const orig = btnLoadSets.textContent;
  btnLoadSets.textContent = t('btn_load_sets_running');
  try {
    const tab = await getTargetTab();
    if (!tab || !/cardmarket\.com/.test(tab.url || '')) { log(t('log_no_cm_tab'), 'err'); return; }
    const basePath = buildBasePath();
    const useSortBy = useSortByEl.checked;
    const cardLangIds = getSelectedCardLangIds();
    const delay = parseInt(delayEl.value, 10) || 0;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.__cmExportStop = false; },
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [{ mode: 'listSets', maxPages: 0, delay, basePath, useSortBy, perExpansion: true, cardLangIds }],
      func: injectedScrapeAll,
    });
    if (!result || result.error) { log(t('log_error', [result?.error || 'no result']), 'err'); return; }
    renderSetPicker(result.sets || []);
  } catch (e) {
    log(t('log_exception', [e.message]), 'err');
    console.error(e);
  } finally {
    btnLoadSets.disabled = false;
    btnLoadSets.textContent = orig;
  }
}

if (btnLoadSets) btnLoadSets.addEventListener('click', loadStockSets);
if (setExportAll) setExportAll.addEventListener('click', (e) => { e.preventDefault(); setExportList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true); updateExportSetsBtn(); });
if (setExportNone) setExportNone.addEventListener('click', (e) => { e.preventDefault(); setExportList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false); updateExportSetsBtn(); });
if (btnExportSets) btnExportSets.addEventListener('click', () => {
  const checked = [...setExportList.querySelectorAll('input[type="checkbox"]:checked')];
  const selectedSets = checked.map(cb => ({ id: cb.getAttribute('data-set-id'), name: cb.getAttribute('data-set-name') }));
  if (selectedSets.length === 0) return;
  runExport(0, { selectedSets });
});

async function runExport(maxPages, opts = {}) {
  const exportStartedAt = Date.now();
  let partialExport = false;
  const selectedSets = opts.selectedSets || null;
  const selectedExpansionIds = selectedSets ? selectedSets.map(s => String(s.id)) : null;
  btnRun.disabled = true;
  if (btnExportSets) btnExportSets.disabled = true;
  if (btnLoadSets) btnLoadSets.disabled = true;
  abortBtn.style.display = 'block';
  progressEl.style.display = 'block';
  progTextEl.textContent = t('progress_starting');
  progFillEl.style.width = '0%';
  statusEl.innerHTML = '';
  let pollTimer = null;
  try {
    const tab = await getTargetTab();
    if (!tab || !/cardmarket\.com/.test(tab.url || '')) {
      log(t('log_no_cm_tab'), 'err');
      return;
    }
    const delay = parseInt(delayEl.value, 10) || 0;
    const basePath = buildBasePath();
    const useSortBy = useSortByEl.checked;
    const perExpansion = selectedExpansionIds ? true : (perExpansionEl.checked && maxPages !== 1);
    // v2.1: Karten-Sprachen-Filter (multi-select)
    const cardLangIds = getSelectedCardLangIds();
    const langFilterMsg = cardLangIds.length > 0 ? t('log_card_langs', [cardLangIds.join(',')]) : '';
    log(t('log_path_info', [basePath, useSortBy, perExpansion, delay, langFilterMsg]));

    // Reset progress + stop flag in tab context first
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.__cmExportProgress = null; window.__cmExportStop = false; },
    });

    // Start polling
    pollTimer = setInterval(async () => {
      try {
        const [{ result: p }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.__cmExportProgress || null,
        });
        if (!p) return;
        const expTxt = p.expansion ? t('progress_expansion', [p.expansion.idx, p.expansion.total, p.expansion.name || '']) : t('progress_all');
        const pct = p.expansion?.total ? Math.round(((p.expansion.idx - 1) / p.expansion.total) * 100) : 0;
        progFillEl.style.width = pct + '%';
        const errSuffix = p.lastErr ? ' ⚠ ' + p.lastErr : '';
        progTextEl.textContent = t('progress_scrape_status', [expTxt, p.page, p.rowsTotal, p.stockTotal || 0, errSuffix]);
      } catch (e) { /* tab gone or busy, ignore */ }
    }, 800);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [{ maxPages, delay, basePath, useSortBy, perExpansion, cardLangIds, selectedExpansionIds, splitParams: getSplitParams() }],
      func: injectedScrapeAll,
    });

    clearInterval(pollTimer); pollTimer = null;
    progFillEl.style.width = '100%';

    if (result.error) {
      log(t('log_error', [result.error]), 'err');
      if (result.debugSnippet) log(result.debugSnippet.slice(0, 500));
      // v2.3.0: Bei einem Fehler nach langem Lauf trotzdem speichern, was schon da ist.
      // Bisher wurde hier abgebrochen und ein halbstuendiger Export war restlos verloren.
      if (!(result.rows && result.rows.length)) return;
      partialExport = true;
      log(tl(
        `⚠ Teil-Export wird trotzdem gespeichert: ${result.rows.length} Zeilen bis zum Fehler. NICHT als vollständigen Bestand verwenden.`,
        `⚠ Saving a partial export anyway: ${result.rows.length} rows collected before the error. Do NOT treat this as your complete stock.`
      ), 'err');
    }
    // v2.3.0: Bereiche, die trotz Absicherung fehlgeschlagen sind, benennen. Ohne diese Ausgabe
    // waere ein unvollstaendiger Export von einem vollstaendigen nicht zu unterscheiden.
    if (result.scopeErrors && result.scopeErrors.length) {
      log(tl(
        `⚠ ${result.scopeErrors.length} Bereich(e) fehlgeschlagen — der Export ist unvollständig:`,
        `⚠ ${result.scopeErrors.length} scope(s) failed — this export is incomplete:`
      ), 'err');
      result.scopeErrors.slice(0, 10).forEach(se => log(`  ${se.label}: ${se.msg}`, 'err'));
    }
    log(t('log_pages_scanned', [result.pagesScanned]), 'ok');
    if (result.detectedTotalPages) log(t('log_pagination_widget', [result.detectedTotalPages]));
    log(t('log_rows_dedup', [result.rows.length]), 'ok');
    if (result.recoveryStats && result.recoveryStats.attempts > 0) {
      const rs = result.recoveryStats;
      log(
        tl(
          `Pagination-Recovery: ${rs.attempts} Scope(s) mit price_desc erneut geprüft; ${rs.recovered} Listing(s) zusätzlich gefunden.`,
          `Pagination recovery: retried ${rs.attempts} scope(s) with price_desc; recovered ${rs.recovered} additional listing(s).`
        ),
        rs.recovered > 0 ? 'ok' : ''
      );
      if (rs.unresolved && rs.unresolved.length) {
        log(
          tl(
            `⚠ ${rs.unresolved.length} Scope(s) bleiben nach Recovery unvollständig.`,
            `⚠ ${rs.unresolved.length} scope(s) are still incomplete after recovery.`
          ),
          'err'
        );
        rs.unresolved.slice(0, 10).forEach(u => {
          log(`  ${u.label}: ${u.observed}/${u.expected} (${u.missing} missing)`, 'err');
        });
      }
    }
    // v2.2.12: Bestands-Abgleich — Export vs. Cardmarkets Set-Kartenzahlen (sprachunabhängig)
    if (result.completeness && !result.aborted) {
      const c = result.completeness;
      if (c.missingTotal > 0) {
        log(tl(
          `⚠ Bestands-Abgleich: ${c.observedTotal}/${c.expectedTotal} Karten exportiert — ${c.missingTotal} fehlen trotz Nachladen.`,
          `⚠ Stock check: exported ${c.observedTotal}/${c.expectedTotal} cards — ${c.missingTotal} still missing after recovery.`
        ), 'err');
        c.shortfalls.slice(0, 15).forEach(s => log(`  ${s.name}: ${s.observed}/${s.expected} (${s.missing})`, 'err'));
      } else if (c.checkedExpansions > 0) {
        log(tl(
          `✓ Bestands-Abgleich: alle ${c.expectedTotal} Karten aus ${c.checkedExpansions} Sets vollständig exportiert.`,
          `✓ Stock check: all ${c.expectedTotal} cards across ${c.checkedExpansions} sets exported completely.`
        ), 'ok');
      }
      if (c.recovered > 0) {
        log(tl(
          `↻ ${c.recovered} Set(s) per Nachladen vervollständigt.`,
          `↻ Recovered ${c.recovered} set(s) via completeness re-scan.`
        ), 'ok');
      }
      if (c.uncountedExpansions > 0) {
        log(tl(
          `ℹ ${c.uncountedExpansions} Set(s) ohne Cardmarket-Zählwert — nicht geprüft.`,
          `ℹ ${c.uncountedExpansions} set(s) had no Cardmarket count — not verified.`
        ), '');
      }
    }
    const emptyAmount = result.rows.filter(r => !(r.amountDisplay || r.amount)).length;
    if (emptyAmount > 0) log(t('log_rows_no_amount', [emptyAmount]), 'err');
    // v2.1: idProduct-Coverage-Summary für späteren Auto-Rebind
    const emptyIdProduct = result.rows.filter(r => !r.idProduct).length;
    if (emptyIdProduct > 0) {
      const pct = (emptyIdProduct / result.rows.length * 100).toFixed(1);
      log(t('log_rows_no_idproduct', [emptyIdProduct, pct]), 'err');
    } else {
      log(t('log_idproduct_ok', [result.rows.length]), 'ok');
    }
    const totalStock = result.rows.reduce((s, r) => s + (parseInt(r.amountDisplay || r.amount, 10) || 0), 0);
    log(t('log_total_amounts', [totalStock]), 'ok');
    const totalValue = result.rows.reduce((s, r) => s + (parseFloat((r.price || '').replace(/\./g, '').replace(',', '.')) || 0) * (parseInt(r.amountDisplay || r.amount, 10) || 0), 0);
    log(t('log_total_value', [totalValue.toFixed(2).replace('.', ',')]), 'ok');
    // v2.3.0: Unterstuetzungs-Hinweis mit der konkreten Leistung dieses Laufs fuellen.
    if (totalStock > 0) {
      showSupportResult(totalStock, totalValue, Math.max(1, Math.round((Date.now() - exportStartedAt) / 60000)));
    }

    if (result.rows.length === 0) {
      log(t('log_no_rows'), 'err');
      if (result.debugSnippet) log(result.debugSnippet.slice(0, 800));
      return;
    }

    // v2.1: Metadata-Header für Bulk-Update Tab-Mismatch-Detection
    const meta = {
      exportedAt: new Date().toISOString(),
      lang: langEl.value,
      game: gameEl.value,
      toolVersion: chrome.runtime.getManifest().version,
    };
    const csv = buildCsv(result.rows, meta);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const reader = new FileReader();
    reader.onload = async () => {
      // v2.1: Metadata im Dateinamen statt im CSV-Body (Excel mangelt CSV-Comments beim Re-Save)
      // Pattern: cardmarket-stock-{date}-{lang}-{game}-v{version}.csv
      let setMarker = '';
      if (selectedSets && selectedSets.length) {
        if (selectedSets.length === 1) {
          const slug = String(selectedSets[0].name || 'set').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
          setMarker = '-' + (slug || 'set');
        } else {
          setMarker = `-${selectedSets.length}sets`;
        }
      }
      const fname = `cardmarket-stock-${new Date().toISOString().slice(0, 10)}-${meta.lang}-${meta.game}-v${meta.toolVersion}${setMarker}${partialExport ? '-TEILEXPORT' : ''}.csv`;
      try {
        await chrome.downloads.download({ url: reader.result, filename: fname, saveAs: true });
        log(t('log_download', [fname]), 'ok');
      } catch (e) {
        log(t('log_download_error', [e.message]), 'err');
      }
    };
    reader.readAsDataURL(blob);

  } catch (e) {
    log(t('log_exception', [e.message]), 'err');
    console.error(e);
  } finally {
    if (pollTimer) clearInterval(pollTimer);
    btnRun.disabled = false;
    if (btnLoadSets) btnLoadSets.disabled = false;
    if (btnExportSets) updateExportSetsBtn();
    abortBtn.style.display = 'none';
  }
}

function buildCsv(rows, meta = {}) {
  // v2.1: SetCode + CollectorNumber + idProduct als eigene Spalten (ExpansionCode bleibt für Backwards-Compat)
  // v2.1 Skip-Fetch: _OriginalPrice_EUR + _OriginalComments als Read-Only Referenz für Edit-Detection
  // Bei Re-Import wird verglichen: wenn Price_EUR === _OriginalPrice_EUR → user hat nicht editiert → skip Cardmarket-Fetch
  // Massive Reduktion der Cloudflare-Last: 1500 rows mit 50 edits → 50 fetches statt 1500
  // v2.3.0: FullArt/UberRare/WithDie ergaenzt (Force of Will bzw. Star Wars: Destiny).
  // Bulk-Update liest die CSV nach Spaltennamen, bestehende Tabellen funktionieren also weiter.
  const cols = ['ArticleID', 'idProduct', 'Name', 'ExpansionCode', 'SetCode', 'CollectorNumber', 'Expansion', 'Rarity', 'Language', 'Condition', 'ConditionFull', 'ReverseHolo', 'Foil', 'FirstEd', 'Signed', 'Altered', 'Playset', 'FullArt', 'UberRare', 'WithDie', 'Comments', '_OriginalComments', 'Price_EUR', '_OriginalPrice_EUR', 'Amount', 'Total_EUR', 'ProductUrl', 'ImageUrl', 'delete'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  // Excel-formula wrapper to keep long IDs as text (otherwise Excel converts to scientific notation)
  const escId = id => `"=""${String(id ?? '').replace(/"/g, '""')}"""`;
  const yn = b => b ? 'Y' : 'N';

  // v2.1: Metadata wird NICHT mehr im CSV-Body gespeichert (Excel mangelt sie beim Re-Save).
  // Stattdessen wird sie im Dateinamen kodiert: cardmarket-stock-{date}-{lang}-{game}-v{version}.csv
  // parseCsv liest sie beim Import aus dem Dateinamen.
  const lines = [cols.join(';')];

  for (const r of rows) {
    const priceNum = parseFloat((r.price || '').replace(/\./g, '').replace(',', '.')) || 0;
    const amtStr = r.amountDisplay || r.amount || '';
    const amt = parseInt(amtStr, 10) || 0;
    const total = (priceNum * amt).toFixed(2).replace('.', ',');

    // v2.1: SetCode + CollectorNumber aus expansionCode parsen (z.B. "sv2a 063" → set=sv2a, coll=063)
    // Pattern: alles bis zum letzten Whitespace = SetCode, Rest = CollectorNumber. Bewahrt "001/250"-Format.
    let setCode = '';
    let collectorNumber = '';
    const ec = r.expansionCode || '';
    if (ec) {
      const lastSpace = ec.lastIndexOf(' ');
      if (lastSpace > 0) {
        const tail = ec.slice(lastSpace + 1).trim();
        // Tail muss mindestens eine Ziffer enthalten um als CollectorNumber zu zählen
        if (/\d/.test(tail)) {
          setCode = ec.slice(0, lastSpace).trim();
          collectorNumber = tail;
        } else {
          setCode = ec; // kein erkennbares Collector-Pattern → alles als SetCode
        }
      } else {
        // Kein Whitespace → entweder reiner SetCode oder reine Number
        if (/^\d+(\/\d+)?[a-z]?$/i.test(ec)) {
          collectorNumber = ec;
        } else {
          setCode = ec;
        }
      }
    }

    lines.push([
      escId(r.articleId),
      escId(r.idProduct || ''),
      esc(r.name), esc(r.expansionCode), esc(setCode), esc(collectorNumber), esc(r.expansion), esc(r.rarity), esc(r.language), esc(r.condition), esc(r.conditionFull),
      esc(yn(r.reverse)), esc(yn(r.foil)),
      esc(yn(r.firstEd)), esc(yn(r.signed)), esc(yn(r.altered)), esc(yn(r.playset)),
      esc(yn(r.fullArt)), esc(yn(r.uberRare)), esc(yn(r.withDie)),
      // v2.1 Skip-Fetch: Comments + _OriginalComments (gleicher Wert beim Export, divergiert wenn user editiert)
      esc(r.comments), esc(r.comments),
      // Price_EUR + _OriginalPrice_EUR
      esc(r.price), esc(r.price),
      esc(amtStr), esc(total), esc(r.productUrl), esc(r.imageUrl || ''),
      // v2.1: delete-Spalte default N. User setzt auf Y für Bulk-Delete des Listings auf Cardmarket
      esc('N'),
    ].join(';'));
  }
  return lines.join('\r\n');
}

// ================================================================
// INJECTED FUNCTIONS — must be self-contained (no outer refs).
// parseRow is duplicated inside each to avoid cross-context issues.
// ================================================================

async function injectedScrapeAll({ maxPages, delay, basePath, useSortBy, perExpansion, cardLangIds, mode, selectedExpansionIds, splitParams }) {
  function parseRow(el) {
    const row = {};
    // v2.2.6: Cardmarket entfernte id="articleRow123" (Row heisst jetzt stockRow<id>,
    // Klassen teils obfuskiert). idArticle robust aus mehreren Quellen ziehen.
    let articleId = '';
    // 1. Edit-Pencil-Link: data-modal="...Article_EditArticleModal?...idArticle=X" (eindeutig)
    const editLink = el.querySelector('a[data-modal*="idArticle="], [data-modal*="idArticle="]');
    if (editLink) {
      const mm = (editLink.getAttribute('data-modal') || '').match(/idArticle=(\d+)/);
      if (mm) articleId = mm[1];
    }
    // 2. Amount-Input: name="groupCountAmount<id>"
    if (!articleId) {
      const amtInp = el.querySelector('input[name^="groupCountAmount"]');
      if (amtInp) {
        const mm = (amtInp.getAttribute('name') || '').match(/groupCountAmount(\d+)/);
        if (mm) articleId = mm[1];
      }
    }
    // 3. onclick-jcp-blob / stockRow im Row-HTML
    if (!articleId) {
      const mm = (el.outerHTML || '').match(/(?:idArticle['"\s:=]+|stockRow)(\d+)/);
      if (mm) articleId = mm[1];
    }
    // 4. Alt-Fallback: id="articleRow123" (falls CM zurueckrudert)
    if (!articleId) {
      const mm = (el.id || '').match(/articleRow(\d+)/);
      if (mm) articleId = mm[1];
    }
    row.articleId = articleId;
    const nameLink = el.querySelector('.col-seller a') || el.querySelector('a[href*="/Products/Singles/"]');
    row.name = (nameLink?.textContent || '').trim().replace(/\s+/g, ' ');
    const href = nameLink?.getAttribute('href') || '';
    row.productUrl = href ? (href.startsWith('http') ? href : 'https://www.cardmarket.com' + href) : '';
    // Full product image URL (S3) — consumed by stock.lupzn.de for browser-side card images.
    { const im = (el.outerHTML || '').match(/https?:\/\/product-images\.s3\.cardmarket\.com\/[^\s"'<>\\]+\.jpg/i); row.imageUrl = im ? im[0] : ''; }
    const m = row.name.match(/\(([^)]+)\)\s*$/);
    row.expansionCode = m ? m[1] : '';

    // v2.1: idProduct extrahieren — Voraussetzung für idArticle-Auto-Rebind in Bulk-Update.
    // Mehrere Fallback-Quellen, weil Cardmarket je nach View unterschiedliche Markup-Patterns nutzt.
    let idProduct = '';
    // 1. data-id-product / data-product-id Attribute auf der Row oder Children
    idProduct = el.getAttribute('data-id-product') || el.getAttribute('data-product-id') || '';
    if (!idProduct) {
      const attrEl = el.querySelector('[data-id-product], [data-product-id]');
      if (attrEl) {
        idProduct = attrEl.getAttribute('data-id-product') || attrEl.getAttribute('data-product-id') || '';
      }
    }
    // 2. Hidden Form Input <input name="idProduct" value="X">
    if (!idProduct) {
      const hidden = el.querySelector('input[name="idProduct"], input[name^="idProduct["]');
      if (hidden) idProduct = hidden.value || hidden.getAttribute('value') || '';
    }
    // 3. Aus Edit-Pencil-Link href ?idProduct=X
    if (!idProduct) {
      const editLink = el.querySelector('a[href*="idProduct="], button[data-bs-target*="idProduct="]');
      const ehref = editLink?.getAttribute('href') || editLink?.getAttribute('data-bs-target') || '';
      const mp = ehref.match(/[?&]idProduct=(\d+)/);
      if (mp) idProduct = mp[1];
    }
    // 4. JS-Trigger-Attribut data-bs-target oder onclick mit idProduct
    if (!idProduct) {
      const trigger = el.querySelector('[onclick*="idProduct"], [data-action*="idProduct"]');
      const blob = trigger?.getAttribute('onclick') || trigger?.getAttribute('data-action') || '';
      const mp = blob.match(/idProduct['"]?\s*[:=]\s*['"]?(\d+)/);
      if (mp) idProduct = mp[1];
    }
    // 5. v2.1 PRIMARY in current Cardmarket DOM: Product-Image-URL enthält idProduct als Ordner-Name
    //    Pattern: product-images.s3.cardmarket.com/{game}/{set-slug}/{idProduct}/{idProduct}.jpg
    //    Bsp: https://product-images.s3.cardmarket.com/51/sv2a/733903/733903.jpg → idProduct=733903
    //    Diese ID-Quelle wurde via DevTools-Diagnose verifiziert (LUPZN, 2026-04-29)
    if (!idProduct) {
      const fullHtml = el.outerHTML || '';
      const mp = fullHtml.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i);
      if (mp) idProduct = mp[1];
    }
    // 6. v2.1: Last-Resort — gesamtes Row-outerHTML nach idProduct=N suchen (catches buried in any attribute)
    if (!idProduct) {
      const fullHtml = el.outerHTML || '';
      const mp = fullHtml.match(/idProduct[=:"'\s]+(\d+)/);
      if (mp) idProduct = mp[1];
    }
    // 7. v2.1: Fallback aus Product-URL — manche CM-Slugs enthalten am Ende eine numerische ID
    if (!idProduct && row.productUrl) {
      const mp = row.productUrl.match(/(\d{6,})(?:[?#]|$)/);
      if (mp) idProduct = mp[1];
    }
    row.idProduct = idProduct;

    // v2.1: Diagnostic — wenn idProduct nicht gefunden, log erste 3 betroffene rows zur DOM-Inspektion
    if (!idProduct) {
      window.__cmIdProductMisses = (window.__cmIdProductMisses || 0) + 1;
      if (window.__cmIdProductMisses <= 3) {
        console.warn(`[CM-Export] idProduct-Extraktion fehlgeschlagen für articleRow${row.articleId}. Row-HTML-Sample:`, (el.outerHTML || '').slice(0, 1500));
      }
    }
    const expEl = el.querySelector('a.expansion-symbol, .expansion-symbol');
    let expansion = expEl?.getAttribute('aria-label') || expEl?.getAttribute('data-bs-original-title') || expEl?.getAttribute('title') || '';
    if (!expansion) {
      const h = expEl?.getAttribute('href') || '';
      const mm = h.match(/\/Expansions\/([^/?#]+)/);
      if (mm) expansion = decodeURIComponent(mm[1]).replace(/-/g, ' ');
    }
    row.expansion = expansion;
    let rarity = '';
    el.querySelectorAll('svg').forEach(s => {
      if (rarity) return;
      const v = s.getAttribute('aria-label') || s.getAttribute('data-bs-original-title') || s.getAttribute('title') || '';
      if (v && !/Artikel|Bearbeiten|entfernen|listen|remove|edit/i.test(v)) rarity = v;
    });
    row.rarity = rarity;
    const condEl = el.querySelector('.article-condition');
    row.condition = condEl?.querySelector('.badge')?.textContent.trim() || '';
    let condFull = condEl?.getAttribute('data-bs-original-title') || condEl?.getAttribute('title') || '';
    if (!condFull && condEl) {
      const cMap = { nm: 'Near Mint', mt: 'Mint', ex: 'Excellent', gd: 'Good', lp: 'Light Played', pl: 'Played', po: 'Poor' };
      const mm = (condEl.className || '').match(/condition-(\w+)/);
      if (mm) condFull = cMap[mm[1].toLowerCase()] || '';
    }
    row.conditionFull = condFull;
    // v2.2.13: alle 17 Kartensprachen, die Cardmarket fuehrt (DE- und EN-Schreibweise).
    // Vorher endete die Liste bei 11 — Karten in Sprache 12-17 bekamen eine LEERE Language-Spalte,
    // und das Bulk-Update hat sie danach auf Deutsch gesetzt.
    const LANG_RE = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|Holländisch|Niederländisch|Polnisch|Tschechisch|Ungarisch|Indonesisch|Thailändisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian|Simplified Chinese|Traditional Chinese|Dutch|Polish|Czech|Hungarian|Indonesian|Thai)$/;
    // v2.2.13: Zusaetzlich zur Namensliste die Sprachen akzeptieren, die das idLanguage-Dropdown
    // DIESER Seite selbst auffuehrt. Damit funktioniert die Erkennung auch auf /fr/, /es/ und /it/,
    // wo die Tooltips weder deutsch noch englisch heissen und die Language-Spalte bisher leer blieb.
    // Einmal pro Tab-Kontext aufbauen, nicht pro Zeile — parseRow laeuft bis zu 20.000 mal.
    if (!window.__cmPageLangNames) {
      const set = new Set();
      try {
        document.querySelectorAll('select[name="idLanguage"] option').forEach(o => {
          const n = (o.textContent || '').trim();
          if (n && (o.value || '') !== '0') set.add(n);
        });
      } catch (e) { /* kein Dropdown → nur LANG_RE greift */ }
      window.__cmPageLangNames = set;
    }
    const pageLangNames = window.__cmPageLangNames;
    let language = '';
    el.querySelectorAll('span[aria-label], span[data-bs-original-title], span[data-original-title], span[title]').forEach(s => {
      if (language) return;
      const l = (s.getAttribute('aria-label') || s.getAttribute('data-bs-original-title') || s.getAttribute('data-original-title') || s.getAttribute('title') || '').trim();
      if (!l) return;
      if (LANG_RE.test(l) || (pageLangNames && pageLangNames.has(l))) language = l;
    });
    row.language = language;
    const cEl = el.querySelector('.product-comments [data-bs-original-title], .product-comments [title], .product-comments .text-truncate, .product-comments span.fst-italic');
    row.comments = cEl?.getAttribute('data-bs-original-title') || cEl?.getAttribute('title') || cEl?.textContent.trim() || '';
    let priceTxt = '';
    const priceEl = el.querySelector('.col-offer .price-container .color-primary, .col-offer .color-primary, .mobile-offer-container .color-primary');
    if (priceEl && priceEl.children.length === 0) {
      priceTxt = priceEl.textContent.trim().replace(/\s*€\s*$/, '');
    }
    if (!priceTxt) {
      el.querySelectorAll('.color-primary').forEach(n => {
        if (priceTxt || n.children.length > 0) return;
        const t = n.textContent.trim();
        const mm = t.match(/^(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?$/);
        if (mm) priceTxt = mm[1];
      });
    }
    row.price = priceTxt;
    let displayCount = '';
    el.querySelectorAll('.item-count').forEach(n => {
      if (displayCount) return;
      const t = n.textContent.trim();
      if (/^\d+$/.test(t)) displayCount = t;
    });
    const amtInput = el.querySelector('input.amount-input, input[name^="groupCountAmount"]');
    const maxAttr = amtInput?.getAttribute('max') || '';
    row.amountMax = maxAttr;
    row.amountDisplay = displayCount;
    row.amount = maxAttr || displayCount || '';
    // Reverse Holo detection — comments OR icon aria-label
    // v2.3.0: Treffer im Verkaeufer-Kommentar ignorieren. Der Kommentar-Tooltip gehoert zur selben
    // Zeile, ist aber freier Text — ein "Full Art" oder "Signed" darin hat frueher die
    // entsprechende Variante gesetzt, auch bei Spielen, die das Attribut gar nicht kennen.
    const hasIcon = (...pats) => [...el.querySelectorAll(pats.flatMap(p =>
      [`[aria-label*="${p}" i]`, `[title*="${p}" i]`, `[data-bs-original-title*="${p}" i]`]).join(','))]
      .some(n => !n.closest('.product-comments'));
    // v2.3.0: Reverse Holo NICHT mehr aus dem Freitext ableiten. Diese Spalte ist die einzige,
    // die per Bulk-Update wieder nach Cardmarket geschrieben wird — ein Verkaeufer-Kommentar wie
    // "kein Reverse Holo" hat sie faelschlich auf Y gesetzt und die Karte beim naechsten Update
    // zur Reverse-Holo-Variante gemacht. Jetzt zaehlt nur das Icon, wie bei allen anderen Flags.
    row.reverse = hasIcon('Reverse Holo', 'Reverse-Holo', 'Reverse');
    // v2.2.9 (issue #2): variant flags from the row's variant icons, mirroring
    // reverse-holo detection. CM tooltip labels (EN UI): "First Edition", "Signed",
    // "Altered", "Playset"; German UI uses translated titles → match both.
    row.firstEd = hasIcon('First Edition', '1st Edition', '1. Auflage', 'Erstauflage', 'Erstausgabe');
    row.signed  = hasIcon('Signed', 'Signiert');
    row.altered = hasIcon('Altered', 'Verändert', 'Bemalt');
    row.playset = hasIcon('Playset');
    row.foil    = hasIcon('Foil');   // v2.2.10: Magic/Foil column (requested by e-mail)
    // v2.3.0: spielspezifische Varianten, die es nur bei wenigen Spielen gibt — Full Art und
    // Uber Rare bei Force of Will, "mit Wuerfel" bei Star Wars: Destiny. Bei allen anderen
    // Spielen bleiben die Spalten schlicht auf N.
    row.fullArt  = hasIcon('Full Art', 'Full-Art', 'Fullart');
    row.uberRare = hasIcon('Uber Rare', 'Über Rare', 'Uber-Rare');
    row.withDie  = hasIcon('with Die', 'with die', 'mit Würfel', 'Die Included');
    return row;
  }

  const rows = [];
  const seen = new Set();
  // v2.2.12: anonymous rows (no articleId) have no natural dedup key; a recovery or
  // completeness re-scan of the same scope would otherwise re-push them — duplicating
  // CSV lines and inflating the completeness tally (a false "complete"). Dedup on a
  // synthetic key so anonymous rows behave like keyed rows: counted and pushed once.
  const anonSeen = new Set();
  // Experimental pagination-recovery patch:
  // Cardmarket can expose N result listings for a filtered stock view while a
  // particular sort order yields fewer than N unique ArticleIDs across pages.
  // When that happens, retry the same scope with price_desc and merge by ArticleID.
  const recoveryStats = { attempts: 0, recovered: 0, unresolved: [] };
  // v2.3.0: Fehlgeschlagene Bereiche sammeln. Seit die Aufrufe in try/catch stehen, reisst ein
  // Fehler den Lauf nicht mehr ab — dafuer waere er ohne diese Liste voellig unsichtbar, und ein
  // unvollstaendiger Export saehe aus wie ein vollstaendiger.
  const scopeErrors = [];
  let pagesScanned = 0;
  let debugSnippet = '';
  let detectedTotalPages = null;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const parseLooseCount = (value) => {
    const digits = String(value || '').replace(/[^\d]/g, '');
    return digits ? parseInt(digits, 10) : null;
  };

  // Reads Cardmarket's listing-result counter, e.g. "23 Results",
  // "23 Resultados", "23 Ergebnisse", "23 Résultats", "23 Risultati".
  // IMPORTANT: this is the number of LISTINGS/RESULTS, not the sum of Amount.
  const extractExpectedListingCount = (doc) => {
    // v2.2.13: Cardmarket rendert die Trefferzahl der Stock-Ansicht in <span class="total-count">.
    // Das ist in JEDER Oberflaechensprache identisch — verifiziert fuer de/en/fr/es/it.
    // Der Wort-Regex unten greift auf der deutschen UI nicht (dort steht "Treffer", nicht
    // "Ergebnisse"), weshalb der Zaehler-Check aus v2.2.11 fuer deutsche Nutzer wirkungslos war.
    // v2.2.13: auch 0 akzeptieren. Mit einem n>0-Guard landete jeder leere Scope im
    // Wort-Fallback unten, dessen Capture ueber Whitespace hinweg greift und dort Zahlen
    // aus anderen Seitenbereichen zu einer erfundenen Trefferzahl zusammenzieht.
    // Achtung: querySelector nimmt bei einer Selektorliste das im DOM zuerst stehende Element,
    // nicht die zuerst genannte Alternative. Ein fremdes .total-count (Warenkorb, Benachrichtigung)
    // wuerde also gewinnen. Deshalb nur Elemente akzeptieren, deren Text NUR aus einer Zahl besteht.
    for (const el of doc.querySelectorAll('.total-count')) {
      const raw = (el.textContent || '').replace(/ /g, ' ').trim();
      if (!/^[\d.,\s]+$/.test(raw)) continue;
      const n = parseLooseCount(raw);
      if (Number.isFinite(n)) return n;
    }
    const texts = [];
    const selectors = [
      '.pagination',
      '[class*="pagination"]',
      '[class*="result-count"]',
      '[class*="results-count"]',
      '[class*="result"]',
    ];
    selectors.forEach(sel => {
      doc.querySelectorAll(sel).forEach(el => {
        const t = (el.innerText || el.textContent || '').replace(/\u00a0/g, ' ').trim();
        if (t) texts.push(t);
      });
    });
    const bodyText = (doc.body?.innerText || doc.body?.textContent || '').replace(/\u00a0/g, ' ');
    if (bodyText) texts.push(bodyText);

    const resultWord = '(?:Results?|Resultados?|Ergebnisse?|Treffer|Résultats?|Resultats?|Risultati)';
    // v2.2.13: Vorher verschluckte "(\d[\d\s.,]*)" beliebigen Whitespace und zog dadurch Zahlen
    // aus anderen Seitenteilen in die Trefferzahl ("40\n1 500" wurde zu 401500). Jetzt sind nur
    // noch echte Tausendergruppen erlaubt: nach einem Trenner muessen exakt drei Ziffern folgen.
    // Das faengt "1.234", "1,234" und das franzoesische "1 234", ohne Tokens zu ueberspringen.
    const num = '(\\d{1,3}(?:[.,\\s]\\d{3})*|\\d+)';
    const beforeWord = new RegExp(`(?:^|\\s)${num}\\s*${resultWord}\\b`, 'i');
    const afterWord = new RegExp(`\\b${resultWord}\\s*[:\\-]?\\s*${num}`, 'i');

    for (const txt of texts) {
      let m = txt.match(beforeWord);
      if (!m) m = txt.match(afterWord);
      if (!m) continue;
      const n = parseLooseCount(m[1]);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  // v2.1: mkUrl akzeptiert generisches filter-Objekt
  // Experimental patch: sortOverride lets a recovery pass explicitly request
  // price_desc without changing the user's normal name_asc/default setting.
  const mkUrl = (p, filter = {}, sortOverride = null) => {
    const params = new URLSearchParams();
    if (sortOverride) params.set('sortBy', sortOverride);
    else if (useSortBy) params.set('sortBy', 'name_asc');
    if (filter.idExpansion) params.set('idExpansion', filter.idExpansion);
    if (filter.idLanguage) params.set('idLanguage', filter.idLanguage);
    // v2.2.13: idRarity ersetzt idCondition als dritte Teilungsachse. Cardmarket IGNORIERT
    // idCondition auf der Stock-Seite (verifiziert: idCondition=1 und =7 liefern dieselbe
    // Trefferzahl wie ungefiltert), idRarity filtert dagegen echt.
    if (filter.idRarity) params.set('idRarity', filter.idRarity);
    // v2.2.13: Varianten-Filter heissen je Spiel anders (isReverseHolo bei Pokemon, isFoil bei
    // Magic, isFirstEd bei Yu-Gi-Oh, isWithDie bei SW Destiny, isFullArt/isUberRare bei FoW).
    // Deshalb generisch: alles was im Filter mit "is" beginnt, wird als 0/1 gesendet.
    Object.keys(filter).forEach(k => {
      if (/^is[A-Z]/.test(k) && filter[k] != null) params.set(k, filter[k] ? '1' : '0');
    });
    params.set('site', String(p));
    return `${basePath}?${params.toString()}`;
  };

  const fetchPage = async (p, filter = {}, sortOverride = null) => {
    const url = mkUrl(p, filter, sortOverride);
    let res;
    try { res = await fetch(url, { credentials: 'include' }); }
    catch (fe) {
      await sleep(2000);
      res = await fetch(url, { credentials: 'include' });
    }
    return { res, url };
  };

  const writeProgress = (extras) => {
    const stockTotal = rows.reduce((s, r) => s + (parseInt(r.amountDisplay || r.amount, 10) || 0), 0);
    // v2.3.0: Reihenfolge korrigiert. Vorher standen die frischen Zaehler GANZ LINKS und wurden
    // vom alten Zustand ueberschrieben — rowsTotal und stockTotal blieben also fuer immer auf den
    // Werten des allerersten Aufrufs (0/0) stehen, und ein einmal gesetztes lastErr klebte bis
    // zum Ende. Der Fortschrittsbalken im Popup war damit praktisch tot.
    window.__cmExportProgress = Object.assign(
      window.__cmExportProgress || {},
      { rowsTotal: rows.length, stockTotal, ts: Date.now() },
      extras,
    );
  };

  // Scrape one filter/sort scope.
  // Returns both global additions and the unique ArticleIDs observed in THIS pass.
  const scrapePages = async (filter, label, expIdx, expTotal, expName, sortOverride = null) => {
    let page = 1;
    let emptyStreak = 0;
    let localAdded = 0;
    let totalPagesSeen = 0;
    let pagesFetched = 0;
    let lastPageRowCount = 0;
    let expectedListings = null;
    let anonymousObserved = 0;
    const passAnonSeen = new Set();
    let passDuplicateCount = 0;
    const passSeen = new Set();
    const sortLabel = sortOverride || (useSortBy ? 'name_asc' : 'default');

    while (true) {
      if (window.__cmExportStop) { writeProgress({ status: 'aborted', lastErr: 'Abgebrochen' }); throw new Error('Abgebrochen'); }
      if (maxPages && page > maxPages) break;
      writeProgress({
        status: 'running',
        expansion: expIdx ? { idx: expIdx, total: expTotal, name: expName, id: filter.idExpansion } : null,
        page,
        label: `${label} [sort=${sortLabel}]`,
        // v2.3.0: alte Fehlermeldung loeschen. Sie steckt seit der Merge-Umstellung in der Basis
        // und wuerde sonst bis zum Ende kleben — ein gesunder Lauf saehe nach einer einmaligen
        // 429-Pause dauerhaft kaputt aus.
        lastErr: null,
      });

      const { res, url } = await fetchPage(page, filter, sortOverride);
      if (res.status === 429) { console.warn('[CM] 429 pause 10s'); writeProgress({ lastErr: '429 Rate-Limit, Pause 10s' }); await sleep(10000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      if (page === 1) {
        expectedListings = extractExpectedListingCount(doc);
        if (expectedListings != null) {
          console.log(`[CM] ${label} sort=${sortLabel}: Cardmarket reports ${expectedListings} result listings`);
        }
      }

      if (page === 1 && !filter.idExpansion && !detectedTotalPages) {
        const links = doc.querySelectorAll('a[href*="site="]');
        let maxP = 0;
        links.forEach(a => {
          const mm = (a.getAttribute('href') || '').match(/[?&]site=(\d+)/);
          if (mm) maxP = Math.max(maxP, parseInt(mm[1], 10));
        });
        detectedTotalPages = maxP || null;
      }

      if (page === 1) {
        const links = doc.querySelectorAll('a[href*="site="]');
        let maxP = 0;
        links.forEach(a => {
          const mm = (a.getAttribute('href') || '').match(/[?&]site=(\d+)/);
          if (mm) maxP = Math.max(maxP, parseInt(mm[1], 10));
        });
        totalPagesSeen = maxP || 1;
      }

      let rowEls = doc.querySelectorAll('[id^="articleRow"].article-row, .article-row');
      if (!rowEls.length && page > 1 && page <= totalPagesSeen) {
        console.warn(`[CM] ${label} page ${page} unexpected empty (totalPagesSeen=${totalPagesSeen}). Retry in 3s...`);
        await sleep(3000);
        const { res: retryRes } = await fetchPage(page, filter, sortOverride);
        if (retryRes.ok) {
          const retryHtml = await retryRes.text();
          const retryDoc = new DOMParser().parseFromString(retryHtml, 'text/html');
          rowEls = retryDoc.querySelectorAll('[id^="articleRow"].article-row, .article-row');
          if (rowEls.length > 0) {
            console.log(`[CM] ${label} page ${page} retry recovered ${rowEls.length} rows`);
          }
        }
      }

      if (!rowEls.length) {
        // v2.2.12: Only the broad (languageless whole-expansion / ALL) scope retries a
        // transient-empty page 1 — that is where a WHOLE set could silently vanish
        // (no rows, not cap-suspect, no error thrown; e.g. Reisegefährten, 913 cards).
        // Deep cascade sub-scopes (a language/condition the seller doesn't stock) are
        // legitimately empty and must break fast, without the 3s retry penalty.
        // v2.2.13: generisch statt auf feste Filternamen geprueft — ein Scope ist "breit",
        // wenn weder Sprache noch Rarity noch irgendein spielspezifischer Varianten-Filter gesetzt ist.
        const broadScope = !filter.idLanguage && !filter.idRarity
          && !Object.keys(filter).some(k => /^is[A-Z]/.test(k) && filter[k] != null);
        if (page === 1 && broadScope) {
          if (window.__cmExportStop) { writeProgress({ status: 'aborted', lastErr: 'Abgebrochen' }); throw new Error('Abgebrochen'); }
          await sleep(3000);
          const { res: p1res } = await fetchPage(1, filter, sortOverride);
          if (p1res.ok) {
            const p1doc = new DOMParser().parseFromString(await p1res.text(), 'text/html');
            rowEls = p1doc.querySelectorAll('[id^="articleRow"].article-row, .article-row');
            if (rowEls.length) {
              console.log(`[CM] ${label} page 1 retry recovered ${rowEls.length} rows`);
              expectedListings = extractExpectedListingCount(p1doc);
              let maxP = 0;
              p1doc.querySelectorAll('a[href*="site="]').forEach(a => {
                const mm = (a.getAttribute('href') || '').match(/[?&]site=(\d+)/);
                if (mm) maxP = Math.max(maxP, parseInt(mm[1], 10));
              });
              totalPagesSeen = maxP || 1;
              if (!filter.idExpansion) detectedTotalPages = maxP || detectedTotalPages;
            }
          }
          if (!rowEls.length) {
            if (!debugSnippet) debugSnippet = (doc.querySelector('.table-body')?.outerHTML || doc.body?.innerHTML || html).slice(0, 2000);
            break;
          }
          // fall through: recovered rows get processed below
        } else if (page === 1) {
          if (!debugSnippet) debugSnippet = (doc.querySelector('.table-body')?.outerHTML || doc.body?.innerHTML || html).slice(0, 2000);
          break;
        } else {
          emptyStreak++;
          if (emptyStreak >= 2) break;
          page++;
          if (delay) await sleep(delay);
          continue;
        }
      }
      emptyStreak = 0;

      let added = 0, duped = 0;
      let passAddedThisPage = 0, passDupedThisPage = 0;

      rowEls.forEach(el => {
        const row = parseRow(el);
        if (!row.articleId) {
          if (row.name || row.price) {
            // v2.2.12: dedup anonymous rows globally so a re-scan can't duplicate them
            const anonKey = (row.name || '') + '|' + (row.expansionCode || '') + '|' + (row.price || '') + '|' + (row.condition || '') + '|' + (row.comments || '');
            // v2.3.0: Beobachtung pass-LOKAL zaehlen, Speicherung global entscheiden.
            // Vorher wurde anonymousObserved nur beim global ersten Auftreten hochgezaehlt.
            // In einem zweiten Durchgang (price_desc-Recovery, Nachlauf) fehlten diese Zeilen
            // dann in passObserved, das blieb dauerhaft unter der Trefferzahl der Seite — und
            // capSuspect klebte auf true, was immer neue, nutzlose Unterteilungen ausloeste.
            if (!passAnonSeen.has(anonKey)) {
              passAnonSeen.add(anonKey);
              anonymousObserved++;
              passAddedThisPage++;
            } else {
              // Kein passDuplicateCount: anonyme Zeilen werden ueber einen synthetischen
              // Schluessel verglichen, zwei echte Listings mit identischen Werten kollidieren
              // dort zwangslaeufig. Als Overlap-Signal taugt das nicht — es wuerde unnoetige
              // price_desc-Durchlaeufe ausloesen.
              passDupedThisPage++;
            }
            if (!anonSeen.has(anonKey)) {
              anonSeen.add(anonKey);
              rows.push(row);
              added++;
              localAdded++;
            }
          }
          return;
        }

        // Track pagination duplicates inside THIS pass separately from the
        // global dedupe set. This matters for recovery passes: page 1 can be
        // entirely "already seen globally" and we still must continue to page 2.
        if (passSeen.has(row.articleId)) {
          passDupedThisPage++;
          passDuplicateCount++;
        } else {
          passSeen.add(row.articleId);
          passAddedThisPage++;
        }

        if (seen.has(row.articleId)) { duped++; return; }
        seen.add(row.articleId);
        rows.push(row);
        added++;
        localAdded++;
      });

      pagesScanned++;
      pagesFetched++;
      lastPageRowCount = rowEls.length;
      console.log(
        `[CM] ${label} sort=${sortLabel} page ${page}: +${added} global ` +
        `(global dup ${duped}; pass unique ${passSeen.size}; pass dup ${passDuplicateCount}; total ${rows.length})`
      );

      // Loop protection must be pass-local, not global. Otherwise an alternate
      // sort recovery pass would stop on page 1 because all page-1 IDs were
      // already collected by the primary pass.
      if (passAddedThisPage === 0 && passDupedThisPage > 0) break;

      page++;
      if (page > 5000) break;
      if (delay) await sleep(delay);
    }

    const passObserved = passSeen.size + anonymousObserved;

    // Cardmarket currently hard-caps broad stock views at 300 result listings.
    // The old v2.2.10 heuristic assumed a 40-row full page, but Cardmarket now
    // serves 20 rows/page in the affected Magic stock view. That makes an exact
    // 300-result cap look "complete" (15 full pages) and prevents the existing
    // language/condition cascade from ever starting.
    //
    // Use the pass-local observed count instead: if this scope reaches the
    // 300-listing ceiling, treat it as cap-suspect even when Cardmarket's own
    // result counter also says exactly 300. A genuinely exact-300 scope may do
    // an unnecessary cascade, but global ArticleID dedupe keeps the output safe.
    const CARDMARKET_SCOPE_CAP = 300;
    const capSuspect = passObserved >= CARDMARKET_SCOPE_CAP;

    return {
      added: localAdded,
      capSuspect,
      totalPagesSeen,
      pagesFetched,
      expectedListings,
      passObserved,
      passArticleIds: [...passSeen],
      passDuplicateCount,
      sortLabel,
    };
  };

  // Wrapper used everywhere a scope is scraped. If Cardmarket's own result
  // counter says there should be more unique listings than the primary sort
  // produced, retry with price_desc and union the ArticleIDs.
  const scrapeScope = async (filter, label, expIdx, expTotal, expName) => {
    const primary = await scrapePages(filter, label, expIdx, expTotal, expName, null);

    // Respect an explicit maxPages user limit; comparing against the full result
    // count would otherwise create a false "missing" signal.
    if (maxPages) return primary;

    // v2.2.13: Meldet die Seite 0 Treffer, hat aber Zeilen geliefert, widerspricht sie sich selbst
    // (falsches .total-count-Element, Teil-Render, Challenge-Seite). Diese 0 zu glauben wuerde die
    // Pruefung fuer den Scope stilllegen — inklusive des Dubletten-Signals, das nur bei
    // expected == null greift. Also lieber als "unbekannt" behandeln.
    const expected = (primary.expectedListings === 0 && primary.passObserved > 0) ? null : primary.expectedListings;
    const missing = (expected != null) ? Math.max(0, expected - primary.passObserved) : 0;
    // If Cardmarket's result counter cannot be parsed, a repeated ArticleID
    // inside the same paginated pass is still a strong overlap signal.
    const overlapWithoutCount = (expected == null && primary.passDuplicateCount > 0);
    if (!missing && !overlapWithoutCount) return primary;

    recoveryStats.attempts++;
    if (expected != null) {
      console.warn(
        `[CM] ${label}: Cardmarket reports ${expected} listings, primary sort returned ` +
        `${primary.passObserved} unique/observable listings. Retrying with price_desc...`
      );
      writeProgress({
        lastErr: `${label}: ${primary.passObserved}/${expected} listings; retry sort=price_desc`,
      });
    } else {
      console.warn(
        `[CM] ${label}: detected ${primary.passDuplicateCount} duplicate ArticleID(s) across the ` +
        `primary pagination and no result counter was parsed. Retrying with price_desc...`
      );
      writeProgress({
        lastErr: `${label}: pagination overlap detected; retry sort=price_desc`,
      });
    }

    if (delay) await sleep(delay);
    const beforeRows = rows.length;
    const alt = await scrapePages(filter, `${label} RECOVERY`, expIdx, expTotal, expName, 'price_desc');
    const recoveredNow = rows.length - beforeRows;
    recoveryStats.recovered += recoveredNow;

    const combinedIds = new Set([...primary.passArticleIds, ...alt.passArticleIds]);
    // v2.2.10 should provide ArticleID for every real row. Anonymous rows are
    // conservatively counted from the larger pass, avoiding double-counting.
    const primaryAnon = Math.max(0, primary.passObserved - primary.passArticleIds.length);
    const altAnon = Math.max(0, alt.passObserved - alt.passArticleIds.length);
    const combinedObserved = combinedIds.size + Math.max(primaryAnon, altAnon);
    const remaining = (expected != null) ? Math.max(0, expected - combinedObserved) : 0;

    if (recoveredNow > 0) {
      console.warn(
        `[CM] ${label}: recovery added ${recoveredNow} listing(s); ` +
        `coverage is now ${combinedObserved}/${expected}.`
      );
    }

    if (remaining > 0) {
      console.warn(`[CM] ${label}: still missing ${remaining} listing(s) after price_desc recovery.`);
      recoveryStats.unresolved.push({
        label,
        expected,
        observed: combinedObserved,
        missing: remaining,
      });
      writeProgress({
        lastErr: `${label}: still ${combinedObserved}/${expected} after price_desc; cascading if possible`,
      });
    }

    return {
      ...primary,
      added: primary.added + alt.added,
      passObserved: combinedObserved,
      passArticleIds: [...combinedIds],
      passDuplicateCount: primary.passDuplicateCount + alt.passDuplicateCount,
      // If Cardmarket still says listings are missing, force the existing
      // cascade machinery to split the scope further when possible.
      capSuspect: primary.capSuspect || remaining > 0,
    };
  };

  // Existing cascading driver, now routed through scrapeScope so every
  // expansion/language/condition scope gets the result-count recovery check.
  // v2.2.13: Cardmarket fuehrt 17 Kartensprachen (bis 17=Thailaendisch). Bis v2.2.12 endete
  // die Kaskade bei 12, wodurch Bestand in Polnisch/Tschechisch/Ungarisch/Indonesisch/Thai
  // nie als eigener Scope geprueft wurde.
  const LANG_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

  // v2.2.13: Rarity-IDs sind spiel- UND spielabhaengig, deshalb zur Laufzeit aus dem
  // idRarity-Dropdown der Stock-Seite lesen (einmal pro Lauf, danach gecacht).
  let cachedRarityIds = null;
  let rarityFailures = 0;
  const getRarityIds = async () => {
    // v2.2.13: NUR Erfolge cachen. Wuerde ein Fehlschlag gecacht, haette ein einzelner
    // 429 oder Netzwerkfehler die Rarity-Stufe fuer den gesamten Restlauf abgeschaltet
    // (leeres Array ist truthy). Ein leeres Dropdown ist dagegen ein legitimes Ergebnis
    // und wird gecacht — es heisst schlicht "dieses Spiel hat keinen Rarity-Filter".
    if (cachedRarityIds) return cachedRarityIds;
    // v2.3.0: Fehlerbudget ueber den ganzen Lauf. Ohne das zahlt bei anhaltender Blockade
    // (Cloudflare/429) JEDER gecappte Scope erneut zwei Fehlversuche samt Pausen — bei einem
    // grossen Bestand summiert sich das auf Minuten reiner Wartezeit ohne jeden Ertrag.
    if (rarityFailures >= 3) return [];
    for (let attempt = 0; attempt < 2; attempt++) {
      if (window.__cmExportStop) return [];
      const isLastAttempt = attempt === 1;
      try {
        const { res } = await fetchPage(1, {});
        if (res.status === 429) {
          writeProgress({ lastErr: 'Rarity-Liste: 429, Pause 10s' });
          if (!isLastAttempt) await sleep(10000);
          continue;
        }
        if (!res.ok) { if (!isLastAttempt) await sleep(2000); continue; }
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        // v2.2.13: Ein Cloudflare-Interstitial, ein Login-Redirect oder eine Wartungsseite kommen
        // mit HTTP 200 und ohne Dropdown daher. Ohne diese Pruefung wuerde so eine Seite als
        // "Spiel ohne Rarity-Filter" dauerhaft gecacht — genau der Fehlschlag-Cache, den wir
        // gerade beseitigt haben, nur durch die Hintertuer.
        if (!doc.querySelector('select[name="idExpansion"], select[name^="idExpansion"]')) {
          if (!isLastAttempt) await sleep(2000);
          continue;
        }
        const sel = doc.querySelector('select[name="idRarity"], select[name^="idRarity"], select#idRarity');
        if (!sel) { cachedRarityIds = []; return cachedRarityIds; }
        const list = [];
        sel.querySelectorAll('option').forEach(o => {
          const v = o.value;
          if (v && /^\d+$/.test(v) && v !== '0') list.push(v);
        });
        cachedRarityIds = list;
        return cachedRarityIds;
      } catch (e) { if (!isLastAttempt) await sleep(2000); }
    }
    rarityFailures++;
    // v2.3.0: sichtbar machen. Fiel die Stufe aus, teilte die Kaskade nur noch ueber Varianten —
    // ohne jeden Hinweis im Popup. Ein unvollstaendiger Export sah aus wie ein vollstaendiger.
    writeProgress({ lastErr: 'Rarity-Liste nicht ladbar — Kaskade teilt nur ueber Varianten' });
    // Nicht cachen — der naechste Scope darf es erneut versuchen.
    console.warn('[CM] Rarity-Liste konnte nicht geladen werden; Kaskade nutzt den Varianten-Fallback.');
    return [];
  };

  // v2.3.0: Teilt einen Scope ueber die Varianten-Achsen DIESES Spiels, eine nach der anderen.
  // Vorher gab es nur eine einzige Achse (die Druckvariante). Spiele ohne Druckvariante —
  // Yu-Gi-Oh, One Piece, Digimon, Flesh and Blood, Vanguard, Weiss Schwarz — hatten damit gar
  // keine Notachse und blieben bei einem gecappten Scope ungeteilt. Ausserdem wurde frueher
  // nach dem Split nicht mehr geprueft, ob die Haelfte SELBST noch gecappt ist; ein Filter
  // halbiert bestenfalls, deshalb geht es jetzt rekursiv weiter, bis die Achsen aufgebraucht sind.
  const cascadeVariants = async (scopeFilter, scopeLabel, expIdx, expTotal, expName) => {
    const axes = Array.isArray(splitParams) ? splitParams : [];
    const axis = axes.find(p => scopeFilter[p] == null);
    if (!axis || window.__cmExportStop) return 0;
    let added = 0;
    for (const flag of [false, true]) {
      if (window.__cmExportStop) break;
      const f = { ...scopeFilter, [axis]: flag };
      const lbl = `${scopeLabel} [${axis}=${flag ? 1 : 0}]`;
      const r = await scrapeScope(f, lbl, expIdx, expTotal, expName);
      added += r.added;
      if (r.capSuspect) added += await cascadeVariants(f, lbl, expIdx, expTotal, expName);
      if (delay) await sleep(delay);
    }
    return added;
  };

  // Rarity-Stufe plus Varianten-Stufe fuer einen bereits eingegrenzten Scope.
  const cascadeRarityAndVariants = async (scopeFilter, scopeLabel, expIdx, expTotal, expName) => {
    let added = 0;
    if (!scopeFilter.idRarity) {
      const rarityIds = await getRarityIds();
      console.warn(`[CM] ${scopeLabel} cap/gap-suspect — cascading by rarity (${rarityIds.length})...`);
      for (const rarId of rarityIds) {
        if (window.__cmExportStop) break;
        const f2 = { ...scopeFilter, idRarity: rarId };
        const lbl2 = `${scopeLabel} [rarity=${rarId}]`;
        const r3 = await scrapeScope(f2, lbl2, expIdx, expTotal, expName);
        added += r3.added;
        if (r3.capSuspect) added += await cascadeVariants(f2, lbl2, expIdx, expTotal, expName);
        if (delay) await sleep(delay);
      }
    }
    // Varianten zusaetzlich direkt auf dem Scope, als Geschwister der Rarity-Stufe.
    // Notwendig, weil Rarity KEINE garantierte Partition ist: Listings ohne bzw. mit nicht
    // gelisteter Seltenheit tauchen in keinem einzigen Rarity-Scope auf. Deckt zugleich den
    // Fall ab, dass die Rarity-Liste leer ist (Spiel ohne Filter oder Abruf gescheitert).
    added += await cascadeVariants(scopeFilter, scopeLabel, expIdx, expTotal, expName);
    return added;
  };

  const scrapeWithCascade = async (baseFilter, label, expIdx, expTotal, expName, force = false) => {
    // v2.2.12: force=true (Vollstaendigkeits-Nachlauf) ueberspringt den breiten r1-Durchgang
    // und geht direkt in die Unterteilung.
    let baseAdded = 0;
    if (!force) {
      const r1 = await scrapeScope(baseFilter, label, expIdx, expTotal, expName);
      if (!r1.capSuspect) return r1.added;
      baseAdded = r1.added;
    }

    if (!baseFilter.idLanguage) {
      console.warn(`[CM] ${label} ${force ? 'forced completeness re-scan' : 'cap/gap-suspect'} — cascading by language...`);
      writeProgress({ lastErr: `${label}: ${force ? 'completeness recovery' : 'cap/gap suspect'}, split by language` });
      let totalAdded = baseAdded;
      for (const langId of LANG_IDS) {
        if (window.__cmExportStop) break;
        const filter = { ...baseFilter, idLanguage: langId };
        const subLabel = `${label} [lang=${langId}]`;
        const r2 = await scrapeScope(filter, subLabel, expIdx, expTotal, expName);
        totalAdded += r2.added;
        if (r2.capSuspect) {
          totalAdded += await cascadeRarityAndVariants(filter, subLabel, expIdx, expTotal, expName);
        }
        if (delay) await sleep(delay);
      }
      return totalAdded;
    }

    // v2.3.0: Die Sprache ist bereits gesetzt, weil der Nutzer im Popup Kartensprachen
    // angehakt hat. Bisher endete die Kaskade hier — ein Scope aus Set plus Sprache mit ueber
    // 300 Listings wurde also still abgeschnitten, obwohl Rarity und Varianten noch offen waren.
    console.warn(`[CM] ${label} cap/gap-suspect bei gesetzter Sprache — teile nach Rarity/Varianten...`);
    writeProgress({ lastErr: `${label}: cap/gap suspect, split by rarity/variant` });
    return baseAdded + await cascadeRarityAndVariants(baseFilter, label, expIdx, expTotal, expName);
  };

  const extractExpansionIds = async () => {
    const { res } = await fetchPage(1, {});
    if (!res.ok) return [];
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ids = [];
    const selectors = ['select[name="idExpansion"]', 'select[name^="idExpansion"]', 'select#idExpansion', 'select[name="expansion"]'];
    let select = null;
    for (const s of selectors) {
      select = doc.querySelector(s);
      if (select) break;
    }
    if (select) {
      select.querySelectorAll('option').forEach(o => {
        const v = o.value;
        if (v && /^\d+$/.test(v) && v !== '0') {
          // v2.2.7: Kartenzahl aus Label parsen falls CM sie liefert (z.B. "Ascended Heroes (9)")
          let name = o.textContent.trim();
          let labelCount = null;
          const cm = name.match(/\((\d+)\)\s*$/);
          if (cm) { labelCount = parseInt(cm[1], 10); name = name.replace(/\s*\(\d+\)\s*$/, '').trim(); }
          ids.push({ id: v, name, labelCount });
        }
      });
    }
    return ids;
  };

  try {
    // v2.2.7: listSets-Modus — nur Bestands-Sets + Kartenzahl ermitteln, kein Voll-Scrape
    if (mode === 'listSets') {
      const listLangId = (cardLangIds && cardLangIds.length === 1) ? cardLangIds[0] : null;
      const listBase = listLangId ? { idLanguage: listLangId } : {};
      const exps = await extractExpansionIds();
      const out = [];
      for (const e of exps) {
        if (window.__cmExportStop) break;
        let count = (e.labelCount != null) ? e.labelCount : null;
        let approx = false;
        if (count == null) {
          // Kein Label-Count → Page-1-Fetch, Kartenzahl aus Zeilen × Seitenanzahl schätzen
          try {
            const { res } = await fetchPage(1, { ...listBase, idExpansion: e.id });
            if (res.ok) {
              const html = await res.text();
              const doc = new DOMParser().parseFromString(html, 'text/html');
              const rowEls = doc.querySelectorAll('[id^="articleRow"].article-row, .article-row');
              let maxP = 1;
              doc.querySelectorAll('a[href*="site="]').forEach(a => { const mm = (a.getAttribute('href') || '').match(/[?&]site=(\d+)/); if (mm) maxP = Math.max(maxP, parseInt(mm[1], 10)); });
              count = maxP > 1 ? rowEls.length * maxP : rowEls.length;
              approx = maxP > 1;
            }
          } catch (ce) { /* count-fetch fehlgeschlagen → count bleibt null */ }
          if (delay) await sleep(delay);
        }
        out.push({ id: e.id, name: e.name, count, approx });
      }
      return { sets: out };
    }

    // v2.1: Karten-Sprachen-Filter — wenn Auswahl, iteriere pro langId mit idLanguage-Filter im Base-Filter
    // Leerer Array = kein Filter (alle Sprachen, normales Verhalten)
    const langLoop = (cardLangIds && cardLangIds.length > 0) ? cardLangIds : [null];

    // v2.2.12: per-expansion completeness tracking. The idExpansion dropdown carries
    // Cardmarket's own per-set CARD counts, so we accumulate captured cards per set
    // and reconcile against those counts after all passes.
    const expExpected = {};   // id -> { name, labelCount }
    const expObserved = {};   // id -> cards captured so far (sum of Amount)
    const langFilterActive = !!(cardLangIds && cardLangIds.length > 0);

    for (let li = 0; li < langLoop.length; li++) {
      if (window.__cmExportStop) break;
      const langId = langLoop[li];
      const langTag = langId ? ` [lang=${langId}]` : '';

      // Build base filter for this language pass
      const langBaseFilter = langId ? { idLanguage: langId } : {};

      if (perExpansion) {
        writeProgress({ status: 'extracting expansions' + langTag, page: 0 });
        let expansions = await extractExpansionIds();
        // v2.2.7: nur die im Export-Tab angehakten Sets exportieren (falls Auswahl übergeben)
        if (selectedExpansionIds && selectedExpansionIds.length) {
          const wanted = new Set(selectedExpansionIds.map(String));
          expansions = expansions.filter(e => wanted.has(String(e.id)));
        }
        console.log(`[CM] Gefundene Expansions${langTag}: ${expansions.length}`);
        if (expansions.length === 0) {
          // v2.2.7: bei gezielter Set-Auswahl NIEMALS auf ALL zurückfallen (sonst versehentlich Voll-Export)
          if (selectedExpansionIds && selectedExpansionIds.length) {
            console.warn('[CM] Gewählte Sets nicht im Dropdown gefunden — kein Fallback auf Voll-Export.');
          } else {
            console.warn('[CM] Keine Expansion-IDs, fallback');
            // v2.3.0: abgesichert — vorher riss ein Fehler hier den ganzen Export mit,
            // inklusive aller bereits gesammelten Zeilen.
            try {
              await scrapeWithCascade(langBaseFilter, 'ALL' + langTag, 1, 1, 'ALL');
            } catch (e) {
              if (e.message !== 'Abgebrochen') {
                scopeErrors.push({ label: 'ALL' + langTag, msg: e.message });
                writeProgress({ lastErr: `ALL${langTag}: ${e.message}` });
              }
            }
          }
        } else {
          for (let i = 0; i < expansions.length; i++) {
            if (window.__cmExportStop) break;
            const { id, name, labelCount } = expansions[i];
            if (!(id in expExpected)) expExpected[id] = { name, labelCount };
            // v2.2.12: a set Cardmarket reports as exactly 0 cards has nothing to scrape —
            // skip it (and its otherwise-retried empty page 1). Only for a real 0, never
            // for an unknown count (null), which still gets scraped normally.
            if (labelCount === 0) { if (!(id in expObserved)) expObserved[id] = 0; continue; }
            const beforeLen = rows.length;
            try {
              // v2.1: scrapeWithCascade prüft cap und splittet automatisch tiefer falls nötig
              await scrapeWithCascade(
                { ...langBaseFilter, idExpansion: id },
                `${i + 1}/${expansions.length} ${name}${langTag}`,
                i + 1, expansions.length, name
              );
            } catch (e) {
              if (e.message === 'Abgebrochen') break;
              console.error(`[CM] Expansion ${id} (${name})${langTag} fehlgeschlagen:`, e);
              scopeErrors.push({ label: `${name}${langTag}`, msg: e.message });
              writeProgress({ lastErr: `${name}${langTag}: ${e.message}` });
            }
            // v2.2.12: tally cards captured for this expansion (summed across language passes)
            let addedCards = 0;
            for (let k = beforeLen; k < rows.length; k++) addedCards += (parseInt(rows[k].amountDisplay || rows[k].amount, 10) || 0);
            expObserved[id] = (expObserved[id] || 0) + addedCards;
            if (delay) await sleep(delay);
          }
        }
      } else {
        // v2.3.0: siehe oben — ohne try/catch kostet ein einzelner HTTP-Fehler im ALL-Modus
        // (perExpansion aus) den gesamten Lauf.
        try {
          await scrapeWithCascade(langBaseFilter, 'ALL' + langTag, 1, 1, 'ALL');
        } catch (e) {
          if (e.message !== 'Abgebrochen') {
            scopeErrors.push({ label: 'ALL' + langTag, msg: e.message });
            writeProgress({ lastErr: `ALL${langTag}: ${e.message}` });
          }
        }
      }
    }

    // v2.2.12: Stock completeness self-check. The idExpansion dropdown carries
    // Cardmarket's own per-set CARD counts ("Reisegefährten (913)") in EVERY UI
    // language — a language-independent source of truth, unlike the "Ergebnisse/
    // Results" counter that simply does not exist on the German stock UI. Any set
    // that came up short gets one forced completeness re-scan; whatever is still
    // short afterwards is reported explicitly, so a gap can never be silent again.
    // Skipped when a page cap or a language filter makes the counts non-comparable.
    let completeness = null;
    const canCheckCompleteness = perExpansion && !maxPages && !langFilterActive && Object.keys(expExpected).length > 0;
    if (canCheckCompleteness && !window.__cmExportStop) {
      const shortfalls = [];
      for (const id of Object.keys(expExpected)) {
        const { name, labelCount } = expExpected[id];
        if (labelCount == null) continue;
        if ((expObserved[id] || 0) < labelCount) shortfalls.push({ id, name });
      }
      for (const sf of shortfalls) {
        if (window.__cmExportStop) break;
        writeProgress({ status: 'completeness recovery', lastErr: `${sf.name}: ${expObserved[sf.id] || 0}/${expExpected[sf.id].labelCount} — Nachladen` });
        const beforeLen = rows.length;
        try {
          await scrapeWithCascade({ idExpansion: sf.id }, `${sf.name} ⟳`, null, null, sf.name, true);
        } catch (e) {
          if (e.message === 'Abgebrochen') break;
          console.error(`[CM] completeness re-scan ${sf.id} (${sf.name}) failed:`, e);
        }
        let addedCards = 0;
        for (let k = beforeLen; k < rows.length; k++) addedCards += (parseInt(rows[k].amountDisplay || rows[k].amount, 10) || 0);
        expObserved[sf.id] = (expObserved[sf.id] || 0) + addedCards;
        if (delay) await sleep(delay);
      }
      // v2.2.12: if the user aborted mid-recovery, observed counts are partial —
      // don't publish a "still missing / complete" verdict built on truncated data.
      if (!window.__cmExportStop) {
        let expectedTotal = 0, observedTotal = 0, checked = 0, uncounted = 0;
        const stillShort = [];
        for (const id of Object.keys(expExpected)) {
          const { name, labelCount } = expExpected[id];
          if (labelCount == null) { uncounted++; continue; }
          checked++;
          expectedTotal += labelCount;
          const obs = expObserved[id] || 0;
          observedTotal += obs;
          if (obs < labelCount) stillShort.push({ name, expected: labelCount, observed: obs, missing: labelCount - obs });
        }
        stillShort.sort((a, b) => b.missing - a.missing);
        completeness = {
          expectedTotal,
          observedTotal,
          missingTotal: stillShort.reduce((s, x) => s + x.missing, 0),
          checkedExpansions: checked,
          uncountedExpansions: uncounted,
          recovered: shortfalls.length - stillShort.length,
          shortfalls: stillShort,
        };
      }
    }

    writeProgress({ status: 'done' });
    return { rows, pagesScanned, debugSnippet, detectedTotalPages, recoveryStats, completeness, scopeErrors, aborted: !!window.__cmExportStop };
  } catch (e) {
    writeProgress({ status: 'error', lastErr: e.message });
    return { error: e.message, rows, pagesScanned, debugSnippet, detectedTotalPages, recoveryStats, completeness: null, scopeErrors, aborted: !!window.__cmExportStop };
  }
}

// ================================================================
// BULK PRICE UPDATER — v2.0
// ================================================================

// Tab switching
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.section').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(t.dataset.section).classList.add('active');
  });
});

const fileCsv = document.getElementById('fileCsv');
const btnAnalyze = document.getElementById('btnAnalyze');
const btnUpdate = document.getElementById('btnUpdate');
const btnAbortUpdate = document.getElementById('btnAbortUpdate');
const updateCountEl = document.getElementById('updateCount');
const updatePreviewEl = document.getElementById('updatePreview');
const updateLogEl = document.getElementById('updateLog');
const updateProgressEl = document.getElementById('updateProgress');
const updateProgFillEl = document.getElementById('updateProgFill');
const updateProgTextEl = document.getElementById('updateProgText');
const dryRunEl = document.getElementById('dryRun');
const verifyAfterEl = document.getElementById('verifyAfter');
const updateCommentsEl = document.getElementById('updateComments');
const fastModeEl = document.getElementById('fastMode');
const slowModeEl = document.getElementById('slowMode');
const maxChangePctEl = document.getElementById('maxChangePct');
const updateDelayEl = document.getElementById('updateDelay');

let parsedUpdates = [];

const ulog = (msg, cls = '') => {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  updateLogEl.appendChild(d);
  updateLogEl.scrollTop = updateLogEl.scrollHeight;
};

// Parse CSV (semicolon-separated, quoted, Excel-formula-aware)
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, ''); // strip BOM
  const allLines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (!allLines.length) return { headers: [], rows: [], meta: {} };

  // v2.1: Metadata kommt jetzt aus Dateiname (siehe parseFilenameMeta).
  // Hier nur defensiv: alte CSVs mit "# CMSE-META" oder Excel-mangled Varianten ('"# CMSE...'") rausfiltern,
  // damit Re-Imports von alten Files nicht crashen.
  const meta = {};
  const lines = [];
  for (const l of allLines) {
    // Match: rohe Comment-Zeile, oder Excel-quoted-Variante davon, oder mit Excel-formula
    const stripped = l.replace(/^"+/, '').replace(/^=/, '').replace(/^"+/, '').trim();
    if (l.startsWith('#') || stripped.startsWith('#') || stripped.startsWith('CMSE-META') || stripped.startsWith('CMSE-WANTS-META')) {
      const metaMatch = stripped.match(/CMSE(?:-WANTS)?-META\s*\|\s*(.+?)(?:"|$)/);
      if (metaMatch) {
        for (const pair of metaMatch[1].split('|')) {
          const [k, v] = pair.trim().split('=');
          if (k && v) meta[k.trim()] = v.trim().replace(/"+$/, '');
        }
      }
      continue; // Comment-Zeile bzw. mangled Comment-Zeile überspringen
    }
    lines.push(l);
  }
  if (!lines.length) return { headers: [], rows: [], meta };

  const parseLine = (line) => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ';') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  // Strip Excel-formula wrapper ="..." → ...
  // Also recover from scientific notation if Excel mangled the value
  const cleanVal = (v) => {
    let s = String(v || '').trim();
    // Excel formula: ="1837013594" → 1837013594
    const fm = s.match(/^="(.*)"$/);
    if (fm) s = fm[1];
    return s;
  };
  const headers = parseLine(lines[0]).map(cleanVal);
  const rows = lines.slice(1).map(l => {
    const vals = parseLine(l).map(cleanVal);
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    // Recover ArticleID from scientific notation (Excel-mangled)
    if (obj.ArticleID && /^\d+(\.\d+)?[eE][+-]?\d+$/.test(obj.ArticleID)) {
      obj.ArticleID = String(Math.round(parseFloat(obj.ArticleID)));
      obj._articleIdRecovered = true;
    }
    // v2.1: idProduct ebenfalls aus Scientific-Notation retten
    if (obj.idProduct && /^\d+(\.\d+)?[eE][+-]?\d+$/.test(obj.idProduct)) {
      obj.idProduct = String(Math.round(parseFloat(obj.idProduct)));
      obj._idProductRecovered = true;
    }
    return obj;
  });
  return { headers, rows, meta };
}

// v2.1: Metadata aus Dateinamen extrahieren — Pattern cardmarket-(stock|wants)-{date}-{lang}-{game}-v{version}.csv
// Robust gegen Browser-Suffixe wie " (1)" oder "_2" durch Regex mit optionalem Trail-Match.
function parseFilenameMeta(filename) {
  if (!filename) return {};
  const m = filename.match(/cardmarket-(?:stock|wants)-(\d{4}-\d{2}-\d{2})(?:-([a-z]{2}))?(?:-([A-Za-z]+))?(?:-v([\d.]+))?/i);
  if (!m) return {};
  const meta = {};
  if (m[1]) meta.exported = m[1] + 'T00:00:00.000Z'; // Datum-only → Mitternacht UTC für age-check
  if (m[2]) meta.lang = m[2];
  if (m[3]) meta.game = m[3];
  if (m[4]) meta.tool = 'v' + m[4];
  return meta;
}

function parsePrice(s) {
  // German CSV format: "1.234,56" (dot=thousand, comma=decimal)
  return parseFloat(String(s || '').replace(/\./g, '').replace(',', '.')) || 0;
}
function parseFormPrice(s) {
  // Cardmarket form values: "0.1" or "0,10"
  return parseFloat(String(s || '').replace(',', '.')) || 0;
}
function fmtPrice(n) {
  return n.toFixed(2).replace('.', ',');
}

btnAnalyze.addEventListener('click', async () => {
 try {
  updateLogEl.innerHTML = '';
  updatePreviewEl.innerHTML = '';
  btnUpdate.style.display = 'none';
  parsedUpdates = [];
  // v2.1: Reset set-filter
  const _setFilterContainer = document.getElementById('setFilterContainer');
  const _setFilterList = document.getElementById('setFilterList');
  if (_setFilterContainer) _setFilterContainer.style.display = 'none';
  if (_setFilterList) _setFilterList.innerHTML = '';

  const file = fileCsv.files[0];
  if (!file) { ulog(tl('Keine CSV ausgewählt', 'No CSV selected'), 'err'); return; }

  const text = await file.text();
  const { headers, rows, meta: bodyMeta } = parseCsv(text);
  // v2.1: Filename-Metadata merge mit Body-Metadata (Filename gewinnt für lang/game, Body für exported falls vorhanden)
  const fnameMeta = parseFilenameMeta(file.name);
  const meta = { ...bodyMeta, ...fnameMeta };
  ulog(tl(`CSV gelesen: ${rows.length} Zeilen, ${headers.length} Spalten`, `CSV read: ${rows.length} rows, ${headers.length} columns`));

  if (!headers.includes('ArticleID') || !headers.includes('Price_EUR')) {
    // v2.1: smart detection — falsche CSV im falschen tab?
    if (headers.includes('idWant') && headers.includes('idWantsList')) {
      ulog(tl('❌ Falsche CSV — das ist eine Wants-CSV, nicht Stock-CSV.', '❌ Wrong CSV — this is a Wants CSV, not a Stock CSV.'), 'err');
      ulog(tl('Wechsel zum Tab "📋 Wants" → dort "Wants-CSV wählen" für Bulk-Delete.', 'Switch to the "📋 Wants" tab → choose "Wants CSV" there for Bulk-Delete.'), 'err');
      return;
    }
    ulog(tl('Fehler: CSV muss ArticleID + Price_EUR Spalten enthalten. Bist du im richtigen Tab?', 'Error: CSV must contain ArticleID + Price_EUR columns. Are you on the right tab?'), 'err');
    ulog(tl(`Gefundene Spalten: ${headers.join(', ')}`, `Columns found: ${headers.join(', ')}`), 'err');
    return;
  }

  // v2.1: Metadata-Ausgabe falls vorhanden (alte CSVs ohne Header haben leeres meta)
  if (meta.exported || meta.tool) {
    ulog(`ℹ Export-Info: ${[
      meta.exported ? new Date(meta.exported).toLocaleString('de-DE') : null,
      meta.lang ? `${meta.lang}/${meta.game || '?'}` : null,
      meta.tool || null,
    ].filter(Boolean).join(' | ')}`, 'ok');
    // Stale-Export-Warning (>24h alt)
    if (meta.exported) {
      const ageMs = Date.now() - new Date(meta.exported).getTime();
      const ageH = ageMs / 3600000;
      if (ageH > 24) {
        ulog(tl(`⚠ CSV ist ${Math.round(ageH)}h alt — empfohlen: vor Bulk-Update neu exportieren (idArticle-Drift möglich)`, `⚠ CSV is ${Math.round(ageH)}h old — recommended: re-export before bulk-update (idArticle drift possible)`), 'err');
      }
    }
  }

  // Fetch current prices from Cardmarket to compare
  ulog(tl('Lade aktuelle Preise von Cardmarket für Vergleich...', 'Loading current prices from Cardmarket for comparison...'));
  const tab = await getTargetTab();
  if (!tab || !/cardmarket\.com/.test(tab.url || '')) {
    ulog(tl('Kein Cardmarket-Tab offen', 'No Cardmarket tab open'), 'err');
    return;
  }

  // v2.1: Tab-Mismatch-Detection (Lang/Game der CSV vs aktuelle Tab)
  if (meta.lang || meta.game) {
    const tabMatch = (tab.url || '').match(/cardmarket\.com\/([^/]+)\/([^/]+)\//);
    const tabLang = tabMatch?.[1] || '';
    const tabGame = tabMatch?.[2] || '';
    const langMismatch = meta.lang && tabLang && meta.lang !== tabLang;
    const gameMismatch = meta.game && tabGame && meta.game !== tabGame;
    if (langMismatch || gameMismatch) {
      const msg = tl(`⚠ Tab-Mismatch: CSV exportiert aus ${meta.lang || '?'}/${meta.game || '?'}, aktive Tab ist ${tabLang}/${tabGame}. Bulk-Update wird wahrscheinlich für alle IDs fehlschlagen. Auf passenden Tab wechseln und nochmal "CSV analysieren" klicken.`, `⚠ Tab mismatch: CSV was exported from ${meta.lang || '?'}/${meta.game || '?'}, but the active tab is ${tabLang}/${tabGame}. Bulk-update will likely fail for all IDs. Switch to the matching tab and click "Analyze CSV" again.`);
      ulog(msg, 'err');
      if (!confirm(msg + '\n\nTrotzdem fortsetzen?')) return;
    }
  }

  // Build updates: ArticleID + newPrice
  const maxPct = parseFloat(maxChangePctEl.value) || 200;
  const updates = [];
  let skipped = 0, invalid = 0;

  // v2.1: variant-attributes mit übernehmen für idArticle-Auto-Rebind + Skip-Fetch-Pre-Filter
  // Skip-Fetch: vergleicht CSV.Price_EUR vs CSV._OriginalPrice_EUR (read-only Ref vom Export)
  // Wenn identisch → user hat nicht editiert → kein Cardmarket-Fetch nötig → drastisch weniger CF-Last
  const hasSkipFetchColumns = headers.includes('_OriginalPrice_EUR') && headers.includes('_OriginalComments');
  const updateCommentsForFilter = updateCommentsEl.checked;
  // v2.2.1: track silent-skips for diagnostic warning
  let silentCommentSkips = 0;
  const silentCommentSkipSamples = [];
  for (const r of rows) {
    const id = r.ArticleID?.trim();
    const newPrice = parsePrice(r.Price_EUR);
    if (!id || !/^\d+$/.test(id)) { invalid++; continue; }
    if (newPrice <= 0) { invalid++; continue; }

    // v2.1 Skip-Fetch-Detection — wenn Ref-Spalten vorhanden, prüfen ob User editiert hat
    let userEdited = true; // default true bei alten CSVs ohne Ref-Spalten
    if (hasSkipFetchColumns) {
      const refPrice = parsePrice(r._OriginalPrice_EUR || '');
      const priceEdited = Math.abs(newPrice - refPrice) >= 0.005;
      const csvCom = (r.Comments || '').trim();
      const refCom = (r._OriginalComments || '').trim();
      const commentsActuallyDiffer = csvCom !== refCom;
      const commentsEdited = updateCommentsForFilter && commentsActuallyDiffer;
      userEdited = priceEdited || commentsEdited;
      // v2.2.1: detect silent-skipped comment-only edits (toggle off = silent loss)
      if (!updateCommentsForFilter && commentsActuallyDiffer && !priceEdited) {
        silentCommentSkips++;
        if (silentCommentSkipSamples.length < 3) {
          silentCommentSkipSamples.push({
            articleId: id,
            name: (r.Name || '').slice(0, 40),
            expansion: (r.Expansion || '').slice(0, 40),
            csvCom: csvCom.slice(0, 60),
            refCom: refCom.slice(0, 60),
          });
        }
      }
    }

    // v2.1: Delete-Flag aus delete-Spalte (Y/YES/TRUE/1 = löschen, sonst ignorieren)
    const deleteFlag = ((r.delete || '').trim().toUpperCase());
    const wantsDelete = deleteFlag === 'Y' || deleteFlag === 'YES' || deleteFlag === 'TRUE' || deleteFlag === '1';

    updates.push({
      articleId: id,
      name: r.Name || '',
      newPrice,
      oldPrice: null,
      // v2.1: Variant-Attrs für Rebind bei idArticle-Drift
      idProduct: (r.idProduct || '').trim(),
      language: (r.Language || '').trim(),
      condition: (r.Condition || '').trim(),
      reverseHolo: ((r.ReverseHolo || '').toUpperCase() === 'Y'),
      // v2.1: amount für Direct-Mode editAmount-field
      amount: parseInt(r.Amount || '1', 10) || 1,
      // v2.1: Comments für Bulk-Edit (newComments aus CSV; oldComments wird beim Fetch gefüllt)
      newComments: (r.Comments || ''),
      oldComments: null,
      // v2.1 Skip-Fetch flag — Delete-Y zählt auch als userEdited
      userEdited: userEdited || wantsDelete,
      wantsDelete,
      _refPrice: hasSkipFetchColumns ? parsePrice(r._OriginalPrice_EUR || '') : null,
      _refComments: hasSkipFetchColumns ? (r._OriginalComments || '') : null,
    });
  }

  // v2.1: Delete-Summary
  const deleteCount = updates.filter(u => u.wantsDelete).length;
  if (deleteCount > 0) {
    ulog(tl(`🗑 ${deleteCount} Listings markiert zum LÖSCHEN (Spalte delete=Y). Werden im Apply-Schritt komplett von Cardmarket entfernt.`, `🗑 ${deleteCount} listings marked for DELETION (column delete=Y). They will be fully removed from Cardmarket in the apply step.`), 'err');
  }

  // v2.1 Skip-Fetch summary
  if (hasSkipFetchColumns) {
    const editedCount = updates.filter(u => u.userEdited).length;
    const skipCount = updates.length - editedCount;
    ulog(tl(`✓ Skip-Fetch aktiv: ${editedCount} Zeilen vom User editiert, ${skipCount} unverändert (werden NICHT von Cardmarket gefetched → keine CF-Last)`,
            `✓ Skip-fetch active: ${editedCount} rows edited by you, ${skipCount} unchanged (NOT fetched from Cardmarket → no CF load)`), 'ok');
    // v2.2.1: warn loud if user has comment-edits but toggle is OFF (silent-skip = bug-source)
    if (silentCommentSkips > 0) {
      ulog(tl(`⚠ ${silentCommentSkips} Zeilen haben geänderte Comments ABER "Comments mit-updaten"-Toggle ist AUS → diese Edits werden IGNORIERT.`, `⚠ ${silentCommentSkips} rows have changed comments BUT the "Update comments too" toggle is OFF → these edits are IGNORED.`), 'err');
      ulog(tl(`   → Toggle "Comments mit-updaten" oben aktivieren UND nochmal "CSV analysieren + Preview" klicken, um Comments-Updates anzuwenden.`, `   → Enable the "Update comments too" toggle above AND click "Analyze CSV + Preview" again to apply comment updates.`), 'err');
      for (const s of silentCommentSkipSamples) {
        ulog(`   • ${s.articleId} (${s.expansion}): "${s.refCom}" → "${s.csvCom}"`, 'err');
      }
      // Surface warning banner in preview area
      const warnEl = document.createElement('div');
      warnEl.className = 'warn';
      warnEl.style.cssText = 'background:#7c2d12;color:#fed7aa;border:2px solid #ea580c';
      warnEl.innerHTML = `⚠ <b>${silentCommentSkips} Comments-Edits werden gerade IGNORIERT</b> — "Comments mit-updaten"-Toggle ist aus. Toggle aktivieren + nochmal analysieren.`;
      updatePreviewEl.appendChild(warnEl);
    }
    if (editedCount === 0) {
      ulog(tl(`ℹ Keine Edits erkannt. Bearbeite Price_EUR oder Comments in CSV. (Falls editiert wurde: prüfe ob _OriginalPrice_EUR / _OriginalComments unverändert geblieben sind)`,
              `ℹ No edits detected. Edit Price_EUR or Comments in the CSV. (If you did edit: check that _OriginalPrice_EUR / _OriginalComments were left unchanged)`), 'err');
    }
  } else {
    ulog(tl(`⚠ Alte CSV ohne Skip-Fetch-Ref-Spalten (_OriginalPrice_EUR, _OriginalComments). Tool muss alle ${updates.length} Zeilen fetchen → erhöhtes CF-Risiko. Re-export mit v2.1+ empfohlen.`,
            `⚠ Old CSV without skip-fetch reference columns (_OriginalPrice_EUR, _OriginalComments). The tool must fetch all ${updates.length} rows → higher CF risk. Re-export with v2.1+ recommended.`), 'err');
  }

  if (invalid > 0) ulog(tl(`⚠ ${invalid} Zeilen ungültig (fehlende ID/Preis)`, `⚠ ${invalid} rows invalid (missing ID/price)`), 'err');
  const recovered = rows.filter(r => r._articleIdRecovered).length;
  if (recovered > 0) ulog(tl(`ℹ ${recovered} ArticleIDs aus Scientific-Notation wiederhergestellt (Excel-Bug)`, `ℹ ${recovered} ArticleIDs recovered from scientific notation (Excel bug)`), 'ok');
  const idProductCount = updates.filter(u => u.idProduct).length;
  const idProductCoverage = updates.length ? (idProductCount / updates.length * 100).toFixed(0) : 0;
  if (idProductCount > 0) {
    ulog(tl(`ℹ idProduct in ${idProductCount}/${updates.length} Zeilen (${idProductCoverage}%) — Auto-Rebind aktiv für 404er`, `ℹ idProduct in ${idProductCount}/${updates.length} rows (${idProductCoverage}%) — auto-rebind active for 404s`), 'ok');
  } else if (updates.length > 0) {
    ulog(tl(`⚠ Keine idProduct-Spalte in CSV — Auto-Rebind nicht möglich. Re-export mit v2.1+ empfohlen.`, `⚠ No idProduct column in CSV — auto-rebind not possible. Re-export with v2.1+ recommended.`), 'err');
  }

  // v2.1: Erweiterte Fetch-Funktion — fetched current prices, mit idArticle-Auto-Rebind via idProduct-Match bei 404
  const isSlowMode = slowModeEl.checked;
  // v2.1: Set-Filter VOR fetch zeigen — user pickt sets, dann nur die werden gefetched
  // Build map articleId → Expansion aus CSV-rows
  const csvExpansionMap = {};
  for (const r of rows) {
    const id = r.ArticleID?.trim();
    if (id) csvExpansionMap[id] = r.Expansion || '(unbekannt)';
  }
  const userEditedUpdates = updates.filter(u => u.userEdited);
  // Group nach Expansion
  const preFetchSetGroups = {};
  for (const u of userEditedUpdates) {
    const exp = csvExpansionMap[u.articleId] || '(unbekannt)';
    if (!preFetchSetGroups[exp]) preFetchSetGroups[exp] = [];
    preFetchSetGroups[exp].push(u);
    u._expansion = exp;
  }
  const preFetchContainer = document.getElementById('setFilterContainer');
  const preFetchList = document.getElementById('setFilterList');
  if (Object.keys(preFetchSetGroups).length > 0) {
    const sortedSets = Object.entries(preFetchSetGroups).sort((a, b) => b[1].length - a[1].length);
    const escHtmlPre = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    preFetchList.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;padding:5px 7px;margin:0;font-size:9.5px;color:var(--fg-faint);border-bottom:1px solid var(--line);font-weight:600;letter-spacing:.06em">
        <span style="width:14px"></span>
        <span style="flex:1">SET</span>
        <span style="min-width:60px;text-align:right">EDITS</span>
        <span style="min-width:60px;text-align:right">${tl('KARTEN', 'CARDS')}</span>
      </div>
    ` + sortedSets.map(([exp, items]) => {
      const safeId = 'setf_' + exp.replace(/[^a-zA-Z0-9]/g, '_');
      // Sum amounts pro set
      const totalCards = items.reduce((s, u) => {
        const r = rows.find(rr => rr.ArticleID?.trim() === u.articleId);
        const amt = parseInt(r?.Amount || '0', 10) || 0;
        return s + amt;
      }, 0);
      return `<label style="display:flex;align-items:center;gap:6px;padding:3px 4px;margin:0;border-bottom:1px solid #1a1a1a;cursor:pointer">
        <input type="checkbox" id="${safeId}" data-set="${escHtmlPre(exp)}" checked style="width:14px;height:14px;flex-shrink:0">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtmlPre(exp)}</span>
        <span style="color:#6ee7b7;font-weight:600;min-width:60px;text-align:right;font-size:12px">${items.length}</span>
        <span style="color:var(--warn);font-weight:600;min-width:60px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums">${totalCards}</span>
      </label>`;
    }).join('');
    preFetchContainer.style.display = 'block';

    // Wait for user to confirm selection — show "Fetch starten" button + wait for it
    ulog(tl(`📋 ${userEditedUpdates.length} edits in ${Object.keys(preFetchSetGroups).length} Sets erkannt. Wähle Sets aus + klicke "Fetch + Preview starten".`, `📋 ${userEditedUpdates.length} edits detected across ${Object.keys(preFetchSetGroups).length} sets. Select sets + click "Start fetch + preview".`), 'ok');

    // Inject confirm-button after the set-filter
    if (!document.getElementById('btnConfirmSets')) {
      const btnConfirm = document.createElement('button');
      btnConfirm.id = 'btnConfirmSets';
      btnConfirm.textContent = '✓ Fetch + Preview starten';
      btnConfirm.style.cssText = 'background:#2563eb;margin-top:6px';
      preFetchContainer.appendChild(btnConfirm);
      // Wait for click
      await new Promise(resolve => {
        btnConfirm.addEventListener('click', () => {
          btnConfirm.disabled = true;
          btnConfirm.textContent = tl('Fetch läuft…', 'Fetching…');
          resolve();
        }, { once: true });
      });
      // Filter updates by selected sets BEFORE fetch
      const selectedPre = new Set([...preFetchList.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.getAttribute('data-set')));
      // Modify updates in-place: items in unselected sets get userEdited=false → won't be fetched
      for (const u of updates) {
        if (u.userEdited && u._expansion && !selectedPre.has(u._expansion)) {
          u.userEdited = false;
          u._setFilterSkipped = true;
        }
      }
      const skipped = updates.filter(u => u._setFilterSkipped).length;
      ulog(tl(`Set-Filter: ${selectedPre.size}/${Object.keys(preFetchSetGroups).length} Sets gewählt. ${userEditedUpdates.length - skipped} Items werden gefetched (${skipped} sets-skipped).`, `Set filter: ${selectedPre.size}/${Object.keys(preFetchSetGroups).length} sets selected. ${userEditedUpdates.length - skipped} items will be fetched (${skipped} sets skipped).`), 'ok');
    }
  }

  // v2.1 Skip-Fetch: nur user-edited rows fetchen
  const itemsToFetch = updates.filter(u => u.userEdited);
  const fetchCount = itemsToFetch.length;
  if (fetchCount === 0) {
    ulog(tl(`Keine Cardmarket-Fetches nötig (0 user-edits). Nichts zu tun.`, `No Cardmarket fetches needed (0 user edits). Nothing to do.`), 'ok');
    btnUpdate.style.display = 'none';
    if (!updatePreviewEl.querySelector('.warn')) {
      updatePreviewEl.innerHTML = `<div class="warn" style="background:#1e3a8a;color:#bfdbfe">ℹ Keine Edits in CSV erkannt. Bearbeite <code>Price_EUR</code> oder <code>Comments</code> und re-analysiere.</div>`;
    }
    return;
  }
  if (isSlowMode) {
    ulog(tl(`🐢 Slow Mode aktiv: ~1 Request/2s. Geschätzte Dauer: ~${Math.round(fetchCount * 2 / 60)} min für ${fetchCount} Items.`, `🐢 Slow Mode active: ~1 request/2s. Estimated time: ~${Math.round(fetchCount * 2 / 60)} min for ${fetchCount} items.`), 'ok');
  }
  if (fetchCount > 500 && !isSlowMode) {
    ulog(tl(`⚠ ${fetchCount} Items ohne Slow Mode — Cloudflare könnte aggressiv blocken. Bei vielen "not-found" → Slow Mode aktivieren + retry.`, `⚠ ${fetchCount} items without Slow Mode — Cloudflare may block aggressively. If many "not-found" → enable Slow Mode + retry.`), 'err');
  }
  let [{ result: fetchResult }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    args: [itemsToFetch.map(u => ({
      articleId: u.articleId,
      idProduct: u.idProduct,
      language: u.language,
      condition: u.condition,
      reverseHolo: u.reverseHolo,
    })), isSlowMode],
    func: async (items, slowMode) => {
      const pathParts = location.pathname.split('/').filter(Boolean);
      const lang = pathParts[0] || 'de';
      const game = pathParts[1] || 'Pokemon';
      const out = {}; // articleId → { price, rebindTo? }

      // v2.1: Fetch single article state — returns null on echtes 404, sonst { price, comments }
      // Mit umfassendem Retry-Handling: 429 (rate-limit), 5xx, Cloudflare-Challenges, Connection-Errors
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      // Cloudflare-Challenge-Detection: Body enthält typische Strings wenn CF interstitial
      const isCloudflareChallenge = (html) => {
        if (!html) return false;
        return /cf-mitigated|cf-chl-bypass|Just a moment|Checking your browser|cf-browser-verification|Cloudflare Ray ID/i.test(html);
      };
      // Cloudflare-spezifische Status-Codes
      const isCloudflareError = (status) => status === 403 || status === 520 || status === 521 || status === 522 || status === 524 || status === 525;

      async function fetchArticleState(id) {
        let attempt = 0;
        while (attempt < 5) {
          try {
            const res = await fetch(`/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${id}`, { credentials: 'include' });
            // 429 — Rate-Limit
            if (res.status === 429) {
              attempt++;
              const backoff = 8000 * attempt; // 8s, 16s, 24s, 32s, 40s
              window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { rateLimited: true, lastErr: `429 → backoff ${backoff/1000}s` });
              await sleep(backoff);
              continue;
            }
            // 404 — echtes not-found
            if (res.status === 404) return null;
            // Cloudflare-Status-Codes — extended backoff
            if (isCloudflareError(res.status)) {
              attempt++;
              const backoff = 30000 + (15000 * attempt); // 30s, 45s, 60s, 75s, 90s
              window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { cloudflareBlocked: true, lastErr: `CF-${res.status} → pause ${backoff/1000}s` });
              await sleep(backoff);
              continue;
            }
            // Anderer non-ok Status → 1 retry, dann null
            if (!res.ok) {
              if (attempt < 1) { attempt++; await sleep(2500); continue; }
              return null;
            }
            // 200 OK — aber Body könnte Cloudflare-Challenge sein
            const html = await res.text();
            if (isCloudflareChallenge(html)) {
              attempt++;
              const backoff = 30000 + (15000 * attempt);
              window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { cloudflareBlocked: true, lastErr: `CF-Challenge → pause ${backoff/1000}s` });
              await sleep(backoff);
              continue;
            }
            const doc = new DOMParser().parseFromString(html, 'text/html');
            // v2.2.3: robust form-detection — extension-articles use different form id patterns
            // Primary: form id starts with "Edit" (regular articles, e.g. EditSingleArticle...)
            // Fallback: any form containing price input (catches extension-articles, language-variants, etc)
            let form = doc.querySelector('form[id^="Edit"]');
            let priceInput = form?.querySelector('input[name="price"]');
            if (!priceInput) {
              // Fallback to any form with price input
              const anyPriceInput = doc.querySelector('input[name="price"]');
              if (anyPriceInput) {
                form = anyPriceInput.closest('form');
                priceInput = anyPriceInput;
              }
            }
            if (!priceInput) {
              // Form fehlt im 200-Response — Login-Redirect oder unbekanntes Modal-Format
              if (/login|signin|anmelden/i.test(html.slice(0, 2000))) {
                window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { sessionExpired: true, lastErr: 'Login-Redirect erkannt — Session abgelaufen' });
                throw new Error('Session expired');
              }
              // v2.2.3: Diagnostic — log first article-id with no price-input + html sample for ext-set debugging
              if (!window.__cmModalNullSamples) window.__cmModalNullSamples = [];
              if (window.__cmModalNullSamples.length < 3) {
                const sample = {
                  articleId: id,
                  hasForm: !!doc.querySelector('form'),
                  formIds: [...doc.querySelectorAll('form')].map(f => f.id || '(no-id)').slice(0, 5),
                  inputNames: [...doc.querySelectorAll('input, textarea')].map(el => el.name).filter(Boolean).slice(0, 20),
                  htmlSnippet: html.slice(0, 800),
                };
                window.__cmModalNullSamples.push(sample);
                console.warn('[CMSE] modal-form not found for articleId=' + id, sample);
              }
              return null;
            }
            const price = priceInput.getAttribute('value') || priceInput.value || '';
            const commentsEl = form ? form.querySelector('textarea[name="comments"], textarea[name="comment"], input[name="comments"], input[name="comment"]') : doc.querySelector('textarea[name="comments"], textarea[name="comment"]');
            // v2.3.0: null statt '' — ein nicht gefundenes Kommentarfeld darf nicht als
            // "Kommentar ist leer" gelten, sonst loescht das Voll-Update ihn.
            const comments = commentsEl ? (commentsEl.value || commentsEl.textContent || '') : null;
            // v2.2.5: capture variant flags from form so directUpdate can preserve them
            // CM stock-listing form has checkboxes: isReverseHolo, isFoil, isSigned, isAltered, isFirstEd, isPlayset
            // Some are absent from form depending on game/expansion — undefined/null means "do not pass"
            const readChk = (name) => {
              const el = (form || doc).querySelector(`input[name="${name}"]`);
              if (!el) return null;
              if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
              const v = el.value || '';
              return v === '1' || v.toLowerCase() === 'true' || v.toLowerCase() === 'y';
            };
            // v2.3.0: keine feste Liste mehr. Die Varianten heissen je Spiel anders — Force of Will
            // hat isFullArt und isUberRare, Star Wars: Destiny isWithDie. Eine Whitelist haette
            // genau diese Flags beim Update verworfen (Cardmarket entfernt nicht mitgesendete
            // Felder). Deshalb alles einsammeln, was das Formular an is*-Feldern anbietet.
            // WICHTIG: pro Name ALLE gleichnamigen Inputs auswerten und die Checkbox bevorzugen.
            // Cardmarket rendert Schalter typischerweise als Paar
            //   <input type="hidden" name="isFoil" value="0"><input type="checkbox" name="isFoil" value="1" checked>
            // Eine Suche per Namen liefert das ERSTE Element, also das Hidden-Feld mit value=0 —
            // jedes Flag waere als false gelesen und anschliessend als '0' zurueckgeschrieben
            // worden. Das haette die Varianten flaechendeckend geloescht statt sie zu bewahren.
            const flags = {};
            const isNames = new Set();
            (form || doc).querySelectorAll('input[name^="is"]').forEach(el => {
              const n = el.getAttribute('name') || '';
              if (/^is[A-Z]/.test(n)) isNames.add(n);
            });
            isNames.forEach(n => {
              const els = [...(form || doc).querySelectorAll(`input[name="${n}"]`)];
              const box = els.find(e => e.type === 'checkbox' || e.type === 'radio');
              if (box) { flags[n] = box.checked; return; }
              // Kein Schalter, sondern ein reines Wertfeld → nicht als Boolean behandeln,
              // sonst wuerde ein Nicht-0/1-Wert beim Zurueckschreiben zerstoert.
              const v = String(els[0]?.value ?? '').toLowerCase();
              flags[n] = (v === '1' || v === 'true' || v === 'y') ? true : (v === '0' || v === 'false' || v === 'n' ? false : null);
            });
            // Sicherheitsnetz: die klassischen Felder auch dann fuehren, wenn der Selektor
            // sie (z.B. als <select>) nicht erwischt hat.
            ['isReverseHolo', 'isFoil', 'isSigned', 'isAltered', 'isFirstEd', 'isPlayset'].forEach(n => {
              if (!(n in flags)) flags[n] = readChk(n);
            });
            // Capture editAmount too (CM-side current amount, may differ from CSV if user partially sold)
            const amountEl = (form || doc).querySelector('input[name="editAmount"], input[name="amount"]');
            // v2.3.0: null statt '' — nur so laesst sich "Feld nicht gefunden" von "Feld ist leer"
            // unterscheiden. Mit '' war der Schutz in directUpdate unerreichbar.
            const editAmount = amountEl ? (amountEl.value || amountEl.getAttribute('value') || '') : null;
            return { price, comments, flags, editAmount };
          } catch (e) {
            if (e?.message === 'Session expired') throw e; // Session-Errors propagieren
            if (attempt < 1) { attempt++; await sleep(2500); continue; }
            return null;
          }
        }
        return null;
      }
      // Backwards-Compat-Wrapper für nur-Preis-Aufrufer
      const fetchPrice = async (id) => {
        const s = await fetchArticleState(id);
        return s ? s.price : null;
      };

      // Cache: idProduct → Liste der User-Articles für dieses Product (mit variant-attrs)
      const productCache = {};
      async function loadUserArticlesForProduct(idProduct) {
        if (productCache[idProduct]) return productCache[idProduct];
        // v2.1: 429-retry auch hier
        let res = null;
        for (let att = 0; att < 4; att++) {
          try {
            res = await fetch(`/${lang}/${game}/Stock/Offers/Singles?idProduct=${idProduct}&sortBy=name_asc`, { credentials: 'include' });
            if (res.status === 429) { await sleep(5000 * (att + 1)); continue; }
            break;
          } catch { res = null; await sleep(1500); }
        }
        try {
          if (!res || !res.ok) { productCache[idProduct] = []; return []; }
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          // v2.2.13: alle 17 Kartensprachen, die Cardmarket fuehrt (DE- und EN-Schreibweise).
    // Vorher endete die Liste bei 11 — Karten in Sprache 12-17 bekamen eine LEERE Language-Spalte,
    // und das Bulk-Update hat sie danach auf Deutsch gesetzt.
    const LANG_RE = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|Holländisch|Niederländisch|Polnisch|Tschechisch|Ungarisch|Indonesisch|Thailändisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian|Simplified Chinese|Traditional Chinese|Dutch|Polish|Czech|Hungarian|Indonesian|Thai)$/;
          // v2.3.0: Selektor und ID-Extraktion an das aktuelle Cardmarket-Markup angeglichen.
          // Der alte Pfad suchte nur id="articleRow123" — seit der Umstellung auf stockRow gab es
          // dort keine Treffer mehr, wodurch der Auto-Rebind fuer verschobene Article-IDs
          // stillschweigend wirkungslos war. Gleiche Reihenfolge wie in parseRow.
          let list = [...doc.querySelectorAll('[id^="articleRow"], [id^="stockRow"], .article-row')].map(el => {
            let articleId = '';
            const editLink = el.querySelector('a[data-modal*="idArticle="], [data-modal*="idArticle="]');
            if (editLink) {
              const mm = (editLink.getAttribute('data-modal') || '').match(/idArticle=(\d+)/);
              if (mm) articleId = mm[1];
            }
            if (!articleId) {
              const amtInp = el.querySelector('input[name^="groupCountAmount"]');
              const mm = (amtInp?.getAttribute('name') || '').match(/groupCountAmount(\d+)/);
              if (mm) articleId = mm[1];
            }
            if (!articleId) {
              const mm = (el.outerHTML || '').match(/(?:idArticle['"\s:=]+|stockRow)(\d+)/);
              if (mm) articleId = mm[1];
            }
            if (!articleId) {
              const mm = (el.id || '').match(/articleRow(\d+)/);
              if (mm) articleId = mm[1];
            }
            const condition = el.querySelector('.article-condition .badge')?.textContent.trim() || '';
            let language = '';
            el.querySelectorAll('span[aria-label], span[data-bs-original-title], span[data-original-title], span[title]').forEach(s => {
              if (language) return;
              const l = s.getAttribute('aria-label') || s.getAttribute('data-bs-original-title') || s.getAttribute('data-original-title') || s.getAttribute('title') || '';
              if (LANG_RE.test(l)) language = l;
            });
            const reverseHolo = !!el.querySelector('[aria-label*="Reverse" i], [data-bs-original-title*="Reverse" i], [title*="Reverse" i]') || /Reverse\s*Holo/i.test(el.textContent || '');
            return { articleId, condition, language, reverseHolo };
          }).filter(c => c.articleId);
          // v2.3.0: nach articleId deduplizieren. Der erweiterte Selektor kann bei
          // verschachteltem Markup dasselbe Listing zweimal liefern, und der Rebind verlangt
          // genau einen Treffer — sonst faellt er wieder auf null zurueck.
          const byId = new Map();
          for (const c of list) if (c.articleId && !byId.has(c.articleId)) byId.set(c.articleId, c);
          list = [...byId.values()];
          productCache[idProduct] = list;
          return list;
        } catch { productCache[idProduct] = []; return []; }
      }

      // Match-Algorithmus: exact (language, condition, reverseHolo). Unique-Match → Rebind. 0 oder multiple → bleibt not-found.
      async function rebind(item) {
        if (!item.idProduct) return null;
        const list = await loadUserArticlesForProduct(item.idProduct);
        const matches = list.filter(c =>
          c.language === item.language &&
          c.condition === item.condition &&
          c.reverseHolo === item.reverseHolo
        );
        if (matches.length === 1) return matches[0].articleId;
        return null;
      }

      // v2.1: Phase A — Slow-Mode oder Normal-Mode
      // Slow: sequentiell, 1 Req/2s — Cloudflare-safe für 1000+ Items
      // Normal: parallel batch=5 mit 200ms Inter-Batch — schneller aber CF-empfindlich
      const batch = slowMode ? 1 : 5;
      const interBatchDelayMs = slowMode ? 2000 : 200;
      // CF-Cascade-Detection: wenn 5 aufeinanderfolgende fetches null returnen (alle CF-blocked) → abort
      let consecutiveFails = 0;
      let cfAbort = false;

      for (let i = 0; i < items.length; i += batch) {
        if (cfAbort) break;
        const chunk = items.slice(i, i + batch);
        const results = await Promise.all(chunk.map(async (it) => {
          try {
            const state = await fetchArticleState(it.articleId);
            return { articleId: it.articleId, state };
          } catch (e) {
            // Session-expired propagiert hier rauf → ganzen Run abbrechen
            return { articleId: it.articleId, state: null, fatal: e?.message };
          }
        }));
        for (const r of results) {
          // v2.2.5: pipe variant flags + editAmount through so directUpdate can preserve them
          out[r.articleId] = r.state
            ? { price: r.state.price, comments: r.state.comments ?? null, flags: r.state.flags || null, editAmount: r.state.editAmount ?? null }
            : { price: null, comments: null, flags: null, editAmount: '' };
          if (!r.state) consecutiveFails++;
          else consecutiveFails = 0;
          if (r.fatal === 'Session expired') {
            window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { sessionExpired: true, lastErr: 'Session abgelaufen — abort' });
            cfAbort = true;
            break;
          }
        }
        // CF-Cascade-Abort: 20+ aufeinanderfolgende fails → Cloudflare blockt → weiter machen sinnlos
        if (consecutiveFails >= 20 && !cfAbort) {
          window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { cfCascadeAbort: true, lastErr: `${consecutiveFails} consecutive fails — CF-blocked, abort` });
          cfAbort = true;
        }
        window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { phase: 'fetch', done: i + chunk.length, total: items.length });
        if (cfAbort) break;
        if (i + batch < items.length) await sleep(interBatchDelayMs);
      }
      window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { fetchAborted: cfAbort });

      // Phase B: für 404er → Rebind versuchen (sequentiell, sonst race auf productCache)
      const notFound = items.filter(it => out[it.articleId].price == null && it.idProduct);
      for (let i = 0; i < notFound.length; i++) {
        const it = notFound[i];
        const newId = await rebind(it);
        if (newId && newId !== it.articleId) {
          const state = await fetchArticleState(newId);
          if (state) {
            // v2.2.5: also pipe flags + editAmount in rebind path
            out[it.articleId] = { price: state.price, comments: state.comments, flags: state.flags || null, editAmount: state.editAmount || '', rebindTo: newId };
          }
        }
        window.__cmUpdateProgress = { phase: 'rebind', done: i + 1, total: notFound.length };
      }

      // v2.2.3: surface modal-null samples for diagnostic
      return { __out: out, __modalNullSamples: window.__cmModalNullSamples || [] };
    },
  });

  // v2.2.3: unwrap diagnostic envelope (backwards-compat: if older format, use directly)
  let modalNullSamples = [];
  if (fetchResult && fetchResult.__out) {
    modalNullSamples = fetchResult.__modalNullSamples || [];
    fetchResult = fetchResult.__out;
  }

  // v2.1: defensive check — wenn injected fetch silent failed, fetchResult ist undefined
  if (!fetchResult || typeof fetchResult !== 'object') {
    ulog(tl('❌ Preview-Fetch lieferte kein Ergebnis. Mögliche Ursachen:', '❌ Preview fetch returned no result. Possible causes:'), 'err');
    ulog(tl('  • Cardmarket-Tab ist nicht offen oder navigierte weg', '  • The Cardmarket tab is not open or navigated away'), 'err');
    ulog(tl('  • Login-Session abgelaufen', '  • Login session expired'), 'err');
    ulog(tl('  • Extension wurde nicht reloaded nach Update', '  • The extension was not reloaded after updating'), 'err');
    ulog(tl('Fix: Cardmarket-Tab refreshen + chrome://extensions/ → Reload bei Stock Exporter + retry.', 'Fix: refresh the Cardmarket tab + chrome://extensions/ → reload Stock Exporter + retry.'), 'err');
    return;
  }

  // v2.1: CF-Cascade-Abort-Detection — Cloudflare hat Session geblockt
  // Check via window.__cmUpdateProgress nach Run-Ende
  try {
    const [{ result: progressAfter }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => window.__cmUpdateProgress || null,
    });
    if (progressAfter?.cfCascadeAbort) {
      ulog(tl('🛑 CLOUDFLARE-BLOCKADE erkannt — Run abgebrochen.', '🛑 CLOUDFLARE BLOCK detected — run aborted.'), 'err');
      ulog(tl(`Letzter Status: ${progressAfter.lastErr || 'unknown'}`, `Last status: ${progressAfter.lastErr || 'unknown'}`), 'err');
      ulog(tl('Maßnahmen:', 'Steps:'), 'err');
      ulog(tl('  1. Cardmarket-Tab schließen, ALLE Tabs', '  1. Close the Cardmarket tab, ALL tabs'), 'err');
      ulog(tl('  2. 10-15 min warten — IP-Reputation regeneriert sich', '  2. Wait 10-15 min — IP reputation recovers'), 'err');
      ulog(tl('  3. Browser-Cookies für cardmarket.com löschen (chrome://settings/cookies/...)', '  3. Clear browser cookies for cardmarket.com (chrome://settings/cookies/...)'), 'err');
      ulog(tl('  4. Neu einloggen', '  4. Log in again'), 'err');
      ulog(tl('  5. Bulk-Update mit 🐢 Slow Mode aktiviert nochmal versuchen', '  5. Retry bulk-update with 🐢 Slow Mode enabled'), 'err');
      return;
    }
    if (progressAfter?.sessionExpired) {
      ulog(tl('🔐 Login-Session abgelaufen während Fetch.', '🔐 Login session expired during fetch.'), 'err');
      ulog(tl('Cardmarket-Tab refreshen + neu einloggen + retry.', 'Refresh the Cardmarket tab + log in again + retry.'), 'err');
      return;
    }
  } catch {}

  // v2.1: Filter updates + Rebind-Tracking + Comments-Diff
  const updateCommentsMode = updateCommentsEl.checked;
  const preview = [];
  let rebindCount = 0;
  let commentsChangedCount = 0;
  for (const u of updates) {
    // v2.1 Skip-Fetch: rows die User nicht editiert hat → kein Fetch → automatisch unchanged
    if (!u.userEdited) {
      u.status = 'unchanged (skip-fetch)';
      skipped++;
      continue;
    }
    const r = fetchResult[u.articleId];
    const oldStr = r?.price;
    if (oldStr == null) { u.status = 'not found'; preview.push(u); continue; }
    if (r.rebindTo) {
      u.rebindTo = r.rebindTo;
      rebindCount++;
    }
    u.oldPrice = parseFormPrice(oldStr);
    u.oldComments = r.comments ?? null;
    // v2.2.5: pipe variant flags + editAmount from fetched state to update-object
    // Used by directUpdate to preserve isFoil/isSigned/isAltered/isFirstEd/isPlayset on bulk-update.
    // isReverseHolo: CSV value takes priority (user might have toggled in CSV); fallback to fetch.
    u._fetchedFlags = r.flags || null;
    u._fetchedAmount = r.editAmount ?? null;

    // v2.1: Delete-Flag — wenn delete=Y, alles andere ignorieren, status=delete
    if (u.wantsDelete) {
      u.status = u.rebindTo ? 'DELETE (rebound)' : 'DELETE';
      preview.push(u);
      continue;
    }

    const diff = u.newPrice - u.oldPrice;
    const pct = u.oldPrice > 0 ? Math.abs(diff / u.oldPrice) * 100 : 999;
    const priceChanged = Math.abs(diff) >= 0.005;
    // v2.1: Comments-Update — wenn Toggle an UND Wert abweicht, schreiben (auch wenn leer = clearen).
    // User-Anforderung: leere CSV-Zelle soll Comment auf CM löschen (war vorher Sicherheits-Default = ignoriert).
    const newC = (u.newComments || '').trim();
    const oldC = (u.oldComments || '').trim();
    const commentsChanged = updateCommentsMode && newC !== oldC;
    if (commentsChanged) { u.applyComments = true; commentsChangedCount++; }

    if (!priceChanged && !commentsChanged) {
      u.status = u.rebindTo ? 'unchanged (rebound)' : 'unchanged';
      skipped++;
      continue;
    }
    if (priceChanged && pct > maxPct) {
      u.status = `cap ${pct.toFixed(0)}%`;
      preview.push(u);
      continue;
    }
    // Status-String reflects what changes
    const changeTags = [];
    if (priceChanged) changeTags.push('price');
    if (commentsChanged) changeTags.push('comments');
    u.status = (u.rebindTo ? 'ok (rebound) ' : 'ok ') + changeTags.join('+');
    preview.push(u);
  }

  ulog(tl(`${preview.length} Änderungen vorgemerkt, ${skipped} unverändert übersprungen`, `${preview.length} changes queued, ${skipped} unchanged skipped`), 'ok');
  if (rebindCount > 0) ulog(tl(`✓ ${rebindCount} idArticles per idProduct-Match auto-rebound (CSV war veraltet)`, `✓ ${rebindCount} idArticles auto-rebound via idProduct match (CSV was stale)`), 'ok');
  if (updateCommentsMode) {
    ulog(tl(`✏ Comments-Update aktiv: ${commentsChangedCount} Artikel haben abweichende Comments`, `✏ Comment update active: ${commentsChangedCount} articles have differing comments`), 'ok');
    // v2.1: Sicherheits-Warnung wenn Comments gelöscht werden würden (leere CSV-Zelle, alter CM-Wert nicht leer)
    const wouldClear = preview.filter(u => {
      if (!u.applyComments) return false;
      const newC = (u.newComments || '').trim();
      const oldC = (u.oldComments || '').trim();
      return newC === '' && oldC !== '';
    }).length;
    if (wouldClear > 0) {
      ulog(tl(`⚠ ${wouldClear} Comments werden GELÖSCHT (CSV-Zelle leer, Cardmarket hatte Text). Falls ungewollt: CSV prüfen, leere Zellen mit Original-Text füllen.`, `⚠ ${wouldClear} comments will be DELETED (CSV cell empty, Cardmarket had text). If unintended: check the CSV, fill empty cells with the original text.`), 'err');
    }
  } else {
    const wouldChange = updates.filter(u => {
      const newC = (u.newComments || '').trim();
      const oldC = (fetchResult[u.articleId]?.comments || '').trim();
      return newC !== oldC;
    }).length;
    if (wouldChange > 0) ulog(tl(`ℹ ${wouldChange} Artikel hätten Comments-Änderungen (Toggle "Comments mit-updaten" aktivieren um anzuwenden)`, `ℹ ${wouldChange} articles would have comment changes (enable the "Update comments too" toggle to apply)`), 'ok');
  }

  // v2.1: Sanity-Check — wenn >5% nicht gefunden trotz Rebind-Versuch → User warnen
  const notFoundFinal = preview.filter(p => p.status === 'not found');
  if (notFoundFinal.length > 0 && updates.length > 0) {
    const pctNotFound = (notFoundFinal.length / updates.length * 100);
    if (pctNotFound > 5) {
      const warn = tl(`⚠ ${notFoundFinal.length} von ${updates.length} ArticleIDs (${pctNotFound.toFixed(0)}%) auch nach Rebind-Versuch nicht gefunden. Wahrscheinlich: CSV-Export ist veraltet, Listings wurden verkauft/gelöscht, oder idProduct-Spalte fehlt. Empfehlung: frisch exportieren.`, `⚠ ${notFoundFinal.length} of ${updates.length} ArticleIDs (${pctNotFound.toFixed(0)}%) still not found even after the rebind attempt. Likely: the CSV export is stale, listings were sold/deleted, or the idProduct column is missing. Recommendation: export fresh.`);
      ulog(warn, 'err');
    }
  }

  // v2.2.3: surface modal-null diagnostic samples (collected during fetch when form-detection failed)
  if (modalNullSamples && modalNullSamples.length > 0) {
    ulog(tl(`🔬 v2.2.3 Diagnostic: ${modalNullSamples.length} Modal-Form Detection-Failure(s) (Sample HTML log to console):`, `🔬 v2.2.3 diagnostic: ${modalNullSamples.length} modal-form detection failure(s) (sample HTML logged to console):`), 'err');
    for (const s of modalNullSamples) {
      ulog(`   articleId=${s.articleId} hasForm=${s.hasForm} formIds=[${(s.formIds || []).join(', ')}] inputs=[${(s.inputNames || []).slice(0, 8).join(', ')}]`, 'err');
    }
    ulog(tl(`   → Vollständige HTML-Samples in Browser-Console (F12 auf CM-Tab) — bitte einen Sample posten für v2.2.4-fix.`, `   → Full HTML samples in the browser console (F12 on the CM tab) — please post one sample for a v2.2.4 fix.`), 'err');
  }

  // v2.2.2: Per-Expansion status-breakdown — surfaces patterns like "Ergänzungen alle not-found"
  const expStats = {};
  for (const u of [...preview, ...updates.filter(uu => uu.status === 'unchanged (skip-fetch)')]) {
    if (!u._expansion) {
      const r = rows.find(rr => rr.ArticleID?.trim() === u.articleId);
      u._expansion = r?.Expansion || '(unbekannt)';
    }
    const exp = u._expansion;
    const bucket = (u.status || '').startsWith('ok') ? 'ok'
                : (u.status === 'not found') ? 'not_found'
                : (u.status || '').startsWith('cap') ? 'capped'
                : (u.status || '').startsWith('DELETE') ? 'delete'
                : (u.status || '').startsWith('unchanged') ? 'unchanged'
                : 'other';
    if (!expStats[exp]) expStats[exp] = { ok: 0, not_found: 0, capped: 0, delete: 0, unchanged: 0, other: 0 };
    expStats[exp][bucket]++;
  }
  // Surface only expansions with >0 not_found OR all-not_found patterns
  const flaggedExps = Object.entries(expStats)
    .filter(([_, s]) => s.not_found > 0)
    .sort((a, b) => b[1].not_found - a[1].not_found);
  if (flaggedExps.length > 0) {
    ulog(tl(`📊 Per-Set Status-Breakdown (Sets mit not-found rows):`, `📊 Per-set status breakdown (sets with not-found rows):`), 'err');
    for (const [exp, s] of flaggedExps.slice(0, 15)) {
      const total = s.ok + s.not_found + s.capped + s.delete + s.unchanged + s.other;
      const allNotFound = s.not_found === total;
      const badge = allNotFound ? ' ⚠ ALLE rows not-found' : '';
      ulog(`   • ${exp}: ${s.ok} ok, ${s.not_found} not-found, ${s.unchanged} unchanged, ${s.capped} capped${badge}`, 'err');
    }
    // If a whole expansion has 100% not-found AND name contains "Erg" (Ergänzungen) or starts with x — log diagnostic
    const extPatterns = flaggedExps.filter(([exp, s]) => {
      const total = s.ok + s.not_found + s.capped + s.delete + s.unchanged + s.other;
      return s.not_found === total && /erg[äa]nzung|ergänz|extension/i.test(exp);
    });
    if (extPatterns.length > 0) {
      ulog(tl(`🔍 Diagnostic: ${extPatterns.length} Erweiterungs-Set(s) komplett not-found. Sample articleIDs zur DevTools-Trace:`, `🔍 Diagnostic: ${extPatterns.length} expansion set(s) completely not-found. Sample articleIDs for DevTools trace:`), 'err');
      const sampleNotFound = notFoundFinal.filter(u => extPatterns.some(([exp, _]) => u._expansion === exp)).slice(0, 3);
      for (const u of sampleNotFound) {
        ulog(`   articleId=${u.articleId} idProduct=${u.idProduct || '(leer)'} lang="${u.language}" cond="${u.condition}" exp="${u._expansion}"`, 'err');
      }
      ulog(tl(`   → Bitte einen dieser articleIds auf Cardmarket öffnen, edit-pencil klicken, in DevTools Network-Tab schauen welche URL die Modal-Form lädt. Schick die URL für v2.2.3-fix.`, `   → Please open one of these articleIds on Cardmarket, click the edit pencil, and check the DevTools Network tab for which URL loads the modal form. Send the URL for a v2.2.3 fix.`), 'err');
    }
  }

  // Render preview
  // v2.1: ok-Status oder DELETE → wird in Apply-Phase verarbeitet
  const isOkStatus = (s) => typeof s === 'string' && (s.startsWith('ok') || s.startsWith('DELETE'));
  const okUpdates = preview.filter(p => isOkStatus(p.status));
  const capped = preview.filter(p => p.status?.startsWith('cap'));
  const deleteUpdates = preview.filter(p => p.status?.startsWith('DELETE'));

  // v2.1: Comments-Diff in HTML escapen + truncaten für preview
  const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const truncMid = (s, n = 30) => s.length <= n ? s : s.slice(0, n - 3) + '...';

  let html = '<div class="diffTable"><table>';
  html += '<tr><td><b>Name</b></td><td><b>Alt</b></td><td><b>Neu</b></td><td><b>Δ / Status</b></td></tr>';
  for (const u of preview.slice(0, 50)) {
    const ok = isOkStatus(u.status);
    const cls = ok ? (u.newPrice > u.oldPrice ? 'diffUp' : 'diffDown') : 'diffSame';
    const old = u.oldPrice != null ? fmtPrice(u.oldPrice) : '?';
    const delta = u.oldPrice != null ? (u.newPrice - u.oldPrice).toFixed(2).replace('.', ',') : '?';
    const rebindBadge = u.rebindTo ? ` <span style="color:#888;font-size:0.85em">↻${u.rebindTo}</span>` : '';
    html += `<tr><td>${escHtml(u.name.slice(0, 40))}${rebindBadge}</td><td>${old}</td><td class="${cls}">${fmtPrice(u.newPrice)}</td><td class="${cls}">${delta} [${escHtml(u.status)}]</td></tr>`;
    // Comments-Diff-Zeile (nur bei applyComments)
    if (u.applyComments) {
      const oldC = truncMid(u.oldComments || '(leer)', 36);
      const newC = truncMid(u.newComments || '(leer)', 36);
      html += `<tr><td colspan="4" style="font-size:9px;color:#888;border-bottom:1px solid #222">↳ Comments: <span class="diffSame" title="${escHtml(u.oldComments)}">${escHtml(oldC)}</span> → <span class="diffUp" title="${escHtml(u.newComments)}">${escHtml(newC)}</span></td></tr>`;
    }
  }
  if (preview.length > 50) html += `<tr><td colspan="4">... +${preview.length - 50} weitere</td></tr>`;
  html += '</table></div>';

  if (deleteUpdates.length > 0) {
    html = `<div class="warn" style="background:#7f1d1d;color:#fecaca">🗑 ${deleteUpdates.length} Listings werden GELÖSCHT (delete=Y in CSV). NICHT rückgängig machbar!</div>` + html;
  }
  if (rebindCount > 0) {
    html = `<div class="warn" style="background:#e8f5e9;color:#2e7d32">↻ ${rebindCount} Artikel auto-rebound (idArticle änderte sich seit Export, neue ID via idProduct-Match gefunden)</div>` + html;
  }
  if (capped.length > 0) {
    html = `<div class="warn">⚠ ${capped.length} Artikel übersteigen Max-Änderung (${maxPct}%) — werden übersprungen. Cap erhöhen falls gewollt.</div>` + html;
  }
  if (notFoundFinal.length > 0) {
    html = `<div class="warn">⚠ ${notFoundFinal.length} ArticleIDs nicht gefunden auf Cardmarket (verkauft/gelöscht/idProduct fehlt)</div>` + html;
  }
  updatePreviewEl.innerHTML = html;

  parsedUpdates = okUpdates;
  // v2.1: Pre-fetch set-filter wurde bereits VOR fetch gezeigt + applied. Hier nur _expansion-mapping
  // für aktuelle ok-updates (falls live-toggle nach fetch noch erlaubt).
  for (const u of okUpdates) {
    if (!u._expansion) {
      const r = rows.find(rr => rr.ArticleID?.trim() === u.articleId);
      u._expansion = r?.Expansion || '(unbekannt)';
    }
  }
  updateCountEl.textContent = okUpdates.length;
  btnUpdate.textContent = t('btn_confirm_update', [okUpdates.length]);
  if (okUpdates.length > 0) {
    btnUpdate.style.display = 'block';
  } else {
    // v2.1: explizite UX wenn nichts zu updaten — sonst denkt User Tool sei kaputt
    btnUpdate.style.display = 'none';
    const reasons = [];
    if (skipped > 0) reasons.push(`${skipped} unverändert (Werte in CSV identisch zu Cardmarket)`);
    if (notFoundFinal.length > 0) reasons.push(`${notFoundFinal.length} nicht gefunden`);
    if (capped.length > 0) reasons.push(`${capped.length} über Max-Änderung-% Cap`);
    const reasonStr = reasons.length ? ` (${reasons.join(', ')})` : '';
    ulog(tl(`ℹ Keine Änderungen zu schreiben${reasonStr}. Bearbeite Price_EUR oder Comments in CSV und re-analysiere.`, `ℹ No changes to write${reasonStr}. Edit Price_EUR or Comments in the CSV and re-analyze.`), 'err');
    // Preview-Banner ergänzen wenn nicht schon einer da
    if (!updatePreviewEl.querySelector('.warn')) {
      updatePreviewEl.innerHTML = `<div class="warn" style="background:#1e3a8a;color:#bfdbfe">ℹ Keine Änderungen zu schreiben${reasonStr}.<br><br>Bearbeite die <code>Price_EUR</code>- oder <code>Comments</code>-Spalte in deiner CSV (in Excel oder Texteditor), speichere, und klicke nochmal "CSV analysieren + Preview".</div>` + (updatePreviewEl.innerHTML || '');
    }
  }
 } catch (topErr) {
  // v2.1: Defensive Top-Level — sonst würde Promise-Rejection silent sein und User sähe nur "hängt"
  console.error('[CM-Bulk] btnAnalyze top-level error:', topErr);
  ulog(tl('❌ Analyse fehlgeschlagen: ', '❌ Analysis failed: ') + (topErr?.message || String(topErr)), 'err');
  ulog('Stack-Snippet: ' + ((topErr?.stack || '').slice(0, 300)), 'err');
  ulog(tl('Bitte F12 Console-Tab prüfen für Details. Cardmarket-Tab refreshen + retry.', 'Check the F12 Console tab for details. Refresh the Cardmarket tab + retry.'), 'err');
 }
});

btnAbortUpdate.addEventListener('click', async () => {
  try {
    const tab = await getTargetTab();
    if (!tab) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => { window.__cmUpdateStop = true; },
    });
    ulog(tl('Abbruch angefordert', 'Abort requested'), 'err');
  } catch (e) { ulog(tl('Abort-Fehler: ', 'Abort error: ') + e.message, 'err'); }
});

// v2.1: Set-Filter helpers
function getSelectedSets() {
  const list = document.getElementById('setFilterList');
  if (!list) return null;
  return new Set([...list.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.getAttribute('data-set')));
}
function updateBulkCountFromSetFilter() {
  const selectedSets = getSelectedSets();
  if (!selectedSets) return;
  const filtered = parsedUpdates.filter(u => selectedSets.has(u._expansion || '(unbekannt)'));
  updateCountEl.textContent = filtered.length;
  btnUpdate.textContent = t('btn_confirm_update', [filtered.length]);
  btnUpdate.style.display = filtered.length > 0 ? 'block' : 'none';
}
document.getElementById('setFilterAll')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelectorAll('#setFilterList input[type="checkbox"]').forEach(cb => cb.checked = true);
  updateBulkCountFromSetFilter();
});
document.getElementById('setFilterNone')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.querySelectorAll('#setFilterList input[type="checkbox"]').forEach(cb => cb.checked = false);
  updateBulkCountFromSetFilter();
});

btnUpdate.addEventListener('click', async () => {
  if (parsedUpdates.length === 0) return;
  // v2.1: Set-Filter — nur ausgewählte sets
  const selectedSets = getSelectedSets();
  const filteredUpdates = selectedSets
    ? parsedUpdates.filter(u => selectedSets.has(u._expansion || '(unbekannt)'))
    : parsedUpdates;
  if (filteredUpdates.length === 0) {
    ulog(tl('Keine Sets ausgewählt. Mindestens 1 set anhaken vor update.', 'No sets selected. Tick at least 1 set before updating.'), 'err');
    return;
  }
  const isDry = dryRunEl.checked;
  const verify = verifyAfterEl.checked;
  const fastMode = fastModeEl.checked;
  const delay = parseInt(updateDelayEl.value, 10) || 250;

  if (!isDry) {
    const setCount = selectedSets ? selectedSets.size : 'alle';
    const confirm1 = window.confirm(`⚠ ACHTUNG: ${filteredUpdates.length} Preise werden LIVE geändert auf Cardmarket (${setCount} Sets gefiltert).\n\nNICHT rückgängig machbar ohne erneutes Update.\n\nFortfahren?`);
    if (!confirm1) return;
  }

  btnUpdate.disabled = true;
  btnAnalyze.disabled = true;
  btnAbortUpdate.style.display = 'block';
  updateProgressEl.style.display = 'block';
  ulog(`Start ${isDry ? 'DRY-RUN' : 'LIVE UPDATE'}...`, 'ok');

  const tab = await getTargetTab();
  if (!tab) {
    ulog(tl('Kein Cardmarket-Tab offen. Öffne deine Stock-Seite (www.cardmarket.com/…/Stock/Offers/Singles) und klicke die Extension dort.',
            'No Cardmarket tab open. Open your stock page (www.cardmarket.com/…/Stock/Offers/Singles) and click the extension there.'), 'err');
    btnUpdate.disabled = false; btnAnalyze.disabled = false; btnAbortUpdate.style.display = 'none';
    return;
  }
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: () => { window.__cmUpdateStop = false; window.__cmUpdateProgress = null; window.__cmUpdateResult = null; },
  });

  // Poll progress
  const pollTimer = setInterval(async () => {
    try {
      const [{ result: p }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: 'MAIN',
        func: () => window.__cmUpdateProgress,
      });
      if (p) {
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
        updateProgFillEl.style.width = pct + '%';
        const stepInfo = p.step ? ` | step: ${p.step}` : '';
        const idInfo = p.currentArticleId ? ` | id: ${p.currentArticleId}` : '';
        updateProgTextEl.textContent = `${p.phase}: ${p.done}/${p.total} (${pct}%) | OK: ${p.ok || 0} | Err: ${p.err || 0}${idInfo}${stepInfo}`;
      }
    } catch {}
  }, 600);

  try {
    const scriptResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [{ updates: filteredUpdates, dryRun: isDry, delay, verify, fastMode }],
      func: runBulkUpdate,
    });
    clearInterval(pollTimer);
    let result = scriptResult?.[0]?.result;
    if (!result) {
      // Try recover from window var (script context may have been destroyed)
      ulog(tl('Script result null - probiere Recovery via window.__cmUpdateResult...', 'Script result null - trying recovery via window.__cmUpdateResult...'), 'err');
      try {
        const [{ result: recovered }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: () => window.__cmUpdateResult || null,
        });
        if (recovered) {
          result = recovered;
          ulog(tl('Recovery erfolgreich', 'Recovery successful'), 'ok');
        }
      } catch (e) {
        ulog(tl('Recovery-Fehler: ', 'Recovery error: ') + e.message, 'err');
      }
      if (!result) {
        ulog(tl('Kein Result. Tab evtl. navigiert weg. Cardmarket-Tab refreshen + retry.', 'No result. The tab may have navigated away. Refresh the Cardmarket tab + retry.'), 'err');
        return;
      }
    }

    updateProgFillEl.style.width = '100%';
    ulog(tl(`${isDry ? 'DRY-RUN' : 'UPDATE'} fertig: ${result.ok || 0} OK, ${result.err || 0} Fehler`, `${isDry ? 'DRY-RUN' : 'UPDATE'} done: ${result.ok || 0} OK, ${result.err || 0} errors`), 'ok');
    // v2.3.0: Fast-Mode-Rueckfaelle ausweisen. Diese Zeilen wurden korrekt aktualisiert, aber
    // ueber den langsamen Modal-Flow — und der Grund ist oft ein Hinweis auf die CSV
    // (z.B. leere Sprach- oder Zustandsspalte aus einem alten Export).
    const fallbacks = result.directFallbacks || [];
    if (fallbacks.length) {
      ulog(tl(
        `ℹ ${fallbacks.length} Zeile(n) liefen nicht über Fast Mode, sondern über den sicheren Modal-Flow:`,
        `ℹ ${fallbacks.length} row(s) did not use Fast Mode and went through the safe modal flow instead:`
      ));
      const reasons = {};
      fallbacks.forEach(f => { reasons[f.msg] = (reasons[f.msg] || 0) + 1; });
      Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .forEach(([msg, n]) => ulog(`   • ${n}× ${msg}`));
    }
    if (result.errors?.length) {
      ulog(tl('Fehler-Details:', 'Error details:'), 'err');
      result.errors.slice(0, 20).forEach(e => ulog(`  ${e.articleId}: ${e.msg}`, 'err'));
    }
  } catch (e) {
    ulog('Exception: ' + e.message, 'err');
  } finally {
    clearInterval(pollTimer);
    btnUpdate.disabled = false;
    btnAnalyze.disabled = false;
    btnAbortUpdate.style.display = 'none';
  }
});

// ========= Injected into tab =========
// Strategy: use Cardmarket's NATIVE Bootstrap-modal flow.
// Create a trigger <a data-bs-toggle="modal" data-modal="..."> -> click ->
// Bootstrap loads modal into #modal -> Cardmarket attaches handlers ->
// modify price -> click submit -> Cardmarket's jcp() fires correctly.
async function runBulkUpdate(args) {
 try {
  const { updates, dryRun, delay, verify, fastMode } = args || {};
  if (!Array.isArray(updates)) return { ok: 0, err: 0, errors: [{ articleId: '?', msg: 'no updates passed' }], aborted: false };
  let ok = 0, err = 0;
  const errors = [];
  // v2.3.0: Zeilen, bei denen Fast Mode auf den Modal-Flow zurueckgefallen ist (inkl. Grund).
  const directFallbacks = [];
  const total = updates.length;
  const pathParts = location.pathname.split('/').filter(Boolean);
  const lang = pathParts[0] || 'de';
  const game = pathParts[1] || 'Pokemon';

  // v2.2.8: the __cmtkn CSRF token used to sit in a page-level <input>. On
  // Cardmarket's newer stock markup it moved into each edit modal, so the page
  // DOM no longer has it (confirmed in issue #1: cmtknInputs=0 on the new page).
  // Read the page first; if it's absent, fetch ONE edit modal, cache the token,
  // and reuse it for the whole run → Fast Mode works on old AND new markup.
  let cachedCmtkn = document.querySelector('input[name="__cmtkn"]')?.value
    || (typeof window.__cmtkn === 'string' ? window.__cmtkn : '') || '';
  async function resolveCmtkn(sampleId) {
    if (cachedCmtkn) return cachedCmtkn;
    try {
      const res = await fetch(`/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${sampleId}`, { credentials: 'include' });
      if (res.ok) {
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        cachedCmtkn = doc.querySelector('input[name="__cmtkn"]')?.value || '';
      }
    } catch { /* leave empty → directUpdate throws a clear error */ }
    return cachedCmtkn;
  }

  // v2.1: Direct-Mode (verifiziert via DevTools-Trace LUPZN 2026-05-01)
  // Endpoint: POST /{lang}/{game}/AjaxAction/Article_EditSingleArticle
  // Felder: __cmtkn, idArticle, condition (string!), idLanguage (numeric), comments, price (dot), editAmount
  // Vorteil: keine Modal-Fetch, keine Modal-Render, 1 POST pro article = max speed + min CF-load
  // v2.2.13: Die Stock-Seite fuehrt selbst ein idLanguage-Dropdown, das Name und ID in der
  // AKTUELLEN Oberflaechensprache liefert. Das daraus gebaute Verzeichnis ist der Wahrheitswert:
  // es deckt automatisch alle Locales (auch fr/es/it) und kuenftige Sprachen ab, waehrend die
  // handgepflegte Tabelle unten nur DE/EN kennt und damit auf /fr/, /es/ und /it/ nichts findet.
  // Kostet keinen zusaetzlichen Abruf — die Seite liegt bereits im DOM.
  const pageLangNameToId = (() => {
    const map = {};
    try {
      document.querySelectorAll('select[name="idLanguage"] option').forEach(o => {
        const v = (o.value || '').trim();
        const n = (o.textContent || '').trim();
        if (v && /^\d+$/.test(v) && v !== '0' && n) map[n] = v;
      });
    } catch (e) { /* kein Dropdown auf dieser Seite → Tabelle unten uebernimmt */ }
    return map;
  })();

  const STOCK_LANG_NAME_TO_ID = {
    'Englisch': '1', 'English': '1',
    'Französisch': '2', 'French': '2',
    'Deutsch': '3', 'German': '3',
    'Spanisch': '4', 'Spanish': '4',
    'Italienisch': '5', 'Italian': '5',
    // v2.2.13: LANG_RE akzeptiert auch 'Chinesisch' und 'Simplified Chinese' — ohne diese
    // Schluessel erzeugt der Export einen Wert, den das Update nicht aufloesen kann.
    'S-Chinesisch': '6', 'Chinese': '6', 'Chinesisch': '6', 'Simplified Chinese': '6',
    'Japanisch': '7', 'Japanese': '7',
    'Portugiesisch': '8', 'Portuguese': '8',
    'Russisch': '9', 'Russian': '9',
    'Koreanisch': '10', 'Korean': '10',
    'T-Chinesisch': '11', 'Traditional Chinese': '11',
    // v2.2.13: Sprachen 12-17 fehlten hier komplett. Ohne Eintrag fiel der Lookup unten auf
    // '3' (Deutsch) zurueck und hat die Sprache der Karte beim Bulk-Update ueberschrieben.
    'Holländisch': '12', 'Niederländisch': '12', 'Dutch': '12',
    'Polnisch': '13', 'Polish': '13',
    'Tschechisch': '14', 'Czech': '14',
    'Ungarisch': '15', 'Hungarian': '15',
    'Indonesisch': '16', 'Indonesian': '16',
    'Thailändisch': '17', 'Thai': '17',
  };
  async function directUpdate(u) {
    const targetId = u.rebindTo || u.articleId;
    const tkn = await resolveCmtkn(targetId);
    if (!tkn) throw new Error('direct: __cmtkn not found on page or in edit modal — reload your Cardmarket stock page and retry');
    const fd = new FormData();
    fd.append('__cmtkn', tkn);
    fd.append('idArticle', targetId);
    // v2.2.13: Weder raten noch weglassen.
    // Dieser Endpoint ist ein VOLL-Update des Artikels: weggelassene Felder werden von Cardmarket
    // verworfen, nicht bewahrt — belegt durch v2.2.4/2.2.5 weiter unten, wo genau deshalb die
    // Varianten-Flags nachgeruestet werden mussten. Ein fehlendes idLanguage waere also nicht
    // "sicher", sondern koennte die Sprache leeren oder das ganze Update verwerfen (unbemerkt,
    // weil unten nur res.ok geprueft wird). Umgekehrt war der alte Default '3' echter Datenverlust:
    // jede nicht erkannte Sprache wurde still auf Deutsch gesetzt.
    // Loesung: aufloesen — und wenn das nicht geht, den Fast-Mode fuer DIESE Zeile verweigern.
    // Der throw landet im catch des Aufrufers und faellt auf den Modal-Flow zurueck. Der oeffnet
    // Cardmarkets eigenes Edit-Formular, das bereits mit den echten Werten des Artikels gefuellt
    // ist, aendert nur den Preis (und optional die Comments) und laesst Sprache wie Zustand
    // unberuehrt. Die Zeile wird also trotzdem korrekt aktualisiert, nur langsamer und sicher.
    const rawLang = String(u.language ?? '').trim();
    const langId = pageLangNameToId[rawLang] || STOCK_LANG_NAME_TO_ID[rawLang] || (/^\d+$/.test(rawLang) ? rawLang : '');
    if (!langId) {
      throw new Error(`Sprache nicht aufloesbar ("${rawLang || 'leer'}") — Fast Mode uebersprungen, Modal-Flow uebernimmt (schreibt die Sprache nicht um)`);
    }
    // Condition: string value direkt aus CSV (NM/EX/LP/...)
    // v2.2.13: ebenfalls kein stiller Default mehr. 'NM' zu raten hat aus einer Played-Karte
    // still eine Near-Mint-Karte gemacht, sobald die Condition-Spalte leer war.
    const condVal = String(u.condition ?? '').trim();
    if (!condVal) {
      throw new Error('Zustand fehlt in der CSV — Fast Mode uebersprungen, Modal-Flow uebernimmt (setzt den Zustand nicht auf NM)');
    }
    fd.append('condition', condVal);
    fd.append('idLanguage', langId);
    // Comments
    // v2.3.0: Ist "Comments mit-updaten" AUS, darf der CSV-Wert NICHT geschrieben werden. Das Popup
    // sagt dem Nutzer ausdruecklich, dass seine Comment-Aenderungen dann ignoriert werden — bisher
    // wurden sie trotzdem gesendet. Aus ist jetzt wirklich aus: es geht der frisch von Cardmarket
    // gelesene Stand zurueck, nicht der (womoeglich editierte) aus der Tabelle.
    // Ist der Toggle AUS, muss der Bestandswert zurueckgeschrieben werden. Konnte der gar nicht
    // gelesen werden (Modal-Parser hat das Feld nicht gefunden), waere ein leeres comments-Feld
    // gleichbedeutend mit "Kommentar loeschen" — dann lieber der Modal-Flow.
    if (!u.applyComments && u.oldComments == null) {
      throw new Error('Bisheriger Kommentar nicht lesbar — Fast Mode uebersprungen, Modal-Flow uebernimmt (loescht den Kommentar nicht)');
    }
    fd.append('comments', u.applyComments ? (u.newComments || '') : u.oldComments);
    // Price: dot-decimal
    fd.append('price', u.newPrice.toFixed(2));
    // editAmount — das ist die BESTANDSMENGE des Artikels.
    // v2.3.0: kein Raten mehr. Vorher wurde der Wert aus der (womoeglich Tage alten) CSV
    // genommen und notfalls auf 1 gesetzt — das konnte den Bestand einer Karte stillschweigend
    // auf 1 zusammenstreichen. Jetzt zaehlt der frisch von Cardmarket gelesene Wert; fehlt auch
    // der, uebernimmt der Modal-Flow (der die Menge gar nicht anfasst).
    // Die CSV ist hier bewusst KEINE Quelle: beim Einlesen wird Amount auf 1 defaultet
    // (parseInt(r.Amount || '1') || 1), ein fehlender Wert kaeme also als "1" an und wuerde den
    // Bestand zusammenstreichen. Es zaehlt nur der frisch von Cardmarket gelesene Wert.
    const amountVal = String(u._fetchedAmount ?? '').trim();
    if (!amountVal || !/^\d+$/.test(amountVal)) {
      throw new Error('Bestandsmenge unbekannt — Fast Mode uebersprungen, Modal-Flow uebernimmt (aendert die Menge nicht)');
    }
    fd.append('editAmount', amountVal);
    // v2.2.4/2.2.5: variant flags MUST be passed — otherwise CM strips them (or rejects update)
    // Reported by LUPZN: reverse-holo cards were silently skipped/dropped during bulk-update.
    // Strategy: CSV value (u.reverseHolo) priority for isReverseHolo (user can toggle in CSV).
    // Other flags (foil/signed/altered/firstEd/playset) pulled from CM-fetched state (CSV doesn't have them).
    const flags = u._fetchedFlags || {};
    fd.append('isReverseHolo', u.reverseHolo ? '1' : '0');
    // v2.3.0: alle vom Formular gelesenen Varianten zurueckschreiben, nicht nur die frueher fest
    // aufgezaehlten. isReverseHolo bleibt ausgenommen, weil der Nutzer es in der CSV umschalten darf.
    Object.keys(flags).forEach(n => {
      if (n === 'isReverseHolo' || flags[n] == null) return;
      fd.append(n, flags[n] ? '1' : '0');
    });
    const res = await fetch(`/${lang}/${game}/AjaxAction/Article_EditSingleArticle`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) throw new Error(`direct: HTTP ${res.status}`);

    // v2.3.0: HTTP 200 war bisher der einzige Erfolgsbeweis. Cardmarkets AjaxAction-Endpoints
    // liefern Validierungsfehler aber typischerweise MIT Status 200 im Body. Eine Zeile, deren
    // Preis nie geschrieben wurde, galt damit als erfolgreich aktualisiert.
    // Zwei Stufen, beide konservativ:
    //  1. Body auf eindeutige Fehlersignale pruefen. Ein Fehlalarm ist unschaedlich — der throw
    //     landet im Modal-Flow, der die Zeile korrekt aktualisiert, nur langsamer.
    //  2. Ist "Nach Update verifizieren" aktiv, den Preis wirklich zurueckzulesen. Das galt
    //     bisher nur fuer den Modal-Flow; im Fast Mode wurde die Option stillschweigend ignoriert.
    // WICHTIG: den VOLLEN Body parsen. Frueher wurde vor dem Parsen auf 4000 Zeichen gekuerzt —
    // eine Fehlerantwort enthaelt aber typischerweise das neu gerenderte Formularfragment und ist
    // damit gerade die groesste Antwort. JSON.parse scheiterte, der catch verschluckte es, und der
    // Fehlschlag galt als Erfolg: exakt der Fall, den diese Pruefung verhindern soll.
    let bodyTxt = '';
    try { bodyTxt = (await res.text()) || ''; } catch (e) { /* Body egal */ }
    const trimmed = bodyTxt.trim();
    if (trimmed) {
      let failed = false;
      let parsed = null;
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { parsed = JSON.parse(trimmed); } catch (e) { parsed = null; }
      }
      if (parsed) {
        // Bei Arrays ALLE Elemente pruefen, nicht nur das erste.
        const nodes = Array.isArray(parsed) ? parsed : [parsed];
        failed = nodes.some(o => o && (
          o.success === false || o.ok === false
          || (typeof o.error === 'string' && o.error.length > 0)
          || (Array.isArray(o.errors) && o.errors.length > 0)
        ));
      } else {
        // Kein (parsebares) JSON → Markup-Marker. `invalid-feedback` ist bewusst NICHT dabei:
        // das ist Bootstrap-Grundgeruest und in jedem Formular vorhanden, auch im Erfolgsfall.
        // Nur `is-invalid`/`has-error` werden tatsaechlich erst im Fehlerfall gesetzt.
        failed = /\bis-invalid\b|\bhas-error\b/i.test(trimmed);
      }
      if (failed) throw new Error('direct: Cardmarket meldet einen Fehler im Antwort-Body (HTTP 200)');
    }

    // Ab hier ist der POST abgesetzt und von Cardmarket nicht beanstandet worden. Wirft die
    // Verifikation unten trotzdem, darf der Aufrufer die Zeile NICHT ueber den Modal-Flow
    // erneut schreiben — sonst wird derselbe Preis zweimal gesetzt. Der Marker unterscheidet
    // "gar nicht geschrieben" von "geschrieben, aber nicht bestaetigt".
    if (verify) {
      const afterPost = (msg) => { const e = new Error(msg); e.afterPost = true; return e; };
      // Ab hier ist der POST durch: JEDER Fehler muss als afterPost gelten, auch ein 429 oder
      // Netzabbruch beim Nachladen. Sonst gilt die Zeile als "nie geschrieben" und der
      // Modal-Flow setzt denselben Preis ein zweites Mal.
      let verifyHtml;
      try { verifyHtml = await fetchModal(targetId); }
      catch (ve) { throw afterPost('direct: Verifikation nicht ladbar (' + ve.message + ')'); }
      const actualPrice = parseCurrentPrice(verifyHtml);
      if (actualPrice == null) throw afterPost('direct: Preis nach dem Update nicht lesbar');
      if (Math.abs(actualPrice - u.newPrice) > 0.005) {
        throw afterPost(`direct: Verifikation fehlgeschlagen — Cardmarket zeigt ${actualPrice}, erwartet ${u.newPrice}`);
      }
    }
    return true;
  }

  // v2.1: Fast-Mode — direct POST an Cardmarket-Edit-Endpoint, ohne Modal-Render
  // Fetch modal HTML, parse form (action + hidden inputs), build FormData mit neuen Werten, POST.
  // Auto-Fallback: bei 4xx/5xx error → return null, caller fällt zurück auf Modal-Flow.
  async function fastUpdate(targetId, newPrice, newComments, applyComments) {
    const url = `/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${targetId}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`fast: modal HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // v2.2.4: robust form-detection (same fallback as fetchArticleState in v2.2.3)
    let form = doc.querySelector('form[id^="Edit"]');
    if (!form) {
      const anyPriceInput = doc.querySelector('input[name="price"]');
      if (anyPriceInput) form = anyPriceInput.closest('form');
    }
    if (!form) throw new Error('fast: no edit form');
    const action = form.getAttribute('action') || '';
    if (!action) throw new Error('fast: form has no action');
    const fd = new FormData();
    // Alle hidden inputs + non-priced fields aus form übernehmen
    for (const inp of form.querySelectorAll('input, textarea, select')) {
      const name = inp.getAttribute('name');
      if (!name) continue;
      if (inp.type === 'checkbox' || inp.type === 'radio') {
        if (inp.checked) fd.append(name, inp.value || 'on');
        continue;
      }
      // Override price und comments unten
      if (name === 'price' || name === 'comments' || name === 'comment') continue;
      fd.append(name, inp.value || '');
    }
    fd.set('price', newPrice.toFixed(2));
    if (applyComments) {
      // Cardmarket might use 'comments' or 'comment' — set whichever the form has
      const commentsField = form.querySelector('textarea[name="comments"], textarea[name="comment"], input[name="comments"]');
      if (commentsField) {
        const fieldName = commentsField.getAttribute('name');
        fd.set(fieldName, newComments || '');
      }
    }
    // POST to action URL (relative to current page, resolve against location.origin)
    const actionUrl = action.startsWith('http') ? action : (action.startsWith('/') ? action : `/${lang}/${game}/${action}`);
    const postRes = await fetch(actionUrl, {
      method: 'POST',
      credentials: 'include',
      body: fd,
      headers: {
        'X-Requested-With': 'XMLHttpRequest', // wichtig für Cardmarket AJAX-Endpoint
      },
    });
    if (!postRes.ok) throw new Error(`fast: POST HTTP ${postRes.status}`);
    return true;
  }

  const modalContainer = document.getElementById('modal');
  if (!modalContainer && !fastMode) {
    return { ok: 0, err: 1, errors: [{ articleId: 'INIT', msg: '#modal element not found on page. Open a Cardmarket page (e.g. Stock/Offers) first.' }], aborted: false };
  }

  // Install fetch + XHR interceptor for diagnosis (only once per session)
  if (!window.__cmFetchWrapped) {
    window.__cmFetchWrapped = true;
    window.__cmFetchLog = [];
    const origFetch = window.fetch;
    window.fetch = function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const method = args[1]?.method || 'GET';
      return origFetch.apply(this, args).then(async res => {
        if (method === 'POST' || /AJAX|Action|Modal|Edit/.test(url || '')) {
          try {
            const cloned = res.clone();
            const text = await cloned.text();
            window.__cmFetchLog.push({ url, method, status: res.status, body: text.slice(0, 500), ts: Date.now() });
            if (window.__cmFetchLog.length > 50) window.__cmFetchLog.shift();
            console.log(`[CM-Fetch] ${method} ${url} → ${res.status}`, text.slice(0, 200));
          } catch {}
        }
        return res;
      });
    };
    // Also wrap XHR
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._cmMethod = method;
      this._cmUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function(body) {
      const xhr = this;
      xhr.addEventListener('load', function() {
        try {
          window.__cmFetchLog.push({ url: xhr._cmUrl, method: xhr._cmMethod, status: xhr.status, body: (xhr.responseText || '').slice(0, 500), ts: Date.now() });
          if (window.__cmFetchLog.length > 50) window.__cmFetchLog.shift();
          console.log(`[CM-XHR] ${xhr._cmMethod} ${xhr._cmUrl} → ${xhr.status}`, (xhr.responseText || '').slice(0, 200));
        } catch {}
      });
      return origSend.apply(this, arguments);
    };
  }
  window.__cmFetchLog = [];

  const fetchModal = async (id) => {
    const url = `/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${id}`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`modal HTTP ${res.status}`);
    return await res.text();
  };

  const parseCurrentPrice = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // v2.2.5: robust form-detection fallback for ext-articles + reverse-holo (consistent with fetchArticleState)
    let form = doc.querySelector('form[id^="Edit"]');
    let priceInput = form?.querySelector('input[name="price"]');
    if (!priceInput) {
      const anyPriceInput = doc.querySelector('input[name="price"]');
      if (anyPriceInput) priceInput = anyPriceInput;
    }
    if (!priceInput) return null;
    const v = priceInput.getAttribute('value') || priceInput.value || '';
    return parseFloat(v.replace(',', '.')) || null;
  };

  const setStep = (step, articleId) => {
    window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { step, currentArticleId: articleId, ts: Date.now() });
    console.log(`[CM-Update] [${articleId}] ${step}`);
  };

  // Helper: open Cardmarket edit modal natively, wait for shown.bs.modal, return form
  // v2.1: Längerer timeout (15s statt 6s) + 1 retry mit force-close für fehlgeschlagene modal-loads
  const openModalAndGetFormCore = async (articleId, timeoutMs) => {
    modalContainer.innerHTML = '';
    // v2.1: aggressive cleanup vor neuem trigger
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    modalContainer.classList.remove('show');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';

    const url = `/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${articleId}`;
    const trigger = document.createElement('a');
    trigger.href = '#';
    trigger.setAttribute('data-bs-toggle', 'modal');
    trigger.setAttribute('data-bs-target', '#modal');
    trigger.setAttribute('data-modal', url);
    trigger.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(trigger);

    const formAppeared = new Promise(resolve => {
      // v2.2.5: helper finds form via primary selector OR via price-input fallback (ext-articles)
      const findForm = () => {
        let f = modalContainer.querySelector('form[id^="Edit"]');
        if (!f) {
          const anyPriceInput = modalContainer.querySelector('input[name="price"]');
          if (anyPriceInput) f = anyPriceInput.closest('form');
        }
        return f;
      };
      const obs = new MutationObserver(() => {
        const f = findForm();
        if (f && f.querySelector('input[name="price"]')) {
          obs.disconnect();
          resolve(f);
        }
      });
      obs.observe(modalContainer, { childList: true, subtree: true });
      modalContainer.addEventListener('shown.bs.modal', () => {
        const f = findForm();
        if (f) { obs.disconnect(); resolve(f); }
      }, { once: true });
    });

    trigger.click();
    setStep('clicked-trigger', articleId);

    const form = await Promise.race([
      formAppeared,
      new Promise(r => setTimeout(() => r(null), timeoutMs)),
    ]);
    setStep(form ? 'form-found' : `form-timeout-${timeoutMs}`, articleId);
    trigger.remove();
    return form;
  };

  const openModalAndGetForm = async (articleId) => {
    // 1. attempt: 15s timeout
    let form = await openModalAndGetFormCore(articleId, 15000);
    if (form) return form;
    // 2. attempt nach pause: 1.5s wait + 20s timeout
    console.warn(`[CM-Update] [${articleId}] modal-timeout 15s, retrying with 20s after 1.5s pause`);
    await new Promise(r => setTimeout(r, 1500));
    // Force close any half-open modal
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    modalContainer.innerHTML = '';
    modalContainer.classList.remove('show');
    document.body.classList.remove('modal-open');
    form = await openModalAndGetFormCore(articleId, 20000);
    if (!form) {
      const modalContent = (modalContainer.innerHTML || '').slice(0, 500);
      console.warn(`[CM-Update] [${articleId}] modal STILL didn't load after retry. Modal content:`, modalContent);
    }
    return form;
  };

  // Helper: close modal aggressively
  const closeModal = async () => {
    // 1. Try Bootstrap dismiss
    const closeBtn = modalContainer.querySelector('.btn-close, [data-bs-dismiss="modal"]');
    if (closeBtn) closeBtn.click();
    // 2. Try jQuery if available
    if (window.jQuery) {
      try { window.jQuery(modalContainer).modal('hide'); } catch {}
    }
    // 3. Wait briefly
    await new Promise(r => setTimeout(r, 200));
    // 4. Force-remove backdrop + reset body
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    modalContainer.classList.remove('show');
    modalContainer.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
  };

  for (let i = 0; i < updates.length; i++) {
    if (window.__cmUpdateStop) break;
    const u = updates[i];
    // v2.1: Wenn idArticle drift detected → operiere auf rebindTo statt original ID
    const targetId = u.rebindTo || u.articleId;
    window.__cmUpdateProgress = { phase: dryRun ? 'dry-run' : 'updating', done: i, total, ok, err };

    try {
      setStep('start', targetId);

      // v2.1: Delete-Branch — listing komplett von Cardmarket entfernen
      if (u.wantsDelete) {
        if (dryRun) {
          // Dry-run: nur prüfen ob article existiert
          const probe = await fetch(`/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${targetId}`, { credentials: 'include' });
          if (!probe.ok) throw new Error(`dry-delete: HTTP ${probe.status}`);
          ok++;
          window.__cmUpdateProgress = { phase: 'dry-delete', done: i + 1, total, ok, err };
          if (delay) await new Promise(r => setTimeout(r, delay));
          continue;
        }
        // Live delete via Cardmarket Stock-Action-Endpoint
        // Pattern: POST /{lang}/{game}/Stock/Singles?idArticle=X mit action=remove (vermutet)
        // Alternative: /Stock/RemoveArticle?idArticle=X
        setStep('deleting', targetId);
        const fd = new FormData();
        fd.append('action', 'remove');
        fd.append('idArticle', targetId);
        let deleteRes;
        try {
          deleteRes = await fetch(`/${lang}/${game}/Stock/Singles`, {
            method: 'POST',
            credentials: 'include',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
          });
        } catch (e) { throw new Error(`delete: ${e.message}`); }
        if (!deleteRes.ok) throw new Error(`delete: HTTP ${deleteRes.status}`);
        ok++;
        setStep('deleted', targetId);
        window.__cmUpdateProgress = { phase: 'deleted', done: i + 1, total, ok, err };
        if (delay) await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // For dry-run, just verify modal opens + price input present, don't submit
      if (dryRun) {
        if (fastMode) {
          // Fast-Mode dry-run: nur fetch der modal-HTML + form-parse, kein POST
          const probeRes = await fetch(`/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${targetId}`, { credentials: 'include' });
          if (!probeRes.ok) throw new Error(`fast-dry: HTTP ${probeRes.status}`);
          const html = await probeRes.text();
          if (!/form[^>]*id="Edit/i.test(html)) throw new Error('fast-dry: no edit form');
          ok++;
          window.__cmUpdateProgress = { phase: 'dry-run-fast', done: i + 1, total, ok, err };
          continue;
        }
        const form = await openModalAndGetForm(targetId);
        if (!form) throw new Error('modal did not load (dry-run check)');
        await closeModal();
        ok++;
        window.__cmUpdateProgress = { phase: 'dry-run', done: i + 1, total, ok, err };
        continue;
      }

      // v2.1: Fast-Mode → Direct-Mode. Verifizierter Endpoint /AjaxAction/Article_EditSingleArticle
      // 1 POST per article, kein modal-fetch, kein modal-render. Massive CF-load-reduktion.
      if (fastMode) {
        try {
          setStep('direct-post', targetId);
          await directUpdate(u);
          ok++;
          setStep('direct-done', targetId);
          window.__cmUpdateProgress = { phase: 'updating-direct', done: i + 1, total, ok, err };
          if (delay) await new Promise(r => setTimeout(r, delay));
          continue;
        } catch (directErr) {
          // v2.3.0: Schlug erst die Verifikation NACH dem POST fehl, ist der Preis moeglicherweise
          // bereits geschrieben. Dann darf der Modal-Flow nicht erneut schreiben — sonst zweimal
          // dieselbe Aenderung. Solche Zeilen werden als Fehler gezaehlt und benannt, damit der
          // Nutzer sie gezielt nachsehen kann.
          if (directErr && directErr.afterPost) {
            err++;
            errors.push({ articleId: targetId, msg: directErr.message + ' (POST war abgesetzt — bitte pruefen)' });
            setStep('direct-unverified', targetId);
            window.__cmUpdateProgress = { phase: 'updating-direct', done: i + 1, total, ok, err };
            if (delay) await new Promise(r => setTimeout(r, delay));
            continue;
          }
          // v2.3.0: Ohne #modal auf der Seite gibt es keinen Modal-Flow, auf den man
          // zurueckfallen koennte — der Versuch endete in einem TypeError. Da die neuen
          // Sicherheits-Abbrueche (Sprache/Zustand/Menge unklar) genau hier landen, muss der
          // Fall sauber gemeldet werden statt zu krachen.
          if (!modalContainer) {
            err++;
            errors.push({ articleId: targetId, msg: directErr.message + ' — kein Modal auf dieser Seite verfuegbar. Bitte eine Stock/Offers-Seite oeffnen.' });
            setStep('direct-no-modal', targetId);
            window.__cmUpdateProgress = { phase: 'updating-direct', done: i + 1, total, ok, err };
            if (delay) await new Promise(r => setTimeout(r, delay));
            continue;
          }
          console.warn(`[CM-Update] [${targetId}] direct-mode failed (${directErr.message}), fallback auf modal-flow`);
          setStep('direct-fallback', targetId);
          // v2.3.0: Rueckfaelle sichtbar machen. Vorher stand das nur in der Konsole des
          // Cardmarket-Tabs — der Nutzer sah im Popup nur "OK" und wusste nicht, dass
          // Fast Mode fuer diese Zeilen ausgesetzt hat (und warum).
          directFallbacks.push({ articleId: targetId, msg: directErr.message });
        }
      }

      // Step 1: Open modal natively
      const form = await openModalAndGetForm(targetId);
      if (!form) throw new Error('modal did not load form within 5s');
      setStep('form-loaded', targetId);

      // Brief wait for Cardmarket JS to attach handlers after modal-shown
      await new Promise(r => setTimeout(r, 150));

      const priceInput = form.querySelector('input[name="price"]');
      const oldPriceVal = parseFloat((priceInput.value || '0').replace(',', '.')) || 0;
      const newPriceStr = u.newPrice.toFixed(2);

      // Step 2: Set new price (we're in MAIN world now, jQuery + handlers accessible)
      setStep('setting-price', targetId);
      priceInput.focus();
      priceInput.value = newPriceStr;
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.dispatchEvent(new Event('change', { bubbles: true }));
      priceInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // v2.1: Optional Comments-Update (nur wenn applyComments-Flag gesetzt)
      if (u.applyComments) {
        setStep('setting-comments', targetId);
        const commentsField = form.querySelector('textarea[name="comments"], textarea[name="comment"], input[name="comments"]');
        if (commentsField) {
          commentsField.focus();
          commentsField.value = u.newComments || '';
          commentsField.dispatchEvent(new Event('input', { bubbles: true }));
          commentsField.dispatchEvent(new Event('change', { bubbles: true }));
          commentsField.dispatchEvent(new Event('blur', { bubbles: true }));
        } else {
          console.warn(`[CM-Update] [${targetId}] applyComments=true but no comments-textarea found in modal`);
        }
      }

      // Step 3: Submit — try jQuery first (cardmarket uses it), fallback native click
      setStep('submitting', targetId);
      let submitVia = 'unknown';
      try {
        if (window.jQuery) {
          window.jQuery(form).trigger('submit');
          submitVia = 'jq-submit';
        } else {
          const btn = form.querySelector('button[type="submit"]');
          if (btn) { btn.click(); submitVia = 'btn-click'; }
          else { form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })); submitVia = 'evt-dispatch'; }
        }
      } catch (e) { submitVia = 'err:' + e.message; }
      setStep('submitted-' + submitVia, targetId);
      console.log(`[CM-Update] [${targetId}] submit via: ${submitVia}`);

      // Step 4: Wait briefly for AJAX response (poll fetch log)
      setStep('waiting-ajax', targetId);
      const startLogLen = (window.__cmFetchLog || []).length;
      let gotResponse = false;
      let responseStatus = null;
      for (let t = 0; t < 20; t++) { // max 2s
        await new Promise(r => setTimeout(r, 100));
        const log = window.__cmFetchLog || [];
        if (log.length > startLogLen) {
          gotResponse = true;
          // Check status of latest POST
          const latest = log[log.length - 1];
          responseStatus = latest?.status;
          break;
        }
      }
      setStep(gotResponse ? `ajax-${responseStatus}` : 'ajax-timeout', targetId);

      if (gotResponse && responseStatus && responseStatus < 400) {
        ok++;
        setStep('done-ok', targetId);
      } else if (verify) {
        await closeModal();
        setStep('verifying', targetId);
        const verifyHtml = await fetchModal(targetId);
        const actualPrice = parseCurrentPrice(verifyHtml);
        if (actualPrice == null) throw new Error('verify: cant parse price');
        if (Math.abs(actualPrice - u.newPrice) > 0.005) {
          throw new Error(`verify FAIL: still ${actualPrice} (wanted ${u.newPrice}, was ${oldPriceVal})`);
        }
        ok++;
        setStep('done-ok', targetId);
      } else {
        ok++;
        setStep('done-no-verify', targetId);
      }

      // Always close modal between iterations so next openModalAndGetForm can re-trigger
      await closeModal();
    } catch (e) {
      err++;
      // v2.1: Bei Rebind-Fall beide IDs in error loggen für Debug
      const errId = u.rebindTo ? `${u.articleId}→${u.rebindTo}` : u.articleId;
      errors.push({ articleId: errId, msg: e.message });
    }
    // Ensure modal is closed before next iteration (idempotent)
    try { await closeModal(); } catch {}

    window.__cmUpdateProgress = { phase: dryRun ? 'dry-run' : 'updating', done: i + 1, total, ok, err };
    if (delay) await new Promise(r => setTimeout(r, delay));
  }

  const finalResult = { ok, err, errors, directFallbacks, aborted: !!window.__cmUpdateStop };
  window.__cmUpdateResult = finalResult;
  return finalResult;
 } catch (topErr) {
  console.error('[CM-Update] Top-level error:', topErr);
  const errResult = { ok: 0, err: 1, errors: [{ articleId: 'TOP', msg: topErr.message + ' | ' + (topErr.stack || '').slice(0, 300) }], aborted: false };
  window.__cmUpdateResult = errResult;
  return errResult;
 }
}

// ================================================================
// WANT-LISTS — v2.1
// Export: scrape /Wants → list of wantlists → für jede /Wants/EditWantsList/{id} paginiert scrapen
// Bulk-Delete: CSV mit "delete=Y"-Spalte → Einträge per native Delete-Modal/POST entfernen
// ================================================================

const btnWantsExport = document.getElementById('btnWantsExport');
const btnAbortWants = document.getElementById('btnAbortWants');
const wantsProgressEl = document.getElementById('wantsProgress');
const wantsProgFillEl = document.getElementById('wantsProgFill');
const wantsProgTextEl = document.getElementById('wantsProgText');
const wantsLogEl = document.getElementById('wantsLog');
const fileWantsCsv = document.getElementById('fileWantsCsv');
const wantsDryRunEl = document.getElementById('wantsDryRun');
const btnWantsAnalyze = document.getElementById('btnWantsAnalyze');
const btnWantsDelete = document.getElementById('btnWantsDelete');
const wantsDeleteCountEl = document.getElementById('wantsDeleteCount');

const wlog = (msg, cls = '') => {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  wantsLogEl.appendChild(d);
  wantsLogEl.scrollTop = wantsLogEl.scrollHeight;
};

let parsedDeletes = [];
let parsedWantsEdits = [];

btnAbortWants.addEventListener('click', async () => {
  try {
    const tab = await getTargetTab();
    if (!tab) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.__cmWantsStop = true; },
    });
    wlog(tl('Abbruch angefordert', 'Abort requested'), 'err');
  } catch (e) { wlog(tl('Abort-Fehler: ', 'Abort error: ') + e.message, 'err'); }
});

btnWantsExport.addEventListener('click', async () => {
  console.log('[CM-Wants-Popup] Button click registered');
  btnWantsExport.disabled = true;
  btnAbortWants.style.display = 'block';
  wantsProgressEl.style.display = 'block';
  wantsLogEl.innerHTML = '';
  wlog(tl('Starte Wants-Export...', 'Starting Wants export...'), 'ok');

  try {
    const tab = await getTargetTab();
    wlog(`Target-Tab: ${tab?.url || '(none)'}`);
    console.log('[CM-Wants-Popup] target tab:', tab?.url);
    if (!tab || !/cardmarket\.com/.test(tab.url || '')) {
      wlog(tl('Kein Cardmarket-Tab gefunden.', 'No Cardmarket tab found.'), 'err');
      return;
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { window.__cmWantsStop = false; window.__cmWantsProgress = null; },
    });

    const pollTimer = setInterval(async () => {
      try {
        const [{ result: p }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => window.__cmWantsProgress || null,
        });
        if (!p) return;
        const pct = p.totalLists ? Math.round((p.listIdx / p.totalLists) * 100) : 0;
        wantsProgFillEl.style.width = pct + '%';
        wantsProgTextEl.textContent = tl(
          `Liste ${p.listIdx || 0}/${p.totalLists || '?'} ${p.listName || ''} | Seite ${p.page || 0} | Zeilen ${p.rowsTotal || 0}`,
          `List ${p.listIdx || 0}/${p.totalLists || '?'} ${p.listName || ''} | Page ${p.page || 0} | Rows ${p.rowsTotal || 0}`
        );
      } catch {}
    }, 800);

    console.log('[CM-Wants-Popup] About to executeScript...');
    wlog('Inject scraper in tab...');
    let result;
    try {
      const scriptRes = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [{ delay: 500 }],
        func: injectedWantsScrape,
      });
      console.log('[CM-Wants-Popup] executeScript returned:', scriptRes);
      result = scriptRes?.[0]?.result;
    } catch (e) {
      console.error('[CM-Wants-Popup] executeScript threw:', e);
      wlog('executeScript-Exception: ' + e.message, 'err');
      clearInterval(pollTimer);
      return;
    }

    clearInterval(pollTimer);
    wantsProgFillEl.style.width = '100%';

    if (!result) {
      wlog(tl('Kein Result vom Scraper. Tab evtl. navigiert weg oder Cloudflare-block.', 'No result from the scraper. The tab may have navigated away or Cloudflare blocked it.'), 'err');
      return;
    }
    if (result.error) {
      wlog(tl('Fehler: ', 'Error: ') + result.error, 'err');
      return;
    }
    wlog(tl(`Wantlists gefunden: ${result.wantlists?.length || 0}`, `Wantlists found: ${result.wantlists?.length || 0}`), 'ok');
    wlog(tl(`Einträge gesamt: ${result.rows?.length || 0}`, `Entries total: ${result.rows?.length || 0}`), 'ok');

    if (!result.rows || result.rows.length === 0) {
      wlog(tl('Keine Einträge. Prüfe Login + dass mindestens eine Wantlist existiert.', 'No entries. Check login + that at least one wantlist exists.'), 'err');
      return;
    }

    // v2.1: editable user-fields + _Original-Refs für Skip-Fetch + Edit-Detection
    const cols = ['WantListName', 'idWantsList', 'idProduct', 'idMetacard', 'idWant', 'ProductName', 'Expansion', 'ExpansionCode',
      'Language', '_OriginalLanguage',
      'MinCondition', '_OriginalMinCondition',
      'IsFoil', '_OriginalIsFoil',
      'IsSigned', '_OriginalIsSigned',
      'IsAltered', '_OriginalIsAltered',
      'IsPlayset', '_OriginalIsPlayset',
      'IsReverseHolo', '_OriginalIsReverseHolo',
      'MaxPrice_EUR', '_OriginalMaxPrice_EUR',
      'Quantity', '_OriginalQuantity',
      'ProductUrl', 'delete'];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const escId = id => `"=""${String(id ?? '').replace(/"/g, '""')}"""`;
    const yn = b => b ? 'Y' : 'N';
    const meta = {
      exportedAt: new Date().toISOString(),
      lang: langEl.value,
      game: gameEl.value,
      toolVersion: chrome.runtime.getManifest().version,
    };
    // v2.1: Metadata im Dateinamen, nicht im CSV-Body (Excel-Re-Save-Kompat)
    const lines = [cols.join(';')];
    for (const r of result.rows) {
      // v2.1: editable + ref-pairs für Skip-Fetch
      const lang = r.language || '';
      const cond = r.minCondition || '';
      const foil = yn(r.isFoil);
      const signed = yn(r.isSigned);
      const altered = yn(r.isAltered);
      const playset = yn(r.isPlayset);
      const reverse = yn(r.isReverseHolo);
      const price = r.maxPrice || '';
      const qty = r.quantity || '1';
      lines.push([
        esc(r.wantListName),
        escId(r.idWantsList),
        escId(r.idProduct),
        escId(r.idMetacard || ''),
        escId(r.idWant),
        esc(r.productName), esc(r.expansion), esc(r.expansionCode),
        esc(lang), esc(lang),
        esc(cond), esc(cond),
        esc(foil), esc(foil),
        esc(signed), esc(signed),
        esc(altered), esc(altered),
        esc(playset), esc(playset),
        esc(reverse), esc(reverse),
        esc(price), esc(price),
        esc(qty), esc(qty),
        esc(r.productUrl),
        esc('N'), // delete-column default N
      ].join(';'));
    }
    const csv = lines.join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const reader = new FileReader();
    reader.onload = async () => {
      // v2.1: Metadata im Dateinamen
      const fname = `cardmarket-wants-${new Date().toISOString().slice(0, 10)}-${meta.lang}-${meta.game}-v${meta.toolVersion}.csv`;
      try {
        await chrome.downloads.download({ url: reader.result, filename: fname, saveAs: true });
        wlog('Download: ' + fname, 'ok');
      } catch (e) { wlog(tl('Download-Fehler: ', 'Download error: ') + e.message, 'err'); }
    };
    reader.readAsDataURL(blob);
  } catch (e) {
    wlog('Exception: ' + e.message, 'err');
  } finally {
    btnWantsExport.disabled = false;
    btnAbortWants.style.display = 'none';
  }
});

async function injectedWantsScrape({ delay }) {
  console.log('[CM-Wants] === START injectedWantsScrape ===');
  try {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const lang = pathParts[0] || 'de';
    const game = pathParts[1] || 'Pokemon';
    console.log(`[CM-Wants] lang=${lang} game=${game} pathname=${location.pathname}`);
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function writeProgress(p) {
      window.__cmWantsProgress = Object.assign({}, window.__cmWantsProgress || {}, p);
    }

    // 1. Discover wantlists from /Wants overview page
    writeProgress({ phase: 'discover-lists' });
    console.log(`[CM-Wants] Fetching overview: /${lang}/${game}/Wants`);
    const overviewRes = await fetch(`/${lang}/${game}/Wants`, { credentials: 'include' });
    console.log(`[CM-Wants] Overview status: ${overviewRes.status}`);
    if (!overviewRes.ok) throw new Error(`overview HTTP ${overviewRes.status}`);
    const overviewHtml = await overviewRes.text();
    const overviewDoc = new DOMParser().parseFromString(overviewHtml, 'text/html');

    // v2.1 FIX: Wants-Discovery — Cardmarket nutzt verschiedene URL-Patterns je nach Locale + Game
    // Bekannte Patterns:
    //   /de/Pokemon/Wants/EditWantsList/{id}
    //   /de/Pokemon/Wants/Show/{id}
    //   /de/Pokemon/Wants/{id}
    //   /de/Pokemon/Wants?idWantsList={id}
    const wantlists = [];
    const seenIds = new Set();
    // Match alle Links die nach Wantlist-IDs aussehen
    const links = overviewDoc.querySelectorAll('a[href*="/Wants/"], a[href*="idWantsList="]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      let id = null;
      // Pattern 1: /Wants/EditWantsList/{id} or /Wants/Show/{id} or /Wants/{id}
      let m = href.match(/\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/);
      if (m) id = m[1];
      // Pattern 2: ?idWantsList={id}
      if (!id) {
        m = href.match(/[?&]idWantsList=(\d+)/);
        if (m) id = m[1];
      }
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      const name = a.textContent.trim().replace(/\s+/g, ' ') || `Wantlist ${id}`;
      wantlists.push({ id, name });
    }
    console.log(`[CM-Wants] Discovered ${wantlists.length} wantlists:`, wantlists.map(w => `${w.id}=${w.name}`).slice(0, 5));
    if (wantlists.length === 0) {
      // v2.1: Diagnostic — log overview-HTML-snippet zur Inspektion
      console.warn('[CM-Wants] /Wants overview HTML sample:', overviewHtml.slice(0, 3000));
      return { error: 'Keine Wantlists gefunden auf /Wants. Prüfe Login + dass Wantlists existieren. Console (F12) zeigt HTML-Sample.', wantlists: [], rows: [] };
    }

    const allRows = [];
    const seenIdWants = new Set(); // dedupe per idWant
    // v2.2.13: alle 17 Kartensprachen, die Cardmarket fuehrt (DE- und EN-Schreibweise).
    // Vorher endete die Liste bei 11 — Karten in Sprache 12-17 bekamen eine LEERE Language-Spalte,
    // und das Bulk-Update hat sie danach auf Deutsch gesetzt.
    const LANG_RE = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|Holländisch|Niederländisch|Polnisch|Tschechisch|Ungarisch|Indonesisch|Thailändisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian|Simplified Chinese|Traditional Chinese|Dutch|Polish|Czech|Hungarian|Indonesian|Thai)$/;

    for (let li = 0; li < wantlists.length; li++) {
      if (window.__cmWantsStop) break;
      const wl = wantlists[li];
      console.log(`[CM-Wants] === List ${li+1}/${wantlists.length}: id=${wl.id} name="${wl.name}" ===`);
      writeProgress({ listIdx: li + 1, totalLists: wantlists.length, listName: wl.name, page: 0, rowsTotal: allRows.length });

      let page = 1;
      let lastHtmlLen = -1;
      while (page <= 100) { // Sicherheits-cap
        if (window.__cmWantsStop) break;
        // v2.1 FIX: Cardmarket-URL ist /Wants/{id} (verifiziert via DevTools Address-Bar)
        // Fallbacks behalten falls andere Locales/Games abweichen
        const urlCandidates = [
          `/${lang}/${game}/Wants/${wl.id}?site=${page}`,
          `/${lang}/${game}/Wants/${wl.id}/${page}`,
          `/${lang}/${game}/Wants/EditWantsList/${wl.id}?site=${page}`,
          `/${lang}/${game}/Wants/Show/${wl.id}?site=${page}`,
          `/${lang}/${game}/Wants?idWantsList=${wl.id}&site=${page}`,
        ];
        let res = null, html = '', successUrl = '';
        for (const url of urlCandidates) {
          try { res = await fetch(url, { credentials: 'include' }); }
          catch (e) { console.log(`[CM-Wants] fetch err ${url}: ${e.message}`); continue; }
          console.log(`[CM-Wants] tried ${url} → status ${res.status}`);
          if (res.status === 429) { console.log('[CM-Wants] 429 → wait 10s'); await sleep(10000); res = null; continue; }
          if (!res.ok) { res = null; continue; }
          const tmpHtml = await res.text();
          // v2.1: Validierung — page muss tatsächlich want-list-content enthalten, nicht generic /Wants overview
          const hasWantContent = /Wants-Optionen|wants-options|Karten<|Wants Hinzufügen|wantRow|article-row|productInfo|Shopping Wizard/i.test(tmpHtml);
          console.log(`[CM-Wants] ${url} hasWantContent=${hasWantContent} html-len=${tmpHtml.length}`);
          if (!hasWantContent) continue;
          html = tmpHtml;
          successUrl = url;
          break;
        }
        if (!res || !html) {
          console.warn(`[CM-Wants] List ${wl.id}: NO valid URL found among candidates. Breaking.`);
          break;
        }
        // v2.1: Pagination-loop-protection — wenn HTML-len identisch zu vorheriger page → URL ignoriert ?site=N → break
        if (page > 1 && html.length === lastHtmlLen) {
          console.log(`[CM-Wants] List ${wl.id} page ${page}: identical html-len ${html.length} → pagination disabled, break`);
          break;
        }
        lastHtmlLen = html.length;
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // v2.1 FIX: Cardmarket-Wants-Markup hat checkbox <input data-id-want="HEX-ID"> innerhalb row-container
        // Strategie: walk up vom checkbox bis ein ancestor product-link enthält (= echter row-container)
        const checkboxes = [...doc.querySelectorAll('input[name="checkWantsRow[]"][data-id-want], input[data-id-want]')];
        const rowSet = new Set();
        const rows = [];
        for (const cb of checkboxes) {
          // Walk up suchen nach ancestor der einen Products/Singles-link enthält
          let container = cb.parentElement;
          let depth = 0;
          while (container && depth < 8) {
            const productLink = container.querySelector('a[href*="/Products/Singles/"], a[href*="/Products/"]');
            if (productLink) break;
            container = container.parentElement;
            depth++;
          }
          if (!container || rowSet.has(container)) continue;
          rowSet.add(container);
          container._cmCheckbox = cb;
          rows.push(container);
        }
        // v2.1 diagnostic
        if (page === 1) {
          console.log(`[CM-Wants] List ${wl.id} page 1: ${checkboxes.length} checkboxes → ${rows.length} unique row-containers`);
          if (rows.length > 0) {
            const r0 = rows[0];
            console.log(`  row[0] tag=${r0.tagName} class="${r0.className}" outerHTML[0..2000]:`, (r0.outerHTML || '').slice(0, 2000));
          }
        }
        if (rows.length === 0) {
          // v2.1: Diagnostic — finde main-content-section und sample sie
          if (page === 1) {
            // Suche nach allen ID-Patterns die "row" enthalten
            const rowsLikeIds = [...doc.querySelectorAll('[id]')].map(e => e.id).filter(id => /row|want|wish|item/i.test(id)).slice(0, 30);
            // Finde alle classes die relevant sein könnten
            const interestingClasses = new Set();
            doc.querySelectorAll('[class]').forEach(e => {
              (e.className || '').toString().split(/\s+/).forEach(c => {
                if (/want|wish|article|product|table-row|grid-row|item-row|card-row/i.test(c)) interestingClasses.add(c);
              });
            });
            // Finde main-content-container
            const mainSelectors = ['main', '#main', '.main-content', '.container .row.g-0', '#WantsList', '[id*="ants"][class*="ist"]'];
            let mainSample = '';
            for (const ms of mainSelectors) {
              const el = doc.querySelector(ms);
              if (el && el.innerHTML.length > 200) {
                mainSample = `(${ms})\n` + el.innerHTML.slice(0, 5000);
                break;
              }
            }
            console.warn(`[CM-Wants] List ${wl.id} page 1: 0 rows. URL=${successUrl}`);
            console.warn(`  IDs (row/want/wish/item):`, rowsLikeIds);
            console.warn(`  Classes (want/wish/article/product/row):`, [...interestingClasses].slice(0, 25));
            console.warn(`  Main-Content-Sample:`, mainSample || '(no main found, falling back to full body)');
            if (!mainSample) {
              const bodyEl = doc.querySelector('body');
              // skip header section: search for "</header>" and start sample after it
              const bodyHtml = bodyEl?.innerHTML || '';
              const headerEnd = bodyHtml.indexOf('</header>');
              const skipTo = headerEnd > 0 ? headerEnd + 9 : 0;
              console.warn(`  Body-Sample (post-header, 8000 chars):`, bodyHtml.slice(skipTo, skipTo + 8000));
            }
          }
          break;
        }

        let pageHadRows = false;
        for (const el of rows) {
          // v2.1 FIX: idWant aus checkbox-data-attribute (hex-string, nicht numeric)
          const cb = el._cmCheckbox || el.querySelector('input[data-id-want]');
          let idWant = cb?.getAttribute('data-id-want') || '';
          // Fallback: id-pattern
          if (!idWant) {
            const idWantMatch = (el.id || '').match(/(?:want|wants)Row(\d+)/i);
            idWant = idWantMatch ? idWantMatch[1] : '';
          }

          // Product name + URL
          const nameLink = el.querySelector('a[href*="/Products/Singles/"], a[href*="/Products/"]');
          const productName = (nameLink?.textContent || '').trim().replace(/\s+/g, ' ');
          const href = nameLink?.getAttribute('href') || '';
          const productUrl = href ? (href.startsWith('http') ? href : 'https://www.cardmarket.com' + href) : '';

          // idProduct from product URL or attribute
          let idProduct = el.getAttribute('data-id-product') || el.getAttribute('data-product-id') || '';
          if (!idProduct) {
            const m = href.match(/\/(\d+)(?:[?#]|$)/);
            if (m) idProduct = m[1];
          }
          // v2.1: idProduct + idMetacard aus row outerHTML scannen (image-URL pattern + data-attrs)
          const fullHtml = el.outerHTML || '';
          if (!idProduct) {
            const mp = fullHtml.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i);
            if (mp) idProduct = mp[1];
          }
          // idMetacard — required für edit-POST. Sucht data-id-metacard oder ähnliches Pattern.
          let idMetacard = '';
          const mm = fullHtml.match(/data-id-metacard=["'](\d+)["']/i)
            || fullHtml.match(/idMetacard["'\s:=]+(\d+)/i);
          if (mm) idMetacard = mm[1];

          // Expansion + ExpansionCode
          const expEl = el.querySelector('a.expansion-symbol, .expansion-symbol');
          let expansion = expEl?.getAttribute('aria-label') || expEl?.getAttribute('data-bs-original-title') || expEl?.getAttribute('title') || '';
          if (!expansion) {
            const h = expEl?.getAttribute('href') || '';
            const mm = h.match(/\/Expansions\/([^/?#]+)/);
            if (mm) expansion = decodeURIComponent(mm[1]).replace(/-/g, ' ');
          }
          const ecMatch = productName.match(/\(([^)]+)\)\s*$/);
          const expansionCode = ecMatch ? ecMatch[1] : '';

          // Language preference
          let language = '';
          el.querySelectorAll('span[aria-label], span[data-bs-original-title], span[data-original-title], span[title]').forEach(s => {
            if (language) return;
            const l = s.getAttribute('aria-label') || s.getAttribute('data-bs-original-title') || s.getAttribute('data-original-title') || s.getAttribute('title') || '';
            // v2.3.0: wie im Stock-Scraper auch die Sprachnamen aus dem idLanguage-Dropdown
            // dieser Seite akzeptieren. Ohne das bleibt die Language-Spalte auf /fr/, /es/ und
            // /it/ leer — und ein Bulk-Edit wuerde solche Eintraege spaeter ueberspringen.
            if (!window.__cmWantsLangNames) {
              const set = new Set();
              try {
                document.querySelectorAll('select[name="idLanguage"] option, select[name="idLanguage[]"] option').forEach(o => {
                  const n = (o.textContent || '').trim();
                  if (n && (o.value || '') !== '0') set.add(n);
                });
              } catch (e) { /* kein Dropdown → nur LANG_RE */ }
              window.__cmWantsLangNames = set;
            }
            const lt = (l || '').trim();
            if (LANG_RE.test(lt) || window.__cmWantsLangNames.has(lt)) language = lt;
          });

          // Min Condition (badge or selected option)
          const condEl = el.querySelector('.article-condition, [class*="condition"]');
          let minCondition = condEl?.querySelector('.badge')?.textContent.trim() || '';
          if (!minCondition) {
            const selCond = el.querySelector('select[name*="ondition"] option[selected]');
            if (selCond) minCondition = selCond.textContent.trim();
          }

          // Variant flags from attributes / hidden inputs / labels
          const txt = el.textContent || '';
          const isFoil = !!el.querySelector('input[name*="oil"][checked], input[name*="oil"]:checked') || /\bFoil\b/i.test(txt);
          const isSigned = !!el.querySelector('input[name*="igned"][checked], input[name*="igned"]:checked') || /\bSigned\b/i.test(txt);
          const isAltered = !!el.querySelector('input[name*="ltered"][checked], input[name*="ltered"]:checked') || /\bAltered\b/i.test(txt);
          const isPlayset = !!el.querySelector('input[name*="layset"][checked], input[name*="layset"]:checked') || /\bPlayset\b/i.test(txt);
          const isReverseHolo = !!el.querySelector('[aria-label*="Reverse" i], [title*="Reverse" i]') || /Reverse\s*Holo/i.test(txt);

          // Max price (input or text)
          let maxPrice = '';
          const priceInput = el.querySelector('input[name*="rice"], input[name*="Price"]');
          if (priceInput) maxPrice = priceInput.value || priceInput.getAttribute('value') || '';
          if (!maxPrice) {
            const priceEl = el.querySelector('.color-primary, [class*="rice"]');
            const t = (priceEl?.textContent || '').trim();
            const pm = t.match(/(\d{1,3}(?:[.,]\d{3})*[,.]\d{2})/);
            if (pm) maxPrice = pm[1];
          }

          // Quantity (input or default 1)
          let quantity = '';
          const qtyInput = el.querySelector('input[name*="mount"], input[name*="uantity"], input[type="number"]');
          if (qtyInput) quantity = qtyInput.value || qtyInput.getAttribute('value') || '';
          if (!quantity) quantity = '1';

          if (productName || idWant) {
            // v2.1: Dedupe per idWant
            if (idWant && seenIdWants.has(idWant)) continue;
            if (idWant) seenIdWants.add(idWant);
            allRows.push({
              wantListName: wl.name,
              idWantsList: wl.id,
              idWant,
              idProduct,
              idMetacard,
              productName,
              expansion,
              expansionCode,
              language,
              minCondition,
              isFoil, isSigned, isAltered, isPlayset, isReverseHolo,
              maxPrice,
              quantity,
              productUrl,
            });
            pageHadRows = true;
          }
        }

        // v2.1 diagnostic: wenn rows-elements matched aber 0 davon hatten productName+idWant → parser-failure
        if (page === 1 && rows.length > 0 && !pageHadRows) {
          console.warn(`[CM-Wants] List ${wl.id}: ${rows.length} row-elements matched, but 0 hatten productName/idWant → Parser fail. Erste row outerHTML wurde oben geloggt.`);
        }

        writeProgress({ listIdx: li + 1, totalLists: wantlists.length, listName: wl.name, page, rowsTotal: allRows.length });

        if (!pageHadRows) break;
        page++;
        if (delay) await sleep(delay);
      }
    }

    return { wantlists, rows: allRows, aborted: !!window.__cmWantsStop };
  } catch (e) {
    return { error: e.message, wantlists: [], rows: [] };
  }
}

// ================================================================
// WANTS BULK-DELETE
// ================================================================

btnWantsAnalyze.addEventListener('click', async () => {
  wantsLogEl.innerHTML = '';
  btnWantsDelete.style.display = 'none';
  parsedDeletes = [];

  const file = fileWantsCsv.files[0];
  if (!file) { wlog(tl('Keine CSV ausgewählt', 'No CSV selected'), 'err'); return; }

  const text = await file.text();
  const { headers, rows, meta: bodyMeta } = parseCsv(text);
  // v2.1: Filename-Metadata merge
  const fnameMeta = parseFilenameMeta(file.name);
  const meta = { ...bodyMeta, ...fnameMeta };
  wlog(tl(`CSV gelesen: ${rows.length} Zeilen, ${headers.length} Spalten`, `CSV read: ${rows.length} rows, ${headers.length} columns`));

  if (meta.exported || meta.tool) {
    wlog(`ℹ Export-Info: ${[
      meta.exported ? new Date(meta.exported).toLocaleString('de-DE') : null,
      meta.lang ? `${meta.lang}/${meta.game || '?'}` : null,
      meta.tool || null,
    ].filter(Boolean).join(' | ')}`, 'ok');
  }

  // v2.1: smart detection — falsche CSV im falschen tab?
  if (headers.includes('ArticleID') && headers.includes('Price_EUR') && !headers.includes('idWant')) {
    wlog(tl('❌ Falsche CSV — das ist eine Stock-CSV, nicht Wants-CSV.', '❌ Wrong CSV — this is a stock CSV, not a Wants CSV.'), 'err');
    wlog(tl('Wechsel zum Tab "✏️ Bulk Update" → dort die Stock-CSV laden.', 'Switch to the "✏️ Bulk Update" tab → load the stock CSV there.'), 'err');
    return;
  }
  if (!headers.includes('idWant') || !headers.includes('idWantsList') || !headers.includes('delete')) {
    wlog(tl('Fehler: CSV muss idWant + idWantsList + delete Spalten enthalten', 'Error: CSV must contain idWant + idWantsList + delete columns'), 'err');
    return;
  }

  // v2.1: Detection für Delete + Edit (Edit hat priorität niedriger als Delete)
  const toDelete = [];
  const toEdit = [];
  let invalid = 0;
  for (const r of rows) {
    const idWant = (r.idWant || '').trim();
    const idWantsList = (r.idWantsList || '').trim();
    if (!/^[a-fA-F0-9]{8,32}$/.test(idWant) && !/^\d+$/.test(idWant)) { invalid++; continue; }
    if (!/^\d+$/.test(idWantsList)) { invalid++; continue; }

    const flag = (r.delete || '').trim().toUpperCase();
    const wantsDelete = flag === 'Y' || flag === 'YES' || flag === 'TRUE' || flag === '1';

    if (wantsDelete) {
      toDelete.push({
        idWant, idWantsList,
        productName: r.ProductName || '',
        wantListName: r.WantListName || '',
      });
      continue;
    }

    // v2.1 Edit-Detection — vergleiche editable fields vs _Original-Refs
    const norm = (s) => (s || '').trim();
    const fieldDiffs = {};
    let edited = false;
    const editableFields = [
      ['Language', '_OriginalLanguage'],
      ['MinCondition', '_OriginalMinCondition'],
      ['IsFoil', '_OriginalIsFoil'],
      ['IsSigned', '_OriginalIsSigned'],
      ['IsAltered', '_OriginalIsAltered'],
      ['IsPlayset', '_OriginalIsPlayset'],
      ['IsReverseHolo', '_OriginalIsReverseHolo'],
      ['MaxPrice_EUR', '_OriginalMaxPrice_EUR'],
      ['Quantity', '_OriginalQuantity'],
    ];
    for (const [field, refField] of editableFields) {
      const newVal = norm(r[field]);
      const refVal = norm(r[refField]);
      // Wenn _Original nicht in CSV → user hat alte CSV ohne ref-spalten → edit-detection deaktiviert für dieses field
      if (refField in r && newVal !== refVal) {
        fieldDiffs[field] = { old: refVal, new: newVal };
        edited = true;
      }
    }
    if (edited) {
      toEdit.push({
        idWant, idWantsList,
        idProduct: (r.idProduct || '').trim(),
        idMetacard: (r.idMetacard || '').trim(),
        productName: r.ProductName || '',
        wantListName: r.WantListName || '',
        fieldDiffs,
        // Snapshot aller editable values (für apply-phase POST)
        newValues: {
          language: norm(r.Language),
          minCondition: norm(r.MinCondition),
          isFoil: norm(r.IsFoil),
          isSigned: norm(r.IsSigned),
          isAltered: norm(r.IsAltered),
          isPlayset: norm(r.IsPlayset),
          isReverseHolo: norm(r.IsReverseHolo),
          maxPrice: norm(r.MaxPrice_EUR),
          quantity: norm(r.Quantity),
        },
      });
    }
  }

  if (invalid > 0) wlog(tl(`⚠ ${invalid} Zeilen mit invaliden IDs übersprungen`, `⚠ ${invalid} rows with invalid IDs skipped`), 'err');
  wlog(tl(`🗑 ${toDelete.length} Einträge zum Löschen (delete=Y)`, `🗑 ${toDelete.length} entries to delete (delete=Y)`), 'ok');
  wlog(tl(`✏ ${toEdit.length} Einträge zum Editieren (Felder geändert)`, `✏ ${toEdit.length} entries to edit (fields changed)`), 'ok');

  // v2.1: Edit-Diff-Preview
  if (toEdit.length > 0) {
    const sample = toEdit.slice(0, 5).map(e => {
      const diffStr = Object.entries(e.fieldDiffs).map(([k, v]) => `${k}: ${v.old}→${v.new}`).join(', ');
      return `  • ${e.productName.slice(0, 30)}: ${diffStr}`;
    }).join('\n');
    wlog(tl(`Edit-Beispiele:\n${sample}${toEdit.length > 5 ? `\n  ... +${toEdit.length - 5} weitere` : ''}`, `Edit examples:\n${sample}${toEdit.length > 5 ? `\n  ... +${toEdit.length - 5} more` : ''}`));
  }

  if (toDelete.length === 0 && toEdit.length === 0) {
    wlog(tl('Nichts zu tun. CSV "delete=Y" oder editable Felder (Language/MinCondition/MaxPrice_EUR/etc.) ändern.', 'Nothing to do. Set CSV "delete=Y" or change editable fields (Language/MinCondition/MaxPrice_EUR/etc.).'), 'err');
    return;
  }

  parsedDeletes = toDelete;
  parsedWantsEdits = toEdit;
  btnWantsDelete.textContent = t('btn_wants_confirm', [`${toDelete.length} ${toDelete.length === 1 ? 'delete' : 'delete'} + ${toEdit.length} edit`]);
  btnWantsDelete.style.display = 'block';
});

btnWantsDelete.addEventListener('click', async () => {
  if (parsedDeletes.length === 0 && parsedWantsEdits.length === 0) return;
  const isDry = wantsDryRunEl.checked;

  if (!isDry) {
    const ok = window.confirm(`⚠ ACHTUNG: ${parsedDeletes.length} Wants gelöscht + ${parsedWantsEdits.length} Wants editiert LIVE.\n\nDelete NICHT rückgängig machbar.\n\nFortfahren?`);
    if (!ok) return;
  }

  btnWantsDelete.disabled = true;
  btnWantsAnalyze.disabled = true;
  wantsProgressEl.style.display = 'block';
  const actionDesc = `${parsedWantsEdits.length} edit + ${parsedDeletes.length} delete`;
  wlog(`Start ${isDry ? 'DRY-RUN' : 'LIVE'} (${actionDesc})...`, 'ok');

  const tab = await getTargetTab();

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      args: [{ deletes: parsedDeletes, edits: parsedWantsEdits, dryRun: isDry, delay: 500 }],
      func: runWantsBulkDelete,
    });

    if (!result) {
      wlog(tl('Kein Result. Tab evtl. navigiert weg.', 'No result. The tab may have navigated away.'), 'err');
      return;
    }
    wlog(tl(`${isDry ? 'DRY-RUN' : 'LIVE'} fertig: ${result.ok || 0} OK, ${result.err || 0} Fehler${result.editsOk != null ? ` (${result.editsOk} edits, ${result.deletesOk} deletes)` : ''}`, `${isDry ? 'DRY-RUN' : 'LIVE'} done: ${result.ok || 0} OK, ${result.err || 0} errors${result.editsOk != null ? ` (${result.editsOk} edits, ${result.deletesOk} deletes)` : ''}`), 'ok');
    // v2.3.0: unauflösbare Sprachen melden statt sie stillschweigend wegzulassen
    const wantsUnresolved = result.langUnresolved || [];
    if (wantsUnresolved.length) {
      const names = [...new Set(wantsUnresolved.map(x => x.name))].slice(0, 5).join(', ');
      wlog(tl(
        `⚠ ${wantsUnresolved.length} Eintrag/Einträge übersprungen — Sprache nicht bestimmbar (${names}). Diese Einträge wurden gar nicht verändert; bitte Wantlist neu exportieren.`,
        `⚠ ${wantsUnresolved.length} entr(y/ies) skipped — language could not be determined (${names}). These entries were left untouched; please re-export your wantlist.`
      ), 'err');
    }
    if (!isDry && (result.ok > 0)) {
      wlog(tl(`⚠ "OK" heißt nur HTTP 200 — verifiziere durch refresh der Wants-Page ob Änderungen wirklich übernommen wurden!`, `⚠ "OK" only means HTTP 200 — verify by refreshing the Wants page whether the changes were actually applied!`), 'err');
      wlog(tl(`Falls Werte unverändert: Endpoint ist falsch. DevTools-Network-Trace bei manueller Edit-Aktion senden für exakten Endpoint.`, `If values are unchanged: the endpoint is wrong. Send a DevTools network trace of a manual edit action for the exact endpoint.`), 'err');
    }
    if (result.errors?.length) {
      result.errors.slice(0, 20).forEach(e => wlog(`  ${e.idWant}: ${e.msg}`, 'err'));
    }
  } catch (e) {
    wlog('Exception: ' + e.message, 'err');
  } finally {
    btnWantsDelete.disabled = false;
    btnWantsAnalyze.disabled = false;
  }
});

async function runWantsBulkDelete(args) {
  try {
    const { deletes, edits, dryRun, delay } = args || {};
    const deletesArr = Array.isArray(deletes) ? deletes : [];
    const editsArr = Array.isArray(edits) ? edits : [];
    let ok = 0, err = 0;
    const errors = [];
    // v2.3.0: Sprachnamen bevorzugt aus dem Dropdown DIESER Seite aufloesen — deckt automatisch
    // alle Oberflaechensprachen ab. langUnresolved sammelt, was trotzdem nicht auflösbar war.
    const langUnresolved = [];
    const wantsPageLangNameToId = (() => {
      const map = {};
      try {
        document.querySelectorAll('select[name="idLanguage"] option, select[name="idLanguage[]"] option').forEach(o => {
          const val = (o.value || '').trim();
          const nm = (o.textContent || '').trim();
          if (val && /^\d+$/.test(val) && val !== '0' && nm) map[nm] = val;
        });
      } catch (e) { /* kein Dropdown → Tabelle uebernimmt */ }
      return map;
    })();
    const pathParts = location.pathname.split('/').filter(Boolean);
    const lang = pathParts[0] || 'de';
    const game = pathParts[1] || 'Pokemon';
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const total = deletesArr.length + editsArr.length;

    // v2.1: CSRF-Token aus aktueller Page extrahieren — Cardmarket erwartet __cmtkn in jedem POST
    const cmtkn = document.querySelector('input[name="__cmtkn"]')?.value || '';
    if (!cmtkn) {
      console.warn('[CM-Wants] Kein __cmtkn gefunden auf aktueller Page — Edits/Deletes werden vermutlich fehlschlagen. Lade eine Cardmarket-Page mit Form (z.B. Wants-page) bevor du den Bulk-Run startest.');
    } else {
      console.log('[CM-Wants] __cmtkn extrahiert, length=', cmtkn.length);
    }

    // v2.1: Phase A — Edits zuerst (Delete würde editierbare items entfernen)
    for (let i = 0; i < editsArr.length; i++) {
      const e = editsArr[i];
      window.__cmWantsProgress = { phase: dryRun ? 'dry-edit' : 'editing', done: i, total, ok, err, currentId: e.idWant };
      try {
        if (dryRun) {
          const probe = await fetch(`/${lang}/${game}/Wants/${e.idWantsList}`, { credentials: 'include' });
          if (!probe.ok) throw new Error(`wantlist HTTP ${probe.status}`);
          ok++;
        } else {
          // v2.1: Cardmarket-Payload-Format verifiziert via DevTools-Trace (LUPZN, 2026-04-30)
          // Endpoint: POST /{lang}/{game}/PostGetAction/WantsList_EditWant
          // Felder: _id (hex), idWantsList, idMetacard, idProduct[], idLanguage[] (numeric), amount,
          //         minCondition (numeric: 1=MT 2=NM 3=EX 4=GD 5=LP 6=PL 7=PO),
          //         isReverseHolo, isSigned, isFirstEd, isAltered (0/1), wishPrice
          const LANG_NAME_TO_ID = {
            'Englisch': '1', 'English': '1',
            'Französisch': '2', 'French': '2',
            'Deutsch': '3', 'German': '3',
            'Spanisch': '4', 'Spanish': '4',
            'Italienisch': '5', 'Italian': '5',
            'S-Chinesisch': '6', 'Chinese': '6', 'Chinesisch': '6', 'Simplified Chinese': '6',
            'Japanisch': '7', 'Japanese': '7',
            'Portugiesisch': '8', 'Portuguese': '8',
            'Russisch': '9', 'Russian': '9',
            'Koreanisch': '10', 'Korean': '10',
            'T-Chinesisch': '11', 'Traditional Chinese': '11',
            // v2.2.13: Sprachen 12-17 ergaenzt (siehe STOCK_LANG_NAME_TO_ID).
            'Holländisch': '12', 'Niederländisch': '12', 'Dutch': '12',
            'Polnisch': '13', 'Polish': '13',
            'Tschechisch': '14', 'Czech': '14',
            'Ungarisch': '15', 'Hungarian': '15',
            'Indonesisch': '16', 'Indonesian': '16',
            'Thailändisch': '17', 'Thai': '17',
          };
          const COND_NAME_TO_ID = {
            'MT': '1', 'NM': '2', 'EX': '3', 'GD': '4', 'LP': '5', 'PL': '6', 'PO': '7',
            'Mint': '1', 'Near Mint': '2', 'Excellent': '3', 'Good': '4',
            'Light Played': '5', 'Played': '6', 'Poor': '7',
          };
          const fd = new FormData();
          if (cmtkn) fd.append('__cmtkn', cmtkn);
          fd.append('_id', e.idWant); // hex-string
          fd.append('idWantsList', e.idWantsList);
          // v2.1: idMetacard ist required — ohne sie verliert want product-association
          if (e.idMetacard) fd.append('idMetacard', e.idMetacard);
          if (e.idProduct) fd.append('idProduct[]', e.idProduct);
          fd.append('idProductEmptyInput', '');
          const v = e.newValues || {};
          // Language → numeric ID
          // v2.3.0: Dieser POST ist ein VOLL-Update des Wants-Eintrags, und idLanguageEmptyInput
          // unten ist Cardmarkets Marker fuer "Feld gesendet, Auswahl leer". Ein POST ohne
          // idLanguage[], aber mit dem Marker, loescht also die Sprachpraeferenz. Deshalb wird
          // hier nichts geraten und nichts halb gesendet: laesst sich die Sprache nicht sicher
          // bestimmen, bleibt der Eintrag unangetastet und wird als Fehler gemeldet.
          // LEER ist hier ein gueltiger Zustand: ein Wunsch ohne Sprachvorgabe gilt fuer alle
          // Sprachen und ist der Normalfall. Genau dafuer existiert idLanguageEmptyInput —
          // Cardmarkets eigenes Formular schickt es bei leerer Mehrfachauswahl ebenso.
          // Abgebrochen wird nur, wenn ein GESETZTER Wert nicht aufloesbar ist; frueher ging der
          // dann roh an Cardmarket.
          const rawL = String(v.language ?? '').trim();
          if (rawL) {
            const langId = wantsPageLangNameToId[rawL] || LANG_NAME_TO_ID[rawL] || (/^\d+$/.test(rawL) ? rawL : '');
            if (!langId) {
              langUnresolved.push({ id: e.idWant, name: rawL });
              throw new Error(`Sprache nicht aufloesbar ("${rawL}") — Eintrag unveraendert gelassen`);
            }
            fd.append('idLanguage[]', langId);
          }
          fd.append('idLanguageEmptyInput', '');
          // Condition → numeric ID
          if (v.minCondition) {
            // v2.3.0: wie bei der Sprache nichts Unbekanntes durchreichen. Ein roher Wert
            // ("Near-Mint", ein Tippfehler) landete bisher unveraendert im POST.
            const rawC = String(v.minCondition).trim();
            const condId = COND_NAME_TO_ID[rawC] || (/^[1-7]$/.test(rawC) ? rawC : '');
            if (!condId) throw new Error(`Zustand nicht aufloesbar ("${rawC}") — Eintrag unveraendert gelassen`);
            fd.append('minCondition', condId);
          }
          if (v.quantity) fd.append('amount', v.quantity);
          if (v.maxPrice) fd.append('wishPrice', v.maxPrice.replace(',', '.'));
          fd.append('isReverseHolo', v.isReverseHolo === 'Y' ? '1' : '0');
          fd.append('isSigned', v.isSigned === 'Y' ? '1' : '0');
          fd.append('isAltered', v.isAltered === 'Y' ? '1' : '0');
          fd.append('isFirstEd', v.isPlayset === 'Y' ? '1' : '0'); // CM nutzt isFirstEd statt isPlayset
          // Note: idMetacard wird optional gesetzt falls vorhanden (sonst CM nutzt default vom _id)
          // v2.1: Cardmarket-Endpoint verifiziert via DevTools-Trace (LUPZN, 2026-04-30):
          // POST /{lang}/{game}/PostGetAction/WantsList_EditWant
          // Returns 302 redirect after success.
          const editUrl = `/${lang}/${game}/PostGetAction/WantsList_EditWant`;
          const res = await fetch(editUrl, {
            method: 'POST',
            credentials: 'include',
            body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            redirect: 'follow',
          });
          // Status 200 (after follow) oder 302 sind beide success-signals
          if (!res.ok && res.status !== 302) throw new Error(`edit HTTP ${res.status} @ ${editUrl}`);
          ok++;
        }
      } catch (ex) {
        err++;
        errors.push({ idWant: e.idWant, msg: 'edit: ' + ex.message });
      }
      if (delay) await sleep(delay);
    }

    // v2.1: Phase B — Deletes nach Edits
    for (let i = 0; i < deletesArr.length; i++) {
      const d = deletesArr[i];
      window.__cmWantsProgress = { phase: dryRun ? 'dry-delete' : 'deleting', done: editsArr.length + i, total, ok, err, currentId: d.idWant };
      try {
        if (dryRun) {
          const probe = await fetch(`/${lang}/${game}/Wants/${d.idWantsList}`, { credentials: 'include' });
          if (!probe.ok) throw new Error(`wantlist HTTP ${probe.status}`);
          ok++;
        } else {
          // v2.1: Delete-Payload verifiziert via DevTools-Trace (LUPZN, 2026-04-30)
          // Felder: __cmtkn, idWantsList, idWant (hex-string, NICHT _id wie bei edit)
          const fd = new FormData();
          if (cmtkn) fd.append('__cmtkn', cmtkn);
          fd.append('idWantsList', d.idWantsList);
          fd.append('idWant', d.idWant); // hex-string
          const deleteUrl = `/${lang}/${game}/PostGetAction/WantsList_DeleteWant`;
          const res = await fetch(deleteUrl, {
            method: 'POST', credentials: 'include', body: fd,
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            redirect: 'follow',
          });
          if (!res.ok && res.status !== 302) throw new Error(`delete HTTP ${res.status} @ ${deleteUrl}`);
          ok++;
        }
      } catch (ex) {
        err++;
        errors.push({ idWant: d.idWant, msg: 'delete: ' + ex.message });
      }
      if (delay) await sleep(delay);
    }

    return { ok, err, errors, langUnresolved };
  } catch (topErr) {
    return { ok: 0, err: 1, errors: [{ idWant: 'TOP', msg: topErr.message }] };
  }
}
