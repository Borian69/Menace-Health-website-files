/* Chat mit DeepSeek über OpenRouter.

   Alles läuft im Browser: Die Chats und der API-Key liegen im
   localStorage, die Anfrage geht direkt an OpenRouter (die API erlaubt
   Aufrufe aus dem Browser). Kein Server, kein Build.

   Bewusst klassische Skripte und keine ES-Module: So läuft die Seite
   auch, wenn man index.html einfach per Doppelklick öffnet — Module
   lädt der Browser von file:// nicht.

   Bewegung kommt aus design/4.0/moch-motion.js (window.Moch). Fehlt
   die Datei, läuft die App ohne Bewegung weiter. */

'use strict';

const M = window.Moch || null;

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash';

const STORE = {
  settings: 'chat.settings',
  chats: 'chat.chats',
  active: 'chat.active',
};

/* Wie sich das Modell verhalten soll. In den Einstellungen änderbar;
   solange dort nichts Eigenes steht, gilt diese Fassung. */
const DEFAULT_SYSTEM = `Ton: Pass dich mir an. Ist meine Frage locker, antworte locker und umgangssprachlich, wie unter Freunden. Ist sie sachlich oder ernst, antworte klar und sachlich. Bleib dabei immer hilfreich.

Ehrlichkeit: Sei ehrlich und direkt. Sag offen, wenn etwas falsch, unklar oder keine gute Idee ist, statt es schönzureden. Wenn du etwas nicht weißt oder unsicher bist, sag das, statt zu raten.

Länge: Antworte so lang, wie die Frage es verlangt, nicht länger. Kein Vorgeplänkel, keine Wiederholung der Frage, keine Zusammenfassung am Ende, keine Liste möglicher Folgefragen. Eine einfache Frage bekommt eine kurze Antwort, eine komplexe so viel wie nötig. Aber nicht künstlich knapp: Was zum Verstehen gebraucht wird, gehört rein. Ausführlich nur, wenn ich ausdrücklich danach frage.

Format: Markdown wird dargestellt (fett, kursiv, Listen, Überschriften, Tabellen, Code). Setz es gezielt ein: Fett für das Wichtigste, Listen nur bei echten Aufzählungen, Überschriften nur bei längeren Antworten. Lockere Antworten brauchen meist gar keine Formatierung.

Antworte in der Sprache, in der ich schreibe.`;

const DEFAULT_SETTINGS = { apiKey: '', model: DEFAULT_MODEL, reasoning: '', theme: 'system', system: '' };

/** Die Systemanweisung: wer das Modell ist, welcher Tag ist, wie es antworten soll. */
function systemPrompt() {
  const today = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `Du bist das Sprachmodell ${settings.model || DEFAULT_MODEL}, aufgerufen über OpenRouter in einer privaten Chat-App. Heute ist ${today}.\n\n${settings.system || DEFAULT_SYSTEM}`;
}

/* ── Speicher ────────────────────────────────────────────── */

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    alert('Speichern fehlgeschlagen — der Browser-Speicher ist voll oder gesperrt. Alte Chats löschen hilft.');
    console.error(err);
  }
}

/** Liest die Chats. Leere Antworten (Seite während des Schreibens geschlossen) fallen weg. */
function loadChats() {
  const list = load(STORE.chats, []);
  for (const chat of list) chat.messages = chat.messages.filter((m) => m.content);
  return list;
}

let settings = { ...DEFAULT_SETTINGS, ...load(STORE.settings, {}) };
let chats = loadChats();
let current = chats.find((c) => c.id === load(STORE.active, null)) || newChat();
let controller = null;   // laufende Anfrage, zum Abbrechen
let busyChat = null;     // der Chat, für den gerade geantwortet wird

function newChat() {
  const now = Date.now();
  return {
    id: now.toString(36) + Math.random().toString(36).slice(2, 8),
    title: 'Neuer Chat',
    created: now,
    updated: now,
    messages: [],
  };
}

