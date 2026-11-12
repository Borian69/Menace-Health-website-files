import { useState } from 'react';
import { api, type TranscriptBlock } from '../api';
import { dauer, stempel } from '../lib/format';

/** Aufklappbar; lädt das Transkript erst beim Öffnen. */
export function TranscriptView({ projectId, version, springe }: {
  projectId: string; version: string; springe: (nr: number, sek: number) => void;
}) {
  const [blocks, setBlocks] = useState<TranscriptBlock[] | null>(null);
  const [geladen, setGeladen] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);

  const lade = () => {
    if (geladen === version) return;
    setFehler(null);
    api.transcript(projectId).then((b) => { setBlocks(b); setGeladen(version); }).catch((e) => setFehler(e.message));
  };

  return (
    <details className="transkript" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) lade(); }}>
      <summary className="btn btn-ghost btn-block">Vollständiges Transkript anzeigen</summary>
      {fehler && <p className="notice is-error"><span><strong>Fehler:</strong> {fehler}</span></p>}
      {!blocks && !fehler && <p className="placeholder" style={{ width: '80%' }} />}
      {blocks?.map((b, i) => (
        <section className="gruppe" key={b.recording_id}>
          <p className="eyebrow"><span className="n">A{i + 1}</span> {b.filename}</p>
          <p className="dataline offen"><span>Dauer <b className="n">{dauer(b.duration_s)}</b></span><span>Abschnitte <b className="n">{b.segments.length}</b></span></p>
          {b.segments.length === 0 ? <p className="muted">Noch nicht transkribiert – oder keine Sprache erkannt.</p> : (
            <div className="segmente">
              {b.segments.map((s, j) => (
                <p key={j}>
                  <button type="button" className="zeit n" onClick={() => springe(i + 1, s.start)} title="Abspielen ab hier">
                    {stempel(s.start)}
                  </button>
                  <span>{s.text}</span>
                </p>
              ))}
            </div>
          )}
        </section>
      ))}
    </details>
  );
}
