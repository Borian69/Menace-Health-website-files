/* Netzanfragen der Erkennung.

   Gefragt wird direkt. Der Umweg über den Service Worker steckt weiter
   hier drin, ist aber ab Werk aus — die ausführliche Begründung steht
   an anfrage(). Kurz: Er sollte das Sperren des Displays überbrücken
   und hat stattdessen jede Erkennung nach 90 Sekunden stumm sterben
   lassen, weil der Browser den Worker mitten in der Anfrage beendet.

   Was der Umweg leisten sollte, leistet heute die Warteschlange: Die
   Aufnahme liegt sicher, und die App nimmt sie nach einem Neustart von
   selbst wieder auf. */

let laufendeNummer = 0;
const offen = new Map();   // id -> { resolve, reject }

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const daten = event.data;
    if (daten?.type !== 'antwort') return;
    const warten = offen.get(daten.id);
    if (!warten) return;
    offen.delete(daten.id);
    warten.resolve(daten);
  });

  /* Zurück in der App: nach Ergebnissen fragen, die während der Pause
     fertig geworden sind. Die Meldung von damals hat die eingefrorene
     Seite nicht mehr erreicht. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    for (const id of offen.keys()) {
      navigator.serviceWorker.controller?.postMessage({ type: 'abholen', id });
    }
  });
}

const nutzbar = () => Boolean(navigator.serviceWorker?.controller);

/* Umschaltbar, damit der Weg prüfbar bleibt statt nur ausgebaut zu sein.
   Ab Werk aus — siehe die Begründung an anfrage(). */
let ueberWorkerErlaubt = false;
export const workerWegSetzen = (an) => { ueberWorkerErlaubt = Boolean(an); };

/* Kommt gar nichts zurück, darf die App nicht ewig warten. Der Worker
   kann zwischendurch ersetzt oder beendet worden sein, dann läuft die
   Erkennung gegen eine Wand und die Anzeige steht still. Nach dieser
   Frist wird stattdessen direkt gefragt.

   Sie liegt bewusst knapp über der Frist im Worker (FRIST in sw.js): Der
   Worker soll von sich aus aufgeben und Bescheid sagen. Vorher standen
   hier 90 Sekunden gegen einen Worker ganz ohne Frist — die Seite gab
   also zuerst auf und schob dieselben Megabyte ein zweites Mal
   hinterher, während der erste Upload weiterlief. */
const WORKER_FRIST = 100_000;

function ueberWorker(url, init, signal) {
  const id = `${Date.now()}-${(laufendeNummer += 1)}`;

  return new Promise((resolve, reject) => {
    const frist = setTimeout(() => {
      if (!offen.delete(id)) return;
      resolve({ id, unbekannt: true });    // löst den direkten Weg aus
    }, WORKER_FRIST);

    offen.set(id, {
      resolve: (wert) => { clearTimeout(frist); resolve(wert); },
      reject: (fehler) => { clearTimeout(frist); reject(fehler); },
    });

    const abbrechen = () => {
      clearTimeout(frist);
      offen.delete(id);
      const fehler = new Error('Abgebrochen');
      fehler.name = 'AbortError';
      reject(fehler);
    };
    signal?.addEventListener('abort', abbrechen, { once: true });

    navigator.serviceWorker.controller.postMessage({
      type: 'anfrage', id, url, method: 'POST', headers: init.headers, body: init.body,
    });
  });
}

/* Ein gescheiterter Netzabruf sagt nur "Failed to fetch" — die Ursache
   liegt unterhalb dessen, was JavaScript zu sehen bekommt. Also wird
   alles mitgegeben, was sich von aussen feststellen lässt: welcher Weg,
   wie lange es dauerte, wie gross die Anfrage war, ob das Gerät sich für
   online hält. Aus "abgebrochen nach 40 s bei 1,8 MB" lässt sich etwas
   schliessen, aus "Keine Verbindung" nichts. */
/* Wo genau klemmt es — beim Dienst oder auf dem Gerät?

   "TypeError: Failed to fetch" sagt nichts darüber, und die Meldung
   "Ist das Handy online?" war schlicht falsch, wenn das Gerät sich für
   online hält und die Anfrage nach 0,3 Sekunden abbricht. So schnell
   scheitert kein Upload — so schnell scheitert etwas, das gar nicht
   erst losgeschickt wurde.

   Also wird nach einem Fehlschlag nachgefasst, mit zwei Proben an
   dieselbe Adresse:

   1. Ohne CORS (`no-cors`). Die kommt an jedem Regelwerk des Browsers
      vorbei; scheitert sie trotzdem, ist der Weg zum Dienst zu — VPN,
      Schutzschild, Werbe- oder DNS-Blocker.
   2. Eine gewöhnliche Anfrage an die offene Modell-Liste. Die braucht
      weder Schlüssel noch Sonderkopf und löst keine Vorabfrage aus.

   Aus dem Vergleich wird eine Aussage:
     beide gut     → der Dienst ist erreichbar, es liegt an DIESER Anfrage
     nur 1 gut     → etwas zwischen Gerät und Dienst schneidet die
                     CORS-Kopfzeilen weg (typisch für VPN mit Filter)
     beide schlecht→ der Dienst ist von diesem Gerät aus gesperrt */
