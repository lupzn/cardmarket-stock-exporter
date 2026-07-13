const btnRun = document.getElementById('run');
const btnDetach = document.getElementById('detach');
const statusEl = document.getElementById('status');
const maxPagesEl = document.getElementById('maxPages');
const delayEl = document.getElementById('delay');
const langEl = document.getElementById('lang');
const gameEl = document.getElementById('game');
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

async function getTargetTab() {
  if (forcedTabId) {
    try { return await chrome.tabs.get(forcedTabId); }
    catch { /* tab was closed */ }
  }
  const tabs = await chrome.tabs.query({ url: 'https://www.cardmarket.com/*' });
  if (tabs.length) return tabs[0];
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
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
const langSelectAll = document.getElementById('langSelectAll');
const langSelectNone = document.getElementById('langSelectNone');
const langSelectAsian = document.getElementById('langSelectAsian');
if (langSelectAll) langSelectAll.addEventListener('click', (e) => {
  e.preventDefault();
  cardLangFilterEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
});
if (langSelectNone) langSelectNone.addEventListener('click', (e) => {
  e.preventDefault();
  cardLangFilterEl.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
});
if (langSelectAsian) langSelectAsian.addEventListener('click', (e) => {
  e.preventDefault();
  // Asiatische Sprachen: 6=S-CN, 7=JP, 10=KR, 11=T-CN, 13=ID
  const asianIds = ['6', '7', '10', '11', '13'];
  cardLangFilterEl.querySelectorAll('input[type="checkbox"][data-lang-id]').forEach(cb => {
    cb.checked = asianIds.includes(cb.getAttribute('data-lang-id'));
  });
});

function buildBasePath() {
  return `/${langEl.value}/${gameEl.value}/Stock/Offers/Singles`;
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

function renderSetPicker(sets) {
  if (!sets || sets.length === 0) {
    setExportList.style.display = 'none';
    setExportControls.style.display = 'none';
    log(t('log_no_sets_found'), 'err');
    return;
  }
  const header = `<div style="display:flex;align-items:center;gap:6px;padding:3px 5px;font-size:9px;color:#888;border-bottom:1px solid #444;font-weight:600;position:sticky;top:0;background:#0f0f0f">
      <span style="width:14px"></span>
      <span style="flex:1">SET</span>
      <span style="min-width:60px;text-align:right">KARTEN</span>
    </div>`;
  const rowsHtml = sets.map(s => {
    const safeId = 'setx_' + String(s.id).replace(/[^a-zA-Z0-9]/g, '_');
    const countTxt = (s.approx ? '~' : '') + (s.count != null ? s.count : '?');
    return `<label style="display:flex;align-items:center;gap:6px;padding:3px 5px;margin:0;border-bottom:1px solid #1a1a1a;cursor:pointer">
      <input type="checkbox" id="${safeId}" data-set-id="${escSetHtml(s.id)}" data-set-name="${escSetHtml(s.name)}" style="width:14px;height:14px;flex-shrink:0">
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escSetHtml(s.name)}</span>
      <span style="color:#fbbf24;font-weight:600;min-width:60px;text-align:right;font-size:12px">${countTxt}</span>
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
      args: [{ maxPages, delay, basePath, useSortBy, perExpansion, cardLangIds, selectedExpansionIds }],
      func: injectedScrapeAll,
    });

    clearInterval(pollTimer); pollTimer = null;
    progFillEl.style.width = '100%';

    if (result.error) {
      log(t('log_error', [result.error]), 'err');
      if (result.debugSnippet) log(result.debugSnippet.slice(0, 500));
      return;
    }
    log(t('log_pages_scanned', [result.pagesScanned]), 'ok');
    if (result.detectedTotalPages) log(t('log_pagination_widget', [result.detectedTotalPages]));
    log(t('log_rows_dedup', [result.rows.length]), 'ok');
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
      const fname = `cardmarket-stock-${new Date().toISOString().slice(0, 10)}-${meta.lang}-${meta.game}-v${meta.toolVersion}${setMarker}.csv`;
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
  const cols = ['ArticleID', 'idProduct', 'Name', 'ExpansionCode', 'SetCode', 'CollectorNumber', 'Expansion', 'Rarity', 'Language', 'Condition', 'ConditionFull', 'ReverseHolo', 'Comments', '_OriginalComments', 'Price_EUR', '_OriginalPrice_EUR', 'Amount', 'Total_EUR', 'ProductUrl', 'ImageUrl', 'delete'];
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
      esc(yn(r.reverse)),
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

async function injectedScrapeAll({ maxPages, delay, basePath, useSortBy, perExpansion, cardLangIds, mode, selectedExpansionIds }) {
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
    const LANG_RE = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian)$/;
    let language = '';
    el.querySelectorAll('span[aria-label], span[data-bs-original-title], span[data-original-title], span[title]').forEach(s => {
      if (language) return;
      const l = s.getAttribute('aria-label') || s.getAttribute('data-bs-original-title') || s.getAttribute('data-original-title') || s.getAttribute('title') || '';
      if (LANG_RE.test(l)) language = l;
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
    const txtAll = (row.comments || '') + ' ' + (el.textContent || '');
    row.reverse = /Reverse\s*Holo/i.test(txtAll) || !!el.querySelector('[aria-label*="Reverse" i], [data-bs-original-title*="Reverse" i], [title*="Reverse" i]');
    return row;
  }

  const rows = [];
  const seen = new Set();
  let pagesScanned = 0;
  let debugSnippet = '';
  let detectedTotalPages = null;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // v2.1: mkUrl akzeptiert generisches filter-Objekt (idExpansion + optional idLanguage + idCondition + isReverseHolo)
  const mkUrl = (p, filter = {}) => {
    const params = new URLSearchParams();
    if (useSortBy) params.set('sortBy', 'name_asc');
    if (filter.idExpansion) params.set('idExpansion', filter.idExpansion);
    if (filter.idLanguage) params.set('idLanguage', filter.idLanguage);
    if (filter.idCondition) params.set('idCondition', filter.idCondition);
    if (filter.isReverseHolo != null) params.set('isReverseHolo', filter.isReverseHolo ? '1' : '0');
    if (filter.isFoil != null) params.set('isFoil', filter.isFoil ? '1' : '0');
    params.set('site', String(p));
    return `${basePath}?${params.toString()}`;
  };

  const fetchPage = async (p, filter = {}) => {
    const url = mkUrl(p, filter);
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
    window.__cmExportProgress = Object.assign(
      { rowsTotal: rows.length, stockTotal, ts: Date.now() },
      window.__cmExportProgress || {},
      extras,
    );
  };

  // v2.1: scrapePages akzeptiert filter-Objekt + meldet cap-Verdacht
  // Returns { added, capSuspect, totalPagesSeen, pagesFetched }
  const scrapePages = async (filter, label, expIdx, expTotal, expName) => {
    let page = 1;
    let emptyStreak = 0;
    let localAdded = 0;
    let totalPagesSeen = 0; // aus Pagination-Widget der Sub-Scope
    let pagesFetched = 0;
    let lastPageRowCount = 0;

    while (true) {
      if (window.__cmExportStop) { writeProgress({ status: 'aborted', lastErr: 'Abgebrochen' }); throw new Error('Abgebrochen'); }
      if (maxPages && page > maxPages) break;
      writeProgress({ status: 'running', expansion: expIdx ? { idx: expIdx, total: expTotal, name: expName, id: filter.idExpansion } : null, page, label });
      const { res, url } = await fetchPage(page, filter);
      if (res.status === 429) { console.warn('[CM] 429 pause 10s'); writeProgress({ lastErr: '429 Rate-Limit, Pause 10s' }); await sleep(10000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      if (page === 1 && !filter.idExpansion && !detectedTotalPages) {
        const links = doc.querySelectorAll('a[href*="site="]');
        let maxP = 0;
        links.forEach(a => {
          const mm = (a.getAttribute('href') || '').match(/[?&]site=(\d+)/);
          if (mm) maxP = Math.max(maxP, parseInt(mm[1], 10));
        });
        detectedTotalPages = maxP || null;
      }

      // v2.1: Per-scope-Pagination tracken (für cap-Detection)
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
      // v2.1: Empty-page-retry — Cardmarket gibt manchmal 200 OK aber leere page bei rate-limit-edge ODER cloudflare-challenge
      // Retry-Heuristik: wenn page leer aber per-scope-totalPagesSeen sagt mehr pages sollten existieren → 1x retry mit pause
      if (!rowEls.length && page > 1 && page <= totalPagesSeen) {
        console.warn(`[CM] ${label} page ${page} unexpected empty (totalPagesSeen=${totalPagesSeen}). Retry in 3s...`);
        await sleep(3000);
        const { res: retryRes } = await fetchPage(page, filter);
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
        if (page === 1) {
          if (!debugSnippet) debugSnippet = (doc.querySelector('.table-body')?.outerHTML || doc.body?.innerHTML || html).slice(0, 2000);
          break;
        }
        emptyStreak++;
        if (emptyStreak >= 2) break;
        page++;
        if (delay) await sleep(delay);
        continue;
      }
      emptyStreak = 0;

      let added = 0, duped = 0;
      rowEls.forEach(el => {
        const row = parseRow(el);
        if (!row.articleId) {
          if (row.name || row.price) { rows.push(row); added++; localAdded++; }
          return;
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
      console.log(`[CM] ${label} page ${page}: +${added} (dup ${duped}, total ${rows.length})`);
      if (added === 0 && duped > 0) break;
      page++;
      if (page > 5000) break;
      if (delay) await sleep(delay);
    }

    // v2.1: Cap-Detection-Heuristik (aggressiver nach LUPZN-feedback 30.4.2026 — 0.4% loss bei kleineren sets)
    // Threshold auf 200 gesenkt damit auch sets mit 250-280 listings cascade triggern
    const ROWS_PER_PAGE_FULL = 40;
    const CAP_THRESHOLD_ROWS = 200; // aggressiver als 280 → fängt auch sets in 250-300-bereich
    const capSuspect = (
      localAdded >= CAP_THRESHOLD_ROWS &&
      lastPageRowCount >= ROWS_PER_PAGE_FULL
    );

    return { added: localAdded, capSuspect, totalPagesSeen, pagesFetched };
  };

  // v2.1: Cascading-Driver — wenn cap-Verdacht → Filter-Achsen tiefer aufteilen
  // Reihenfolge: idLanguage → idCondition → isReverseHolo. Stopp-Bedingung: keine Achse mehr ODER cap weg.
  // LANG-IDs aus Cardmarket: 1=DE, 2=EN, 3=FR, 4=ES, 5=IT, 6=S-CN, 7=JP, 8=KO, 9=RU, 10=PT (defensiv 1-15)
  // COND-IDs: 1=MT, 2=NM, 3=EX, 4=GD, 5=LP, 6=PL, 7=PO
  const LANG_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const COND_IDS = [1, 2, 3, 4, 5, 6, 7];

  const scrapeWithCascade = async (baseFilter, label, expIdx, expTotal, expName) => {
    // Stage 1: try base filter directly
    const r1 = await scrapePages(baseFilter, label, expIdx, expTotal, expName);
    if (!r1.capSuspect) return r1.added;

    // Cap detected → cascade by language (only if not already filtered by language)
    if (!baseFilter.idLanguage) {
      console.warn(`[CM] ${label} cap-suspect (${r1.added} rows). Cascading by language...`);
      writeProgress({ lastErr: `${label}: cap-Verdacht, splitte nach Sprache` });
      let totalAdded = 0;
      for (const langId of LANG_IDS) {
        if (window.__cmExportStop) break;
        const filter = { ...baseFilter, idLanguage: langId };
        const subLabel = `${label} [lang=${langId}]`;
        const r2 = await scrapePages(filter, subLabel, expIdx, expTotal, expName);
        totalAdded += r2.added;
        if (r2.capSuspect && !baseFilter.idCondition) {
          // Stage 2: cascade by condition
          console.warn(`[CM] ${subLabel} still cap-suspect. Cascading by condition...`);
          for (const condId of COND_IDS) {
            if (window.__cmExportStop) break;
            const filter2 = { ...filter, idCondition: condId };
            const subLabel2 = `${subLabel} [cond=${condId}]`;
            const r3 = await scrapePages(filter2, subLabel2, expIdx, expTotal, expName);
            if (r3.capSuspect && baseFilter.isReverseHolo == null) {
              // Stage 3: cascade by reverseHolo
              console.warn(`[CM] ${subLabel2} still cap-suspect. Cascading by reverseHolo...`);
              for (const rh of [false, true]) {
                if (window.__cmExportStop) break;
                const filter3 = { ...filter2, isReverseHolo: rh };
                await scrapePages(filter3, `${subLabel2} [rh=${rh ? 1 : 0}]`, expIdx, expTotal, expName);
                if (delay) await sleep(delay);
              }
            }
            if (delay) await sleep(delay);
          }
        }
        if (delay) await sleep(delay);
      }
      return totalAdded;
    }
    return r1.added;
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
            await scrapeWithCascade(langBaseFilter, 'ALL' + langTag, 1, 1, 'ALL');
          }
        } else {
          for (let i = 0; i < expansions.length; i++) {
            if (window.__cmExportStop) break;
            const { id, name } = expansions[i];
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
              writeProgress({ lastErr: `${name}${langTag}: ${e.message}` });
            }
            if (delay) await sleep(delay);
          }
        }
      } else {
        await scrapeWithCascade(langBaseFilter, 'ALL' + langTag, 1, 1, 'ALL');
      }
    }
    writeProgress({ status: 'done' });
    return { rows, pagesScanned, debugSnippet, detectedTotalPages, aborted: !!window.__cmExportStop };
  } catch (e) {
    writeProgress({ status: 'error', lastErr: e.message });
    return { error: e.message, rows, pagesScanned, debugSnippet, detectedTotalPages, aborted: !!window.__cmExportStop };
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
      <div style="display:flex;align-items:center;gap:6px;padding:3px 4px;margin:0;font-size:9px;color:#888;border-bottom:1px solid #444;font-weight:600">
        <span style="width:14px"></span>
        <span style="flex:1">SET</span>
        <span style="min-width:60px;text-align:right">EDITS</span>
        <span style="min-width:60px;text-align:right">KARTEN</span>
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
        <span style="color:#fbbf24;font-weight:600;min-width:60px;text-align:right;font-size:12px">${totalCards}</span>
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
          btnConfirm.textContent = 'Fetch läuft...';
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
            const commentsEl = form ? form.querySelector('textarea[name="comments"], textarea[name="comment"], input[name="comments"]') : doc.querySelector('textarea[name="comments"], textarea[name="comment"]');
            const comments = commentsEl ? (commentsEl.value || commentsEl.textContent || '') : '';
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
            const flags = {
              isReverseHolo: readChk('isReverseHolo'),
              isFoil: readChk('isFoil'),
              isSigned: readChk('isSigned'),
              isAltered: readChk('isAltered'),
              isFirstEd: readChk('isFirstEd'),
              isPlayset: readChk('isPlayset'),
            };
            // Capture editAmount too (CM-side current amount, may differ from CSV if user partially sold)
            const amountEl = (form || doc).querySelector('input[name="editAmount"], input[name="amount"]');
            const editAmount = amountEl ? (amountEl.value || amountEl.getAttribute('value') || '') : '';
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
          const LANG_RE = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian)$/;
          const list = [...doc.querySelectorAll('[id^="articleRow"]')].map(el => {
            const m = (el.id || '').match(/articleRow(\d+)/);
            const articleId = m ? m[1] : '';
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
            ? { price: r.state.price, comments: r.state.comments, flags: r.state.flags || null, editAmount: r.state.editAmount || '' }
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
    u.oldComments = r.comments || '';
    // v2.2.5: pipe variant flags + editAmount from fetched state to update-object
    // Used by directUpdate to preserve isFoil/isSigned/isAltered/isFirstEd/isPlayset on bulk-update.
    // isReverseHolo: CSV value takes priority (user might have toggled in CSV); fallback to fetch.
    u._fetchedFlags = r.flags || null;
    u._fetchedAmount = r.editAmount || '';

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
  const total = updates.length;
  const pathParts = location.pathname.split('/').filter(Boolean);
  const lang = pathParts[0] || 'de';
  const game = pathParts[1] || 'Pokemon';

  // v2.1: CSRF-Token aus current page extrahieren (für Direct-Mode + Fast-Mode)
  const pageCmtkn = document.querySelector('input[name="__cmtkn"]')?.value || '';

  // v2.1: Direct-Mode (verifiziert via DevTools-Trace LUPZN 2026-05-01)
  // Endpoint: POST /{lang}/{game}/AjaxAction/Article_EditSingleArticle
  // Felder: __cmtkn, idArticle, condition (string!), idLanguage (numeric), comments, price (dot), editAmount
  // Vorteil: keine Modal-Fetch, keine Modal-Render, 1 POST pro article = max speed + min CF-load
  const STOCK_LANG_NAME_TO_ID = {
    'Englisch': '1', 'English': '1',
    'Französisch': '2', 'French': '2',
    'Deutsch': '3', 'German': '3',
    'Spanisch': '4', 'Spanish': '4',
    'Italienisch': '5', 'Italian': '5',
    'S-Chinesisch': '6', 'Chinese': '6',
    'Japanisch': '7', 'Japanese': '7',
    'Portugiesisch': '8', 'Portuguese': '8',
    'Russisch': '9', 'Russian': '9',
    'Koreanisch': '10', 'Korean': '10',
    'T-Chinesisch': '11',
  };
  async function directUpdate(u) {
    if (!pageCmtkn) throw new Error('direct: __cmtkn missing — Cardmarket-page muss geladen sein');
    const targetId = u.rebindTo || u.articleId;
    const fd = new FormData();
    fd.append('__cmtkn', pageCmtkn);
    fd.append('idArticle', targetId);
    // Condition: string value direkt aus CSV (NM/EX/LP/...)
    fd.append('condition', u.condition || 'NM');
    // Language: name → numeric ID
    const langId = STOCK_LANG_NAME_TO_ID[u.language] || u.language || '3';
    fd.append('idLanguage', langId);
    // Comments: u.newComments enthält CSV.Comments-wert (= aktuellen state, da CSV exportiert wurde mit CM-werten).
    // Falls applyComments true → user hat editiert, wert ist neuer.
    // Falls applyComments false → wert ist gleich wie CM (CSV-state). Sicheres noop-übergabe.
    fd.append('comments', u.newComments || '');
    // Price: dot-decimal
    fd.append('price', u.newPrice.toFixed(2));
    // editAmount: aus CSV oder fallback 1
    fd.append('editAmount', String(u.amount || 1));
    // v2.2.4/2.2.5: variant flags MUST be passed — otherwise CM strips them (or rejects update)
    // Reported by LUPZN: reverse-holo cards were silently skipped/dropped during bulk-update.
    // Strategy: CSV value (u.reverseHolo) priority for isReverseHolo (user can toggle in CSV).
    // Other flags (foil/signed/altered/firstEd/playset) pulled from CM-fetched state (CSV doesn't have them).
    const flags = u._fetchedFlags || {};
    fd.append('isReverseHolo', u.reverseHolo ? '1' : '0');
    if (flags.isFoil != null) fd.append('isFoil', flags.isFoil ? '1' : '0');
    if (flags.isSigned != null) fd.append('isSigned', flags.isSigned ? '1' : '0');
    if (flags.isAltered != null) fd.append('isAltered', flags.isAltered ? '1' : '0');
    if (flags.isFirstEd != null) fd.append('isFirstEd', flags.isFirstEd ? '1' : '0');
    if (flags.isPlayset != null) fd.append('isPlayset', flags.isPlayset ? '1' : '0');
    const res = await fetch(`/${lang}/${game}/AjaxAction/Article_EditSingleArticle`, {
      method: 'POST',
      credentials: 'include',
      body: fd,
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    });
    if (!res.ok) throw new Error(`direct: HTTP ${res.status}`);
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
          console.warn(`[CM-Update] [${targetId}] direct-mode failed (${directErr.message}), fallback auf modal-flow`);
          setStep('direct-fallback', targetId);
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

  const finalResult = { ok, err, errors, aborted: !!window.__cmUpdateStop };
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
        wantsProgTextEl.textContent = `Liste ${p.listIdx || 0}/${p.totalLists || '?'} ${p.listName || ''} | Seite ${p.page || 0} | Zeilen ${p.rowsTotal || 0}`;
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
    const LANG_RE = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian)$/;

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
            if (LANG_RE.test(l)) language = l;
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
            'S-Chinesisch': '6', 'Chinese': '6',
            'Japanisch': '7', 'Japanese': '7',
            'Portugiesisch': '8', 'Portuguese': '8',
            'Russisch': '9', 'Russian': '9',
            'Koreanisch': '10', 'Korean': '10',
            'T-Chinesisch': '11',
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
          if (v.language) {
            const langId = LANG_NAME_TO_ID[v.language] || v.language; // accept raw ID if user already entered numeric
            fd.append('idLanguage[]', langId);
          }
          fd.append('idLanguageEmptyInput', '');
          // Condition → numeric ID
          if (v.minCondition) {
            const condId = COND_NAME_TO_ID[v.minCondition] || v.minCondition;
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

    return { ok, err, errors };
  } catch (topErr) {
    return { ok: 0, err: 1, errors: [{ idWant: 'TOP', msg: topErr.message }] };
  }
}
