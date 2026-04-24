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
} else {
  btnDetach.addEventListener('click', async () => {
    try {
      const tab = await getTargetTab();
      const width = 400, height = 780;
      await chrome.windows.create({
        url: chrome.runtime.getURL('popup.html') + `?detached=1${tab?.id ? '&tabId=' + tab.id : ''}`,
        type: 'popup',
        width,
        height,
      });
      window.close();
    } catch (e) {
      log('Pin-Fehler: ' + e.message, 'err');
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
    log('Abbruch angefordert...', 'err');
  } catch (e) { log('Abort-Fehler: ' + e.message, 'err'); }
});

const log = (msg, cls = '') => {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = msg;
  statusEl.appendChild(d);
  statusEl.scrollTop = statusEl.scrollHeight;
};

// Prefill lang + game from target tab URL
(async () => {
  try {
    const tab = await getTargetTab();
    const m = (tab?.url || '').match(/cardmarket\.com\/([^/]+)\/([^/]+)\//);
    if (m) {
      if ([...langEl.options].some(o => o.value === m[1])) langEl.value = m[1];
      if ([...gameEl.options].some(o => o.value === m[2])) gameEl.value = m[2];
    }
  } catch {}
})();

function buildBasePath() {
  return `/${langEl.value}/${gameEl.value}/Stock/Offers/Singles`;
}

btnRun.addEventListener('click', () => runExport(parseInt(maxPagesEl.value, 10) || 0));

async function runExport(maxPages) {
  btnRun.disabled = true;
  abortBtn.style.display = 'block';
  progressEl.style.display = 'block';
  progTextEl.textContent = 'Starte...';
  progFillEl.style.width = '0%';
  statusEl.innerHTML = '';
  let pollTimer = null;
  try {
    const tab = await getTargetTab();
    if (!tab || !/cardmarket\.com/.test(tab.url || '')) {
      log('Kein Cardmarket-Tab gefunden. Öffne eine Stock-Seite zuerst.', 'err');
      return;
    }
    const delay = parseInt(delayEl.value, 10) || 0;
    const basePath = buildBasePath();
    const useSortBy = useSortByEl.checked;
    const perExpansion = perExpansionEl.checked && maxPages !== 1;
    log(`Path: ${basePath} | sortBy=${useSortBy} | perExpansion=${perExpansion} | delay=${delay}ms`);

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
        const expTxt = p.expansion ? `Erw ${p.expansion.idx}/${p.expansion.total} ${p.expansion.name || ''}` : 'ALL';
        const pct = p.expansion?.total ? Math.round(((p.expansion.idx - 1) / p.expansion.total) * 100) : 0;
        progFillEl.style.width = pct + '%';
        progTextEl.textContent = `${expTxt} | Seite ${p.page} | Zeilen ${p.rowsTotal} | Stock ${p.stockTotal || 0}${p.lastErr ? ' ⚠ ' + p.lastErr : ''}`;
      } catch (e) { /* tab gone or busy, ignore */ }
    }, 800);

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [{ maxPages, delay, basePath, useSortBy, perExpansion }],
      func: injectedScrapeAll,
    });

    clearInterval(pollTimer); pollTimer = null;
    progFillEl.style.width = '100%';

    if (result.error) {
      log('Fehler: ' + result.error, 'err');
      if (result.debugSnippet) log(result.debugSnippet.slice(0, 500));
      return;
    }
    log(`Seiten gescannt: ${result.pagesScanned}`, 'ok');
    if (result.detectedTotalPages) log(`Pagination-Widget: ${result.detectedTotalPages} Seiten`);
    log(`Zeilen (dedup): ${result.rows.length}`, 'ok');
    const emptyAmount = result.rows.filter(r => !(r.amountDisplay || r.amount)).length;
    if (emptyAmount > 0) log(`⚠ Zeilen ohne Amount: ${emptyAmount}`, 'err');
    const totalStock = result.rows.reduce((s, r) => s + (parseInt(r.amountDisplay || r.amount, 10) || 0), 0);
    log(`Summe Amounts: ${totalStock}`, 'ok');
    const totalValue = result.rows.reduce((s, r) => s + (parseFloat((r.price || '').replace(/\./g, '').replace(',', '.')) || 0) * (parseInt(r.amountDisplay || r.amount, 10) || 0), 0);
    log(`Gesamtwert: ${totalValue.toFixed(2).replace('.', ',')} €`, 'ok');

    if (result.rows.length === 0) {
      log('Keine Zeilen. Prüfe Login + Pfad.', 'err');
      if (result.debugSnippet) log(result.debugSnippet.slice(0, 800));
      return;
    }

    const csv = buildCsv(result.rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const reader = new FileReader();
    reader.onload = async () => {
      const fname = `cardmarket-stock-${new Date().toISOString().slice(0, 10)}.csv`;
      try {
        await chrome.downloads.download({ url: reader.result, filename: fname, saveAs: true });
        log('Download: ' + fname, 'ok');
      } catch (e) {
        log('Download-Fehler: ' + e.message, 'err');
      }
    };
    reader.readAsDataURL(blob);

  } catch (e) {
    log('Exception: ' + e.message, 'err');
    console.error(e);
  } finally {
    if (pollTimer) clearInterval(pollTimer);
    btnRun.disabled = false;
    abortBtn.style.display = 'none';
  }
}

