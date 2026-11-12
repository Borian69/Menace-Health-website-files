import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { api, type ProjectRow } from '../api';

export type Wahl = { id: string; name: string } | { neu: string };

/** Löst die Wahl auf: legt ein neues Projekt erst beim Speichern an. */
export async function wahlAufloesen(w: Wahl): Promise<{ id: string; name: string }> {
  if ('id' in w) return w;
  const p = await api.createProject(w.neu.trim());
  return { id: p.id, name: p.name };
}

export const wahlGueltig = (w: Wahl | null) => !!w && ('id' in w || w.neu.trim().length > 0);

/** Füllung wächst vom Druckpunkt (Moch: Chips). */
function druckpunkt(e: PointerEvent<HTMLButtonElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--x', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--y', `${e.clientY - r.top}px`);
}

const SICHTBAR = 4;

export function ProjectPicker({ value, onChange, vorwahl }: {
  value: Wahl | null; onChange: (w: Wahl | null) => void; vorwahl?: string;
}) {
  const [projekte, setProjekte] = useState<ProjectRow[] | null>(null);
  const [mehr, setMehr] = useState(false);
  const [neuOffen, setNeuOffen] = useState(false);
  const [neuName, setNeuName] = useState('');
  const feld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.projects().then((p) => {
      setProjekte(p);
      const v = vorwahl && p.find((x) => x.id === vorwahl);
      if (v && !value) onChange({ id: v.id, name: v.name });
      if (!p.length) setNeuOffen(true);
    }).catch(() => setProjekte([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vorwahl]);

  useEffect(() => { if (neuOffen && projekte?.length) feld.current?.focus(); }, [neuOffen, projekte]);

  const gewaehlt = (id: string) => !!value && 'id' in value && value.id === id;
  const chip = (p: ProjectRow) => (
    <button key={p.id} type="button" className="chip" aria-pressed={gewaehlt(p.id)} onPointerDown={druckpunkt}
      onClick={() => { setNeuOffen(false); onChange(gewaehlt(p.id) ? null : { id: p.id, name: p.name }); }}>
      {p.name}
    </button>
  );

  if (!projekte) return <span className="placeholder" style={{ width: '60%' }} />;
  const vorne = projekte.slice(0, SICHTBAR);
  const rest = projekte.slice(SICHTBAR);
  // Ein vorgewähltes Projekt aus dem hinteren Teil nach vorn holen.
  if (value && 'id' in value && rest.some((r) => r.id === value.id)) {
    const i = rest.findIndex((r) => r.id === value.id);
    vorne.push(...rest.splice(i, 1));
  }

  return (
    <div className="stapel-eng">
      <span className="lb">Projekt</span>
      <div className={mehr ? 'offen' : ''}>
        <div className="wahl" role="group" aria-label="Projekt wählen">
          {vorne.map(chip)}
          <button type="button" className="chip" aria-pressed={neuOffen} onPointerDown={druckpunkt}
            onClick={() => {
              const auf = !neuOffen;
              setNeuOffen(auf);
              onChange(auf ? { neu: neuName } : null);
            }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            Neues Projekt
          </button>
        </div>
        {rest.length > 0 && (
          <>
            <div className="mehr-wrap"><div><div className="wahl">{rest.map(chip)}</div></div></div>
            <button type="button" className="mehr" onClick={() => setMehr(!mehr)} aria-expanded={mehr}>
              {mehr ? 'Weniger anzeigen' : `Weitere anzeigen (${rest.length})`}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </>
        )}
      </div>
      {neuOffen && (
        <div className="field" style={{ marginTop: 'var(--f3)' }}>
          <label htmlFor="neues-projekt">Name des neuen Projekts</label>
          <input id="neues-projekt" ref={feld} value={neuName} maxLength={120} autoComplete="off"
            placeholder="z. B. Kundentermin Weber" enterKeyHint="done"
            onChange={(e) => { setNeuName(e.target.value); onChange({ neu: e.target.value }); }} />
        </div>
      )}
    </div>
  );
}