/** Speichert den Chat. Ein leerer Chat landet nicht im Verlauf. */
function saveChat(chat) {
  if (!chat.messages.length) {
    chats = chats.filter((c) => c.id !== chat.id);
  } else if (!chats.includes(chat)) {
    chats.push(chat);
  }
  store(STORE.chats, chats);
}

function titleFrom(text) {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 40 ? line.slice(0, 40) + '…' : line || 'Neuer Chat';
}

/* ── Zahlen und Zeiten ───────────────────────────────────── */

const startOfDay = (t) => new Date(t).setHours(0, 0, 0, 0);
const uhrzeit = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const kurzdatum = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
const datum = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
/** Heute die Uhrzeit, sonst das Datum. */
const zeitpunkt = (t) => (startOfDay(t) === startOfDay(Date.now()) ? uhrzeit(t) : kurzdatum(t));

/** US-Dollar → US-Cent, zwei gültige Stellen: 0,045 · 1,2 · 12. */
const cent = (dollars) => (dollars * 100).toLocaleString('de-DE', { maximumSignificantDigits: 2 });

/** „deepseek/deepseek-v4.1-flash-20260910" → „deepseek-v4.1-flash". */
const modellName = (id) => String(id || '').replace(/^[^/]+\//, '').replace(/-20\d{6}$/, '');

const fragen = (chat) => chat.messages.filter((m) => m.role === 'user').length;
const kosten = (list) => list.reduce((sum, m) => sum + (m.meta?.cost || 0), 0);

/** Zeitabschnitt im Verlauf: Heute, Gestern, Letzte 7 Tage, dann Monate. */
function gruppeVon(t) {
  const heute = startOfDay(Date.now());
  const tag = startOfDay(t);
  const gestern = new Date(heute).setDate(new Date(heute).getDate() - 1);
  if (tag === heute) return 'Heute';
  if (tag === gestern) return 'Gestern';
  if (heute - tag < 7 * 86400000) return 'Letzte 7 Tage';
  return new Date(t).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

/* ── Oberfläche ──────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);
const els = {
  history: $('history'),
  historyEmpty: $('history-empty'),
  summen: $('summen'),
  leiste: $('leiste'),
  mini: $('mini-titel'),
  kopf: $('kopf'),
  title: $('chat-title'),
  kennung: $('chat-kennung'),
  messages: $('messages'),
  runden: $('runden'),
  composer: $('composer'),
  input: $('input'),
  send: $('send'),
  settings: $('settings'),
  settingsForm: $('settings-form'),
  feldKey: $('feld-key'),
  msgKey: $('m-key'),
};

/* Bausteine aus moch-motion.js — ohne die Datei: ohne Bewegung. */
const toast = M ? M.Toast($('toast')) : { zeige() {} };
const sendKnopf = M ? M.Bedingt(els.send) : {
  zeige(ok) { els.send.classList.toggle('da', ok); els.send.style.setProperty('--a', ok ? 1 : 0); },
};
const kopfScroll = M ? M.kopf(els.messages, els.leiste, null) : () => {};
const zaehlerChats = M ? M.Zaehler($('summe-chats'), 0) : null;
const zaehlerKosten = M ? M.Zaehler($('summe-kosten'), 0, cent) : null;
if (!M) els.kopf.classList.add('an');

const svg = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;

/* Hell, dunkel oder wie das System. Die Farbe der Browserleiste folgt dem Grund. */
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
function applyTheme(theme = settings.theme) {
  const dunkel = theme === 'dunkel' || (theme !== 'hell' && darkQuery.matches);
  document.documentElement.dataset.scheme = dunkel ? 'dunkel' : 'hell';
  const ground = getComputedStyle(document.documentElement).getPropertyValue('--ground').trim();
  if (ground) document.querySelector('meta[name="theme-color"]').setAttribute('content', ground);
}
darkQuery.addEventListener('change', () => applyTheme());

/* ── Verlauf ─────────────────────────────────────────────── */

function historyEntry(chat) {
  const row = document.createElement('div');
  row.className = chat === current ? 'eintrag active' : 'eintrag';

  const tag = document.createElement('span');
  tag.className = 'tag n';
  tag.textContent = zeitpunkt(chat.updated);

  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'was open';
  if (chat === current) open.setAttribute('aria-current', 'true');
  const titel = document.createElement('span');
  titel.textContent = chat.title;
  const anzahl = fragen(chat);
  const klein = document.createElement('small');
  const zahl = document.createElement('span');
  zahl.className = 'n';
  zahl.textContent = anzahl;
  klein.append(zahl, anzahl === 1 ? ' Frage' : ' Fragen');
  open.append(titel, klein);
  open.title = `${chat.title}\n${new Date(chat.updated).toLocaleString('de-DE')}`;
  open.addEventListener('click', () => switchTo(chat));

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'icon-btn delete';
  del.setAttribute('aria-label', `„${chat.title}“ löschen`);
  del.innerHTML = svg('<path d="M6 6l12 12M18 6 6 18"/>');
  del.addEventListener('click', () => deleteChat(chat));

  row.append(tag, open, del);
  return row;
}

function renderHistory() {
  const sorted = [...chats].sort((a, b) => b.updated - a.updated);
  const frag = document.createDocumentFragment();
  let gruppe = null;
  let box = null;
  for (const chat of sorted) {
    const g = gruppeVon(chat.updated);
    if (g !== gruppe) {
      gruppe = g;
      box = document.createElement('div');
      box.className = 'monat';
      const lb = document.createElement('span');
      lb.className = 'lb';
      lb.textContent = g;
      box.append(lb);
      frag.append(box);
    }
    box.append(historyEntry(chat));
  }
  els.history.replaceChildren(frag);
  els.historyEmpty.hidden = chats.length > 0;

  // Summen in der Datenzeile: Zahlen zählen zum neuen Wert.
  els.summen.hidden = !chats.length;
  const gesamt = kosten(chats.flatMap((c) => c.messages));
  if (zaehlerChats) {
    zaehlerChats.zu(chats.length);
    zaehlerKosten.zu(gesamt);
  } else {
    $('summe-chats').textContent = chats.length;
    $('summe-kosten').textContent = cent(gesamt);
  }
}

/* ── Gespräch ────────────────────────────────────────────── */

function frageEl(text) {
  const p = document.createElement('p');
  // Eingefügte lange Texte still in Archivo statt in der Serife.
  p.className = text.length > 200 || text.split('\n').length > 4 ? 'frage lang' : 'frage';
  p.textContent = text;
  return p;
}

/** Antwort des Modells als Markdown; eigene Nachrichten bleiben wörtlich. */
function antwortEl(text) {
  const div = document.createElement('div');
  div.className = 'antwort md';
  div.innerHTML = renderMarkdown(text);
  return div;
}

/** Datenzeile unter der Antwort: Modell · Uhrzeit · Kosten. */
function metaEl(meta) {
  const div = document.createElement('div');
  div.className = 'dataline offen meta';
  const teil = (label, wert, einheit) => {
    const span = document.createElement('span');
    if (label) span.append(`${label} `);
    const b = document.createElement('b');
    if (label) b.className = 'n';
    b.textContent = wert;
    span.append(b);
    if (einheit) span.append(` ${einheit}`);
    div.append(span);
  };
  teil('', modellName(meta.model));
  if (meta.at) teil('Uhrzeit', uhrzeit(meta.at));
  if (typeof meta.cost === 'number') teil('Kosten', cent(meta.cost), 'US-Cent');
  return div;
}

function fehlerEl(text) {
  const div = document.createElement('div');
  div.className = 'notice is-error';
  div.setAttribute('role', 'alert');
  const span = document.createElement('span');
  const strong = document.createElement('strong');
  strong.textContent = 'Fehler.';
  span.append(strong, ` ${text}`);
  div.append(span);
  return div;
}

/** Kein Chat offen: der Titel trägt die Ansicht, darunter höchstens ein Schritt. */
function leerEl() {
  const div = document.createElement('div');
  div.className = 'leer';
  if (settings.apiKey) return div;
  const p = document.createElement('p');
  p.textContent = 'Der OpenRouter-Key bleibt in diesem Browser und geht nur an OpenRouter.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = 'Key eintragen';
  btn.addEventListener('click', openSettings);
  div.append(p, btn);
  return div;
}

let gezeigterTitel = null;

/** Titel und Kennung. Ein neuer Titel steigt Wort für Wort auf. */
function renderKopf() {
  const offen = current.messages.length > 0;
  const titel = offen ? current.title : settings.apiKey ? 'Was liegt an?' : 'Ein Key fehlt noch.';

  let kennung;
  if (offen) {
    const anzahl = fragen(current);
    const summe = kosten(current.messages);
    kennung = `${datum(current.created)} · ${anzahl} ${anzahl === 1 ? 'Frage' : 'Fragen'}`;
    if (summe) kennung += ` · ${cent(summe)} US-Cent`;
  } else {
    kennung = settings.apiKey ? `${modellName(settings.model)} · über OpenRouter` : 'Einrichtung';
  }
  els.kennung.textContent = kennung;
  els.mini.textContent = offen ? current.title : 'Neuer Chat';
  document.title = offen ? `${current.title} · Chat` : 'Chat';

  if (titel !== gezeigterTitel) {
    gezeigterTitel = titel;
    els.title.textContent = titel;
    if (M) {
      M.titelWoerter(els.title);
      M.zeigeTitel(els.kopf);
    }
  }
}

function renderMessages() {
  renderKopf();
  els.runden.replaceChildren();
  if (!current.messages.length) {
    els.runden.append(leerEl());
    els.messages.scrollTop = 0;
    kopfScroll();
    return;
  }
  for (const msg of current.messages) {
    if (msg.role === 'user') {
      els.runden.append(frageEl(msg.content));
    } else {
      els.runden.append(antwortEl(msg.content));
      if (msg.meta) els.runden.append(metaEl(msg.meta));
    }
  }
  scrollToEnd(true);
}

function render() {
  renderHistory();
  renderMessages();
  store(STORE.active, current.id);
}

function nearEnd() {
  const el = els.messages;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function scrollToEnd(force) {
  if (force || nearEnd()) els.messages.scrollTop = els.messages.scrollHeight;
  kopfScroll();
}

/** Senden erscheint erst, wenn es etwas zu senden gibt — oder etwas zu stoppen. */
function updateSend() {
  sendKnopf.zeige(Boolean(controller) || els.input.value.trim().length > 0);
}

function setBusy(busy) {
  els.send.textContent = busy ? 'Stoppen' : 'Senden';
  if (busy) els.send.setAttribute('aria-busy', 'true');
  else els.send.removeAttribute('aria-busy');
  updateSend();
}

/** Das Eingabefeld wächst mit dem Text, bis 40 % der Höhe. */
function autosize() {
  els.input.style.height = 'auto';
  els.input.style.height = `${els.input.scrollHeight + 1}px`;
}

function setInput(text) {
  els.input.value = text;
  autosize();
  updateSend();
}

function showError(text) {
  els.runden.querySelector('.leer')?.remove();
  els.runden.append(fehlerEl(text));
  scrollToEnd(true);
}

function switchTo(chat) {
  current = chat;
  document.body.classList.remove('sidebar-open');
  render();
  if (M) M.zieheLinie(els.runden.querySelectorAll('.meta'));
  els.input.focus();
}

function deleteChat(chat) {
  if (!confirm(`„${chat.title}“ löschen?`)) return;
  if (chat === busyChat) controller.abort();
  chats = chats.filter((c) => c !== chat);
  store(STORE.chats, chats);
  if (chat === current) current = newChat();
  render();
  toast.zeige('Gelöscht.', `„${chat.title}“`);
}

/* ── OpenRouter ──────────────────────────────────────────── */

function errorText(status, payload) {
  const detail = (payload?.error?.message || '').trim();
  const quote = detail ? ` OpenRouter meldet: „${detail}“` : '';
  if (status === 401) return 'Der API-Key wurde nicht akzeptiert. Bitte in den Einstellungen prüfen.';
  if (status === 402) return `Das Guthaben bei OpenRouter reicht nicht. Aufladen unter openrouter.ai/credits.${quote}`;
  if (status === 404) return `Dieses Modell gibt es bei OpenRouter nicht. Bitte in den Einstellungen prüfen.${quote}`;
  if (status === 429) return `Zu viele Anfragen gerade. Kurz warten und erneut senden.${quote}`;
  if (status >= 500) return `OpenRouter oder der Anbieter hinter dem Modell antwortet gerade nicht.${quote}`;
  return detail || `Anfrage fehlgeschlagen (Status ${status}).`;
}

/**
 * Schickt den Verlauf an OpenRouter und liefert die Antwort Stück für
 * Stück (Server-Sent Events). onDelta bekommt je Stück { content, reasoning }.
 * In info landen das tatsächlich antwortende Modell und die Kosten.
 */
async function complete(messages, signal, onDelta, info) {
  const body = {
    model: settings.model || DEFAULT_MODEL,
    messages: [{ role: 'system', content: systemPrompt() }, ...messages],
    stream: true,
    // Kosten und Token im letzten Stück mitliefern — für die Datenzeile.
    usage: { include: true },
  };
  if (settings.reasoning) body.reasoning = { effort: settings.reasoning };

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${settings.apiKey}`,
        'x-title': 'Chat',   // nur zur Zuordnung in der OpenRouter-Statistik
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Keine Verbindung zu OpenRouter. Internet prüfen und erneut senden.');
  }

  if (!res.ok) {
    let payload = null;
    try { payload = await res.json(); } catch { /* Antwort ohne JSON */ }
    throw new Error(errorText(res.status, payload));
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });

    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      // Zeilen mit ":" am Anfang sind Lebenszeichen von OpenRouter.
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;

      let chunk;
      try { chunk = JSON.parse(data); } catch { continue; }
      if (chunk.error) throw new Error(chunk.error.message || 'Die Antwort brach mittendrin ab.');
      if (chunk.model) info.model = chunk.model;
      if (typeof chunk.usage?.cost === 'number') info.cost = chunk.usage.cost;

      const delta = chunk.choices?.[0]?.delta || {};
      onDelta({ content: delta.content || '', reasoning: delta.reasoning || '' });
    }
  }
}

/* ── Senden ──────────────────────────────────────────────── */

const WARTET = '<span class="lb">Schreibt</span><span class="placeholder"></span><span class="placeholder"></span><span class="placeholder"></span>';

async function send() {
  const text = els.input.value.trim();
  if (!text) return;
  if (!settings.apiKey) {
    openSettings();
    return;
  }

  const chat = current;
  const userMsg = { role: 'user', content: text };
  const answer = { role: 'assistant', content: '' };
  const history = [...chat.messages, userMsg]
    .filter((m) => m.content)
    .map(({ role, content }) => ({ role, content }));

  const vorher = chat.updated;
  if (!chat.messages.length) chat.title = titleFrom(text);
  chat.messages.push(userMsg, answer);
  chat.updated = Date.now();
  setInput('');
  saveChat(chat);
  render();

  // Die Antwort ist immer die letzte Antwort des Chats — auch wenn
  // zwischendurch ein anderer Chat offen war und neu gezeichnet wurde.
  const answerEl = () => {
    if (chat !== current) return null;
    const all = els.runden.querySelectorAll('.antwort');
    return all[all.length - 1] || null;
  };
  // Warten zeigt das System mit Label und Platzhalterzeilen, nie mit Spinner.
  const pending = answerEl();
  pending.className = 'antwort pending';
  pending.innerHTML = WARTET;

  // Markdown höchstens einmal pro Bildschirmbild neu setzen, nicht bei
  // jedem der oft hundert Stücke pro Sekunde.
  let frame = 0;
  const paint = () => {
    frame = 0;
    const el = answerEl();
    if (!el || !answer.content) return;
    const stick = nearEnd();
    el.className = 'antwort md';
    el.innerHTML = renderMarkdown(answer.content);
    if (stick) scrollToEnd(true);
  };

  controller = new AbortController();
  busyChat = chat;
  setBusy(true);
  let thinking = false;
  const info = {};

  try {
    await complete(history, controller.signal, ({ content, reasoning }) => {
      if (reasoning && !answer.content && !thinking) {
        thinking = true;
        const lb = answerEl()?.querySelector('.lb');
        if (lb) lb.textContent = 'Denkt nach';
      }
      if (!content) return;
      answer.content += content;
      if (!frame) frame = requestAnimationFrame(paint);
    }, info);
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err);
      if (chat === current) showError(err.message);
    }
  } finally {
    controller = null;
    busyChat = null;
    setBusy(false);
    cancelAnimationFrame(frame);
    paint();

    // Wurde der Chat währenddessen gelöscht, bleibt er gelöscht.
    if (chats.includes(chat)) {
      if (!answer.content) {
        // Nichts angekommen: Frage zurück ins Eingabefeld, damit sie mit
        // einem Klick erneut gesendet werden kann, statt doppelt im Verlauf zu stehen.
        chat.messages.splice(chat.messages.indexOf(userMsg), 2);
        chat.updated = vorher;   // ein Fehlschlag schiebt den Chat nicht nach oben
        if (!chat.messages.length) chat.title = 'Neuer Chat';
        if (chat === current) {
          if (!els.input.value) setInput(text);
          const error = els.runden.querySelector('.notice');
          renderMessages();
          if (error) els.runden.append(error);
        }
      } else {
        chat.updated = Date.now();
        answer.meta = { model: info.model || settings.model, cost: info.cost, at: chat.updated };
        // Die Antwort steht: Datenzeile darunter, ihre Linie zieht auf.
        const el = answerEl();
        if (el) {
          const meta = metaEl(answer.meta);
          el.after(meta);
          if (M) M.zieheLinie([meta]);
          renderKopf();
          scrollToEnd(false);
        }
      }
      saveChat(chat);
    }
    renderHistory();
  }
}

/* ── Einstellungen ───────────────────────────────────────── */

const form = els.settingsForm;
const wahl = {
  reasoning: form.querySelector('[data-name="reasoning"]'),
  theme: form.querySelector('[data-name="theme"]'),
};

function waehle(gruppe, value) {
  for (const chip of gruppe.querySelectorAll('.chip')) {
    chip.setAttribute('aria-checked', String(chip.dataset.value === value));
  }
}
const gewaehlt = (gruppe) => gruppe.querySelector('.chip[aria-checked="true"]')?.dataset.value ?? '';

// Auswahl über Chips; die Darstellung wechselt sofort zur Probe.
form.addEventListener('click', (e) => {
  const chip = e.target.closest('.wahl .chip');
  if (!chip) return;
  const gruppe = chip.closest('.wahl');
  waehle(gruppe, chip.dataset.value);
  if (gruppe === wahl.theme) applyTheme(chip.dataset.value);
});
if (M) M.chipDruck(form);

/** Meldung unter dem Key-Feld: live, mit Wort. */
function pruefeKey() {
  const value = form.elements.apiKey.value.trim();
  const fehler = Boolean(value) && !/^sk-or-/i.test(value);
  els.feldKey.classList.toggle('has-error', fehler);
  els.feldKey.classList.toggle('is-valid', Boolean(value) && !fehler);
  form.elements.apiKey.setAttribute('aria-invalid', String(fehler));
  if (!value) {
    els.msgKey.innerHTML = 'Key auf <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a> erstellen. Er bleibt in diesem Browser und geht nur an OpenRouter.';
  } else {
    els.msgKey.textContent = fehler
      ? 'Fehler: Ein OpenRouter-Key beginnt mit „sk-or-“.'
      : 'Format stimmt. Der Key bleibt in diesem Browser.';
  }
}
form.elements.apiKey.addEventListener('input', pruefeKey);

function openSettings() {
  const f = form.elements;
  f.apiKey.value = settings.apiKey;
  f.model.value = settings.model;
  f.system.value = settings.system || DEFAULT_SYSTEM;
  waehle(wahl.reasoning, settings.reasoning);
  waehle(wahl.theme, settings.theme);
  pruefeKey();
  document.body.classList.remove('sidebar-open');
  // Sonst gilt nach einem Speichern auch Esc beim nächsten Mal als „Speichern“.
  els.settings.returnValue = '';
  els.settings.showModal();
  (settings.apiKey ? f.model : f.apiKey).focus();
}

els.settings.addEventListener('close', () => {
  if (els.settings.returnValue !== 'save') {
    applyTheme();   // Probe der Darstellung zurücknehmen
    return;
  }
  const f = form.elements;
  settings = {
    apiKey: f.apiKey.value.trim(),
    model: f.model.value.trim() || DEFAULT_MODEL,
    reasoning: gewaehlt(wahl.reasoning),
    theme: gewaehlt(wahl.theme) || 'system',
    // Unverändert oder leer heißt: Standard. So kommen spätere
    // Verbesserungen am Standard auch bei Dir an.
    system: f.system.value.trim() === DEFAULT_SYSTEM ? '' : f.system.value.trim(),
  };
  store(STORE.settings, settings);
  applyTheme();
  if (!current.messages.length) renderMessages();
  else renderKopf();
  toast.zeige('Gespeichert.', 'Gilt ab der nächsten Nachricht.');
});

/* ── Ereignisse ──────────────────────────────────────────── */

els.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  if (controller) controller.abort();
  else send();
});

els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    if (!controller) send();
  }
});

els.input.addEventListener('input', () => {
  autosize();
  updateSend();
});

$('new-chat').addEventListener('click', () => {
  if (current.messages.length) switchTo(newChat());
  else switchTo(current);
});

$('open-settings').addEventListener('click', openSettings);

$('reset-system').addEventListener('click', () => {
  form.elements.system.value = DEFAULT_SYSTEM;
});

// Schmal: Der Verlauf schiebt sich herein, die Einträge folgen gestaffelt.
$('toggle-sidebar').addEventListener('click', (e) => {
  e.stopPropagation();
  const offen = document.body.classList.toggle('sidebar-open');
  if (offen && M) M.staffel(els.history.querySelectorAll('.eintrag'), 35, 60);
});

// Tippen neben den Verlauf schließt ihn.
document.addEventListener('click', (e) => {
  if (!document.body.classList.contains('sidebar-open')) return;
  if (!e.target.closest('#sidebar, #toggle-sidebar')) document.body.classList.remove('sidebar-open');
});

// Ein anderer Tab hat Chats oder Einstellungen geändert.
window.addEventListener('storage', (e) => {
  if (controller) return;
  if (e.key === STORE.settings) {
    settings = { ...DEFAULT_SETTINGS, ...load(STORE.settings, {}) };
    applyTheme();
    renderKopf();
  }
  if (e.key === STORE.chats) {
    chats = loadChats();
    current = chats.find((c) => c.id === current.id) || newChat();
    render();
  }
});

applyTheme();
render();
autosize();
updateSend();
// Titel erst aufsteigen lassen, wenn die Schriften da sind — sonst
// steigt die Ersatzschrift auf und springt dann um.
if (M && document.fonts) document.fonts.ready.then(() => M.zeigeTitel(els.kopf));
if (M) M.zieheLinie(els.runden.querySelectorAll('.meta'));
els.input.focus();
