// Vom Transkript zur strukturierten Zusammenfassung – dieselbe Logik und
// dieselben Prompts wie backend/services/summarizer.py.
// Kurz: ein Aufruf. Lang: Abschnitte verdichten, zusammenführen, Ergebnis.
// Jeder Aufruf wird über seinen Inhalt zwischengespeichert.

import promptZusammenfassung from '../../../../backend/prompts/zusammenfassung.md?raw';
import promptAbschnitt from '../../../../backend/prompts/abschnitt.md?raw';
import promptVerdichten from '../../../../backend/prompts/verdichten.md?raw';
import { einstellungen } from '../../lib/einstellungen';
import { store } from '../../lib/idb';
import type { Eintrag, Summary, Thema, TranscriptBlock } from '../types';
import { chat, LLMError } from './openrouter';

const ABSATZ_SEKUNDEN = 45;
const EINSTUFIG_BIS = 90_000;   // geschätzte Token
const ABSCHNITT = 30_000;
const ZEICHEN_JE_TOKEN = 3.6;

const LISTEN = ['erkenntnisse', 'fakten', 'entscheidungen', 'aufgaben', 'offene_fragen', 'widersprueche', 'unklar'] as const;

export function zeit(sek: number): string {
  const s = Math.max(0, Math.floor(sek));
  const z = (n: number) => String(n).padStart(2, '0');
  return `${z(Math.floor(s / 3600))}:${z(Math.floor((s % 3600) / 60))}:${z(s % 60)}`;
}

interface Zeile { kopf: string; text: string }

export function transkriptZeilen(blocks: TranscriptBlock[]): Zeile[] {
  const zeilen: Zeile[] = [];
  blocks.forEach((b, i) => {
    const kopf = `=== A${i + 1} · ${b.filename} · Dauer ${zeit(b.duration_s)} ===`;
    if (!b.segments.length) { zeilen.push({ kopf, text: '[keine Sprache erkannt]' }); return; }
    let absatz: string[] = [];
    let start = b.segments[0].start;
    for (const seg of b.segments) {
      if (absatz.length && seg.start - start >= ABSATZ_SEKUNDEN) {
        zeilen.push({ kopf, text: `[${zeit(start)}] ${absatz.join(' ')}` });
        absatz = [];
        start = seg.start;
      }
      absatz.push(seg.text);
    }
    if (absatz.length) zeilen.push({ kopf, text: `[${zeit(start)}] ${absatz.join(' ')}` });
  });
  return zeilen;
}

export function alsText(zeilen: Zeile[]): string {
  const out: string[] = [];
  let letzter: string | null = null;
  for (const z of zeilen) {
    if (z.kopf !== letzter) {
      if (out.length) out.push('');
      out.push(z.kopf);
      letzter = z.kopf;
    }
    out.push(z.text);
  }
  return out.join('\n');
}

export const tokens = (t: string) => Math.floor(t.length / ZEICHEN_JE_TOKEN) + 1;

export function packe(zeilen: Zeile[], max: number): Zeile[][] {
  const pakete: Zeile[][] = [];
  let akt: Zeile[] = [];
  let groesse = 0;
  for (let z of zeilen) {
    const t = tokens(z.text) + 4;
    if (akt.length && groesse + t > max) { pakete.push(akt); akt = []; groesse = 0; }
    if (!akt.length && pakete.length && pakete[pakete.length - 1].at(-1)!.kopf === z.kopf) {
      z = { kopf: z.kopf.replace(' ===', ' (Fortsetzung) ==='), text: z.text };
    }
    akt.push(z);
    groesse += t;
  }
  if (akt.length) pakete.push(akt);
  return pakete;
}

function gruppiere(texte: string[], max: number): string[][] {
  const g: string[][] = [];
  let akt: string[] = [];
  let groesse = 0;
  for (const t of texte) {
    const n = tokens(t);
    if (akt.length && groesse + n > max) { g.push(akt); akt = []; groesse = 0; }
    akt.push(t);
    groesse += n;
  }
  if (akt.length) g.push(akt);
  return g;
}

export function liesJson(text: string): Record<string, unknown> {
  const t = text.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch {
    const a = t.indexOf('{'); const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new SyntaxError('kein JSON');
  }
}

function eintrag(x: unknown, aufgabe = false): Eintrag | null {
  const o = (typeof x === 'string' ? { text: x } : x) as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const text = String(o.text ?? o.inhalt ?? o.aufgabe ?? '').trim();
  if (!text) return null;
  const e: Eintrag = { text, quelle: String(o.quelle ?? '').trim() };
  if (aufgabe) { e.wer = String(o.wer ?? o.verantwortlich ?? '').trim(); e.bis = String(o.bis ?? o.frist ?? '').trim(); }
  return e;
}

const liste = (v: unknown, aufgabe = false) =>
  (Array.isArray(v) ? v : v ? [v] : []).map((x) => eintrag(x, aufgabe)).filter((e): e is Eintrag => !!e);