function buildCsv(rows) {
  const cols = ['ArticleID', 'Name', 'ExpansionCode', 'Expansion', 'Rarity', 'Language', 'Condition', 'ConditionFull', 'ReverseHolo', 'Comments', 'Price_EUR', 'Amount', 'Total_EUR', 'ProductUrl'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const yn = b => b ? 'Y' : 'N';
  const lines = [cols.join(';')];
  for (const r of rows) {
    const priceNum = parseFloat((r.price || '').replace(/\./g, '').replace(',', '.')) || 0;
    const amtStr = r.amountDisplay || r.amount || '';
    const amt = parseInt(amtStr, 10) || 0;
    const total = (priceNum * amt).toFixed(2).replace('.', ',');
    lines.push([
      r.articleId, r.name, r.expansionCode, r.expansion, r.rarity, r.language, r.condition, r.conditionFull,
      yn(r.reverse), r.comments, r.price, amtStr, total, r.productUrl,
    ].map(esc).join(';'));
  }
  return lines.join('\r\n');
}

// ================================================================
// INJECTED FUNCTIONS — must be self-contained (no outer refs).
// parseRow is duplicated inside each to avoid cross-context issues.
// ================================================================

async function injectedScrapeAll({ maxPages, delay, basePath, useSortBy, perExpansion }) {
  function parseRow(el) {
    const row = {};
    const idMatch = (el.id || '').match(/articleRow(\d+)/);
    row.articleId = idMatch ? idMatch[1] : '';
    const nameLink = el.querySelector('.col-seller a') || el.querySelector('a[href*="/Products/Singles/"]');
    row.name = (nameLink?.textContent || '').trim().replace(/\s+/g, ' ');
    const href = nameLink?.getAttribute('href') || '';
    row.productUrl = href ? (href.startsWith('http') ? href : 'https://www.cardmarket.com' + href) : '';
    const m = row.name.match(/\(([^)]+)\)\s*$/);
    row.expansionCode = m ? m[1] : '';
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

  const mkUrl = (p, idExpansion) => {
    const params = new URLSearchParams();
    if (useSortBy) params.set('sortBy', 'name_asc');
    if (idExpansion) params.set('idExpansion', idExpansion);
    params.set('site', String(p));
    return `${basePath}?${params.toString()}`;
  };

  const fetchPage = async (p, idExpansion) => {
    const url = mkUrl(p, idExpansion);
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

  const scrapePages = async (idExpansion, label, expIdx, expTotal, expName) => {
    let page = 1;
    let emptyStreak = 0;
    let localAdded = 0;
    while (true) {
      if (window.__cmExportStop) { writeProgress({ status: 'aborted', lastErr: 'Abgebrochen' }); throw new Error('Abgebrochen'); }
      if (maxPages && page > maxPages) break;
      writeProgress({ status: 'running', expansion: expIdx ? { idx: expIdx, total: expTotal, name: expName, id: idExpansion } : null, page });
      const { res, url } = await fetchPage(page, idExpansion);
      if (res.status === 429) { console.warn('[CM] 429 pause 10s'); writeProgress({ lastErr: '429 Rate-Limit, Pause 10s' }); await sleep(10000); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      if (page === 1 && !idExpansion && !detectedTotalPages) {
        const links = doc.querySelectorAll('a[href*="site="]');
        let maxP = 0;
        links.forEach(a => {
          const mm = (a.getAttribute('href') || '').match(/[?&]site=(\d+)/);
          if (mm) maxP = Math.max(maxP, parseInt(mm[1], 10));
        });
        detectedTotalPages = maxP || null;
      }

      const rowEls = doc.querySelectorAll('[id^="articleRow"].article-row, .article-row');
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
      console.log(`[CM] ${label} page ${page}: +${added} (dup ${duped}, total ${rows.length})`);
      if (added === 0 && duped > 0) break;
      page++;
      if (page > 5000) break;
      if (delay) await sleep(delay);
    }
    return localAdded;
  };

  const extractExpansionIds = async () => {
    const { res } = await fetchPage(1, null);
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
        if (v && /^\d+$/.test(v) && v !== '0') ids.push({ id: v, name: o.textContent.trim() });
      });
    }
    return ids;
  };

  try {
    if (perExpansion) {
      writeProgress({ status: 'extracting expansions', page: 0 });
      const expansions = await extractExpansionIds();
      console.log(`[CM] Gefundene Expansions: ${expansions.length}`);
      if (expansions.length === 0) {
        console.warn('[CM] Keine Expansion-IDs, fallback');
        await scrapePages(null, 'ALL', 1, 1, 'ALL');
      } else {
        for (let i = 0; i < expansions.length; i++) {
          if (window.__cmExportStop) break;
          const { id, name } = expansions[i];
          try {
            await scrapePages(id, `${i + 1}/${expansions.length} ${name}`, i + 1, expansions.length, name);
          } catch (e) {
            if (e.message === 'Abgebrochen') break;
            console.error(`[CM] Expansion ${id} (${name}) fehlgeschlagen:`, e);
            writeProgress({ lastErr: `${name}: ${e.message}` });
          }
          if (delay) await sleep(delay);
        }
      }
    } else {
      await scrapePages(null, 'ALL', 1, 1, 'ALL');
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

// Parse CSV (semicolon-separated, quoted)
function parseCsv(text) {
  text = text.replace(/^\uFEFF/, ''); // strip BOM
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (!lines.length) return { headers: [], rows: [] };
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
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const vals = parseLine(l);
    const obj = {};
    headers.forEach((h, i) => obj[h] = vals[i] || '');
    return obj;
  });
  return { headers, rows };
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
  updateLogEl.innerHTML = '';
  updatePreviewEl.innerHTML = '';
  btnUpdate.style.display = 'none';
  parsedUpdates = [];

  const file = fileCsv.files[0];
  if (!file) { ulog('Keine CSV ausgewählt', 'err'); return; }

  const text = await file.text();
  const { headers, rows } = parseCsv(text);
  ulog(`CSV gelesen: ${rows.length} Zeilen, ${headers.length} Spalten`);

  if (!headers.includes('ArticleID') || !headers.includes('Price_EUR')) {
    ulog('Fehler: CSV muss ArticleID + Price_EUR Spalten enthalten', 'err');
    return;
  }

  // Fetch current prices from Cardmarket to compare
  ulog('Lade aktuelle Preise von Cardmarket für Vergleich...');
  const tab = await getTargetTab();
  if (!tab || !/cardmarket\.com/.test(tab.url || '')) {
    ulog('Kein Cardmarket-Tab offen', 'err');
    return;
  }

  // Build updates: ArticleID + newPrice
  const maxPct = parseFloat(maxChangePctEl.value) || 200;
  const updates = [];
  let skipped = 0, invalid = 0;

  for (const r of rows) {
    const id = r.ArticleID?.trim();
    const newPrice = parsePrice(r.Price_EUR);
    if (!id || !/^\d+$/.test(id)) { invalid++; continue; }
    if (newPrice <= 0) { invalid++; continue; }
    updates.push({ articleId: id, name: r.Name || '', newPrice, oldPrice: null });
  }

  if (invalid > 0) ulog(`⚠ ${invalid} Zeilen ungültig (fehlende ID/Preis)`, 'err');

  // Fetch current prices in parallel batches
  const [{ result: currentPrices }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    args: [updates.map(u => u.articleId)],
    func: async (ids) => {
      const pathParts = location.pathname.split('/').filter(Boolean);
      const lang = pathParts[0] || 'de';
      const game = pathParts[1] || 'Pokemon';
      const out = {};
      const batch = 10;
      for (let i = 0; i < ids.length; i += batch) {
        const chunk = ids.slice(i, i + batch);
        const results = await Promise.all(chunk.map(async (id) => {
          try {
            const res = await fetch(`/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${id}`, { credentials: 'include' });
            if (!res.ok) return [id, null];
            const html = await res.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const form = doc.querySelector('form[id^="Edit"]');
            const priceInput = form?.querySelector('input[name="price"]');
            if (!priceInput) return [id, null];
            const v = priceInput.getAttribute('value') || priceInput.value || '';
            return [id, v];
          } catch { return [id, null]; }
        }));
        results.forEach(([id, v]) => out[id] = v);
        window.__cmUpdateProgress = { phase: 'fetch', done: i + chunk.length, total: ids.length };
      }
      return out;
    },
  });

  // Filter updates: skip unchanged + those exceeding max change
  const preview = [];
  for (const u of updates) {
    const oldStr = currentPrices[u.articleId];
    if (oldStr == null) { u.status = 'not found'; preview.push(u); continue; }
    u.oldPrice = parseFormPrice(oldStr);
    const diff = u.newPrice - u.oldPrice;
    const pct = u.oldPrice > 0 ? Math.abs(diff / u.oldPrice) * 100 : 999;
    if (Math.abs(diff) < 0.005) { u.status = 'unchanged'; skipped++; continue; }
    if (pct > maxPct) { u.status = `cap ${pct.toFixed(0)}%`; preview.push(u); continue; }
    u.status = 'ok';
    preview.push(u);
  }

  ulog(`${preview.length} Änderungen vorgemerkt, ${skipped} unverändert übersprungen`, 'ok');

  // Render preview
  const okUpdates = preview.filter(p => p.status === 'ok');
  const capped = preview.filter(p => p.status?.startsWith('cap'));
  const notFound = preview.filter(p => p.status === 'not found');

  let html = '<div class="diffTable"><table>';
  html += '<tr><td><b>Name</b></td><td><b>Alt</b></td><td><b>Neu</b></td><td><b>Δ</b></td></tr>';
  for (const u of preview.slice(0, 50)) {
    const cls = u.status === 'ok' ? (u.newPrice > u.oldPrice ? 'diffUp' : 'diffDown') : 'diffSame';
    const old = u.oldPrice != null ? fmtPrice(u.oldPrice) : '?';
    const delta = u.oldPrice != null ? (u.newPrice - u.oldPrice).toFixed(2).replace('.', ',') : '?';
    html += `<tr><td>${u.name.slice(0, 40)}</td><td>${old}</td><td class="${cls}">${fmtPrice(u.newPrice)}</td><td class="${cls}">${delta} [${u.status}]</td></tr>`;
  }
  if (preview.length > 50) html += `<tr><td colspan="4">... +${preview.length - 50} weitere</td></tr>`;
  html += '</table></div>';

  if (capped.length > 0) {
    html = `<div class="warn">⚠ ${capped.length} Artikel übersteigen Max-Änderung (${maxPct}%) — werden übersprungen. Cap erhöhen falls gewollt.</div>` + html;
  }
  if (notFound.length > 0) {
    html = `<div class="warn">⚠ ${notFound.length} ArticleIDs nicht gefunden auf Cardmarket (verkauft/gelöscht?)</div>` + html;
  }
  updatePreviewEl.innerHTML = html;

  parsedUpdates = okUpdates;
  updateCountEl.textContent = okUpdates.length;
  if (okUpdates.length > 0) btnUpdate.style.display = 'block';
});

