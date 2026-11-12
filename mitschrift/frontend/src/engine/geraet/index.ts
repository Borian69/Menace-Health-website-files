// Gerätebetrieb: kein eigener Server. Projekte, Aufnahmen und Ergebnisse
// liegen in IndexedDB dieses Geräts; Transkription und Zusammenfassung laufen
// über OpenRouter mit dem Schlüssel aus den Einstellungen.

import { einstellungen } from '../../lib/einstellungen';
import { store } from '../../lib/idb';
import { neueId } from '../../lib/format';
import { ApiError, type Eintrag, type Engine, type ProjectDetail, type Recording, type ServerStatus } from '../types';
import {
  aendereProjekt, alsRecording, aufnahme, aufnahmen, beruehre, detail, LAUFEND, liste, loescheAufnahme,
  loescheProjekt, neuesProjekt, projekt, setzeUnterbrocheneZurueck, transkripte, type LAufnahme,
} from './daten';
import { beschaeftigt, laeuftGerade, verarbeite } from './pipeline';
import { zeit } from './summarizer';

const FORMATE = ['mp3', 'wav', 'm4a', 'mp4', 'aac', 'ogg', 'oga', 'opus', 'flac', 'webm'];
let aufgeraeumt = false;

async function gesperrt(projectId: string) {
  const p = await projekt(projectId);
  if (LAUFEND.includes(p.status)) throw new ApiError(409, 'Das Projekt wird gerade verarbeitet. Änderungen sind danach wieder möglich.');
}

function formatOk(name: string, type: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FORMATE.includes(ext) || type.startsWith('audio/') || type === 'video/webm' || type === 'video/mp4';
}

function dauerAusMetadaten(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    const fertig = (d: number) => { URL.revokeObjectURL(url); resolve(d); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => fertig(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : 0);
    a.onerror = () => fertig(0);
    setTimeout(() => fertig(0), 6000);
    a.src = url;
  });
}

async function mitDetail<T>(f: () => Promise<T>): Promise<T> {
  try { return await f(); } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(500, (e as Error).message);
  }
}

