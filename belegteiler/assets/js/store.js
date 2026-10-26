/* Alles bleibt lokal auf dem Gerät: Einstellungen und Verlauf im
   localStorage. Es wird nichts an fremde Server geschickt außer dem
   Belegfoto an die Erkennung. */

const SETTINGS_KEY = 'belegteiler.settings.v1';
const HISTORY_KEY  = 'belegteiler.history.v1';
const OPEN_KEY     = 'belegteiler.open.v1';
const USAGE_KEY    = 'belegteiler.usage.v1';
const HISTORY_MAX  = 25;

const DEFAULTS = {
  provider:      'openrouter',
  mode:          'direct',
  apiKey:        '',            // Anthropic
  openrouterKey: '',
  proxyUrl:      '',
  /* Nicht mehr das Gratis-Modell.

     Die Fassungen, die liefen, benutzten Claude (v1 Opus, v2 Haiku, v3
     Sonnet). Mit v4 kam OpenRouter und als Vorgabe
     google/gemma-4-31b-it:free — und ab da ging es schief. Auf dem
     Gerät gemessen: 126 Sekunden, danach „nichts erfasst". Kein
     Netzproblem, kein Bildproblem; das Modell kann diese Aufgabe nicht.

     Gerechnet, was die Alternative kostet: qwen3.7-flash liegt bei
     0,04 Cent je Beleg. Hundert Belege kosten vier Cent. Ein Modell,
     das nichts kostet und nichts liefert, ist nicht billiger — es ist
     nur umsonst. Die Gratis-Modelle stehen weiter zur Auswahl, aber
     nicht mehr als Vorgabe. */
  model:         'qwen/qwen3.7-flash',
  helperModel:   'qwen/qwen3.7-flash',
  fallbackModel: 'google/gemini-2.5-flash-lite',
  resolveUncertain: true,
  /* Kassenbons sind grau auf weiss und meist unter Mischlicht
     fotografiert. Spreizen und Nachschärfen hilft der Erkennung
     spürbar — deshalb an. Abschaltbar, falls ein Foto einmal schon
     kräftig genug ist. */
  bildAufbereiten: true,
  /* Aus als Vorgabe: Ein Anlauf, der von allein nachrückt, überschreibt
     die Fehleranzeige, bevor man sie lesen konnte. Wer wissen will,
     woran es liegt, kommt sonst nicht an die Details. Der Beleg bleibt
     ohnehin gespeichert und lässt sich jederzeit von Hand wiederholen. */
  autoRetry: false,
  fromName: '',
  toName:   '',
  payTo:    '',
  showMine: false,
  sounds:   true,
  haptics:  true,
  volume:   0.7,
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

  const fertig = { ...DEFAULTS, ...stored };

  /* Wer noch auf einem Gratis-Modell steht, wird einmalig umgestellt.

     Eine geänderte Vorgabe erreicht nur neue Geräte — wer die App schon
     benutzt, behält seine gespeicherte Wahl und damit genau das Modell,
     das nachweislich nichts liefert. Das wäre eine Verbesserung, die
     bei niemandem ankommt, der sie braucht.

     Nur einmal, und nur für die Bilderkennung: Wer bewusst wieder ein
     Gratis-Modell wählt, behält es. */
  if (!fertig.modellUmgestellt && /:free$/.test(fertig.model || '')) {
    fertig.vorherigesModell = fertig.model;
    fertig.model = DEFAULTS.model;
    if (/:free$/.test(fertig.helperModel || '')) fertig.helperModel = DEFAULTS.helperModel;
    fertig.modellUmgestellt = true;
    write(SETTINGS_KEY, fertig);
  }

  return fertig;
}

export function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  write(SETTINGS_KEY, next);
  return next;
}

/** Ist die Erkennung einsatzbereit? */
export function isConfigured(settings = loadSettings()) {
  // Im Proxy-Modus genügt die Adresse; der Schlüssel liegt dort.
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

/* ── Laufende Abrechnung ─────────────────────────────────────
   Über den Tag werden Belege gesammelt. Diese offene Abrechnung
   überlebt das Schließen der App und ist erst dann im Verlauf, wenn
   sie ausdrücklich abgeschlossen wurde. */

export const loadOpenBill = () => read(OPEN_KEY, null);

export const saveOpenBill = (bill) => write(OPEN_KEY, bill);

export function clearOpenBill() {
  try {
    localStorage.removeItem(OPEN_KEY);
  } catch { /* nichts zu tun */ }
}

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
    localStorage.removeItem(OPEN_KEY);
    localStorage.removeItem(USAGE_KEY);
  } catch { /* Privatmodus o. Ä. — dann gab es ohnehin nichts zu löschen. */ }
}
