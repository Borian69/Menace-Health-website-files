// Gemeinsame Typen beider Betriebsarten. Die Oberfläche kennt nur dieses
// Interface – ob dahinter ein eigener Server oder das Gerät selbst arbeitet,
// entscheidet `engine/index.ts` beim Start.

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

export interface Usage { calls: number; prompt_tokens: number; completion_tokens: number; cost_usd: number | null }

export interface ProjectDetail extends ProjectRow {
  progress: Progress | null;
  error: string | null;
  summary: Summary | null;
  summary_at: string | null;
  recordings: Recording[];
  usage: Usage;
}

export interface Segment { start: number; end: number; text: string }
export interface TranscriptBlock { recording_id: string; filename: string; duration_s: number; segments: Segment[] }

export type Betrieb = 'server' | 'geraet';

export interface ServerStatus {
  betrieb: Betrieb;
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

export interface UploadPart { blob: Blob; name: string; dauer?: number }

export interface UploadOpts { filename: string; source: 'import' | 'aufnahme'; clientId: string }

/** Ein oder mehrere Teile, die nacheinander abgespielt werden. */
export interface AudioQuelle { teile: { url: string; dauer: number }[]; freigeben?: () => void }

export interface Engine {
  betrieb: Betrieb;
  status(): Promise<ServerStatus>;
  login(password: string): Promise<unknown>;

  projects(): Promise<ProjectRow[]>;
  project(id: string): Promise<ProjectDetail>;
  createProject(name: string): Promise<ProjectDetail>;
  renameProject(id: string, name: string): Promise<ProjectDetail>;
  deleteProject(id: string): Promise<void>;
  process(id: string): Promise<ProjectDetail>;
  transcript(id: string): Promise<TranscriptBlock[]>;

  patchRecording(id: string, body: { filename?: string; move?: number }): Promise<Recording>;
  deleteRecording(id: string): Promise<void>;
  audio(rec: Recording): Promise<AudioQuelle>;
  exportMarkdown(id: string): Promise<string>;

  upload(projectId: string, parts: UploadPart[], opts: UploadOpts, onProgress?: (a: number) => void): Promise<Recording>;
}
