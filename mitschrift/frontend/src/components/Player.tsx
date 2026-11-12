import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type AudioQuelle, type Recording } from '../api';

/** Wiedergabe über dem Inhalt. Eine Aufnahme kann aus mehreren Teilen
 *  bestehen (lange Aufnahmen, Unterbrechungen); sie laufen nahtlos nacheinander,
 *  ein Sprung auf eine Zeit wählt den passenden Teil. */
export function Player({ rec, nr, sek, onClose }: { rec: Recording; nr: number; sek: number; onClose: () => void }) {
  const [quelle, setQuelle] = useState<AudioQuelle | null>(null);
  const [teil, setTeil] = useState(0);
  const [fehler, setFehler] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const ziel = useRef<number | null>(null);

  useEffect(() => {
    let q: AudioQuelle | null = null;
    let weg = false;
    api.audio(rec).then((x) => { if (weg) x.freigeben?.(); else { q = x; setQuelle(x); } }).catch((e) => setFehler(e.message));
    return () => { weg = true; q?.freigeben?.(); };
  }, [rec]);

  // Sprung: passenden Teil wählen, Restzeit darin setzen.
  useEffect(() => {
    if (!quelle) return;
    let rest = sek;
    let i = 0;
    while (i < quelle.teile.length - 1 && quelle.teile[i].dauer > 0 && rest >= quelle.teile[i].dauer) {
      rest -= quelle.teile[i].dauer;
      i++;
    }
    ziel.current = rest;
    setTeil(i);
    const a = audio.current;
    if (a && i === teil && a.readyState >= 1) { a.currentTime = rest; ziel.current = null; void a.play().catch(() => undefined); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quelle, sek]);

  const geladen = () => {
    const a = audio.current;
    if (!a) return;
    if (ziel.current != null) { a.currentTime = ziel.current; ziel.current = null; }
    void a.play().catch(() => undefined);
  };

  const rahmen = document.querySelector('.app-rahmen') ?? document.body;
  const n = quelle?.teile.length ?? 0;
  return createPortal(
    <div className="player" role="region" aria-label="Wiedergabe">
      <div className="player-kopf">
        <span className="lb">A{nr} · {rec.filename}{n > 1 ? ` · Teil ${teil + 1}/${n}` : ''}</span>
        <button className="icon-btn" aria-label="Wiedergabe schließen" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      {fehler && <p className="klein">Fehler: {fehler}</p>}
      {quelle && quelle.teile[teil] && (
        <audio ref={audio} controls preload="metadata" src={quelle.teile[teil].url} onLoadedMetadata={geladen}
          onEnded={() => { if (teil < n - 1) { ziel.current = 0; setTeil(teil + 1); } }} />
      )}
    </div>,
    rahmen,
  );
}

/** Speichert Text oder Blobs als Datei auf dem Gerät. */
export function herunterladen(inhalt: Blob | string, name: string) {
  const blob = typeof inhalt === 'string' ? new Blob([inhalt], { type: 'text/markdown;charset=utf-8' }) : inhalt;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function audioHerunterladen(rec: Recording) {
  const q = await api.audio(rec);
  for (let i = 0; i < q.teile.length; i++) {
    const a = document.createElement('a');
    a.href = q.teile[i].url;
    a.download = q.teile.length > 1 ? `${rec.filename} (Teil ${i + 1})` : rec.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => q.freigeben?.(), 10_000);
}