export const geraetEngine: Engine = {
  betrieb: 'geraet',

  async status(): Promise<ServerStatus> {
    if (!aufgeraeumt) { aufgeraeumt = true; await setzeUnterbrocheneZurueck(laeuftGerade).catch(() => undefined); }
    const e = einstellungen();
    return {
      betrieb: 'geraet', auth_required: false, authenticated: true, llm_ready: !!e.apiKey.trim(),
      model: e.llmModel, whisper_model: e.sttModel, max_upload_mb: 2048, formats: FORMATE,
    };
  },
  login: async () => ({ ok: true }),

  projects: () => mitDetail(liste),
  project: (id) => mitDetail(() => detail(id)),
  createProject: (name) => mitDetail(async () => detail(await neuesProjekt(name))),
  renameProject: (id, name) => mitDetail(async () => {
    await aendereProjekt(id, { name: name.trim(), updated_at: new Date().toISOString() });
    return detail(id);
  }),
  deleteProject: (id) => mitDetail(async () => { await gesperrt(id); await loescheProjekt(id); }),

  process: (id) => mitDetail(async (): Promise<ProjectDetail> => {
    const p = await detail(id);
    if (!p.recordings.length) throw new ApiError(400, 'Das Projekt enthält noch keine Aufnahmen.');
    if (!einstellungen().apiKey.trim()) {
      throw new ApiError(400, 'Für die Verarbeitung fehlt der OpenRouter-Schlüssel. Bitte unter Einstellungen eintragen.');
    }
    if (LAUFEND.includes(p.status) || beschaeftigt()) throw new ApiError(409, 'Es läuft bereits eine Verarbeitung.');
    await aendereProjekt(id, {
      status: 'transkribiert', error: null,
      progress: { step: 'transkribiert', done: 0, total: 0, detail: 'Startet' },
    });
    void verarbeite(id);
    return detail(id);
  }),
  transcript: (id) => mitDetail(() => transkripte(id)),

  patchRecording: (id, body) => mitDetail(async (): Promise<Recording> => {
    const a = await aufnahme(id);
    await gesperrt(a.project_id);
    if (body.filename?.trim()) await store.put('aufnahmen', { ...a, filename: body.filename.trim().slice(0, 160) });
    if (body.move) {
      const recs = await aufnahmen(a.project_id);
      const i = recs.findIndex((r) => r.id === id);
      const j = i + (body.move > 0 ? 1 : -1);
      if (j >= 0 && j < recs.length) {
        [recs[i], recs[j]] = [recs[j], recs[i]];
        for (let k = 0; k < recs.length; k++) {
          const frisch = await aufnahme(recs[k].id);
          await store.put('aufnahmen', { ...frisch, position: k });
        }
      }
    }
    await beruehre(a.project_id);
    return alsRecording(await aufnahme(id));
  }),
  deleteRecording: (id) => mitDetail(async () => {
    const a = await aufnahme(id);
    await gesperrt(a.project_id);
    await loescheAufnahme(id);
  }),

  async audio(rec) {
    const a = await aufnahme(rec.id);
    const teile = (await store.byIndex<{ idx: number; blob: Blob }>('audio', 'byAufnahme', rec.id)).sort((x, y) => x.idx - y.idx);
    const urls = teile.map((t) => URL.createObjectURL(t.blob));
    return {
      teile: urls.map((url, i) => ({ url, dauer: a.teile[i]?.dauer ?? (teile.length === 1 ? a.duration_s : 0) })),
      freigeben: () => urls.forEach((u) => URL.revokeObjectURL(u)),
    };
  },

  exportMarkdown: (id) => mitDetail(async () => markdown(await detail(id), await transkripte(id))),

  upload: (projectId, parts, opts, onProgress) => mitDetail(async (): Promise<Recording> => {
    await gesperrt(projectId);
    const alle = await store.all<LAufnahme>('aufnahmen');
    const vorhanden = alle.find((a) => a.client_id && a.client_id === opts.clientId);
    if (vorhanden) return alsRecording(vorhanden);
    if (!parts.length) throw new ApiError(400, 'Keine Datei erhalten.');
    for (const p of parts) {
      if (!formatOk(p.name, p.blob.type)) {
        throw new ApiError(415, `Format nicht unterstützt. Erlaubt: ${FORMATE.map((f) => f.toUpperCase()).join(', ')}.`);
      }
      if (!p.blob.size) throw new ApiError(400, 'Die Datei ist leer.');
    }
    const teile: { dauer: number; groesse: number }[] = [];
    for (let i = 0; i < parts.length; i++) {
      teile.push({ dauer: parts[i].dauer ?? (await dauerAusMetadaten(parts[i].blob)), groesse: parts[i].blob.size });
      onProgress?.((i + 0.5) / parts.length);
    }
    const id = neueId();
    const recs = await aufnahmen(projectId);
    for (let i = 0; i < parts.length; i++) {
      await store.put('audio', { key: `${id}:${i}`, recId: id, idx: i, blob: parts[i].blob });
    }
    const a: LAufnahme = {
      id, project_id: projectId,
      filename: (opts.filename || parts[0].name || 'Aufnahme').trim().slice(0, 160),
      mime: parts[0].blob.type || null, source: opts.source,
      duration_s: Math.round(teile.reduce((n, t) => n + t.dauer, 0) * 100) / 100,
      size_bytes: teile.reduce((n, t) => n + t.groesse, 0),
      created_at: new Date().toISOString(),
      position: recs.length ? Math.max(...recs.map((r) => r.position)) + 1 : 0,
      status: 'gespeichert', error: null, transcript: null, transcript_model: null,
      client_id: opts.clientId || null, teile,
    };
    await store.put('aufnahmen', a);
    await beruehre(projectId);
    onProgress?.(1);
    return alsRecording(a);
  }),
};

function markdown(p: ProjectDetail, blocks: Awaited<ReturnType<typeof transkripte>>): string {
  const out: string[] = [`# ${p.name}`, ''];
  const s = p.summary;
  const q = (e: { quelle?: string; wer?: string; bis?: string }) => {
    const x = [e.wer && `wer: ${e.wer}`, e.bis && `bis: ${e.bis}`, e.quelle].filter(Boolean);
    return x.length ? ` _(${x.join('; ')})_` : '';
  };
  if (s) {
    if (s.ueberblick) out.push('## Überblick', '', s.ueberblick, '');
    const liste = (titel: string, items: Eintrag[]) => {
      if (!items.length) return;
      out.push(`## ${titel}`, '', ...items.map((e) => `- ${e.text}${q(e)}`), '');
    };
    liste('Wichtigste Erkenntnisse', s.erkenntnisse);
    if (s.themen.length) {
      out.push('## Themen', '');
      for (const th of s.themen) {
        out.push(`### ${th.titel}`, '', ...th.punkte.map((e) => `- ${e.text}${q(e)}`));
        for (const u of th.unterthemen) out.push('', `#### ${u.titel}`, '', ...u.punkte.map((e) => `- ${e.text}${q(e)}`));
        out.push('');
      }
    }
    liste('Fakten, Zahlen, Fachbegriffe', s.fakten);
    liste('Entscheidungen und Ergebnisse', s.entscheidungen);
    liste('Aufgaben', s.aufgaben);
    liste('Offene Fragen', s.offene_fragen);
    liste('Widersprüche', s.widersprueche);
    liste('Unklare Stellen', s.unklar);
  }
  out.push('## Transkript', '');
  blocks.forEach((b, i) => {
    out.push(`### A${i + 1} · ${b.filename} (${zeit(b.duration_s)})`, '');
    out.push(...(b.segments.length ? b.segments.map((g) => `[${zeit(g.start)}] ${g.text}`) : ['_(noch nicht transkribiert)_']), '');
  });
  return out.join('\n');
}
