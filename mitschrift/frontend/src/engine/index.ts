// Wählt beim Start die Betriebsart:
// - Antwortet ./api/status wie unser FastAPI-Server → Server-Betrieb.
// - Sonst (GitHub Pages, jeder andere statische Host) → alles auf dem Gerät.
// Die letzte Wahl wird gemerkt, damit eine Server-Installation ohne Netz
// nicht plötzlich in den Gerätebetrieb fällt.

import { geraetEngine } from './geraet';
import { serverEngine } from './server';
import type { Engine } from './types';

export { onUnauthorized } from './server';

const MERK = 'mitschrift.betrieb';

// Live-Bindung: Nach waehleEngine() zeigt `api` auf die gewählte Engine.
export let api: Engine = geraetEngine;

export async function waehleEngine(): Promise<Engine> {
  let zuletzt: string | null = null;
  try { zuletzt = localStorage.getItem(MERK); } catch { /* privat */ }
  try {
    const r = await fetch('api/status', { credentials: 'same-origin', cache: 'no-store' });
    const ct = r.headers.get('content-type') ?? '';
    if (r.ok && ct.includes('application/json')) {
      const j = await r.json();
      if (typeof j.auth_required === 'boolean') {
        api = serverEngine;
        try { localStorage.setItem(MERK, 'server'); } catch { /* egal */ }
        return api;
      }
    }
    api = geraetEngine;
    try { localStorage.setItem(MERK, 'geraet'); } catch { /* egal */ }
  } catch {
    // Kein Netz: bei der letzten Wahl bleiben.
    api = zuletzt === 'server' ? serverEngine : geraetEngine;
  }
  return api;
}
