/* Ablaufsteuerung der App: Ansichten, Kamera, Erkennung, Zuordnung,
   Übersicht und Verlauf. */

import { $, el, euro, euroPlain, formatDate, quantityLabel, parseQuantity, toCents } from './util.js';
import { CATEGORIES } from './categories.js';
import { loadSettings, saveSettings, isConfigured, loadHistory, pushHistory, clearHistory, clearEverything, loadUsage, addUsage, clearUsage } from './store.js';
import { prepareImage } from './image.js';
import { scanReceipt, testConnection } from './scan.js';
import { PROVIDERS, provider, detectProvider } from './providers.js';
import { createBill, addScan, addReceipt, createItem, totals, printedTotal, groupByCategory, storeLabel, billDate } from './receipt.js';
import { buildSummary, renderPaper, buildText, fileName } from './summary.js';
import { renderSummaryImage } from './canvas.js';

/* ── Zustand ─────────────────────────────────────────────── */

let settings = loadSettings();
let bill = null;
let summary = null;
let summaryBlob = null;
let scanAbort = null;
let editing = null;      // id der Position, die gerade im Sheet liegt
let appendMode = false;  // true = Scan wird an die laufende Abrechnung angehängt

/* ── Ansichten & Rückmeldungen ───────────────────────────── */

function showView(name) {
  document.body.dataset.view = name;
  document.querySelector(`#view-${name} .scroll`)?.scrollTo(0, 0);
}

let toastTimer = null;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 2600);
}

/* ── Home ────────────────────────────────────────────────── */

function renderHome() {
  $('#setup-card').hidden = isConfigured(settings);

  const history = loadHistory();
  $('#history-section').hidden = history.length === 0;

  const list = $('#history-list');
  list.replaceChildren();

  for (const entry of history) {
    const sums = totals(entry);
    list.append(el('li', {},
      el('button', { class: 'history-item', onClick: () => openFromHistory(entry) },
        el('div', { class: 'history-body' },
          el('div', { class: 'history-store', text: storeLabel(entry) }),
          el('div', {
            class: 'history-meta',
            text: `${formatDate(billDate(entry), { short: true })} · ${sums.count} ${sums.count === 1 ? 'Position' : 'Positionen'}`,
          }),
        ),
        el('div', { class: 'history-amount', text: euro(sums.parents) }),
      ),
    ));
  }
}

function openFromHistory(entry) {
  bill = structuredClone(entry);
  appendMode = false;
  renderReview();
  showView('review');
}

/* ── Kamera & Erkennung ──────────────────────────────────── */

function requestPhoto(input) {
  if (!isConfigured(settings)) {
    toast('Erst die Erkennung einrichten.');
    openSettings();
    return;
  }
  input.value = '';
  input.click();
}

async function handleFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;

  document.body.classList.remove('scan-failed');
  $('#scan-error').hidden = true;
  $('#scan-step').textContent = 'Beleg wird vorbereitet …';
  $('#scan-substep').textContent = files.length > 1
    ? `${files.length} Aufnahmen werden zusammengeführt.`
    : 'Das Bild wird für die Erkennung geschärft.';
  showView('scan');

  scanAbort?.abort();
  scanAbort = new AbortController();
  const { signal } = scanAbort;

  try {
    const prepared = [];
    for (const file of files) prepared.push(await prepareImage(file));
    if (signal.aborted) return;

    $('#scan-preview').src = prepared[0].preview;
    $('#scan-step').textContent = 'Beleg wird gelesen …';
    $('#scan-substep').textContent = settings.resolveUncertain
      ? 'Positionen und Preise werden erkannt, unklare Zeilen danach nachgeschlagen.'
      : 'Positionen, Preise und Kategorien werden erkannt.';

    const parts = prepared.flatMap((item) => item.parts);
    const parsed = await scanReceipt(parts, settings, signal);
    if (signal.aborted) return;

    if (!appendMode || !bill) bill = createBill();
    const added = addScan(bill, parsed);
    appendMode = false;
    recordUsage(parsed.usage);

    renderReview();
    showView('review');

    if (parsed.notes) toast(parsed.notes);
    else if (added.length > 1) toast(`${added.length} Belege erkannt.`);
  } catch (error) {
    if (error.name === 'AbortError' || signal.aborted) return;
    showScanError(error);
  }
}

function showScanError(error) {
  document.body.classList.add('scan-failed');
  $('#scan-error').hidden = false;
  $('#scan-error-msg').textContent = error.message || 'Unbekannter Fehler.';
}

/* ── Review ──────────────────────────────────────────────── */