async function erreichbarkeit(url) {
  const herkunft = (() => { try { return new URL(url).origin; } catch { return ''; } })();
  if (!herkunft) return '';

  const probe = async (init) => {
    const steuerung = new AbortController();
    const zeit = setTimeout(() => steuerung.abort(), 8000);
    try {
      await fetch(`${herkunft}/api/v1/models`, { cache: 'no-store', signal: steuerung.signal, ...init });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(zeit);
    }
  };

  const [ohneRegeln, mitRegeln] = await Promise.all([
    probe({ mode: 'no-cors' }),
    probe({}),
  ]);

  if (ohneRegeln && mitRegeln) return 'Dienst erreichbar — es liegt an dieser Anfrage, nicht am Weg';
  if (ohneRegeln) return 'Weg da, aber die CORS-Kopfzeilen fehlen — dazwischen filtert etwas (VPN, Schutzschild)';
  return 'Dienst von diesem Gerät aus nicht erreichbar — VPN, Schutzschild, Werbe- oder DNS-Blocker';
}

function verbindungsfehler({ grund, weg, url, init, begonnen }) {
  const mb = ((init?.body?.length || 0) / 1024 / 1024).toFixed(2);
  const sekunden = ((Date.now() - begonnen) / 1000).toFixed(1);

  /* Die Meldung richtet sich nach dem, was messbar ist.

     "Ist das Handy online?" war falsch, sobald das Gerät sich für
     online hält — und ein Abbruch nach 0,3 Sekunden ist ohnehin kein
     Verbindungsabbruch: So schnell scheitert nur, was gar nicht erst
     losgeschickt wurde. */
  const schnell = Number(sekunden) < 3;
  const meldung = !navigator.onLine
    ? 'Das Gerät ist offline. Sobald wieder Netz da ist, klappt es.'
    : schnell
      ? 'Die Anfrage wurde sofort abgewiesen — nicht unterwegs verloren. Das kommt fast immer von etwas auf dem Gerät: VPN, Schutzschild des Browsers, Werbe- oder DNS-Blocker. Kurz abschalten und nochmal.'
      : 'Die Verbindung zur Erkennung ist abgebrochen. Ein neuer Anlauf hilft meist.';

  const fehler = new Error(meldung);
  fehler.wiederholbar = true;   // kommt das Netz zurück, klappt es
  fehler.diagnose = {
    grund,
    weg,
    ziel: String(url).replace(/^(https?:\/\/[^/]+).*$/, '$1'),
    anfrageMB: mb,
    dauerSekunden: sekunden,
    geraetOnline: navigator.onLine,
  };
  /* Die Probe braucht selbst einen Moment — sie wird nachgereicht und
     steht in den Details, sobald sie da ist. */
  fehler.pruefung = erreichbarkeit(url).then((satz) => {
    if (satz) fehler.diagnose.erreichbarkeit = satz;
    return satz;
  }).catch(() => '');
  return fehler;
}

/* Eine Anfrage, die nie antwortet, ist schlimmer als eine, die scheitert:
   Sie belegt die Leitung, und der nächste Anlauf kommt gar nicht erst
   dran. Auf dem Handy passiert genau das beim Wechsel zwischen WLAN und
   Mobilfunk — die Verbindung steht formal noch, es fliesst nur nichts
   mehr. Nach dieser Frist gilt der Anlauf als gescheitert und der
   nächste darf ran. */
/* Ohne den Worker-Umweg braucht es keine grosszügige Frist mehr: Der
   direkte Weg antwortet oder scheitert, er verschwindet nicht. 60
   Sekunden lassen einem langsamen Gratis-Modell Luft und halten die
   Wartezeit im Erträglichen — zumal die Anläufe parallel laufen. */
export const ANFRAGE_FRIST = 60_000;

/** Bricht ab, wenn zu lange nichts kommt — und sagt, dass es die Frist war. */
function mitFrist(signal) {
  const steuerung = new AbortController();
  const zeit = setTimeout(() => steuerung.abort(new DOMException('Zeit abgelaufen', 'TimeoutError')), ANFRAGE_FRIST);
  const weiter = () => steuerung.abort(signal.reason);
  signal?.addEventListener('abort', weiter, { once: true });
  return {
    signal: steuerung.signal,
    fertig: () => { clearTimeout(zeit); signal?.removeEventListener('abort', weiter); },
    abgelaufen: () => steuerung.signal.reason?.name === 'TimeoutError',
  };
}

