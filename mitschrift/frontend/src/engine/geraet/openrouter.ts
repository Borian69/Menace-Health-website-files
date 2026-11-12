// OpenRouter direkt aus dem Browser. Der Schlüssel kommt aus den
// Einstellungen dieses Geräts und geht nur an openrouter.ai.
// Modelle und Parameter stehen in lib/einstellungen.ts – nirgends sonst.

import { einstellungen } from '../../lib/einstellungen';
import { store } from '../../lib/idb';
import type { Segment } from '../types';

export const OPENROUTER = 'https://openrouter.ai/api/v1';
const TEMPERATUR = 0.2;
const MAX_AUSGABE = 8000;
const VERSUCHE = 3;

export class LLMError extends Error {}

export interface Completion { text: string; promptTokens: number | null; completionTokens: number | null; cost: number | null }

const ENDGUELTIG: Record<number, string> = {
  400: 'Die Anfrage wurde abgelehnt (400). Ist die Modell-ID richtig?',
  401: 'Der OpenRouter-Schlüssel ist ungültig (401). Bitte in den Einstellungen prüfen.',
  402: 'Das OpenRouter-Guthaben reicht nicht (402).',
  403: 'OpenRouter hat die Anfrage blockiert (403).',
  404: 'Das Modell wurde bei OpenRouter nicht gefunden (404).',
  413: 'Der Audioabschnitt ist zu groß für den Anbieter (413).',
};

function kopf(): Record<string, string> {
  const key = einstellungen().apiKey.trim();
  if (!key) throw new LLMError('Kein OpenRouter-Schlüssel hinterlegt. Bitte in den Einstellungen eintragen.');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'X-Title': 'Mitschrift',
    'HTTP-Referer': location.origin,
  };
}

const schlaf = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fehlertext(r: Response): Promise<string> {
  try {
    const j = await r.json();
    const e = j?.error;
    return String(typeof e === 'object' ? e?.message ?? '' : e ?? '').slice(0, 300);
  } catch { return ''; }
}

/** POST mit Wiederholung bei 429, 5xx und Netzfehlern. `anpassen` darf den
 *  Body nach einer 400 einmal ändern (z. B. ohne JSON-Modus). */
async function post(
  pfad: string,
  body: Record<string, unknown>,
  art: string,
  anpassen?: (detail: string, body: Record<string, unknown>) => boolean,
): Promise<Record<string, unknown>> {
  let letzter = 'unbekannt';
  for (let versuch = 1; versuch <= VERSUCHE; versuch++) {
    let r: Response;
    try {
      r = await fetch(OPENROUTER + pfad, { method: 'POST', headers: kopf(), body: JSON.stringify(body) });
    } catch (e) {
      if (e instanceof LLMError) throw e;
      letzter = navigator.onLine ? 'Netzwerkfehler' : 'Keine Internetverbindung';
      await warte(versuch);
      continue;
    }
    if (r.status in ENDGUELTIG) {
      const detail = await fehlertext(r);
      if (r.status === 400 && anpassen?.(detail, body)) { versuch--; anpassen = undefined; continue; }
      throw new LLMError(`${ENDGUELTIG[r.status]} ${detail}`.trim());
    }
    if (r.status === 429 || r.status >= 500) {
      letzter = `OpenRouter antwortet mit ${r.status} ${await fehlertext(r)}`.trim();
      await warte(versuch, r.headers.get('retry-after'));
      continue;
    }
    let data: Record<string, unknown>;
    try { data = await r.json(); } catch { letzter = 'Antwort war kein JSON'; await warte(versuch); continue; }
    if (data.error && !data.choices && data.text === undefined) {
      const e = data.error as { message?: string };
      letzter = `OpenRouter-Fehler: ${e?.message ?? JSON.stringify(e)}`;
      await warte(versuch);
      continue;
    }
    return data;
  }
  throw new LLMError(`OpenRouter nicht erreichbar nach ${VERSUCHE} Versuchen (${letzter}).`);

  async function warte(versuch: number, retryAfter?: string | null) {
    if (versuch >= VERSUCHE) return;
    const ra = Number(retryAfter);
    await schlaf(Math.min(60_000, Math.max(Number.isFinite(ra) ? ra * 1000 : 0, 2 ** versuch * 1000 + Math.random() * 1000)));
  }
  void art;
}

