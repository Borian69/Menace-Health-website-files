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

function ueberWorker(url, init, signal) {
  const id = `${Date.now()}-${(laufendeNummer += 1)}`;

  return new Promise((resolve, reject) => {
    offen.set(id, { resolve, reject });

    const abbrechen = () => {
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

async function direkt(url, init, signal) {
  let antwort;
  try {
    antwort = await fetch(url, { ...init, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Keine Verbindung zur Erkennung. Ist das Handy online?');
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
    const antwort = await ueberWorker(url, init, signal);
    // 'unbekannt': Der Worker wurde zwischendurch beendet und weiß
    // nichts mehr von der Anfrage. Dann eben selbst fragen.
    if (!antwort.unbekannt) {
      if (antwort.fehler) throw new Error('Keine Verbindung zur Erkennung. Ist das Handy online?');
      return {
        ok: antwort.ok,
        status: antwort.status,
        retryAfter: antwort.retryAfter || 0,
        payload: parse(antwort.text),
      };
    }
  }
  return direkt(url, init, signal);
}

const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };
