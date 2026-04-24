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
  const cols = ['ArticleID', 'Name', 'ExpansionCode', 'Expansion', 'Rarity', 'Language', 'Condition', 'ConditionFull', 'Comments', 'Price_EUR', 'Amount', 'Total_EUR', 'ProductUrl'];
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [cols.join(';')];
  for (const r of rows) {
    const priceNum = parseFloat((r.price || '').replace(/\./g, '').replace(',', '.')) || 0;
    const amtStr = r.amountDisplay || r.amount || '';
    const amt = parseInt(amtStr, 10) || 0;
    const total = (priceNum * amt).toFixed(2).replace('.', ',');
    lines.push([
      r.articleId, r.name, r.expansionCode, r.expansion, r.rarity, r.language, r.condition, r.conditionFull,
      r.comments, r.price, amtStr, total, r.productUrl,
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
