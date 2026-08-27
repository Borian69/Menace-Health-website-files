/* Ablaufsteuerung der App: Ansichten, Kamera, Erkennung, Zuordnung,
   Übersicht und Verlauf. */

import { $, el, euro, euroPlain, formatDate, quantityLabel, parseQuantity, toCents, todayISO } from './util.js';
import { CATEGORIES } from './categories.js';
import { loadSettings, saveSettings, isConfigured, loadHistory, pushHistory, clearHistory, clearEverything, loadUsage, addUsage, clearUsage, loadOpenBill, saveOpenBill, clearOpenBill } from './store.js';
import { prepareImage } from './image.js';
import { scanReceipt, testConnection } from './scan.js';
import { PROVIDERS, provider, detectProvider } from './providers.js';
import { createBill, addScan, addReceipt, createItem, totals, printedTotal, groupByCategory, storeLabel, billDate } from './receipt.js';
import { buildSummary, renderPaper, buildText, fileName } from './summary.js';
import { renderSummaryImage } from './canvas.js';
import { configure as configureFeedback, unlock, cue, countTo, pop, celebrate, audioStatus, canPickOutput, pickOutput } from './feedback.js';
import * as camera from './camera.js';

/* ── Zustand ─────────────────────────────────────────────── */

let settings = loadSettings();
let bill = loadOpenBill();   // die laufende Abrechnung, überlebt das Schließen der App
let summary = null;
let summaryBlob = null;
let scanAbort = null;
let editing = null;          // id der Position, die gerade im Sheet liegt

/* Jede Änderung sofort sichern. Eine laufende Abrechnung landet in
   ihrem eigenen Fach, eine bereits abgeschlossene aktualisiert ihren
   Eintrag im Verlauf. */
function persist() {
  if (!bill) return;
  if (bill.done) pushHistory(structuredClone(bill));
  else saveOpenBill(bill);
}

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
  renderOpenBill();

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

/** Die laufende Abrechnung als Karte über dem Verlauf. */
function renderOpenBill() {
  const card = $('#open-bill');
  const running = bill && !bill.done ? bill : null;
  card.hidden = !running || running.items.length === 0;
  if (card.hidden) {
    $('#hero-hint').textContent = 'Kamera öffnen und den Kassenbon abfotografieren. Mehrere Bons dürfen nebeneinander liegen.';
    return;
  }

  const sums = totals(running);
  const date = billDate(running);
  const isToday = date === todayISO();

  $('#open-label').textContent = isToday ? 'Heute' : formatDate(date);
  $('#open-meta').textContent =
    `${running.receipts.length} ${running.receipts.length === 1 ? 'Beleg' : 'Belege'} · `
    + `${sums.count} ${sums.count === 1 ? 'Position' : 'Positionen'}`;
  countTo($('#open-amount'), sums.parents, euro);

  const stores = $('#open-stores');
  stores.replaceChildren();
  for (const receipt of running.receipts) {
    stores.append(el('span', {
      class: 'open-store',
      text: receipt.time ? `${receipt.store} · ${receipt.time}` : receipt.store,
    }));
  }

  $('#hero-hint').textContent = 'Nächsten Beleg fotografieren — er wird an die laufende Abrechnung angehängt.';
}

function openFromHistory(entry) {
  bill = { ...structuredClone(entry), done: true };
  renderReview();
  showView('review');
}

/* ── Kamera & Erkennung ──────────────────────────────────── */

function requestPhoto(input) {
  unlock();                       // echte Geste — hier darf der Ton aufgehen
  if (!isConfigured(settings)) {
    toast('Erst die Erkennung einrichten.');
    openSettings();
    return;
  }
  input.value = '';
  input.click();
}

/* Die App-eigene Kamera. `capture="environment"` am Datei-Feld ist für
   den Browser nur ein Vorschlag — viele Android-Browser nehmen trotzdem
   die Frontkamera. Über getUserMedia lässt sich die Rückkamera
   verbindlich anfordern. Klappt das nicht, bleibt das Datei-Feld. */
async function openCamera() {
  unlock();
  if (!isConfigured(settings)) {
    toast('Erst die Erkennung einrichten.');
    openSettings();
    return;
  }
  if (!camera.supported()) { requestPhoto($('#file-camera')); return; }

  showView('camera');
  try {
    await camera.start($('#cam-video'));
  } catch (error) {
    await camera.stop();
    showView('home');
    toast(error.message);
    requestPhoto($('#file-camera'));   // Notweg über die System-Kamera
    return;
  }

  const torch = $('#btn-cam-torch');
  torch.hidden = !camera.hasTorch();
  torch.classList.remove('on');
  $('#btn-cam-shoot').disabled = false;

  const { width, height } = camera.resolution();
  $('#cam-hint').textContent = Math.max(width, height) < 1600
    ? `Achtung: Die Kamera liefert nur ${width}×${height}. Für Kassenschrift ist das knapp — näher rangehen.`
    : 'Bon ganz ins Bild, von oben fotografieren. Antippen stellt scharf.';
}