const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

function renderReview() {
  if (!bill) return;

  $('#review-store').textContent = storeLabel(bill);
  const sums = totals(bill);
  $('#review-meta').textContent = `${formatDate(billDate(bill), { short: true })} · ${sums.count} ${sums.count === 1 ? 'Position' : 'Positionen'}`;

  const list = $('#category-list');
  list.replaceChildren();

  for (const group of groupByCategory(bill.items)) {
    const items = el('div', { class: 'items' });
    for (const item of group.items) items.append(itemRow(item));

    list.append(el('div', { class: 'cat-group' },
      el('div', { class: 'cat-head' },
        el('span', { class: 'cat-dot', style: `background:${group.color}` }),
        el('span', { class: 'cat-name', text: group.label }),
        el('span', { class: 'cat-sum', text: euro(group.sum) }),
      ),
      items,
    ));
  }

  renderTally();
}

function itemRow(item) {
  const details = [
    quantityLabel(item.quantity, item.unit),
    item.unitPrice && item.quantity !== 1 ? `à ${euro(item.unitPrice)}` : '',
  ].filter(Boolean).join(' · ');

  return el('div', { class: `item${item.mine ? ' is-mine' : ''}${item.price < 0 ? ' is-negative' : ''}` },
    el('button', {
      class: 'item-mark',
      html: CHECK_ICON,
      'aria-label': item.mine ? `${item.name} den Eltern zuordnen` : `${item.name} als meins markieren`,
      'aria-pressed': String(item.mine),
      onClick: () => toggleMine(item.id),
    }),
    el('button', { class: 'item-open', onClick: () => openItemSheet(item.id) },
      el('div', { class: 'item-body' },
        el('div', { class: 'item-name', text: item.name }),
        details ? el('div', { class: 'item-sub', text: details }) : null,
      ),
      item.uncertain ? el('span', { class: 'item-flag', title: 'Schlecht lesbar — bitte prüfen' }) : null,
      el('div', { class: 'item-price', text: euro(item.price) }),
    ),
  );
}

function renderTally() {
  const sums = totals(bill);
  $('#tally-parents').textContent = euro(sums.parents);
  $('#tally-mine').textContent = euro(sums.mine);
  $('#tally-total').textContent = euro(sums.total);
  $('#btn-to-summary').disabled = sums.count === 0;

  const printed = printedTotal(bill);
  const warning = $('#sum-warning');
  if (printed === null || Math.abs(printed - sums.total) <= 2) {
    warning.hidden = true;
  } else {
    warning.hidden = false;
    const difference = sums.total - printed;
    $('#sum-warning-text').textContent =
      `Auf dem Beleg steht ${euro(printed)}, die Positionen ergeben ${euro(sums.total)} `
      + `(${difference > 0 ? '+' : '−'}${euroPlain(Math.abs(difference))} €). Bitte kurz prüfen.`;
  }
}

function toggleMine(id) {
  const item = bill.items.find((entry) => entry.id === id);
  if (!item) return;
  item.mine = !item.mine;
  renderReview();
}

function setAllMine(value) {
  for (const item of bill.items) item.mine = value;
  renderReview();
}

/* ── Position bearbeiten ─────────────────────────────────── */

function openItemSheet(id) {
  const item = id ? bill.items.find((entry) => entry.id === id) : null;
  editing = item ? item.id : null;

  $('#sheet-title').textContent = item ? 'Position bearbeiten' : 'Position hinzufügen';

  // Originalzeile zeigen, damit eine falsch gedeutete Position
  // gegengeprüft werden kann.
  const raw = item?.raw && item.raw !== item.name ? item.raw : '';
  const query = item?.query || raw;
  $('#item-raw').hidden = !raw;
  $('#item-raw-text').textContent = raw;

  const lookup = $('#item-lookup');
  lookup.hidden = !query;
  if (query) lookup.href = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

  $('#item-name').value  = item ? item.name : '';
  $('#item-qty').value   = item ? String(item.quantity).replace('.', ',') : '1';
  $('#item-price').value = item ? euroPlain(item.price) : '';
  $('#item-cat').value   = item ? item.category : 'sonstiges';
  $('#item-mine').checked = item ? item.mine : false;
  $('#btn-item-delete').hidden = !item;

  $('#sheet-backdrop').hidden = false;
  setTimeout(() => $('#item-name').focus(), 60);
}

function closeItemSheet() {
  $('#sheet-backdrop').hidden = true;
  editing = null;
}

function saveItemSheet() {
  const name = $('#item-name').value.trim();
  if (!name) { toast('Bitte eine Bezeichnung eintragen.'); return; }

  const patch = {
    name,
    quantity: parseQuantity($('#item-qty').value),
    price: toCents($('#item-price').value),
    category: $('#item-cat').value,
    mine: $('#item-mine').checked,
  };

  const existing = editing && bill.items.find((entry) => entry.id === editing);
  if (existing) Object.assign(existing, patch, { uncertain: false });
  else bill.items.push(createItem({ ...patch, receiptId: bill.receipts[0]?.id ?? null }));

  closeItemSheet();
  renderReview();
}

function deleteItem() {
  bill.items = bill.items.filter((entry) => entry.id !== editing);
  closeItemSheet();
  renderReview();
}

/* ── Übersicht ───────────────────────────────────────────── */

function openSummary() {
  summary = buildSummary(bill, settings);
  summaryBlob = null;
  renderPaper($('#paper'), summary);
  pushHistory(structuredClone(bill));
  renderHome();
  showView('summary');
}

async function summaryImage() {
  if (!summaryBlob) summaryBlob = await renderSummaryImage(summary);
  return summaryBlob;
}

async function shareSummary() {
  try {
    const blob = await summaryImage();
    const file = new File([blob], fileName(summary), { type: 'image/png' });
    const payload = {
      files: [file],
      title: summary.title,
      text: buildText(summary),
    };

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share(payload);
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: payload.title, text: payload.text });
      return;
    }
    downloadBlob(blob, fileName(summary));
    toast('Teilen geht hier nicht — Bild wurde gespeichert.');
  } catch (error) {
    if (error.name === 'AbortError') return;
    toast(error.message || 'Teilen hat nicht geklappt.');
  }
}

