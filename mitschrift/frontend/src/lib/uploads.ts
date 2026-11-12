// Eine Aufnahme vom Gerät zum Server. Erst wenn der Server sie bestätigt,
// wird sie auf dem Gerät gelöscht. Die Sitzungs-ID dient als client_id:
// ein wiederholter Upload legt keine zweite Aufnahme an.

import { uploadRecording, type Recording } from '../api';
import { idb, type Session } from './idb';
import { endungFuer } from './platform';
import { teileFuer } from './recorder';
import { datumZeit } from './format';

export function standardName(s: Session): string {
  return `Aufnahme ${datumZeit(s.createdAt)}`;
}

export async function ladeSitzungHoch(
  s: Session,
  projectId: string,
  projectName: string,
  name: string,
  onProgress?: (a: number) => void,
): Promise<Recording> {
  s.state = 'upload';
  s.projectId = projectId;
  s.projectName = projectName;
  s.name = name.trim() || standardName(s);
  s.lastError = undefined;
  await idb.putSession(s);

  const endung = endungFuer(s.mime);
  const teile = await teileFuer(s, endung);
  if (!teile.length) throw new Error('Auf dem Gerät sind keine Daten zu dieser Aufnahme.');
  try {
    const rec = await uploadRecording(
      projectId,
      teile,
      { filename: s.name, source: 'aufnahme', clientId: s.id },
      onProgress,
    );
    await idb.deleteSession(s.id);
    return rec;
  } catch (e) {
    s.lastError = (e as Error).message;
    await idb.putSession(s);
    throw e;
  }
}

/** Stabiler Schlüssel für eine importierte Datei – verhindert Dubletten bei Wiederholung. */
export function dateiSchluessel(f: File, projectId: string): string {
  return `imp-${projectId.slice(0, 8)}-${f.size}-${f.lastModified}-${f.name}`.slice(0, 80);
}

/** Dauer im Browser ermitteln, bevor hochgeladen wird (nicht jeder Browser kann jedes Format). */
export function dauerImBrowser(f: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    const url = URL.createObjectURL(f);
    const fertig = (d: number | null) => { URL.revokeObjectURL(url); resolve(d); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => fertig(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null);
    a.onerror = () => fertig(null);
    setTimeout(() => fertig(null), 5000);
    a.src = url;
  });
}
