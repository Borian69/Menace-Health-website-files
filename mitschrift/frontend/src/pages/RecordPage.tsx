import { useEffect, useMemo, useState } from 'react';
import type { ServerStatus } from '../api';
import type { Go } from '../App';
import { FileImport } from '../components/FileImport';
import { ProjectPicker, wahlAufloesen, wahlGueltig, type Wahl } from '../components/ProjectPicker';
import { useToast } from '../components/Toast';
import { dauer, datumZeit, groesse } from '../lib/format';
import { idb, type Session } from '../lib/idb';
import { hatWakeLock, hintergrundHinweis, kannAufnehmen, plattform } from '../lib/platform';
import { BLOCK_MS, offeneSitzungen, recorder, type RecSnapshot } from '../lib/recorder';
import { ladeSitzungHoch, standardName } from '../lib/uploads';

const KENNUNG: Record<RecSnapshot['state'], string> = {
  leer: 'Bereit',
  startet: 'Mikrofon wird geöffnet',
  aufnahme: `Läuft · alle ${BLOCK_MS / 1000} s gesichert`,
  pausiert: 'Pausiert',
  unterbrochen: 'Unterbrochen · bisher Aufgenommenes ist gesichert',
  beendet: 'Beendet · noch nicht gespeichert',
};

export function RecordPage({ status, go, importModus, vorwahl }: {
  status: ServerStatus; go: Go; importModus: boolean; vorwahl?: string;
}) {
  const toast = useToast();
  const [snap, setSnap] = useState<RecSnapshot>(() => recorder.snapshot());
  const [, setTick] = useState(0);
  const [offen, setOffen] = useState<Session[]>([]);
  const [wahl, setWahl] = useState<Wahl | null>(null);
  const [name, setName] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const [anteil, setAnteil] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState<{ id: string; name: string } | null>(null);
  const [wach, setWach] = useState(recorder.keepAwake);
  const [importAuf, setImportAuf] = useState(importModus);
  const [importWahl, setImportWahl] = useState<Wahl | null>(null);
  const [geteilt, setGeteilt] = useState<File[]>([]);

  const p = useMemo(plattform, []);
  const hinweis = useMemo(() => hintergrundHinweis(p), [p]);
  const faehig = useMemo(kannAufnehmen, []);

  useEffect(() => recorder.subscribe(setSnap), []);

  // Zeit und Pegel laufen sichtbar, solange aufgenommen wird.
  useEffect(() => {
    if (snap.state !== 'aufnahme') return;
    const t = window.setInterval(() => setTick((n) => n + 1), 200);
    return () => window.clearInterval(t);
  }, [snap.state]);

  // Nicht hochgeladene Aufnahmen vom Gerät (Absturz, Neuladen, Upload-Fehler).
  const ladeOffene = () => offeneSitzungen(recorder.snapshot().session?.id).then(setOffen).catch(() => setOffen([]));
  useEffect(() => { void ladeOffene(); }, []);

  // Von einer anderen App geteilte Dateien (Android, über den Service Worker).
  useEffect(() => {
    if (!importModus) return;
    setImportAuf(true);
    idb.sharedFiles().then((files) => {
      setGeteilt(files.map((f) => new File([f.blob], f.name, { type: f.type })));
      void idb.clearShared();
    }).catch(() => undefined);
  }, [importModus]);

  // Schließen während der Aufnahme: der Browser fragt nach.
  useEffect(() => {
    if (snap.state !== 'aufnahme' && snap.state !== 'pausiert') return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [snap.state]);

  const s = snap.session;
  const sek = recorder.elapsedMs() / 1000;
  const level = snap.state === 'aufnahme' ? recorder.snapshot().level : 0;

  const starte = async () => {
    setGespeichert(null);
    setFehler(null);
    try { await recorder.start(); } catch { /* Meldung kommt über snap.meldung */ }
  };

  const speichere = async () => {
    if (!s || !wahlGueltig(wahl)) return;
    setSpeichert(true);
    setFehler(null);
    setAnteil(0);
    try {
      const ziel = await wahlAufloesen(wahl!);
      await ladeSitzungHoch(s, ziel.id, ziel.name, name, setAnteil);
      recorder.reset();
      setWahl(null);
      setName('');
      setGespeichert(ziel);
      toast('Gespeichert.', `Die Aufnahme liegt in „${ziel.name}“.`);
      void ladeOffene();
    } catch (e) {
      setFehler((e as Error).message);
    } finally {
      setSpeichert(false);
    }
  };

  const verwerfe = async (sitzung: Session) => {
    if (!window.confirm(`Aufnahme vom ${datumZeit(sitzung.createdAt)} (${dauer(sitzung.durationMs / 1000)}) endgültig löschen?`)) return;
    await idb.deleteSession(sitzung.id);
    if (recorder.snapshot().session?.id === sitzung.id) recorder.reset();
    setFehler(null);
    void ladeOffene();
  };

  const uebernimm = (sitzung: Session) => {
    if (recorder.adopt(sitzung)) {
      setName(sitzung.name ?? '');
      if (sitzung.projectId) setWahl({ id: sitzung.projectId, name: sitzung.projectName ?? '' });
      setOffen((o) => o.filter((x) => x.id !== sitzung.id));
      document.querySelector('.seite')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const laeuft = snap.state === 'aufnahme' || snap.state === 'pausiert';
  const darfSpeichern = snap.state === 'beendet' && wahlGueltig(wahl);

  return (
    <>
      <div className="app-kopf">
        <h1>{snap.state === 'leer' ? 'Aufnahme' : s && snap.state === 'beendet' && name ? name : 'Neue Aufnahme'}</h1>
        <p className="kz">{KENNUNG[snap.state]}</p>
      </div>

      {!faehig.ok && (
        <div className="gruppe notice is-warning" role="alert">
          <span><strong>Aufnehmen geht hier nicht.</strong> {faehig.grund} Audiodateien lassen sich trotzdem importieren.</span>
        </div>
      )}

      {/* Die Kennzahl dieser Ansicht: die aufgenommene Zeit. */}
      <div className="gruppe aufnahme-block">
        <div className={`uhr${snap.state === 'aufnahme' ? ' laeuft' : ''}`} aria-live="off">
          <span className="number n">{dauer(sek)}</span>
        </div>
        <div className={`pegel${laeuft ? '' : ' still'}`} aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0.02, level)})` }} /></div>
        <p className="dataline offen">
          <span>Gesichert <b className="n">{groesse(s?.bytes ?? 0)}</b></span>
          {s && s.segments > 1 && <span>Teilstücke <b className="n">{s.segments}</b></span>}
          {laeuft && <span>Bildschirm wach <b>{snap.wakeLock ? 'ja' : 'nein'}</b></span>}
          {s && s.gaps.length > 0 && <span>Lücken <b className="n">{s.gaps.length}</b></span>}
        </p>
      </div>

      {snap.meldung && (
        <div className={`notice ${snap.state === 'unterbrochen' ? 'is-error' : 'is-warning'}`} role="alert">
          <span><strong>{snap.state === 'unterbrochen' ? 'Unterbrochen.' : 'Hinweis.'}</strong> {snap.meldung}</span>
        </div>
      )}

      <div className="gruppe steuerung">
        {(snap.state === 'leer' || snap.state === 'startet') && (
          <button className="btn btn-primary rec is-circle" onClick={starte} disabled={!faehig.ok || snap.state === 'startet'}
            aria-busy={snap.state === 'startet'}>
            <span className="rec-punkt" aria-hidden="true" />
            Aufnahme starten
          </button>
        )}
        {snap.state === 'aufnahme' && (
          <>
            <button className="btn btn-ghost rec is-circle" onClick={() => recorder.pause()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12" /></svg>
              Pause
            </button>
            <button className="btn btn-ghost" onClick={() => void recorder.stop()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>
              Aufnahme beenden
            </button>
          </>
        )}
        {snap.state === 'pausiert' && (
          <>
            <button className="btn btn-primary rec is-circle" onClick={() => recorder.resume()}>
              <span className="rec-punkt" aria-hidden="true" />
              Fortsetzen
            </button>
            <button className="btn btn-ghost" onClick={() => void recorder.stop()}>Aufnahme beenden</button>
          </>
        )}
        {snap.state === 'unterbrochen' && (
          <>
            <button className="btn btn-primary rec is-circle" onClick={() => void recorder.continueRecording()}>
              <span className="rec-punkt" aria-hidden="true" />
              Weiter aufnehmen
            </button>
            <button className="btn btn-ghost" onClick={() => void recorder.stop()}>Aufnahme beenden</button>
          </>
        )}
      </div>

      {snap.state === 'beendet' && s && (
        <div className="gruppe speichern stapel">
          <div className="field">
            <label htmlFor="aufnahme-name">Name der Aufnahme</label>
            <input id="aufnahme-name" value={name} maxLength={120} placeholder={standardName(s)}
              onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <ProjectPicker value={wahl} onChange={setWahl} vorwahl={vorwahl} />
          {fehler && (
            <div className="notice is-error" role="alert">
              <span><strong>Nicht gespeichert.</strong> {fehler} Die Aufnahme bleibt auf diesem Gerät, bis der Upload klappt.</span>
            </div>
          )}
          {s.gaps.length > 0 && (
            <p className="klein muted">
              Erkannte Lücken bei <span className="n">{s.gaps.map((g) => dauer(g.at / 1000)).join(', ')}</span>.
            </p>
          )}
          <div className="row">
            <button className="btn btn-quiet" onClick={() => void verwerfe(s)} disabled={speichert}>Verwerfen</button>
          </div>
        </div>
      )}

      {gespeichert && snap.state === 'leer' && (
        <div className="gruppe notice is-success">
          <span><strong>Gespeichert</strong> in „{gespeichert.name}“.{' '}
            <button className="btn btn-quiet" onClick={() => go(`/projekte/${gespeichert.id}`)}>Projekt öffnen</button>
          </span>
        </div>
      )}

      {offen.length > 0 && (
        <section className="gruppe">
          <p className="eyebrow">Noch auf diesem Gerät</p>
          <p className="klein muted">Diese Aufnahmen sind nicht beim Server – etwa nach einem Absturz oder ohne Verbindung.</p>
          {offen.map((o) => (
            <div className="eintrag" key={o.id}>
              <span className="tag n">{dauer(o.durationMs / 1000)}</span>
              <span className="was">{o.name || standardName(o)}
                <small><span className="n">{groesse(o.bytes)}</span>{o.projectName ? ` · für „${o.projectName}“` : ''}
                  {o.lastError ? ` · Fehler: ${o.lastError}` : ''}</small>
              </span>
              <span className="wert row" style={{ margin: 0, flexWrap: 'nowrap' }}>
                <button className="btn btn-ghost" onClick={() => uebernimm(o)} disabled={snap.state !== 'leer'}>Speichern</button>
                <button className="icon-btn" aria-label="Verwerfen" onClick={() => void verwerfe(o)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="gruppe">
        <details className="hinweis" open={p === 'ios' && snap.state === 'leer' ? true : undefined}>
          <summary className="lb">Aufnahme bei gesperrtem Bildschirm</summary>
          <div className="stapel-eng">
            <p><strong>{hinweis.titel}.</strong> {hinweis.text}</p>
            {hinweis.alternative && <p className="muted">{hinweis.alternative}</p>}
            {hatWakeLock() ? (
              <label className="schalter">
                <input type="checkbox" checked={wach} onChange={(e) => { recorder.keepAwake = e.target.checked; setWach(e.target.checked); }} />
                Bildschirm während der Aufnahme wach halten
              </label>
            ) : <p className="klein muted">Dieser Browser kann den Bildschirm nicht wach halten. Automatische Sperre in den Einstellungen verlängern.</p>}
          </div>
        </details>
      </section>

      <section className="gruppe">
        {!importAuf ? (
          <button className="btn btn-quiet" onClick={() => setImportAuf(true)}>
            Audiodatei aus einer anderen App importieren
          </button>
        ) : (
          <div className="stapel">
            <p className="eyebrow">Importieren</p>
            <ProjectPicker value={importWahl} onChange={setImportWahl} vorwahl={vorwahl} />
            <FileImport bereit={wahlGueltig(importWahl)} maxMb={status.max_upload_mb} vorbelegt={geteilt}
              ziel={async () => (await wahlAufloesen(importWahl!)).id}
              onFertig={(r) => toast('Importiert.', `${r.length} ${r.length === 1 ? 'Datei' : 'Dateien'} hinzugefügt.`)} />
          </div>
        )}
      </section>

      {/* Bedingte Hauptaktion: erst sichtbar, wenn es etwas Gültiges zu speichern gibt. */}
      <div className={`aktion${darfSpeichern ? ' da' : ''}`} style={{ ['--a' as string]: darfSpeichern ? 1 : 0 }}>
        <button className="btn btn-primary btn-block" onClick={speichere} disabled={!darfSpeichern || speichert} aria-busy={speichert}>
          {speichert ? `Wird hochgeladen … ${Math.round(anteil * 100)} %` : 'Aufnahme speichern'}
        </button>
      </div>
    </>
  );
}
