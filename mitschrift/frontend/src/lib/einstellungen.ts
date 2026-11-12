// Einstellungen dieses Geräts. Liegen nur im Browser (localStorage) und
// verlassen das Gerät nur als Header an openrouter.ai.

import { useSyncExternalStore } from 'react';

export interface Einstellungen {
  apiKey: string;
  sttModel: string;   // Transkription
  llmModel: string;   // Zusammenfassung
  sprache: string;    // ISO-Code, leer = automatisch
}

export const STANDARD: Einstellungen = {
  apiKey: '',
  sttModel: 'openai/whisper-large-v3-turbo',
  llmModel: 'deepseek/deepseek-v4.1-flash',
  sprache: 'de',
};

const KEY = 'mitschrift.einstellungen';
const hoerer = new Set<() => void>();
let cache: Einstellungen | null = null;

export function einstellungen(): Einstellungen {
  if (cache) return cache;
  try {
    const roh = localStorage.getItem(KEY);
    cache = { ...STANDARD, ...(roh ? JSON.parse(roh) : {}) };
  } catch {
    cache = { ...STANDARD };
  }
  return cache!;
}

export function speichereEinstellungen(teil: Partial<Einstellungen>) {
  cache = { ...einstellungen(), ...teil };
  for (const k of ['sttModel', 'llmModel'] as const) if (!cache[k].trim()) cache[k] = STANDARD[k];
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* privat: nur für diese Sitzung */ }
  hoerer.forEach((f) => f());
}

export function useEinstellungen(): Einstellungen {
  return useSyncExternalStore((f) => { hoerer.add(f); return () => { hoerer.delete(f); }; }, einstellungen);
}
