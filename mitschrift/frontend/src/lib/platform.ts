// Was das Gerät kann – und was es bei gesperrtem Bildschirm tut.
// Diese Texte versprechen nichts, was der Browser nicht hält.

export type Plattform = 'ios' | 'android' | 'desktop';

export function plattform(): Plattform {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export const istInstalliert = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

export function kannAufnehmen(): { ok: boolean; grund?: string } {
  if (!window.isSecureContext) return { ok: false, grund: 'Aufnehmen braucht eine sichere Verbindung (HTTPS).' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, grund: 'Dieser Browser gibt das Mikrofon nicht frei.' };
  if (typeof MediaRecorder === 'undefined') return { ok: false, grund: 'Dieser Browser kann nicht aufnehmen (MediaRecorder fehlt).' };
  return { ok: true };
}

/** Bevorzugte Formate: Opus spart bei Sprache am meisten Platz. Safari kann nur MP4/AAC. */
export function bestesFormat(): string {
  const kandidaten = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm'];
  for (const k of kandidaten) if (MediaRecorder.isTypeSupported?.(k)) return k;
  return '';
}

export function endungFuer(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  return 'webm';
}

export const hatWakeLock = () => 'wakeLock' in navigator;

export interface Hinweis { titel: string; text: string; alternative?: string }

export function hintergrundHinweis(p: Plattform): Hinweis {
  if (p === 'ios') {
    return {
      titel: 'iPhone und iPad: Bildschirm anlassen',
      text:
        'iOS beendet das Mikrofon einer Web-App, sobald der Bildschirm gesperrt wird oder Du in eine andere App wechselst. ' +
        'Die App hält den Bildschirm deshalb wach. Wird die Aufnahme trotzdem unterbrochen, ist alles bis dahin gesichert; ' +
        'mit „Weiter aufnehmen“ geht es im selben Stück weiter.',
      alternative:
        'Für lange Aufnahmen mit gesperrtem Gerät: in der Sprachmemos-App aufnehmen und die Datei hier importieren.',
    };
  }
  if (p === 'android') {
    return {
      titel: 'Android: meist auch mit gesperrtem Bildschirm',
      text:
        'Chrome nimmt in der Regel weiter auf, wenn der Bildschirm ausgeht. Manche Hersteller beenden Apps im Hintergrund ' +
        'trotzdem, um Strom zu sparen. Die App sichert alle 4 Sekunden und meldet jede erkannte Lücke.',
      alternative:
        'Sicherer: Akku-Optimierung für Chrome ausschalten – oder mit der Rekorder-App aufnehmen und die Datei teilen bzw. importieren.',
    };
  }
  return {
    titel: 'Am Computer',
    text: 'Die Aufnahme läuft weiter, solange der Tab offen ist – auch im Hintergrund. Alle 4 Sekunden wird gesichert.',
  };
}
