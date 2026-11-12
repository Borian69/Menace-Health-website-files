// Betrieb mit eigenem Server (FastAPI unter ./api). Der OpenRouter-Schlüssel
// liegt dann auf dem Server, die Sitzung trägt ein HttpOnly-Cookie.

import {
  ApiError, type Engine, type ProjectDetail, type ProjectRow, type Recording, type ServerStatus,
  type TranscriptBlock, type UploadOpts, type UploadPart,
} from './types';

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
  if (r.status === 401 && url !== 'api/session') unauthorized.forEach((f) => f());
  if (!r.ok) throw new ApiError(r.status, await fehlertext(r));
  if (r.status === 204) return undefined as T;
  return r.json() as Promise<T>;
}

export const serverEngine: Engine = {
  betrieb: 'server',
  status: async () => ({ ...(await req<Omit<ServerStatus, 'betrieb'>>('GET', 'api/status')), betrieb: 'server' }),
  login: (password) => req('POST', 'api/session', { password }),

  projects: () => req<ProjectRow[]>('GET', 'api/projects'),
  project: (id) => req<ProjectDetail>('GET', `api/projects/${id}`),
  createProject: (name) => req<ProjectDetail>('POST', 'api/projects', { name }),
  renameProject: (id, name) => req<ProjectDetail>('PATCH', `api/projects/${id}`, { name }),
  deleteProject: (id) => req<void>('DELETE', `api/projects/${id}`),
  process: (id) => req<ProjectDetail>('POST', `api/projects/${id}/process`),
  transcript: (id) => req<TranscriptBlock[]>('GET', `api/projects/${id}/transcript`),

  patchRecording: (id, body) => req<Recording>('PATCH', `api/recordings/${id}`, body),
  deleteRecording: (id) => req<void>('DELETE', `api/recordings/${id}`),
  audio: async (rec) => ({ teile: [{ url: `api/recordings/${rec.id}/audio`, dauer: rec.duration_s }] }),
  exportMarkdown: async (id) => {
    const r = await fetch(`api/projects/${id}/export.md`, { credentials: 'same-origin' });
    if (!r.ok) throw new ApiError(r.status, await fehlertext(r));
    return r.text();
  },

  upload: (projectId: string, parts: UploadPart[], opts: UploadOpts, onProgress?: (a: number) => void) =>
    new Promise<Recording>((resolve, reject) => {
      // XHR, weil fetch keinen Upload-Fortschritt meldet.
      const fd = new FormData();
      for (const p of parts) fd.append('parts', p.blob, p.name);
      fd.append('filename', opts.filename);
      fd.append('source', opts.source);
      fd.append('client_id', opts.clientId);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `api/projects/${projectId}/recordings`);
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
      xhr.onabort = () => reject(new ApiError(-1, 'Upload abgebrochen.'));
      xhr.send(fd);
    }),
};
