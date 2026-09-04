/* Diagnose-Werkzeug für alle Funktionen der App.

   Jede Funktion — Speichern, Auswertung, Kalender, Diagramm, PDF,
   Oberfläche — schreibt hier hinein. In den Einstellungen lässt sich für
   jeden Bereich einzeln entscheiden, ob er mitschreibt; der Hauptschalter
   liegt darüber. Ohne eingeschalteten Bereich kostet ein Aufruf fast
   nichts: es wird nur ein Schalter geprüft.

   Fehler landen immer im Protokoll, auch bei ausgeschaltetem Debug-Modus.
   Genau die will man später sehen, und rückwirkend einschalten geht nicht.

   Dieses Modul steht bewusst ganz unten: es lädt nichts aus der App, damit
   jeder andere Baustein es gefahrlos einbinden kann. */

const LOG_KEY  = 'bordbuch.protokoll.v1';
const LOG_MAX  = 300;

/** Bereiche, die einzeln zuschaltbar sind — Reihenfolge wie in den
    Einstellungen. */
export const BEREICHE = [
  { id: 'daten',    label: 'Daten & Speicher', hinweis: 'Jedes Lesen und Schreiben im Gerätespeicher, mit Größe.' },
  { id: 'eintrag',  label: 'Einträge',         hinweis: 'Anlegen, Ändern, Löschen und die Prüfung der Eingaben.' },
  { id: 'auswertung', label: 'Auswertung',     hinweis: 'Kilometer-Differenzen, Monatswerte, erkannte Ausreißer.' },
  { id: 'kalender', label: 'Kalender',         hinweis: 'Aufgebaute Monate, Zellen, Tagesauswahl.' },
  { id: 'diagramm', label: 'Diagramm',         hinweis: 'Skalen, Rohwerte und Pfade der beiden Kurven.' },
  { id: 'pdf',      label: 'PDF',              hinweis: 'Seitenumbrüche, Objekte, Größe der fertigen Datei.' },
  { id: 'ui',       label: 'Oberfläche',       hinweis: 'Tabs, Ansichten und wie lange ein Aufbau gedauert hat.' },
];

/* Hauptschalter plus ein Schalter je Bereich. Wird beim Start aus den
   Einstellungen gesetzt. */
export const flags = {
  an: false,
  ...Object.fromEntries(BEREICHE.map((bereich) => [bereich.id, false])),
};

let protokoll = ladeProtokoll();
let schreibTimer = null;
const hoerer = new Set();

function ladeProtokoll() {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const liste = raw ? JSON.parse(raw) : [];
    return Array.isArray(liste) ? liste.slice(-LOG_MAX) : [];
  } catch {
    return [];
  }
}

/* Gesammelt geschrieben: bei eingeschaltetem Debug fallen schnell Dutzende
   Zeilen pro Sekunde an, und jede einzeln zu speichern würde genau die
   Aufbauzeiten verfälschen, die hier gemessen werden. */
function sichereSpaeter() {
  if (schreibTimer) return;
  schreibTimer = setTimeout(() => {
    schreibTimer = null;
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(protokoll.slice(-LOG_MAX)));
    } catch { /* Speicher voll oder Privatmodus — das Protokoll ist es nicht wert. */ }
  }, 600);
}

export function setzeFlags(einstellungen = {}) {
  flags.an = Boolean(einstellungen.debug);
  for (const bereich of BEREICHE) {
    // Ohne Hauptschalter schweigen alle Bereiche.
    flags[bereich.id] = flags.an && einstellungen[`debug_${bereich.id}`] !== false;
  }
  return flags;
}

export const aktiv = (bereich) => Boolean(flags[bereich]);

function schreibe(eintrag) {
  protokoll.push(eintrag);
  if (protokoll.length > LOG_MAX) protokoll = protokoll.slice(-LOG_MAX);
  sichereSpaeter();
  for (const ruf of hoerer) {
    try { ruf(eintrag); } catch { /* ein kaputter Zuhörer darf nichts aufhalten */ }
  }
}

/** Notiz aus einem Bereich. Wird verworfen, wenn der Bereich aus ist. */
export function log(bereich, nachricht, daten) {
  if (!flags[bereich]) return;
  const eintrag = { t: Date.now(), bereich, nachricht, daten: kuerze(daten) };
  schreibe(eintrag);
  if (typeof console !== 'undefined') console.debug(`[${bereich}] ${nachricht}`, daten ?? '');
}

/** Fehler — landet immer im Protokoll, unabhängig von allen Schaltern. */
export function fehler(bereich, nachricht, error) {
  const eintrag = {
    t: Date.now(),
    bereich,
    nachricht,
    fehler: true,
    daten: kuerze(error instanceof Error ? { name: error.name, message: error.message } : error),
  };
  schreibe(eintrag);
  if (typeof console !== 'undefined') console.error(`[${bereich}] ${nachricht}`, error ?? '');
}

/** Misst, wie lange etwas gedauert hat:
      const fertig = messe('ui', 'Liste aufgebaut');
      … ; fertig({ zeilen: 42 });
    Ist der Bereich aus, ist beides ein leerer Aufruf. */
export function messe(bereich, nachricht) {
  if (!flags[bereich]) return () => {};
  const start = performance.now();
  return (daten) => {
    const ms = Math.round((performance.now() - start) * 10) / 10;
    log(bereich, nachricht, { ms, ...(daten || {}) });
  };
}

/* Große Objekte würden das Protokoll sprengen und wären ohnehin
   unleserlich. Gekürzt wird auf das, was auf einen Blick hilft. */
function kuerze(daten) {
  if (daten === null || daten === undefined) return undefined;
  if (typeof daten !== 'object') return daten;
  try {
    const text = JSON.stringify(daten);
    if (text.length <= 400) return JSON.parse(text);
    return { gekuerzt: `${text.slice(0, 400)}…`, zeichen: text.length };
  } catch {
    return { nichtLesbar: String(daten) };
  }
}

export const protokollListe = () => protokoll.slice();

export function protokollText() {
  return protokoll
    .map((eintrag) => {
      const zeit = new Date(eintrag.t).toLocaleTimeString('de-DE', { hour12: false });
      const marke = eintrag.fehler ? 'FEHLER' : eintrag.bereich;
      const daten = eintrag.daten === undefined ? '' : `  ${JSON.stringify(eintrag.daten)}`;
      return `${zeit}  [${marke}] ${eintrag.nachricht}${daten}`;
    })
    .join('\n');
}

export function protokollLeeren() {
  protokoll = [];
  try { localStorage.removeItem(LOG_KEY); } catch { /* nichts zu tun */ }
  for (const ruf of hoerer) {
    try { ruf(null); } catch { /* egal */ }
  }
}

/** Für die Live-Anzeige in den Einstellungen. */
export function beiEintrag(ruf) {
  hoerer.add(ruf);
  return () => hoerer.delete(ruf);
}

/* Unerwartete Fehler aus der ganzen App auffangen — sonst stehen sie nur
   in einer Entwicklerkonsole, an die am Handy niemand herankommt. */
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    fehler('ui', 'Unbehandelter Fehler', { message: event.message, quelle: `${event.filename}:${event.lineno}` });
  });
  window.addEventListener('unhandledrejection', (event) => {
    fehler('ui', 'Unbehandelte Zusage abgelehnt', { grund: String(event.reason) });
  });
}
