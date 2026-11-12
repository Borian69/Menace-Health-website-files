import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type ProjectDetail, type Recording, type ServerStatus } from '../api';
import type { Go } from '../App';
import { FileImport } from '../components/FileImport';
import { audioHerunterladen, herunterladen, Player } from '../components/Player';
import { LAUFEND, StatusText } from '../components/Status';
import { SummaryView } from '../components/SummaryView';
import { TranscriptView } from '../components/TranscriptView';
import { useToast } from '../components/Toast';
import { dauer, datum, datumZeit, dollar, groesse, zahl } from '../lib/format';

export function ProjectPage({ id, status, go, aktiv }: { id: string; status: ServerStatus; go: Go; aktiv: boolean }) {
  const toast = useToast();
  const [p, setP] = useState<ProjectDetail | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [umbenennen, setUmbenennen] = useState(false);
  const [name, setName] = useState('');
  const [bestaetigen, setBestaetigen] = useState(false);
  const [startet, setStartet] = useState(false);
  const [player, setPlayer] = useState<{ rec: Recording; sek: number } | null>(null);
  const [hinzufuegen, setHinzufuegen] = useState(false);

  const lade = useCallback(() => {
    api.project(id).then((d) => { setP(d); setFehler(null); }).catch((e) => setFehler(e.message));
  }, [id]);
  useEffect(() => { lade(); }, [lade]);

  const laeuft = !!p && LAUFEND.includes(p.status);
  // Fortschritt sichtbar: während der Verarbeitung alle 2 s nachsehen.
  useEffect(() => {
    if (!laeuft) return;
    const t = window.setInterval(lade, 2000);
    return () => window.clearInterval(t);
  }, [laeuft, lade]);

  if (fehler && !p) {
    return (
      <>
        <div className="app-kopf"><h1>Projekt</h1></div>
        <div className="notice is-error" role="alert"><span><strong>Nicht geladen.</strong> {fehler}</span></div>
        <button className="btn btn-quiet" onClick={() => go('/projekte')}>Zurück zu allen Projekten</button>
      </>
    );
  }
  if (!p) return <><span className="placeholder" style={{ height: 56, width: '70%' }} /><span className="placeholder" /></>;

  const speichereName = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      setP(await api.renameProject(id, name.trim()));
      setUmbenennen(false);
      toast('Umbenannt.');
    } catch (err) { setFehler((err as Error).message); }
  };

  const starte = async () => {
    setStartet(true);
    try {
      setP(await api.process(id));
      setBestaetigen(false);
    } catch (e) { setFehler((e as Error).message); lade(); } finally { setStartet(false); }
  };

  const aufnahmeAktion = async (r: Recording, art: 'hoch' | 'runter' | 'name' | 'loeschen') => {
    try {
      if (art === 'loeschen') {
        if (!window.confirm(`„${r.filename}“ (${dauer(r.duration_s)}) aus dem Projekt entfernen und löschen?`)) return;
        await api.deleteRecording(r.id);
        if (player?.rec.id === r.id) setPlayer(null);
        toast('Entfernt.', r.filename);
      } else if (art === 'name') {
        const neu = window.prompt('Neuer Name der Aufnahme', r.filename);
        if (!neu?.trim()) return;
        await api.patchRecording(r.id, { filename: neu.trim() });
      } else {
        await api.patchRecording(r.id, { move: art === 'hoch' ? -1 : 1 });
      }
      lade();
    } catch (e) { setFehler((e as Error).message); }
  };

  const loescheProjekt = async () => {
    if (!window.confirm(`Projekt „${p.name}“ mit ${p.recording_count} Aufnahmen, Transkripten und Zusammenfassung endgültig löschen?`)) return;
    try { await api.deleteProject(id); toast('Gelöscht.', p.name); go('/projekte'); }
    catch (e) { setFehler((e as Error).message); }
  };

  const springe = (nr: number, sek: number) => {
    const rec = p.recordings[nr - 1];
    if (rec) setPlayer({ rec, sek });
  };

  const transkribiert = p.recordings.filter((r) => r.has_transcript).length;
  const aktuell = p.status === 'fertig' && !p.summary_stale;
  const kannStarten = p.recordings.length > 0 && !laeuft && !aktuell;
  const fortschritt = p.progress && p.progress.total > 0 ? p.progress.done / p.progress.total : null;

  return (
    <>
      <button className="btn btn-quiet zurueck" onClick={() => go('/projekte')}>‹ Alle Projekte</button>

      <div className="app-kopf">
        {!umbenennen ? (
          <div className="titelzeile">
            <h1>{p.name}</h1>
            <button className="icon-btn" aria-label="Projekt umbenennen" onClick={() => { setName(p.name); setUmbenennen(true); }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>
            </button>
          </div>
        ) : (
          <form onSubmit={speichereName} className="stapel-eng">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="pname">Projektname</label>
              <input id="pname" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="row">
              <button className="btn btn-ghost" type="submit" disabled={!name.trim()}>Namen speichern</button>
              <button className="btn btn-quiet" type="button" onClick={() => setUmbenennen(false)}>Abbrechen</button>
            </div>
          </form>
        )}
        <p className="kz">
          <span className="n">{p.recording_count}</span> {p.recording_count === 1 ? 'Aufnahme' : 'Aufnahmen'} · <span className="n">{dauer(p.total_duration_s)}</span> · erstellt <span className="n">{datum(p.created_at)}</span>
        </p>
      </div>

      {fehler && <div className="notice is-error" role="alert"><span><strong>Fehler.</strong> {fehler}</span></div>}

      {/* ── Status und Verarbeitung ── */}
      <section className="gruppe stapel-eng">
        <p className="lb">Status</p>
        <p className="status-zeile"><StatusText status={p.status} veraltet={p.summary_stale} /></p>
        {laeuft && (
          <div className="mass">
            <div className="spur">
              <span className="tick" />
              <span className="fill" style={{ ['--wert' as string]: fortschritt ?? 0.04 }} />
              <span className="jetzt" style={{ ['--wert' as string]: fortschritt ?? 0.04 }} />
              <span className="tick" />
            </div>
            <div className="unten"><span>{p.progress?.detail ?? 'Startet'}</span>
              {fortschritt != null && <b className="n">{Math.round(fortschritt * 100)} %</b>}</div>
          </div>
        )}
        {p.status === 'fehler' && p.error && (
          <div className="notice is-error" role="alert">
            <span><strong>Verarbeitung gestoppt.</strong> {p.error} Bereits fertige Transkripte bleiben erhalten und werden nicht wiederholt.</span>
          </div>
        )}
        {!status.llm_ready && !aktuell && (status.betrieb === 'geraet' ? (
          <div className="notice is-warning">
            <span><strong>Schlüssel fehlt.</strong> Für Transkription und Zusammenfassung einmal den OpenRouter-Schlüssel eintragen.{' '}
              <button className="btn btn-quiet" onClick={() => go('/einstellungen')}>Zu den Einstellungen</button></span>
          </div>
        ) : (
          <p className="klein muted">Hinweis: Auf dem Server fehlt der OpenRouter-Schlüssel. Transkribiert wird trotzdem, die Zusammenfassung folgt, sobald er hinterlegt ist.</p>
        ))}
        {laeuft && status.betrieb === 'geraet' && (
          <p className="klein muted">Die Verarbeitung läuft auf diesem Gerät: App geöffnet lassen, der Bildschirm bleibt dafür an.
            Wird sie unterbrochen, geht es beim nächsten Start ab dem letzten fertigen Abschnitt weiter.</p>
        )}
      </section>

      {/* ── Aufnahmen ── */}
      <section className="gruppe">
        <p className="eyebrow">Aufnahmen</p>
        {p.recordings.length === 0 && (
          <div className="empty"><p>Noch keine Aufnahmen. Aufnehmen oder Dateien hinzufügen.</p></div>
        )}
        {p.recordings.map((r, i) => (
          <div className="eintrag aufnahme" key={r.id}>
            <span className="tag n">A{i + 1}</span>
            <span className="was">{r.filename}
              <small>
                <span className="n">{dauer(r.duration_s)}</span> · <span className="n">{groesse(r.size_bytes)}</span>
                {' · '}{r.source === 'aufnahme' ? 'Aufnahme' : 'Import'}
                {' · '}{r.status === 'transkribiert' ? 'transkribiert' : r.status === 'fehler' ? <span className="fehlertext">Fehler: {r.error}</span> : 'noch nicht transkribiert'}
              </small>
              <small>Hinzugefügt <span className="n">{datumZeit(r.created_at)}</span></small>
            </span>
            <span className="wert aktionen">
              <button className="icon-btn" aria-label={`${r.filename} abspielen`} onClick={() => setPlayer({ rec: r, sek: 0 })}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z" /></svg>
              </button>
              {!laeuft && (
                <details className="menue">
                  <summary className="icon-btn" aria-label="Weitere Aktionen">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
                  </summary>
                  <div className="menue-liste">
                    <button onClick={() => void aufnahmeAktion(r, 'name')}>Umbenennen</button>
                    {i > 0 && <button onClick={() => void aufnahmeAktion(r, 'hoch')}>Nach oben</button>}
                    {i < p.recordings.length - 1 && <button onClick={() => void aufnahmeAktion(r, 'runter')}>Nach unten</button>}
                    <button onClick={() => void audioHerunterladen(r).catch((e) => setFehler(e.message))}>Herunterladen</button>
                    <button className="gefahr" onClick={() => void aufnahmeAktion(r, 'loeschen')}>Entfernen</button>
                  </div>
                </details>
              )}
            </span>
          </div>
        ))}

        {!laeuft && (
          <div className="stapel" style={{ marginTop: 'var(--f4)' }}>
            {!hinzufuegen ? (
              <div className="row">
                <button className="btn btn-ghost" onClick={() => setHinzufuegen(true)}>Dateien hinzufügen</button>
                <button className="btn btn-ghost" onClick={() => go(`/aufnahme/${id}`)}>Neue Aufnahme</button>
              </div>
            ) : (
              <FileImport bereit maxMb={status.max_upload_mb} ziel={async () => id} knopf="Dateien auswählen"
                onFertig={(r) => { toast('Hinzugefügt.', `${r.length} ${r.length === 1 ? 'Datei' : 'Dateien'}.`); lade(); }} />
            )}
          </div>
        )}
      </section>

      {/* ── Start: erst die Übersicht, dann die Verarbeitung ── */}
      {kannStarten && (
        <section className="gruppe">
          {!bestaetigen ? (
            <button className="btn btn-primary btn-block" onClick={() => setBestaetigen(true)}>Transkribieren und zusammenfassen</button>
          ) : (
            <div className="stapel-eng bestaetigung">
              <p className="lb">Das wird verarbeitet</p>
              <p className="dataline">
                <span>Aufnahmen <b className="n">{p.recording_count}</b></span>
                <span>Dauer <b className="n">{dauer(p.total_duration_s)}</b></span>
                <span>Schon transkribiert <b className="n">{transkribiert}</b></span>
              </p>
              <p className="klein muted">
                {status.betrieb === 'geraet'
                  ? <>Transkription über OpenRouter ({status.whisper_model}) in Abschnitten zu 2 Minuten, Stille wird übersprungen. Danach eine
                    Zusammenfassung über alle Aufnahmen ({status.model}). Die App muss dabei geöffnet bleiben. Fertige Abschnitte werden wiederverwendet.</>
                  : <>Transkription lokal auf dem Server ({status.whisper_model}), danach eine Zusammenfassung über alle Aufnahmen
                    ({status.model}). Fertige Transkripte werden wiederverwendet.</>}
              </p>
              <div className="row">
                <button className="btn btn-primary" onClick={starte} disabled={startet} aria-busy={startet}>Jetzt starten</button>
                <button className="btn btn-quiet" onClick={() => setBestaetigen(false)}>Abbrechen</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── Zusammenfassung ── */}
      {p.summary && (
        <section className="gruppe">
          <hr className="haar" />
          <h2 className="zf-titel">Zusammenfassung</h2>
          {p.summary_stale && (
            <div className="notice is-info"><span><strong>Nicht mehr aktuell.</strong> Sie stammt vom {datumZeit(p.summary_at!)}; die Aufnahmen haben sich seitdem geändert.</span></div>
          )}
          <p className="dataline offen">
            <span>Erstellt <b className="n">{datumZeit(p.summary_at!)}</b></span>
            <span>KI-Aufrufe <b className="n">{p.usage.calls}</b></span>
            <span>Token <b className="n">{zahl(p.usage.prompt_tokens + p.usage.completion_tokens)}</b></span>
            <span>Kosten <b className="n">{dollar(p.usage.cost_usd)}</b></span>
            {p.summary._meta && <span>Verfahren <b>{p.summary._meta.verfahren}</b></span>}
          </p>
          <SummaryView s={p.summary} springe={springe} />
        </section>
      )}

      {/* ── Transkript ── */}
      {transkribiert > 0 && (
        <section className="gruppe">
          <TranscriptView projectId={id} version={`${p.summary_at}-${transkribiert}-${p.updated_at}`} springe={springe} />
        </section>
      )}

      <section className="gruppe row">
        <button className="btn btn-quiet" onClick={() => api.exportMarkdown(id).then((t) => herunterladen(t, `${p.name}.md`)).catch((e) => setFehler(e.message))}>
          Als Markdown exportieren
        </button>
        <button className="btn btn-quiet gefahr" onClick={loescheProjekt} disabled={laeuft}>Projekt löschen</button>
      </section>

      {player && aktiv && (
        <Player rec={player.rec} sek={player.sek} nr={p.recordings.findIndex((r) => r.id === player.rec.id) + 1}
          onClose={() => setPlayer(null)} />
      )}
    </>
  );
}
