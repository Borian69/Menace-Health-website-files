/* Alles bleibt lokal auf dem Gerät: Einstellungen und Verlauf im
   localStorage. Es wird nichts an fremde Server geschickt außer dem
   Belegfoto an die Erkennung. */

const SETTINGS_KEY = 'belegteiler.settings.v1';
const HISTORY_KEY  = 'belegteiler.history.v1';
const USAGE_KEY    = 'belegteiler.usage.v1';
const HISTORY_MAX  = 25;

const DEFAULTS = {
  provider:      'openrouter',
  mode:          'direct',
  apiKey:        '',            // Anthropic
  openrouterKey: '',
  proxyUrl:      '',
  model:         'google/gemma-4-31b-it:free',
  helperModel:   'google/gemma-4-31b-it:free',
  resolveUncertain: true,
  fromName: '',
  toName:   '',
  payTo:    '',
  showMine: false,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings() {
  const stored = read(SETTINGS_KEY, {});

  // Ältere Fassungen kannten nur Claude und hatten kein Feld "provider".
  // Wer damals eingerichtet hat, soll weiterlaufen wie bisher.
  if (!stored.provider && stored.model) {
    stored.provider = String(stored.model).startsWith('claude-') ? 'anthropic' : 'openrouter';
  }
  if (stored.provider === 'anthropic' && !stored.helperModel) {
    stored.helperModel = stored.model;
  }

  return { ...DEFAULTS, ...stored };
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  write(SETTINGS_KEY, next);
  return next;
}

/** Ist die Erkennung einsatzbereit? */
export function isConfigured(settings = loadSettings()) {
  if (settings.mode === 'proxy') return Boolean(settings.proxyUrl.trim());
  const key = settings.provider === 'anthropic' ? settings.apiKey : settings.openrouterKey;
  return Boolean((key || '').trim());
}

export const loadHistory = () => read(HISTORY_KEY, []);

export function pushHistory(entry) {
  const history = loadHistory().filter((item) => item.id !== entry.id);
  history.unshift(entry);
  write(HISTORY_KEY, history.slice(0, HISTORY_MAX));
}

export const clearHistory = () => write(HISTORY_KEY, []);

/* ── Verbrauch ───────────────────────────────────────────── */

export const loadUsage = () => read(USAGE_KEY, { scans: 0, cents: 0, since: Date.now() });

/** Kosten einer Erkennung mitschreiben, damit sichtbar ist, was anfällt. */
export function addUsage({ cents }) {
  const usage = loadUsage();
  usage.scans += 1;
  usage.cents += cents || 0;
  write(USAGE_KEY, usage);
  return usage;
}

export const clearUsage = () => write(USAGE_KEY, { scans: 0, cents: 0, since: Date.now() });

export function clearEverything() {
  try {
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(USAGE_KEY);
  } catch { /* Privatmodus o. Ä. — dann gab es ohnehin nichts zu löschen. */ }
}