async function closeCamera(view = 'home') {
  await camera.stop();
  showView(view);
  if (view === 'home') renderHome();
}

async function shootPhoto() {
  const button = $('#btn-cam-shoot');
  button.disabled = true;
  try {
    // Erst scharfstellen, dann auslösen — sonst landet gern das Bild
    // vor dem Fokus auf dem Weg zur Erkennung.
    if (await camera.focusAt(0.5, 0.5)) await new Promise((r) => setTimeout(r, 420));

    const file = await camera.shoot($('#cam-video'));
    flash();
    cue.shutter();
    await camera.stop();
    handleFiles([file]);
  } catch (error) {
    button.disabled = false;
    toast(error.message || 'Die Aufnahme hat nicht geklappt.');
  }
}

/** Kurzes Aufblitzen wie beim Auslösen einer Kamera. */
function flash() {
  const node = $('#cam-flash');
  node.classList.remove('run');
  void node.offsetWidth;
  node.classList.add('run');
}

/** Antippen der Vorschau stellt auf diesen Punkt scharf. */
async function focusTap(event) {
  const stage = $('#cam-stage');
  const box = stage.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width;
  const y = (event.clientY - box.top) / box.height;

  const ring = $('#cam-focus');
  ring.style.left = `${event.clientX - box.left}px`;
  ring.style.top = `${event.clientY - box.top}px`;
  ring.classList.remove('run');
  void ring.offsetWidth;
  ring.classList.add('run');

  await camera.focusAt(x, y);
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Das aufgenommene Bild wandert sichtbar zu den anderen in die Ablage.
 * Die Strecke wird gemessen und nicht geraten, damit die Bewegung auf
 * jedem Bildschirm genau im Ordner endet.
 * @returns {Promise<void>} erfüllt, wenn das Bild abgelegt ist
 */
function fileIntoFolder() {
  const frame = $('#scan-frame');
  const folder = $('#scan-folder');
  // Der Zähler springt erst hoch, wenn der Beleg ankommt.
  const arrive = () => {
    $('#folder-count').textContent = String(bill.receipts.length);
    pop(folder, 'bump');
  };

  if (reduceMotion()) {
    document.body.classList.add('filing');
    arrive();
    cue.filed();
    return new Promise((resolve) => setTimeout(resolve, 260));
  }

  const from = frame.getBoundingClientRect();
  const to = folder.getBoundingClientRect();
  frame.style.setProperty('--dx', `${(to.left + to.width / 2) - (from.left + from.width / 2)}px`);
  // Zielpunkt ist das Ordnerblatt, nicht die Mitte samt Zähler darunter.
  frame.style.setProperty('--dy', `${(to.top + 26) - (from.top + from.height / 2)}px`);

  document.body.classList.add('filing');
  setTimeout(() => cue.filed(), 260);
  setTimeout(arrive, 470);

  return new Promise((resolve) => setTimeout(resolve, 720));
}

async function handleFiles(fileList) {
  const files = [...fileList].filter((file) => file.type.startsWith('image/'));
  if (!files.length) return;

  document.body.classList.remove('scan-failed', 'filing');
  $('#scan-folder').classList.remove('bump');
  // Stand der Ablage vor diesem Beleg — er zählt gleich sichtbar hoch.
  $('#folder-count').textContent = String(bill && !bill.done ? bill.receipts.length : 0);
  $('#scan-error').hidden = true;
  $('#scan-step').textContent = 'Beleg wird vorbereitet …';
  $('#scan-substep').textContent = files.length > 1
    ? `${files.length} Aufnahmen werden zusammengeführt.`
    : 'Das Bild wird für die Erkennung geschärft.';
  showView('scan');
  pop($('#scan-frame'), 'pull');      // das Bild wird hervorgezogen

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

    if (!bill || bill.done) bill = createBill();
    const added = addScan(bill, parsed);
    persist();
    recordUsage(parsed.usage);

    // Erst wandert der Beleg zu den anderen in die Ablage, dann kommt
    // der Aufschlag mit dem Betrag — Anlauf und Auflösung nacheinander.
    const sums = totals(bill);
    await fileIntoFolder();
    await celebrate({
      label: added.length > 1 ? `${added.length} Belege erfasst` : `${added[0]?.store || 'Beleg'} erfasst`,
      amount: euro(sums.parents),
    });

    renderReview();
    showView('review');

    if (parsed.usage?.switchedTo) toast(`Ausgewichen auf ${modelLabel(parsed.usage.switchedTo)} — das gewählte Modell war nicht verfügbar.`);
    else if (parsed.notes) toast(parsed.notes);
    else if (bill.receipts.length > 1) toast(`${bill.receipts.length} Belege in dieser Abrechnung.`);
  } catch (error) {
    if (error.name === 'AbortError' || signal.aborted) return;
    showScanError(error);
  }
}

