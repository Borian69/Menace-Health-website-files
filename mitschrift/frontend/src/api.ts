// Alle Aufrufe an das Backend. Kein Schlüssel, kein Modell, kein Geheimnis
// im Frontend – die Sitzung trägt ein HttpOnly-Cookie.

export type ProjectStatus = 'wartet' | 'transkribiert' | 'analysiert' | 'zusammenfassung' | 'fertig' | 'fehler';

export interface Progress { step: string; done: number; total: number; detail: string }

export interface Recording {
  id: string;
  project_id: string;
  filename: string;
  mime: string | null;
  source: 'import' | 'aufnahme';
  duration_s: number;
  size_bytes: number;
  created_at: string;
  position: number;
  status: 'gespeichert' | 'transkribiert' | 'fehler';
  error: string | null;
  has_transcript: boolean;
}

export interface ProjectRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  status: ProjectStatus;
  recording_count: number;
  total_duration_s: number;
  has_summary: boolean;
  summary_stale: boolean;
}

export interface Eintrag { text: string; quelle: string; wer?: string; bis?: string }
export interface Thema { titel: string; punkte: Eintrag[]; unterthemen: { titel: string; punkte: Eintrag[] }[] }
export interface Summary {
  ueberblick: string;
  erkenntnisse: Eintrag[];
  themen: Thema[];
  fakten: Eintrag[];
  entscheidungen: Eintrag[];
  aufgaben: Eintrag[];
  offene_fragen: Eintrag[];
  widersprueche: Eintrag[];
  unklar: Eintrag[];
  _meta?: { verfahren: string; token_geschaetzt: number; abschnitte: number; stufen?: number };
}

export interface ProjectDetail extends ProjectRow {
  progress: Progress | null;
  error: string | null;
  summary: Summary | null;
  summary_at: string | null;
  recordings: Recording[];
  usage: { calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number | null };
}

export interface Segment { start: number; end: number; text: string }
export interface TranscriptBlock { recording_id: string; filename: string; duration_s: number; segments: Segment[] }

export interface ServerStatus {
  auth_required: boolean;
  authenticated: boolean;
  llm_ready: boolean;
  model: string;
  whisper_model: string;
  max_upload_mb: number;
  formats: string[];
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Listener = () => void;
const unauthorized = new Set<Listener>();
export function onUnauthorized(fn: Listener): () => void { unauthorized.add(fn); return () => { unauthorized.delete(fn); }; }

async function fehlertext(r: Response): Promise<string> {
  try {
    const j = await r.json();
    if (typeof j.detail === 'string') return j.detail;
    if (Array.isArray(j.detail)) return j.detail.map((d: { msg: string }) => d.msg).join(', ');
  } catch { /* kein JSON */ }
  return `Serverfehler (${r.status})`;
}

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server.');
  }
  if (r.status === 401 && url !== '/api/session') unauthorized.forEach((f) => f());
  if (!r.ok) throw new ApiError(r.status, await fehlertext(r));
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export const api = {
  status: () => req<ServerStatus>('GET', '/api/status'),
  login: (password: string) => req<{ ok: boolean }>('POST', '/api/session', { password }),
  logout: () => req<{ ok: boolean }>('DELETE', '/api/session'),

  projects: () => req<ProjectRow[]>('GET', '/api/projects'),
  project: (id: string) => req<ProjectDetail>('GET', `/api/projects/${id}`),
  createProject: (name: string) => req<ProjectDetail>('POST', '/api/projects', { name }),
  renameProject: (id: string, name: string) => req<ProjectDetail>('PATCH', `/api/projects/${id}`, { name }),
  deleteProject: (id: string) => req<void>('DELETE', `/api/projects/${id}`),
  process: (id: string) => req<ProjectDetail>('POST', `/api/projects/${id}/process`),
  transcript: (id: string) => req<TranscriptBlock[]>('GET', `/api/projects/${id}/transcript`),

  patchRecording: (id: string, body: { filename?: string; move?: number }) =>
    req<Recording>('PATCH', `/api/recordings/${id}`, body),
  deleteRecording: (id: string) => req<void>('DELETE', `/api/recordings/${id}`),
  audioUrl: (id: string) => `/api/recordings/${id}/audio`,
  exportUrl: (id: string) => `/api/projects/${id}/export.md`,
};

export interface UploadPart { blob: Blob; name: string }

/** Upload mit Fortschritt (XHR, weil fetch keinen Upload-Fortschritt meldet). */
export function uploadRecording(
  projectId: string,
  parts: UploadPart[],
  opts: { filename: string; source: 'import' | 'aufnahme'; clientId: string },
  onProgress?: (anteil: number) => void,
  signal?: AbortSignal,
): Promise<Recording> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    for (const p of parts) fd.append('parts', p.blob, p.name);
    fd.append('filename', opts.filename);
    fd.append('source', opts.source);
    fd.append('client_id', opts.clientId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/projects/${projectId}/recordings`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let j: { detail?: string } & Recording;
      try { j = JSON.parse(xhr.responseText); } catch { j = {} as typeof j; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(j);
      else {
        if (xhr.status === 401) unauthorized.forEach((f) => f());
        reject(new ApiError(xhr.status, typeof j.detail === 'string' ? j.detail : `Upload fehlgeschlagen (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, 'Keine Verbindung zum Server. Die Aufnahme bleibt auf dem Gerät gesichert.'));
    xhr.ontimeout = xhr.onerror;
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.onabort = () => reject(new ApiError(-1, 'Upload abgebrochen.'));
    xhr.send(fd);
  });
}
