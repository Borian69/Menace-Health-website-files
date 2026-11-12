import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, type ProjectRow } from '../api';
import type { Go } from '../App';
import { StatusText } from '../components/Status';
import { dauer, datum } from '../lib/format';

export function ProjectsPage({ go, aktiv }: { go: Go; aktiv: boolean }) {
  const [liste, setListe] = useState<ProjectRow[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neuOffen, setNeuOffen] = useState(false);
  const [name, setName] = useState('');
  const [legtAn, setLegtAn] = useState(false);

  const lade = useCallback(() => {
    api.projects().then((l) => { setListe(l); setFehler(null); }).catch((e) => setFehler(e.message));
  }, []);
  useEffect(() => { if (aktiv) lade(); }, [aktiv, lade]);

  // Laufende Verarbeitungen: Liste alle 4 s auffrischen.
  useEffect(() => {
    if (!aktiv || !liste?.some((p) => ['transkribiert', 'analysiert', 'zusammenfassung'].includes(p.status))) return;
    const t = window.setInterval(lade, 4000);
    return () => window.clearInterval(t);
  }, [aktiv, liste, lade]);

  const anlegen = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLegtAn(true);
    try {
      const p = await api.createProject(name.trim());
      go(`/projekte/${p.id}`);
    } catch (err) {
      setFehler((err as Error).message);
    } finally { setLegtAn(false); }
  };

  const gesamt = liste?.reduce((n, p) => n + p.total_duration_s, 0) ?? 0;

  return (
    <>
      <div className="app-kopf">
        <h1>Projekte</h1>
        <p className="kz">
          {liste ? <><span className="n">{liste.length}</span> {liste.length === 1 ? 'Projekt' : 'Projekte'} · <span className="n">{dauer(gesamt)}</span> Audio</> : 'Lädt'}
        </p>
      </div>

      <div className="gruppe">
        {!neuOffen ? (
          <button className="btn btn-ghost" onClick={() => setNeuOffen(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Neues Projekt
          </button>
        ) : (
          <form onSubmit={anlegen} className="stapel-eng">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="projekt-name">Name des Projekts</label>
              <input id="projekt-name" autoFocus value={name} maxLength={120} onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Vorlesung Statik, Woche 3" autoComplete="off" />
            </div>
            <div className="row">
              <button className="btn btn-primary" type="submit" disabled={!name.trim() || legtAn} aria-busy={legtAn}>Projekt anlegen</button>
              <button className="btn btn-quiet" type="button" onClick={() => { setNeuOffen(false); setName(''); }}>Abbrechen</button>
            </div>
          </form>
        )}
      </div>

      {fehler && <div className="notice is-error" role="alert"><span><strong>Fehler.</strong> {fehler}</span></div>}

      <div className="gruppe">
        {liste === null && !fehler && <><span className="placeholder" /><span className="placeholder" style={{ width: '70%' }} /></>}
        {liste?.length === 0 && (
          <div className="empty">
            <p>Noch keine Projekte. Ein Projekt sammelt Aufnahmen zu einem Thema – etwa alle Termine mit einem Kunden.</p>
          </div>
        )}
        {liste?.map((p) => (
          <a className="eintrag projekt" key={p.id} href={`#/projekte/${p.id}`}>
            <span className="tag n">{datum(p.updated_at).slice(0, 5)}</span>
            <span className="was">{p.name}
              <small>
                <span className="n">{p.recording_count}</span> {p.recording_count === 1 ? 'Aufnahme' : 'Aufnahmen'}
                {' · '}<span className="n">{dauer(p.total_duration_s)}</span>
                {' · '}<StatusText status={p.status} veraltet={p.summary_stale} />
              </small>
              <small>Geändert <span className="n">{datum(p.updated_at)}</span> · erstellt <span className="n">{datum(p.created_at)}</span></small>
            </span>
            <span className="wert" aria-hidden="true">›</span>
          </a>
        ))}
      </div>
    </>
  );
}