btnAbortUpdate.addEventListener('click', async () => {
  try {
    const tab = await getTargetTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => { window.__cmUpdateStop = true; },
    });
    ulog('Abbruch angefordert', 'err');
  } catch (e) { ulog('Abort-Fehler: ' + e.message, 'err'); }
});

btnUpdate.addEventListener('click', async () => {
  if (parsedUpdates.length === 0) return;
  const isDry = dryRunEl.checked;
  const verify = verifyAfterEl.checked;
  const delay = parseInt(updateDelayEl.value, 10) || 250;

  if (!isDry) {
    const confirm1 = window.confirm(`⚠ ACHTUNG: ${parsedUpdates.length} Preise werden LIVE geändert auf Cardmarket.\n\nDas ist NICHT rückgängig machbar ohne erneutes Update.\n\nFortfahren?`);
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
      args: [{ updates: parsedUpdates, dryRun: isDry, delay, verify }],
      func: runBulkUpdate,
    });
    clearInterval(pollTimer);
    let result = scriptResult?.[0]?.result;
    if (!result) {
      // Try recover from window var (script context may have been destroyed)
      ulog('Script result null - probiere Recovery via window.__cmUpdateResult...', 'err');
      try {
        const [{ result: recovered }] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: 'MAIN',
          func: () => window.__cmUpdateResult || null,
        });
        if (recovered) {
          result = recovered;
          ulog('Recovery erfolgreich', 'ok');
        }
      } catch (e) {
        ulog('Recovery-Fehler: ' + e.message, 'err');
      }
      if (!result) {
        ulog('Kein Result. Tab evtl. navigiert weg. Cardmarket-Tab refreshen + retry.', 'err');
        return;
      }
    }

    updateProgFillEl.style.width = '100%';
    ulog(`${isDry ? 'DRY-RUN' : 'UPDATE'} fertig: ${result.ok || 0} OK, ${result.err || 0} Fehler`, 'ok');
    if (result.errors?.length) {
      ulog('Fehler-Details:', 'err');
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
  const { updates, dryRun, delay, verify } = args || {};
  if (!Array.isArray(updates)) return { ok: 0, err: 0, errors: [{ articleId: '?', msg: 'no updates passed' }], aborted: false };
  let ok = 0, err = 0;
  const errors = [];
  const total = updates.length;
  const pathParts = location.pathname.split('/').filter(Boolean);
  const lang = pathParts[0] || 'de';
  const game = pathParts[1] || 'Pokemon';

  const modalContainer = document.getElementById('modal');
  if (!modalContainer) {
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
    const form = doc.querySelector('form[id^="Edit"]');
    const priceInput = form?.querySelector('input[name="price"]');
    if (!priceInput) return null;
    const v = priceInput.getAttribute('value') || priceInput.value || '';
    return parseFloat(v.replace(',', '.')) || null;
  };

  const setStep = (step, articleId) => {
    window.__cmUpdateProgress = Object.assign({}, window.__cmUpdateProgress || {}, { step, currentArticleId: articleId, ts: Date.now() });
    console.log(`[CM-Update] [${articleId}] ${step}`);
  };

  // Helper: open Cardmarket edit modal natively, wait for shown.bs.modal, return form
  const openModalAndGetForm = async (articleId) => {
    // Clear stale modal content from previous iteration
    modalContainer.innerHTML = '';

    const url = `/${lang}/${game}/Modal/Article_EditArticleModal?showUserOffersRow=1&idArticle=${articleId}`;
    const trigger = document.createElement('a');
    trigger.href = '#';
    trigger.setAttribute('data-bs-toggle', 'modal');
    trigger.setAttribute('data-bs-target', '#modal');
    trigger.setAttribute('data-modal', url);
    trigger.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(trigger);

    // Listen for shown event OR for new form appearing in modal
    const formAppeared = new Promise(resolve => {
      const obs = new MutationObserver(() => {
        const f = modalContainer.querySelector('form[id^="Edit"]');
        if (f && f.querySelector('input[name="price"]')) {
          obs.disconnect();
          resolve(f);
        }
      });
      obs.observe(modalContainer, { childList: true, subtree: true });
      // Also resolve on shown event
      modalContainer.addEventListener('shown.bs.modal', () => {
        const f = modalContainer.querySelector('form[id^="Edit"]');
        if (f) { obs.disconnect(); resolve(f); }
      }, { once: true });
    });

    trigger.click();
    setStep('clicked-trigger', articleId);

    const form = await Promise.race([
      formAppeared,
      new Promise(r => setTimeout(() => r(null), 6000)),
    ]);
    setStep(form ? 'form-found' : 'form-timeout', articleId);

    trigger.remove();
    if (!form) {
      const modalContent = (modalContainer.innerHTML || '').slice(0, 300);
      console.warn('[CM-Update] Modal content sample:', modalContent);
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
    window.__cmUpdateProgress = { phase: dryRun ? 'dry-run' : 'updating', done: i, total, ok, err };

    try {
      setStep('start', u.articleId);
      // For dry-run, just verify modal opens + price input present, don't submit
      if (dryRun) {
        const form = await openModalAndGetForm(u.articleId);
        if (!form) throw new Error('modal did not load (dry-run check)');
        await closeModal();
        ok++;
        window.__cmUpdateProgress = { phase: 'dry-run', done: i + 1, total, ok, err };
        continue;
      }

      // Step 1: Open modal natively
      const form = await openModalAndGetForm(u.articleId);
      if (!form) throw new Error('modal did not load form within 5s');
      setStep('form-loaded', u.articleId);

      // Brief wait for Cardmarket JS to attach handlers after modal-shown
      await new Promise(r => setTimeout(r, 150));

      const priceInput = form.querySelector('input[name="price"]');
      const oldPriceVal = parseFloat((priceInput.value || '0').replace(',', '.')) || 0;
      const newPriceStr = u.newPrice.toFixed(2);

      // Step 2: Set new price (we're in MAIN world now, jQuery + handlers accessible)
      setStep('setting-price', u.articleId);
      priceInput.focus();
      priceInput.value = newPriceStr;
      priceInput.dispatchEvent(new Event('input', { bubbles: true }));
      priceInput.dispatchEvent(new Event('change', { bubbles: true }));
      priceInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // Step 3: Submit — try jQuery first (cardmarket uses it), fallback native click
      setStep('submitting', u.articleId);
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
      setStep('submitted-' + submitVia, u.articleId);
      console.log(`[CM-Update] [${u.articleId}] submit via: ${submitVia}`);

      // Step 4: Wait briefly for AJAX response (poll fetch log)
      setStep('waiting-ajax', u.articleId);
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
      setStep(gotResponse ? `ajax-${responseStatus}` : 'ajax-timeout', u.articleId);

      if (gotResponse && responseStatus && responseStatus < 400) {
        ok++;
        setStep('done-ok', u.articleId);
      } else if (verify) {
        await closeModal();
        setStep('verifying', u.articleId);
        const verifyHtml = await fetchModal(u.articleId);
        const actualPrice = parseCurrentPrice(verifyHtml);
        if (actualPrice == null) throw new Error('verify: cant parse price');
        if (Math.abs(actualPrice - u.newPrice) > 0.005) {
          throw new Error(`verify FAIL: still ${actualPrice} (wanted ${u.newPrice}, was ${oldPriceVal})`);
        }
        ok++;
        setStep('done-ok', u.articleId);
      } else {
        ok++;
        setStep('done-no-verify', u.articleId);
      }

      // Always close modal between iterations so next openModalAndGetForm can re-trigger
      await closeModal();
    } catch (e) {
      err++;
      errors.push({ articleId: u.articleId, msg: e.message });
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
