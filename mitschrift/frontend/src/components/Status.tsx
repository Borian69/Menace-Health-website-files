import type { ProjectStatus } from '../api';

export const STATUS_TEXT: Record<ProjectStatus, string> = {
  wartet: 'Wartet auf Verarbeitung',
  transkribiert: 'Wird transkribiert',
  analysiert: 'Wird analysiert',
  zusammenfassung: 'Zusammenfassung wird erstellt',
  fertig: 'Erfolgreich abgeschlossen',
  fehler: 'Fehler aufgetreten',
};

export const LAUFEND: ProjectStatus[] = ['transkribiert', 'analysiert', 'zusammenfassung'];

/** Status immer mit Wort, nie nur Farbe. */
export function StatusText({ status, veraltet }: { status: ProjectStatus; veraltet?: boolean }) {
  const cls = status === 'fehler' ? 'st st-fehler' : status === 'fertig' ? 'st st-ok' : LAUFEND.includes(status) ? 'st st-laeuft' : 'st';
  return <span className={cls}>{status === 'wartet' && veraltet ? 'Neue Aufnahmen, noch nicht verarbeitet' : STATUS_TEXT[status]}</span>;
}
