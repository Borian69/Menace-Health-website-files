const zwei = (n: number) => String(n).padStart(2, '0');

/** 0:42 · 12:05 · 1:02:03 */
export function dauer(sek: number): string {
  const s = Math.max(0, Math.floor(sek));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${zwei(m)}:${zwei(s % 60)}` : `${m}:${zwei(s % 60)}`;
}

/** Immer mit Stunden – für Zeitstempel im Transkript. */
export function stempel(sek: number): string {
  const s = Math.max(0, Math.floor(sek));
  return `${zwei(Math.floor(s / 3600))}:${zwei(Math.floor((s % 3600) / 60))}:${zwei(s % 60)}`;
}

export function groesse(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 })} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
  return `${(bytes / 1024 ** 3).toLocaleString('de-DE', { maximumFractionDigits: 2 })} GB`;
}

export function datum(iso: string | number): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function datumZeit(iso: string | number): string {
  const d = new Date(iso);
  return `${datum(iso)}, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
}

export function zahl(n: number): string {
  return n.toLocaleString('de-DE');
}

export function dollar(n: number | null): string {
  if (n == null) return '–';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: n < 0.1 ? 4 : 2 })} $`;
}

/** „A2 · 00:14:10“ → { nr: 2, sek: 850 } – für Sprünge aus der Zusammenfassung. */
export function liesQuelle(q: string): { nr: number; sek: number } | null {
  const m = /A(\d+)\s*·\s*(\d{1,2}):(\d{2}):(\d{2})/.exec(q);
  if (!m) return null;
  return { nr: Number(m[1]), sek: Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]) };
}

export function neueId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