async function protokolliere(projectId: string | null, kind: string, model: string, usage: Record<string, unknown> | undefined) {
  const num = (v: unknown) => (typeof v === 'number' ? v : null);
  await store.add('llmcalls', {
    project_id: projectId ?? '', kind, model,
    prompt_tokens: num(usage?.prompt_tokens), completion_tokens: num(usage?.completion_tokens), cost_usd: num(usage?.cost),
    created_at: new Date().toISOString(),
  });
}

export async function chat(system: string, user: string, opts: { json: boolean; kind: string; projectId: string }): Promise<Completion> {
  const model = einstellungen().llmModel;
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: TEMPERATUR,
    max_tokens: MAX_AUSGABE,
    usage: { include: true },
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  const data = await post('/chat/completions', body, opts.kind, (detail, b) => {
    if (b.response_format && detail.toLowerCase().includes('response_format')) { delete b.response_format; return true; }
    return false;
  });
  const choice = (data.choices as { message?: { content?: string }; finish_reason?: string }[] | undefined)?.[0];
  const text = choice?.message?.content ?? '';
  const usage = data.usage as Record<string, unknown> | undefined;
  await protokolliere(opts.projectId, opts.kind, String(data.model ?? model), usage);
  if (choice?.finish_reason === 'length') throw new LLMError('Die Antwort der KI wurde abgeschnitten. Bitte erneut starten.');
  if (!text.trim()) throw new LLMError('Die KI hat eine leere Antwort geliefert.');
  return {
    text,
    promptTokens: (usage?.prompt_tokens as number) ?? null,
    completionTokens: (usage?.completion_tokens as number) ?? null,
    cost: (usage?.cost as number) ?? null,
  };
}

/** Speech-to-Text über POST /audio/transcriptions (JSON, Audio als Base64). */
export async function transkribiere(mp3Base64: string, offset: number, dauer: number, projectId: string): Promise<Segment[]> {
  const { sttModel, sprache } = einstellungen();
  const body: Record<string, unknown> = {
    model: sttModel,
    input_audio: { data: mp3Base64, format: 'mp3' },
    response_format: 'verbose_json',
  };
  if (sprache) body.language = sprache;
  const data = await post('/audio/transcriptions', body, 'transkription', (detail, b) => {
    // Nicht jeder Anbieter liefert Segmente: dann nur Text.
    if (b.response_format && /response_format|verbose/i.test(detail)) { delete b.response_format; return true; }
    return false;
  });
  await protokolliere(projectId, 'transkription', sttModel, data.usage as Record<string, unknown> | undefined);
  const segs = data.segments as { start?: number; end?: number; text?: string }[] | undefined;
  if (Array.isArray(segs) && segs.length) {
    return segs
      .filter((s) => (s.text ?? '').trim())
      .map((s) => ({
        start: round(offset + (s.start ?? 0)),
        end: round(offset + Math.min(s.end ?? dauer, dauer)),
        text: (s.text ?? '').trim(),
      }));
  }
  const text = String(data.text ?? '').trim();
  return text ? [{ start: round(offset), end: round(offset + dauer), text }] : [];
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Prüft den Schlüssel und liefert Guthaben-Infos, soweit OpenRouter sie nennt. */
export async function pruefeSchluessel(key: string): Promise<{ label?: string; limit?: number | null; usage?: number; rest?: number | null }> {
  const h = { Authorization: `Bearer ${key.trim()}` };
  let r = await fetch(`${OPENROUTER}/key`, { headers: h });
  if (r.status === 404) r = await fetch(`${OPENROUTER}/auth/key`, { headers: h });
  if (r.status === 401) throw new LLMError('Der Schlüssel ist ungültig.');
  if (!r.ok) throw new LLMError(`OpenRouter antwortet mit ${r.status}.`);
  const d = ((await r.json()) as { data?: Record<string, unknown> }).data ?? {};
  return {
    label: d.label as string | undefined,
    limit: d.limit as number | null | undefined,
    usage: d.usage as number | undefined,
    rest: d.limit_remaining as number | null | undefined,
  };
}
