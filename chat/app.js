/* Chat mit DeepSeek über OpenRouter.

   Alles läuft im Browser: Die Chats und der API-Key liegen im
   localStorage, die Anfrage geht direkt an OpenRouter (die API erlaubt
   Aufrufe aus dem Browser). Kein Server, kein Build.

   Bewusst ein klassisches Skript und kein ES-Modul: So läuft die Seite
   auch, wenn man index.html einfach per Doppelklick öffnet — Module
   lädt der Browser von file:// nicht. */

'use strict';

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

/* ── Oberfläche ──────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);
const els = {
  history: $('history'),
  historyEmpty: $('history-empty'),
  title: $('chat-title'),
  messages: $('messages'),
  composer: $('composer'),
  input: $('input'),
  send: $('send'),
  settings: $('settings'),
  settingsForm: $('settings-form'),
};

function applyTheme() {
  if (settings.theme === 'hell' || settings.theme === 'dunkel') {
    document.documentElement.dataset.theme = settings.theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function renderHistory() {
  els.history.replaceChildren();
  const sorted = [...chats].sort((a, b) => b.updated - a.updated);
  for (const chat of sorted) {
    const li = document.createElement('li');
    if (chat === current) li.className = 'active';

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'open';
    open.textContent = chat.title;
    open.title = `${chat.title}\n${new Date(chat.updated).toLocaleString('de-DE')}`;
    open.addEventListener('click', () => switchTo(chat));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.textContent = '✕';
    del.setAttribute('aria-label', `„${chat.title}“ löschen`);
    del.addEventListener('click', () => deleteChat(chat));

    li.append(open, del);
    els.history.append(li);
  }
  els.historyEmpty.hidden = chats.length > 0;
}

function bubble(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  // Nur Antworten des Modells als Markdown; eigene Nachrichten bleiben wörtlich.
  if (role === 'assistant') {
    div.classList.add('md');
    div.innerHTML = renderMarkdown(text);
  } else {
    div.textContent = text;
  }
  return div;
}

function renderMessages() {
  els.title.textContent = current.title;
  document.title = current.messages.length ? `${current.title} · Chat` : 'Chat';
  els.messages.replaceChildren();

  if (!current.messages.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = settings.apiKey
      ? `Neuer Chat mit ${settings.model}.`
      : 'Zuerst unter „Einstellungen“ den OpenRouter API-Key eintragen.';
    els.messages.append(p);
    return;
  }

  for (const msg of current.messages) {
    els.messages.append(bubble(msg.role, msg.content));
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
}

function setBusy(busy) {
  els.send.textContent = busy ? 'Stopp' : 'Senden';
}

function showError(text) {
  els.messages.querySelector('.empty')?.remove();
  els.messages.append(bubble('error', text));
  scrollToEnd(true);
}

function switchTo(chat) {
  current = chat;
  document.body.classList.remove('sidebar-open');
  render();
  els.input.focus();
}

function deleteChat(chat) {
  if (!confirm(`„${chat.title}“ löschen?`)) return;
  if (chat === busyChat) controller.abort();
  chats = chats.filter((c) => c !== chat);
  store(STORE.chats, chats);
  if (chat === current) current = newChat();
  render();
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
 */
async function complete(messages, signal, onDelta) {
  const body = {
    model: settings.model || DEFAULT_MODEL,
    messages: [{ role: 'system', content: systemPrompt() }, ...messages],
    stream: true,
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

      const delta = chunk.choices?.[0]?.delta || {};
      onDelta({ content: delta.content || '', reasoning: delta.reasoning || '' });
    }
  }
}

/* ── Senden ──────────────────────────────────────────────── */

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

  if (!chat.messages.length) chat.title = titleFrom(text);
  chat.messages.push(userMsg, answer);
  chat.updated = Date.now();
  els.input.value = '';
  saveChat(chat);
  render();

  // Die Antwort ist immer die letzte Modell-Blase des Chats — auch wenn
  // zwischendurch ein anderer Chat offen war und neu gezeichnet wurde.
  const answerEl = () => {
    if (chat !== current) return null;
    const all = els.messages.querySelectorAll('.msg.assistant');
    return all[all.length - 1] || null;
  };
  const pending = answerEl();
  pending.classList.add('pending');
  pending.textContent = 'schreibt …';

  // Markdown höchstens einmal pro Bildschirmbild neu setzen, nicht bei
  // jedem der oft hundert Stücke pro Sekunde.
  let frame = 0;
  const paint = () => {
    frame = 0;
    const el = answerEl();
    if (!el || !answer.content) return;
    const stick = nearEnd();
    el.classList.remove('pending');
    el.innerHTML = renderMarkdown(answer.content);
    if (stick) scrollToEnd(true);
  };

  controller = new AbortController();
  busyChat = chat;
  setBusy(true);
  let thinking = false;

  try {
    await complete(history, controller.signal, ({ content, reasoning }) => {
      if (reasoning && !answer.content && !thinking) {
        thinking = true;
        const el = answerEl();
        if (el) el.textContent = 'denkt nach …';
      }
      if (!content) return;
      answer.content += content;
      if (!frame) frame = requestAnimationFrame(paint);
    });
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
        if (!chat.messages.length) chat.title = 'Neuer Chat';
        if (chat === current) {
          if (!els.input.value) els.input.value = text;
          const error = els.messages.querySelector('.msg.error');
          renderMessages();
          if (error) els.messages.append(error);
        }
      } else {
        chat.updated = Date.now();
      }
      saveChat(chat);
    }
    renderHistory();
  }
}

/* ── Einstellungen ───────────────────────────────────────── */

function openSettings() {
  const f = els.settingsForm.elements;
  f.apiKey.value = settings.apiKey;
  f.model.value = settings.model;
  f.reasoning.value = settings.reasoning;
  f.theme.value = settings.theme;
  f.system.value = settings.system || DEFAULT_SYSTEM;
  document.body.classList.remove('sidebar-open');
  // Sonst gilt nach einem Speichern auch Esc beim nächsten Mal als „Speichern“.
  els.settings.returnValue = '';
  els.settings.showModal();
  (settings.apiKey ? f.model : f.apiKey).focus();
}

els.settings.addEventListener('close', () => {
  if (els.settings.returnValue !== 'save') return;
  const f = els.settingsForm.elements;
  settings = {
    apiKey: f.apiKey.value.trim(),
    model: f.model.value.trim() || DEFAULT_MODEL,
    reasoning: f.reasoning.value,
    theme: f.theme.value || 'system',
    // Unverändert oder leer heißt: Standard. So kommen spätere
    // Verbesserungen am Standard auch bei Dir an.
    system: f.system.value.trim() === DEFAULT_SYSTEM ? '' : f.system.value.trim(),
  };
  store(STORE.settings, settings);
  applyTheme();
  if (!current.messages.length) renderMessages();
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

$('new-chat').addEventListener('click', () => {
  if (current.messages.length) switchTo(newChat());
  else switchTo(current);
});

$('open-settings').addEventListener('click', openSettings);

$('reset-system').addEventListener('click', () => {
  els.settingsForm.elements.system.value = DEFAULT_SYSTEM;
});

$('toggle-sidebar').addEventListener('click', (e) => {
  e.stopPropagation();
  document.body.classList.toggle('sidebar-open');
});

// Auf schmalen Bildschirmen: Tippen neben den Verlauf schließt ihn.
document.querySelector('main').addEventListener('click', () => {
  document.body.classList.remove('sidebar-open');
});

// Ein anderer Tab hat Chats oder Einstellungen geändert.
window.addEventListener('storage', (e) => {
  if (controller) return;
  if (e.key === STORE.settings) {
    settings = { ...DEFAULT_SETTINGS, ...load(STORE.settings, {}) };
    applyTheme();
  }
  if (e.key === STORE.chats) {
    chats = loadChats();
    current = chats.find((c) => c.id === current.id) || newChat();
    render();
  }
});

applyTheme();
render();
els.input.focus();