async function direkt(url, init, signal, weg = 'direkt') {
  const begonnen = Date.now();
  const frist = mitFrist(signal);
  let antwort;
  try {
    antwort = await fetch(url, { ...init, signal: frist.signal });
  } catch (error) {
    // Ein Abbruch durch den Nutzer geht durch, einer durch die Frist nicht:
    // der ist ein Fehlschlag wie jeder andere und darf einen neuen Anlauf auslösen.
    if (error.name === 'AbortError' && !frist.abgelaufen()) throw error;
    throw verbindungsfehler({
      grund: frist.abgelaufen()
        ? `Zeit abgelaufen nach ${ANFRAGE_FRIST / 1000} s`
        : `${error?.name || 'Fehler'}: ${error?.message || error}`,
      weg, url, init, begonnen,
    });
  } finally {
    frist.fertig();
  }
  return {
    ok: antwort.ok,
    status: antwort.status,
    retryAfter: Number(antwort.headers.get('retry-after')) || 0,
    payload: await antwort.json().catch(() => null),
  };
}

/**
 * Eine POST-Anfrage stellen, möglichst über den Service Worker.
 * @returns {Promise<{ok:boolean, status:number, retryAfter:number, payload:any}>}
 * @throws Error mit name 'AbortError' beim Abbruch, sonst mit lesbarem Text
 */
/* Der Umweg über den Service Worker ist ab Werk aus.

   Er kam dazu, damit eine Erkennung das Sperren des Displays übersteht.
   Gemessen auf dem Gerät richtet er aber genau das Gegenteil an: Drei
   Anläufe mit drei verschiedenen Modellen — darunter ein schnelles,
   bezahltes — endeten alle exakt an derselben 90-Sekunden-Frist, Weg
   „Service Worker", Gerät online, Anfrage 1,66 MB. Drei Modelle
   scheitern nicht zufällig gleichzeitig auf dieselbe Art; der
   gemeinsame Nenner war der Weg.

   Die Ursache liegt in der Lebensdauer: Ein Service Worker wird vom
   Browser beendet, wenn er ihn für untätig hält, und `waitUntil` hält
   ihn nur begrenzt. Wird er mitten in der Anfrage beendet, stirbt die
   fetch stumm — keine Antwort, kein Fehler, nur Stille bis zur Frist.
   Eine Erkennung, die zwanzig Sekunden dauern darf, ist damit genau
   der Fall, den er nicht überlebt.

   Der direkte Weg hat das Problem nicht. Das Sperren des Displays fängt
   inzwischen etwas anderes ab: Die Aufnahme liegt in der Warteschlange,
   und die App nimmt sie nach einem Neustart von selbst wieder auf. */
export async function anfrage(url, init, signal) {
  if (nutzbar() && ueberWorkerErlaubt) {
    const begonnen = Date.now();
    const antwort = await ueberWorker(url, init, signal);

    /* Scheitert der Umweg, wird direkt gefragt statt aufzugeben. Hier
       stand ein throw — und damit war ein Fehlschlag im Worker das Ende
       der Erkennung, obwohl der direkte Weg womöglich durchgekommen
       wäre. Auch 'unbekannt' (Worker zwischendurch beendet) landet hier. */
    if (!antwort.unbekannt && !antwort.fehler) {
      return {
        ok: antwort.ok,
        status: antwort.status,
        retryAfter: antwort.retryAfter || 0,
        payload: parse(antwort.text),
      };
    }

    /* Ist dem Worker die Zeit ausgegangen, war nicht der Worker das
       Problem, sondern die Leitung — und die ist für den direkten Weg
       dieselbe. Nochmal 90 Sekunden dranzuhängen verdoppelt nur die
       Wartezeit: Aus einer Frist wurden in der Praxis 180 Sekunden, bis
       überhaupt eine Fehlermeldung erschien. Also hier Schluss und
       Bescheid sagen; der nächste Anlauf läuft ohnehin schon parallel. */
    if (/Zeit abgelaufen/.test(antwort.grund || '')) {
      throw verbindungsfehler({
        grund: antwort.grund,
        weg: 'Service Worker', url, init, begonnen,
      });
    }

    try {
      return await direkt(url, init, signal, 'direkt nach Worker-Fehlschlag');
    } catch (error) {
      // Beide Wege gescheitert: den Grund des Workers mit angeben.
      if (error.diagnose && antwort.grund) error.diagnose.workerGrund = antwort.grund;
      if (error.diagnose) error.diagnose.workerDauer = `${((Date.now() - begonnen) / 1000).toFixed(1)} s`;
      throw error;
    }
  }
  return direkt(url, init, signal);
}

const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