async function downloadSummary() {
  try {
    downloadBlob(await summaryImage(), fileName(summary));
    toast('Bild gespeichert.');
  } catch (error) {
    toast(error.message || 'Speichern hat nicht geklappt.');
  }
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function copySummary() {
  const text = buildText(summary);
  try {
    await navigator.clipboard.writeText(text);
    toast('Text kopiert.');
  } catch {
    // Ältere Browser ohne Clipboard-API
    const area = el('textarea', { style: 'position:fixed;opacity:0' });
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    toast('Text kopiert.');
  }
}

/* ── Einstellungen ───────────────────────────────────────── */

function openSettings() {
  $('#set-provider').value = settings.provider;
  applyProvider();

  $('#set-mode').value  = settings.mode;
  $('#set-key').value   = currentKey();
  $('#set-proxy').value = settings.proxyUrl;
  $('#set-model').value = settings.model;
  $('#set-helper').value = settings.helperModel;
  $('#set-resolve').checked = settings.resolveUncertain;
  $('#set-from').value  = settings.fromName;
  $('#set-to').value    = settings.toName;
  $('#set-pay').value   = settings.payTo;
  $('#set-show-mine').checked = settings.showMine;
  applyMode();
  hideTestResult();
  renderUsage();
  showView('settings');
}

function recordUsage(usage) {
  if (!usage) return;
  addUsage(usage);
  renderUsage();
}

function renderUsage() {
  const usage = loadUsage();
  const card = $('#usage-card');
  card.hidden = usage.scans === 0;
  if (!usage.scans) return;

  const cents = usage.cents;
  $('#usage-amount').textContent = cents < 100
    ? `${cents.toFixed(cents < 10 ? 1 : 0).replace('.', ',')} Cent`
    : euro(Math.round(cents));

  const average = cents / usage.scans;
  $('#usage-note').textContent =
    `für ${usage.scans} ${usage.scans === 1 ? 'Erkennung' : 'Erkennungen'} seit ${formatDate(new Date(usage.since).toISOString().slice(0, 10), { short: true })}`
    + ` · im Schnitt ${average.toFixed(1).replace('.', ',')} Cent pro Beleg`;
}

function applyMode() {
  const mode = $('#set-mode').value;
  document.body.dataset.mode = mode;
  $('#mode-hint').textContent = mode === 'proxy'
    ? 'Der Key bleibt auf Deinem Server. Empfehlenswert, wenn die App öffentlich erreichbar ist.'
    : 'Schnellster Weg. Der Key bleibt auf diesem Gerät — nutze ihn nur auf einem Handy, das nur Du benutzt.';
}

const currentKey = () => (settings.provider === 'anthropic' ? settings.apiKey : settings.openrouterKey);

/** Beschriftungen und Modell-Listen auf den gewählten Anbieter umstellen. */
function applyProvider() {
  const api = provider($('#set-provider').value);

  $('#key-label').textContent = api.keyLabel;
  $('#key-hint').textContent  = api.keyHint;
  $('#set-key').placeholder   = api.keyPlaceholder;
  $('#provider-hint').textContent = api.id === 'openrouter'
    ? 'Ein Zugang, viele Modelle — darunter kostenlose. Abgerechnet wird, was das gewählte Modell kostet.'
    : 'Direkt bei Anthropic. Kein kostenloses Kontingent, dafür sehr zuverlässig bei schwierigen Bons.';

  for (const [select, chosen] of [['#set-model', settings.model], ['#set-helper', settings.helperModel]]) {
    const node = $(select);
    node.replaceChildren();
    for (const entry of api.models) {
      node.append(el('option', { value: entry.id, text: entry.note ? `${entry.label} — ${entry.note}` : entry.label }));
    }
    // Ein von Hand eingetragenes Modell aus früheren Einstellungen behalten.
    if (chosen && !api.models.some((m) => m.id === chosen)) {
      node.append(el('option', { value: chosen, text: `${chosen} (eigene Angabe)` }));
    }
    node.value = chosen && [...node.options].some((o) => o.value === chosen) ? chosen : api.defaultModel;
  }

  $('#helper-field').hidden = !$('#set-resolve').checked;
}

function hideTestResult() {
  $('#test-result').hidden = true;
  $('#test-result').className = 'test-result';
}

let testAbort = null;
async function runConnectionTest() {
  const button = $('#btn-test');
  const result = $('#test-result');

  if (!isConfigured(settings)) {
    result.hidden = false;
    result.className = 'test-result fail';
    result.textContent = 'Erst einen API-Key eintragen.';
    return;
  }

  testAbort?.abort();
  testAbort = new AbortController();

  button.disabled = true;
  button.textContent = 'Wird geprüft …';
  result.hidden = false;
  result.className = 'test-result';
  result.textContent = `Frage ${$('#set-model').selectedOptions[0]?.textContent || settings.model} an …`;

  try {
    await testConnection(settings, testAbort.signal);
    result.className = 'test-result ok';
    result.textContent = 'Alles bereit — Schlüssel und Modell antworten. Du kannst scannen.';
  } catch (error) {
    if (error.name === 'AbortError') return;
    result.className = 'test-result fail';
    result.textContent = error.message || 'Der Test ist fehlgeschlagen.';
  } finally {
    button.disabled = false;
    button.textContent = 'Verbindung testen';
  }
}

function readSettingsForm() {
  const chosenProvider = $('#set-provider').value;
  const key = $('#set-key').value.trim();

  settings = saveSettings({
    provider: chosenProvider,
    mode:     $('#set-mode').value,
    // Schlüssel je Anbieter getrennt halten, damit Umschalten nichts verliert.
    apiKey:        chosenProvider === 'anthropic'  ? key : settings.apiKey,
    openrouterKey: chosenProvider === 'openrouter' ? key : settings.openrouterKey,
    proxyUrl: $('#set-proxy').value.trim(),
    model:       $('#set-model').value,
    helperModel: $('#set-helper').value,
    resolveUncertain: $('#set-resolve').checked,
    fromName: $('#set-from').value,
    toName:   $('#set-to').value,
    payTo:    $('#set-pay').value,
    showMine: $('#set-show-mine').checked,
  });
  applyMode();
  $('#helper-field').hidden = !settings.resolveUncertain;
}

/** Anbieterwechsel: Liste und Schlüsselfeld neu aufbauen. */
function switchProvider() {
  settings = saveSettings({ provider: $('#set-provider').value });
  const api = provider(settings.provider);
  if (!api.models.some((m) => m.id === settings.model)) {
    settings = saveSettings({ model: api.defaultModel, helperModel: api.defaultModel });
  }
  applyProvider();
  $('#set-key').value = currentKey();
  hideTestResult();
  readSettingsForm();
}

/* Am Präfix des Schlüssels lässt sich der Anbieter eindeutig ablesen.
   Wer einen OpenRouter-Key einfügt, meint OpenRouter — dann stellt die
   App Anbieter und Modell selbst um, statt es zu verlangen. */
function adoptKey() {
  const key = $('#set-key').value.trim();
  const detected = detectProvider(key);
  if (!detected || detected === settings.provider) return false;

  const api = provider(detected);
  settings = saveSettings({
    provider: detected,
    [detected === 'anthropic' ? 'apiKey' : 'openrouterKey']: key,
    model: api.defaultModel,
    helperModel: api.defaultModel,
  });

  $('#set-provider').value = detected;
  applyProvider();
  hideTestResult();
  toast(`Auf ${api.label} umgestellt.`);
  return true;
}

/* ── Verdrahtung ─────────────────────────────────────────── */

function wire() {
  // Home
  $('#btn-capture').addEventListener('click', () => { appendMode = false; requestPhoto($('#file-camera')); });
  $('#btn-pick').addEventListener('click',    () => { appendMode = false; requestPhoto($('#file-gallery')); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-setup').addEventListener('click', openSettings);
  $('#btn-clear-history').addEventListener('click', () => {
    if (!confirm('Alle gespeicherten Abrechnungen löschen?')) return;
    clearHistory();
    renderHome();
  });

  for (const id of ['#file-camera', '#file-gallery']) {
    $(id).addEventListener('change', (event) => handleFiles(event.target.files));
  }

  // Scan
  $('#btn-scan-retry').addEventListener('click', () => requestPhoto($('#file-camera')));
  $('#btn-scan-back').addEventListener('click', () => { scanAbort?.abort(); showView(bill ? 'review' : 'home'); });
  $('#btn-scan-manual').addEventListener('click', () => {
    if (!appendMode || !bill) bill = createBill();
    if (!bill.receipts.length) addReceipt(bill, { store: 'Einkauf', items: [], receipt_total: null });
    appendMode = false;
    renderReview();
    showView('review');
    openItemSheet(null);
  });

  // Review
  $('#btn-review-back').addEventListener('click', () => { showView('home'); renderHome(); });
  $('#btn-add-receipt').addEventListener('click', () => { appendMode = true; requestPhoto($('#file-camera')); });
  $('#btn-all-mine').addEventListener('click', () => setAllMine(true));
  $('#btn-all-parents').addEventListener('click', () => setAllMine(false));
  $('#btn-add-item').addEventListener('click', () => openItemSheet(null));
  $('#btn-to-summary').addEventListener('click', openSummary);

  // Sheet
  $('#btn-item-cancel').addEventListener('click', closeItemSheet);
  $('#btn-item-save').addEventListener('click', saveItemSheet);
  $('#btn-item-delete').addEventListener('click', deleteItem);
  $('#sheet-backdrop').addEventListener('click', (event) => {
    if (event.target === $('#sheet-backdrop')) closeItemSheet();
  });

  // Übersicht
  $('#btn-summary-back').addEventListener('click', () => showView('review'));
  $('#btn-share').addEventListener('click', shareSummary);
  $('#btn-copy').addEventListener('click', copySummary);
  $('#btn-download').addEventListener('click', downloadSummary);

  // Einstellungen
  $('#btn-settings-back').addEventListener('click', () => { showView('home'); renderHome(); });
  $('#set-provider').addEventListener('change', switchProvider);
  $('#btn-test').addEventListener('click', runConnectionTest);
  $('#settings-form').addEventListener('input', (event) => {
    // Erkennt der Schlüssel seinen Anbieter selbst, ist das Formular
    // danach schon gespeichert — sonst normal übernehmen.
    if (event.target.id === 'set-key' && adoptKey()) return;
    if (event.target.id === 'set-key') hideTestResult();
    readSettingsForm();
  });
  $('#settings-form').addEventListener('change', (event) => {
    if (event.target.id === 'set-provider') return;   // switchProvider hat schon gespeichert
    if (event.target.id === 'set-model') hideTestResult();
    readSettingsForm();
  });
  $('#settings-form').addEventListener('submit', (event) => event.preventDefault());
  $('#btn-reset-usage').addEventListener('click', () => { clearUsage(); renderUsage(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Einstellungen und alle Abrechnungen von diesem Gerät löschen?')) return;
    clearEverything();
    location.reload();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !$('#sheet-backdrop').hidden) closeItemSheet();
  });
}

function fillCategorySelect() {
  const select = $('#item-cat');
  select.replaceChildren();
  for (const entry of CATEGORIES) select.append(el('option', { value: entry.id, text: entry.label }));
}

function fillProviderSelect() {
  const select = $('#set-provider');
  select.replaceChildren();
  for (const api of Object.values(PROVIDERS)) select.append(el('option', { value: api.id, text: api.label }));
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline-Betrieb ist optional */ });
}

fillCategorySelect();
fillProviderSelect();
wire();
$('#set-provider').value = settings.provider;
$('#set-resolve').checked = settings.resolveUncertain;
applyProvider();
$('#set-mode').value = settings.mode;
applyMode();
renderHome();
registerServiceWorker();