/** Lesbarer Name eines Modells, sonst die nackte Kennung. */
function modelLabel(id) {
  const entry = provider(settings.provider).models.find((model) => model.id === id);
  return entry ? entry.label.split(' · ')[0] : id;
}

// Statuscodes, bei denen ein anderes Modell die naheliegende Abhilfe ist.
const MODEL_TROUBLE = new Set([402, 404, 429, 502, 503, 504]);

function showScanError(error) {
  cue.error();
  document.body.classList.add('scan-failed');
  $('#scan-error').hidden = false;
  $('#scan-error-msg').textContent = error.message || 'Unbekannter Fehler.';
  $('#btn-scan-model').hidden = !MODEL_TROUBLE.has(error.status);
}

/* ── Review ──────────────────────────────────────────────── */

const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>';

function renderReview() {
  if (!bill) return;

  $('#review-store').textContent = storeLabel(bill);
  const sums = totals(bill);
  $('#review-meta').textContent = [
    formatDate(billDate(bill), { short: true }),
    bill.receipts.length > 1 ? `${bill.receipts.length} Belege` : null,
    `${sums.count} ${sums.count === 1 ? 'Position' : 'Positionen'}`,
  ].filter(Boolean).join(' · ');

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
  // Bei mehreren Belegen muss erkennbar bleiben, wo die Position herkommt.
  const source = bill.receipts.length > 1
    ? (bill.receipts.find((receipt) => receipt.id === item.receiptId)?.store || '')
    : '';

  const details = [
    source,
    quantityLabel(item.quantity, item.unit),
    item.unitPrice && item.quantity !== 1 ? `à ${euro(item.unitPrice)}` : '',
  ].filter(Boolean).join(' · ');

  return el('div', {
    class: `item${item.mine ? ' is-mine' : ''}${item.price < 0 ? ' is-negative' : ''}`,
    'data-item': item.id,
  },
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
  countTo($('#tally-parents'), sums.parents, euro);
  $('#tally-mine').textContent = euro(sums.mine);
  $('#tally-total').textContent = euro(sums.total);
  $('#btn-to-summary').disabled = sums.count === 0;
  $('#btn-to-summary').textContent = bill.receipts.length > 1 ? 'Abrechnung erstellen' : 'Übersicht erstellen';

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
  cue.tick();
  persist();
  renderReview();
  pop(document.querySelector(`[data-item="${id}"] .item-mark`));
}

function setAllMine(value) {
  for (const item of bill.items) item.mine = value;
  persist();
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

  persist();
  closeItemSheet();
  renderReview();
}

function deleteItem() {
  bill.items = bill.items.filter((entry) => entry.id !== editing);
  persist();
  closeItemSheet();
  renderReview();
}

/* ── Übersicht ───────────────────────────────────────────── */

function openSummary() {
  summary = buildSummary(bill, settings);
  summaryBlob = null;
  renderPaper($('#paper'), summary);
  $('#btn-finish').hidden = Boolean(bill.done);
  showView('summary');
}

/** Abrechnung abschließen: ab in den Verlauf, das Fach wird frei. */
function finishBill() {
  if (!bill || bill.done) return;
  bill.done = true;
  bill.finishedAt = Date.now();
  const final = summary ? summary.parents : totals(bill).parents;
  pushHistory(structuredClone(bill));
  clearOpenBill();
  bill = null;
  summary = null;
  renderHome();
  showView('home');
  celebrate({ label: 'Abrechnung abgeschlossen', amount: euro(final), tone: 'done' });
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
  $('#set-fallback').value = settings.fallbackModel;
  $('#set-resolve').checked = settings.resolveUncertain;
  $('#set-sounds').checked = settings.sounds !== false;
  $('#set-haptics').checked = settings.haptics !== false;
  $('#set-volume').value = Math.round((settings.volume ?? 0.7) * 100);
  $('#volume-value').textContent = `${$('#set-volume').value} %`;
  $('#output-field').hidden = !canPickOutput();
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

  for (const [select, chosen] of [
    ['#set-model', settings.model],
    ['#set-helper', settings.helperModel],
    ['#set-fallback', settings.fallbackModel],
  ]) {
    const node = $(select);
    node.replaceChildren();
    if (select === '#set-fallback') node.append(el('option', { value: '', text: 'Keins — Fehler stattdessen anzeigen' }));
    for (const entry of api.models) {
      node.append(el('option', { value: entry.id, text: entry.note ? `${entry.label} — ${entry.note}` : entry.label }));
    }
    // Ein von Hand eingetragenes Modell aus früheren Einstellungen behalten.
    if (chosen && !api.models.some((m) => m.id === chosen)) {
      node.append(el('option', { value: chosen, text: `${chosen} (eigene Angabe)` }));
    }
    node.value = [...node.options].some((o) => o.value === chosen)
      ? chosen
      : (select === '#set-fallback' ? '' : api.defaultModel);
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
    fallbackModel: $('#set-fallback').value,
    resolveUncertain: $('#set-resolve').checked,
    sounds:  $('#set-sounds').checked,
    haptics: $('#set-haptics').checked,
    volume:  Number($('#set-volume').value) / 100,
    fromName: $('#set-from').value,
    toName:   $('#set-to').value,
    payTo:    $('#set-pay').value,
    showMine: $('#set-show-mine').checked,
  });
  applyMode();
  configureFeedback(settings);
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
  $('#btn-capture').addEventListener('click', openCamera);
  $('#btn-pick').addEventListener('click',    () => requestPhoto($('#file-gallery')));

  // Kamera-Ansicht
  $('#btn-cam-shoot').addEventListener('click', shootPhoto);
  $('#cam-stage').addEventListener('click', focusTap);
  $('#btn-cam-close').addEventListener('click', () => closeCamera('home'));
  $('#btn-cam-flip').addEventListener('click', async () => {
    try {
      await camera.flip($('#cam-video'));
      $('#btn-cam-torch').hidden = !camera.hasTorch();
      $('#btn-cam-torch').classList.remove('on');
      $('#cam-hint').textContent = camera.facingNow() === 'environment'
        ? 'Bon ganz ins Bild, von oben fotografieren.'
        : 'Frontkamera — für Belege ist die Rückkamera schärfer.';
    } catch (error) {
      toast(error.message);
    }
  });
  $('#btn-cam-torch').addEventListener('click', async () => {
    const on = !$('#btn-cam-torch').classList.contains('on');
    if (await camera.setTorch(on)) $('#btn-cam-torch').classList.toggle('on', on);
  });
  $('#btn-open-review').addEventListener('click', () => { renderReview(); showView('review'); });
  $('#btn-open-finish').addEventListener('click', openSummary);
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
  $('#btn-scan-retry').addEventListener('click', openCamera);
  $('#btn-scan-model').addEventListener('click', openSettings);
  $('#btn-scan-back').addEventListener('click', () => { scanAbort?.abort(); showView(bill ? 'review' : 'home'); });
  $('#btn-scan-manual').addEventListener('click', () => {
    if (!bill || bill.done) bill = createBill();
    if (!bill.receipts.length) addReceipt(bill, { store: 'Einkauf', items: [], receipt_total: null });
    persist();
    renderReview();
    showView('review');
    openItemSheet(null);
  });

  // Review
  $('#btn-review-back').addEventListener('click', () => { persist(); showView('home'); renderHome(); });
  $('#btn-add-receipt').addEventListener('click', openCamera);
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
  $('#btn-summary-back').addEventListener('click', () => { renderReview(); showView('review'); });
  $('#btn-share').addEventListener('click', shareSummary);
  $('#btn-finish').addEventListener('click', finishBill);
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
  $('#set-volume').addEventListener('input', () => {
    $('#volume-value').textContent = `${$('#set-volume').value} %`;
  });
  $('#btn-pick-output').addEventListener('click', async () => {
    unlock();
    const node = $('#output-hint');
    try {
      node.textContent = `Ausgabe: ${await pickOutput()}`;
    } catch (error) {
      node.textContent = error.message;
    }
  });
  $('#btn-try-sound').addEventListener('click', async () => {
    unlock();
    await celebrate({ label: 'So klingt es', amount: euro(1799) });
    const status = audioStatus();
    const node = $('#sound-status');
    node.hidden = false;
    node.className = `test-result ${status.ok ? 'ok' : 'fail'}`;
    node.textContent = status.text;
  });
  $('#btn-reset-usage').addEventListener('click', () => { clearUsage(); renderUsage(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('Einstellungen und alle Abrechnungen von diesem Gerät löschen?')) return;
    clearEverything();
    location.reload();
  });

  // Browser lassen Ton erst nach einer echten Geste zu.
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('touchstart', unlock, { once: true });

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

configureFeedback(settings);
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
