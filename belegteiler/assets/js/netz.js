/* Netzanfragen, die das Sperren des Displays überstehen.

   Geht das Handy in den Standby oder wandert die Seite in den
   Hintergrund, friert der Browser sie ein. Eine Anfrage, die aus der
   Seite heraus läuft, hängt dann fest: Die Antwort mag längst da sein,
   aber der Code, der sie entgegennimmt, läuft nicht mehr. Für eine
   Erkennung, die zwanzig Sekunden dauert, reicht ein kurzer Blick zur
   Seite — und der Vorgang steht.

   Ein Service Worker gehört nicht zur Seite und hat das Problem nicht.
   Läuft einer, bekommt er die Anfrage; `event.waitUntil` hält ihn so
   lange am Leben. Das Ergebnis legt er haltbar ab, bevor er es meldet.
   Damit findet die Seite es auch dann noch, wenn sie zwischendurch
   ganz verworfen und neu aufgebaut wurde.

   Bleibt der Umweg aus irgendeinem Grund stumm, wird direkt gefragt.
   Langsamer, aber nie ein Totalausfall. */

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

/* Kommt gar nichts zurück, darf die App nicht ewig warten. Der Worker
   kann zwischendurch ersetzt oder beendet worden sein, dann läuft die
   Erkennung gegen eine Wand und die Anzeige steht still. Nach dieser
   Frist wird stattdessen direkt gefragt. Grosszügig bemessen: Ein Bild
   mit mehreren Abschnitten darf durchaus eine Minute brauchen. */
const WORKER_FRIST = 90_000;

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
function verbindungsfehler({ grund, weg, url, init, begonnen }) {
  const mb = ((init?.body?.length || 0) / 1024 / 1024).toFixed(2);
  const sekunden = ((Date.now() - begonnen) / 1000).toFixed(1);

  const fehler = new Error('Keine Verbindung zur Erkennung. Ist das Handy online?');
  fehler.wiederholbar = true;   // kommt das Netz zurück, klappt es
  fehler.diagnose = {
    grund,
    weg,
    ziel: String(url).replace(/^(https?:\/\/[^/]+).*$/, '$1'),
    anfrageMB: mb,
    dauerSekunden: sekunden,
    geraetOnline: navigator.onLine,
  };
  return fehler;
}

async function direkt(url, init, signal, weg = 'direkt') {
  const begonnen = Date.now();
  let antwort;
  try {
    antwort = await fetch(url, { ...init, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw verbindungsfehler({
      grund: `${error?.name || 'Fehler'}: ${error?.message || error}`,
      weg, url, init, begonnen,
    });
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
export async function anfrage(url, init, signal) {
  if (nutzbar()) {
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
