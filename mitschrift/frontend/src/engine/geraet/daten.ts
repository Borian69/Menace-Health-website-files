// Projekte und Aufnahmen im Gerätebetrieb (IndexedDB). Gleiche Felder wie
// die Server-Datenbank, damit die Oberfläche nichts unterscheiden muss.

import { store } from '../../lib/idb';
import { neueId } from '../../lib/format';
import type {
  Progress, ProjectDetail, ProjectRow, ProjectStatus, Recording, Segment, Summary, TranscriptBlock,
} from '../types';

export interface LProjekt {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  status: ProjectStatus;
  progress: Progress | null;
  error: string | null;
  summary: Summary | null;
  summary_key: string | null;
  summary_at: string | null;
}

export interface LAufnahme {
  id: string;
  project_id: string;
  filename: string;
  mime: string | null;
  source: 'import' | 'aufnahme';
  duration_s: number;
  size_bytes: number;
  created_at: string;
  position: number;
  status: Recording['status'];
  error: string | null;
  transcript: Segment[] | null;
  transcript_model: string | null;
  client_id: string | null;
  teile: { dauer: number; groesse: number }[];
}

export interface LAudio { key: string; recId: string; idx: number; blob: Blob }

export const LAUFEND: ProjectStatus[] = ['transkribiert', 'analysiert', 'zusammenfassung'];
const jetzt = () => new Date().toISOString();

export const recordingsKey = (ids: string[]) => ids.join('|');

export async function projekt(id: string): Promise<LProjekt> {
  const p = await store.get<LProjekt>('projekte', id);
  if (!p) throw new Error('Projekt nicht gefunden.');
  return p;
}

export async function speichereProjekt(p: LProjekt) { await store.put('projekte', p); }

export async function aendereProjekt(id: string, teil: Partial<LProjekt>) {
  const p = await projekt(id);
  await store.put('projekte', { ...p, ...teil });
}

export async function aufnahmen(projectId: string): Promise<LAufnahme[]> {
  const a = await store.byIndex<LAufnahme>('aufnahmen', 'byProjekt', projectId);
  return a.sort((x, y) => x.position - y.position || x.created_at.localeCompare(y.created_at));
}

export async function aufnahme(id: string): Promise<LAufnahme> {
  const a = await store.get<LAufnahme>('aufnahmen', id);
  if (!a) throw new Error('Aufnahme nicht gefunden.');
  return a;
}

export async function audioTeile(recId: string): Promise<LAudio[]> {
  return (await store.byIndex<LAudio>('audio', 'byAufnahme', recId)).sort((a, b) => a.idx - b.idx);
}

/** Änderung an den Aufnahmen: Zeitstempel neu; fertig/fehler → wartet. */
export async function beruehre(projectId: string) {
  const p = await projekt(projectId);
  const zurueck = p.status === 'fertig' || p.status === 'fehler';
  await store.put('projekte', { ...p, updated_at: jetzt(), status: zurueck ? 'wartet' : p.status, error: zurueck ? null : p.error });
}

export function alsRecording(a: LAufnahme): Recording {
  return {
    id: a.id, project_id: a.project_id, filename: a.filename, mime: a.mime, source: a.source,
    duration_s: a.duration_s, size_bytes: a.size_bytes, created_at: a.created_at, position: a.position,
    status: a.status, error: a.error, has_transcript: a.transcript !== null,
  };
}

function zeile(p: LProjekt, recs: LAufnahme[]): ProjectRow {
  return {
    id: p.id, name: p.name, created_at: p.created_at, updated_at: p.updated_at, status: p.status,
    recording_count: recs.length,
    total_duration_s: recs.reduce((n, r) => n + r.duration_s, 0),
    has_summary: !!p.summary,
    summary_stale: !!p.summary && p.summary_key !== recordingsKey(recs.map((r) => r.id)),
  };
}

export async function liste(): Promise<ProjectRow[]> {
  const [ps, alle] = await Promise.all([store.all<LProjekt>('projekte'), store.all<LAufnahme>('aufnahmen')]);
  return ps
    .map((p) => zeile(p, alle.filter((a) => a.project_id === p.id)))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function detail(id: string): Promise<ProjectDetail> {
  const p = await projekt(id);
  const recs = await aufnahmen(id);
  const calls = await store.byIndex<{ prompt_tokens: number | null; completion_tokens: number | null; cost_usd: number | null }>(
    'llmcalls', 'byProjekt', id);
  const kosten = calls.some((c) => c.cost_usd != null) ? calls.reduce((n, c) => n + (c.cost_usd ?? 0), 0) : null;
  return {
    ...zeile(p, recs),
    progress: p.progress, error: p.error, summary: p.summary, summary_at: p.summary_at,
    recordings: recs.map(alsRecording),
    usage: {
      calls: calls.length,
      prompt_tokens: calls.reduce((n, c) => n + (c.prompt_tokens ?? 0), 0),
      completion_tokens: calls.reduce((n, c) => n + (c.completion_tokens ?? 0), 0),
      cost_usd: kosten,
    },
  };
}

export async function neuesProjekt(name: string): Promise<string> {
  const ts = jetzt();
  const p: LProjekt = {
    id: neueId(), name: name.trim(), created_at: ts, updated_at: ts, status: 'wartet', progress: null, error: null,
    summary: null, summary_key: null, summary_at: null,
  };
  await store.put('projekte', p);
  return p.id;
}

export async function loescheAufnahme(id: string) {
  const a = await aufnahme(id);
  await store.delByIndex('audio', 'byAufnahme', id);
  await store.delByIndex('tparts', 'byAufnahme', id);
  await store.del('aufnahmen', id);
  await beruehre(a.project_id);
}

export async function loescheProjekt(id: string) {
  for (const a of await aufnahmen(id)) {
    await store.delByIndex('audio', 'byAufnahme', a.id);
    await store.delByIndex('tparts', 'byAufnahme', a.id);
    await store.del('aufnahmen', a.id);
  }
  await store.delByIndex('llmcalls', 'byProjekt', id);
  await store.del('projekte', id);
}

export async function transkripte(projectId: string): Promise<TranscriptBlock[]> {
  return (await aufnahmen(projectId)).map((a) => ({
    recording_id: a.id, filename: a.filename, duration_s: a.duration_s, segments: a.transcript ?? [],
  }));
}

/** Nach dem Öffnen der App: Was als „läuft“ gespeichert ist, aber nicht läuft,
 *  wurde durch Schließen der App unterbrochen. */
export async function setzeUnterbrocheneZurueck(laeuftGerade: (id: string) => boolean) {
  for (const p of await store.all<LProjekt>('projekte')) {
    if (LAUFEND.includes(p.status) && !laeuftGerade(p.id)) {
      await store.put('projekte', {
        ...p, status: 'fehler', progress: null,
        error: 'Die Verarbeitung wurde unterbrochen, weil die App geschlossen wurde. Erneut starten – fertige Teile bleiben erhalten.',
      });
    }
  }
}