/** Feste Form für die Oberfläche. Fehlendes bleibt leer – nie erfunden. */
export function normalisiere(raw: Record<string, unknown>): Summary {
  const out = { ueberblick: String(raw.ueberblick ?? '').trim() } as Summary;
  for (const k of LISTEN) (out as unknown as Record<string, Eintrag[]>)[k] = liste(raw[k], k === 'aufgaben');
  const themen: Thema[] = [];
  for (const th of (Array.isArray(raw.themen) ? raw.themen : []) as Record<string, unknown>[]) {
    if (!th || typeof th !== 'object') continue;
    const titel = String(th.titel ?? '').trim();
    const punkte = liste(th.punkte);
    const unter = ((Array.isArray(th.unterthemen) ? th.unterthemen : []) as Record<string, unknown>[])
      .filter((u) => u && String(u.titel ?? '').trim())
      .map((u) => ({ titel: String(u.titel).trim(), punkte: liste(u.punkte) }));
    if (titel || punkte.length) themen.push({ titel, punkte, unterthemen: unter });
  }
  out.themen = themen;
  return out;
}

async function hash(...teile: string[]): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(teile.join('\u0000')));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Fortschritt = (step: 'analysiert' | 'zusammenfassung', done: number, total: number, detail: string) => Promise<void>;

export async function fasseZusammen(blocks: TranscriptBlock[], projectId: string, fortschritt: Fortschritt): Promise<Summary> {
  const model = einstellungen().llmModel;

  const rufe = async (kind: string, system: string, user: string, json: boolean): Promise<string> => {
    const key = await hash(model, '0.2', kind, system, user);
    const hit = await store.get<{ content: string }>('llmcache', key);
    if (hit) return hit.content;
    const c = await chat(system, user, { json, kind, projectId });
    if (json) liesJson(c.text);  // nur gültiges JSON wird gespeichert
    await store.put('llmcache', { key, kind, content: c.text, created_at: new Date().toISOString() });
    return c.text;
  };

  const final = async (inhalt: string, art: string): Promise<Summary> => {
    const user = `${art}:\n\n${inhalt}`;
    try {
      return normalisiere(liesJson(await rufe('final', promptZusammenfassung.trim(), user, true)));
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e;
      const system2 = `${promptZusammenfassung.trim()}\n\nWICHTIG: Deine letzte Antwort war kein gültiges JSON. Nur das JSON-Objekt ausgeben.`;
      try {
        return normalisiere(liesJson(await rufe('final', system2, user, true)));
      } catch (e2) {
        if (e2 instanceof SyntaxError) throw new LLMError('Die KI hat keine lesbare Zusammenfassung geliefert. Bitte erneut starten.');
        throw e2;
      }
    }
  };

  if (!blocks.some((b) => b.segments.length)) {
    throw new LLMError('In keiner Aufnahme wurde Sprache erkannt – es gibt nichts zusammenzufassen.');
  }
  const zeilen = transkriptZeilen(blocks);
  const voll = alsText(zeilen);
  const geschaetzt = tokens(voll);

  if (geschaetzt <= EINSTUFIG_BIS) {
    await fortschritt('zusammenfassung', 0, 1, 'Ein Aufruf für das gesamte Transkript');
    const s = await final(voll, 'Transkripte');
    s._meta = { verfahren: 'einstufig', token_geschaetzt: geschaetzt, abschnitte: 1 };
    return s;
  }

  const pakete = packe(zeilen, ABSCHNITT);
  let notizen: string[] = [];
  for (let i = 0; i < pakete.length; i++) {
    await fortschritt('analysiert', i, pakete.length, `Abschnitt ${i + 1} von ${pakete.length} wird verdichtet`);
    const t = await rufe('abschnitt', promptAbschnitt.trim(), alsText(pakete[i]), false);
    notizen.push(`### Abschnitt ${i + 1}\n${t.trim()}`);
  }
  let stufe = 0;
  while (tokens(notizen.join('\n\n')) > EINSTUFIG_BIS && notizen.length > 1 && stufe < 4) {
    stufe++;
    let gruppen = gruppiere(notizen, ABSCHNITT);
    if (gruppen.length === notizen.length) {
      gruppen = [];
      for (let i = 0; i < notizen.length; i += 2) gruppen.push(notizen.slice(i, i + 2));
    }
    const neu: string[] = [];
    for (let j = 0; j < gruppen.length; j++) {
      await fortschritt('analysiert', j, gruppen.length, `Notizen zusammenführen, Stufe ${stufe}: ${j + 1} von ${gruppen.length}`);
      neu.push((await rufe('verdichten', promptVerdichten.trim(), gruppen[j].join('\n\n'), false)).trim());
    }
    notizen = neu;
  }
  await fortschritt('zusammenfassung', 0, 1, 'Gesamtzusammenfassung wird erstellt');
  const s = await final(notizen.join('\n\n'), 'Verdichtete Notizen aus allen Abschnitten');
  s._meta = { verfahren: 'mehrstufig', token_geschaetzt: geschaetzt, abschnitte: pakete.length, stufen: stufe + 2 };
  return s;
}
