import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type Recording } from '../api';
import { dauer, groesse } from '../lib/format';
import { dateiSchluessel, dauerImBrowser } from '../lib/uploads';

export const ACCEPT = '.mp3,.wav,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm,.mp4,audio/*';

type Zeile = {
  key: string;
  file: File;
  dauer: number | null;
  status: 'wartet' | 'laedt' | 'fertig' | 'fehler';
  anteil: number;
  fehler?: string;
};

/**
 * Dateien auswählen und nacheinander hochladen. Zeigt je Datei Name, Dauer,
 * Größe und Status. `ziel` liefert die Projekt-ID erst beim Start – so kann
 * ein neues Projekt bis zuletzt offen bleiben.
 */
export function FileImport({ ziel, bereit, maxMb, onFertig, vorbelegt, knopf = 'Audiodateien auswählen' }: {
  ziel: () => Promise<string>;
  bereit: boolean;
  maxMb: number;
  onFertig?: (r: Recording[]) => void;
  vorbelegt?: File[];
  knopf?: string;
}) {
  const [zeilen, setZeilen] = useState<Zeile[]>([]);
  const [laeuft, setLaeuft] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const hinzu = (files: File[]) => {
    const neu: Zeile[] = files.map((f) => ({
      key: `${f.name}-${f.size}-${f.lastModified}`, file: f, dauer: null, anteil: 0,
      status: f.size > maxMb * 1024 * 1024 ? 'fehler' : 'wartet',
      fehler: f.size > maxMb * 1024 * 1024 ? `Größer als ${maxMb} MB` : undefined,
    }));
    setZeilen((z) => [...z, ...neu.filter((n) => !z.some((x) => x.key === n.key))]);
    neu.forEach((n) => dauerImBrowser(n.file).then((d) =>
      setZeilen((z) => z.map((x) => (x.key === n.key ? { ...x, dauer: x.dauer ?? d } : x)))));
  };

  useEffect(() => { if (vorbelegt?.length) hinzu(vorbelegt); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vorbelegt]);

  const setz = (key: string, teil: Partial<Zeile>) => setZeilen((z) => z.map((x) => (x.key === key ? { ...x, ...teil } : x)));

  const start = async () => {
    setLaeuft(true);
    const fertig: Recording[] = [];
    try {
      const pid = await ziel();
      for (const z of zeilen) {
        if (z.status === 'fertig' || (z.status === 'fehler' && z.fehler?.startsWith('Größer'))) continue;
        setz(z.key, { status: 'laedt', anteil: 0, fehler: undefined });
        try {
          const rec = await api.upload(
            pid, [{ blob: z.file, name: z.file.name }],
            { filename: z.file.name, source: 'import', clientId: dateiSchluessel(z.file, pid) },
            (a) => setz(z.key, { anteil: a }),
          );
          setz(z.key, { status: 'fertig', anteil: 1, dauer: rec.duration_s });
          fertig.push(rec);
        } catch (e) {
          setz(z.key, { status: 'fehler', fehler: (e as ApiError).message });
        }
      }
    } catch (e) {
      setZeilen((z) => z.map((x) => (x.status === 'wartet' ? { ...x, status: 'fehler', fehler: (e as Error).message } : x)));
    }
    setLaeuft(false);
    if (fertig.length) onFertig?.(fertig);
  };

  const offen = zeilen.filter((z) => z.status === 'wartet' || (z.status === 'fehler' && !z.fehler?.startsWith('Größer'))).length;

  return (
    <div className="stapel">
      <input ref={input} type="file" accept={ACCEPT} multiple hidden
        onChange={(e) => { hinzu([...(e.target.files ?? [])]); e.target.value = ''; }} />
      <div className="row" style={{ margin: 0 }}>
        <button type="button" className="btn btn-ghost" onClick={() => input.current?.click()} disabled={laeuft}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 15v4.5h15V15" /></svg>
          {knopf}
        </button>
        <span className="klein muted">MP3 · WAV · M4A · AAC · OGG · FLAC · WebM, bis {maxMb} MB</span>
      </div>

      {zeilen.length > 0 && (
        <div>
          {zeilen.map((z) => (
            <div className="eintrag datei" key={z.key}>
              <span className="tag n">{z.dauer != null ? dauer(z.dauer) : '–'}</span>
              <span className="was">{z.file.name}
                <small>
                  <span className="n">{groesse(z.file.size)}</span>
                  {' · '}
                  {z.status === 'wartet' && 'Bereit'}
                  {z.status === 'laedt' && <>Wird hinzugefügt <span className="n">{Math.round(z.anteil * 100)} %</span></>}
                  {z.status === 'fertig' && 'Hinzugefügt'}
                  {z.status === 'fehler' && <span className="fehlertext">Fehler: {z.fehler}</span>}
                </small>
                {z.status === 'laedt' && <span className="balken"><i style={{ transform: `scaleX(${z.anteil})` }} /></span>}
              </span>
              <span className="wert">
                {z.status === 'fertig' ? <span className="badge b-brand">OK</span> :
                  !laeuft && <button type="button" className="icon-btn" aria-label={`${z.file.name} entfernen`}
                    onClick={() => setZeilen((all) => all.filter((x) => x.key !== z.key))}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </button>}
              </span>
            </div>
          ))}
          {offen > 0 && (
            <button type="button" className="btn btn-primary btn-block" style={{ marginTop: 'var(--f4)' }}
              disabled={!bereit || laeuft} aria-busy={laeuft} onClick={start}>
              {laeuft ? 'Wird hinzugefügt …' : offen === 1 ? 'Datei hinzufügen' : `${offen} Dateien hinzufügen`}
            </button>
          )}
          {!bereit && offen > 0 && <p className="field-msg">Erst ein Projekt wählen.</p>}
        </div>
      )}
    </div>
  );
}
