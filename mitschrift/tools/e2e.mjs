/* Ende-zu-Ende-Test im echten Browser (Chromium, künstliches Mikrofon).
   Voraussetzung: Server läuft mit Attrappen auf Port 8000:
     STORAGE_DIR=/tmp/mitschrift-demo python -m backend.tests.demo_server
   Aufruf:
     node mitschrift/tools/e2e.mjs <ordner-mit-vortrag.mp3-und-memo.m4a> [screenshot-ordner]

   Prüft: Aufnahme starten, pausieren, fortsetzen, beenden, speichern ·
   neues Projekt · Wiederherstellung nach Neuladen mitten in der Aufnahme ·
   Unterbrechung durch das System und „Weiter aufnehmen“ · Import zweier
   Dateien · Verarbeitung · Zusammenfassung · Transkript · Umbenennen. */

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8000';
const DATEIEN = process.argv[2];
const SHOTS = process.argv[3];
const PROJEKT = `E2E ${new Date().toISOString().slice(11, 19)}`;

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone'] });
// Zugriff auf die Mikrofon-Spuren, um eine System-Unterbrechung auszulösen.
await ctx.addInitScript(() => {
  const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  window.__spuren = [];
  navigator.mediaDevices.getUserMedia = async (c) => {
    const s = await orig(c);
    window.__spuren.push(...s.getAudioTracks());
    return s;
  };
});
const page = await ctx.newPage();
const fehler = [];
page.on('pageerror', (e) => fehler.push(e.message));

let n = 0;
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `${String(++n).padStart(2, '0')}-${name}.png`) }); };
const sekunden = async () => {
  const t = await page.locator('.uhr .number').innerText();
  const [m, s] = t.split(':').map(Number);
  return m * 60 + s;
};
const schritt = (t) => console.log('✓', t);
const aufnahme = page.locator('section[aria-label="Aufnahme"]');
const projekte = page.locator('section[aria-label="Projekte"]');

await page.goto(BASE);
await aufnahme.getByRole('button', { name: 'Aufnahme starten' }).waitFor();
await shot('bereit');

// 1 · Aufnehmen, pausieren, fortsetzen, beenden
await aufnahme.getByRole('button', { name: 'Aufnahme starten' }).click();
await page.waitForTimeout(6500);
assert.ok((await sekunden()) >= 5, 'Zeit läuft');
assert.match(await aufnahme.locator('.dataline').innerText(), /Gesichert\s+[1-9]/i);
await shot('aufnahme');
await aufnahme.getByRole('button', { name: 'Pause' }).click();
const pausiert = await sekunden();
await page.waitForTimeout(2000);
assert.equal(await sekunden(), pausiert, 'Zeit steht in der Pause');
await aufnahme.getByRole('button', { name: 'Fortsetzen' }).click();
await page.waitForTimeout(2500);
assert.ok((await sekunden()) > pausiert, 'Zeit läuft nach Fortsetzen weiter');
await aufnahme.getByRole('button', { name: 'Aufnahme beenden' }).click();
schritt('Aufnahme starten · pausieren · fortsetzen · beenden');

// 2 · Speichern in ein neues Projekt
assert.equal(await page.locator('.aktion.da').count(), 0, 'Speichern erst nach Projektwahl');
// Ohne vorhandene Projekte ist das Feld schon offen.
const neu = aufnahme.getByRole('button', { name: 'Neues Projekt' });
if ((await neu.getAttribute('aria-pressed')) !== 'true') await neu.click();
await aufnahme.getByLabel('Name des neuen Projekts').fill(PROJEKT);
await aufnahme.getByLabel('Name der Aufnahme').fill('Erste Aufnahme');
await shot('speichern');
await page.getByRole('button', { name: 'Aufnahme speichern' }).click();
await aufnahme.locator('.notice.is-success').waitFor({ timeout: 15000 });
schritt('Gespeichert in neues Projekt');

// 3 · Absturz mitten in der Aufnahme: Neuladen, dann wiederherstellen
await aufnahme.getByRole('button', { name: 'Aufnahme starten' }).click();
await page.waitForTimeout(9000);
page.once('dialog', (d) => d.accept());
await page.reload();
await aufnahme.getByText('Noch nicht gespeichert').waitFor();
const zeile = aufnahme.locator('.eintrag').first();
const wiederDauer = await zeile.locator('.tag').innerText();
assert.ok(Number(wiederDauer.split(':')[1]) >= 4, `wiederhergestellt: ${wiederDauer}`);
await shot('wiederherstellen');
await zeile.getByRole('button', { name: 'Speichern' }).click();
await aufnahme.getByRole('button', { name: PROJEKT }).click();
await page.getByRole('button', { name: 'Aufnahme speichern' }).click();
await aufnahme.locator('.notice.is-success').waitFor({ timeout: 15000 });
schritt(`Nach Neuladen wiederhergestellt (${wiederDauer}) und gespeichert`);

// 4 · Unterbrechung durch das System, dann weiter im selben Stück
await aufnahme.getByRole('button', { name: 'Aufnahme starten' }).click();
await page.waitForTimeout(5000);
await page.evaluate(() => window.__spuren.at(-1).dispatchEvent(new Event('ended')));
await aufnahme.getByRole('button', { name: 'Weiter aufnehmen' }).waitFor();
assert.match(await aufnahme.locator('.notice.is-error').innerText(), /Unterbrochen/i);
await shot('unterbrochen');
await aufnahme.getByRole('button', { name: 'Weiter aufnehmen' }).click();
await page.waitForTimeout(5000);
await aufnahme.getByRole('button', { name: 'Aufnahme beenden' }).click();
assert.match(await aufnahme.locator('.dataline').innerText(), /Teilstücke\s+2/i);
await aufnahme.getByRole('button', { name: PROJEKT }).click();
await page.getByRole('button', { name: 'Aufnahme speichern' }).click();
await aufnahme.locator('.notice.is-success').waitFor({ timeout: 20000 });
schritt('Unterbrechung erkannt, zwei Teilstücke als eine Aufnahme gespeichert');

// 5 · Projekt öffnen, zwei Dateien importieren
await aufnahme.getByRole('button', { name: 'Projekt öffnen' }).click();
await projekte.getByRole('heading', { name: PROJEKT }).waitFor();
await projekte.getByRole('button', { name: 'Dateien hinzufügen' }).click();
await projekte.locator('input[type=file]').setInputFiles([join(DATEIEN, 'vortrag.mp3'), join(DATEIEN, 'memo.m4a')]);
await projekte.getByRole('button', { name: '2 Dateien hinzufügen' }).click();
await projekte.locator('.eintrag.datei .badge').nth(1).waitFor({ timeout: 20000 });
await page.waitForTimeout(800);
const kz = await projekte.locator('.app-kopf .kz').innerText();
assert.match(kz, /5\s+Aufnahmen/i, kz);
const zweite = await projekte.locator('.eintrag.aufnahme').nth(2).innerText();
assert.match(zweite, /0:(09|1[0-1])/, `zusammengesetzte Aufnahme ≈ 10 s: ${zweite}`);
await shot('projekt');
schritt(`Import zweier Dateien · ${kz.replace(/\s+/g, ' ')}`);

// 6 · Verarbeitung
await projekte.getByRole('button', { name: 'Transkribieren und zusammenfassen' }).click();
await projekte.getByText('Das wird verarbeitet').waitFor();
await shot('bestaetigen');
await projekte.getByRole('button', { name: 'Jetzt starten' }).click();
await projekte.getByText('Erfolgreich abgeschlossen').waitFor({ timeout: 60000 });
await projekte.getByText('Wichtigste Erkenntnisse').waitFor();
await projekte.getByRole('heading', { name: 'Zusammenfassung' }).evaluate((h) => h.scrollIntoView());
await shot('zusammenfassung');
await projekte.getByText('Vollständiges Transkript anzeigen').click();
await projekte.locator('.segmente p').first().waitFor();
const bloecke = await projekte.locator('details.transkript .eyebrow').count();
assert.equal(bloecke, 5, 'Transkript je Aufnahme');
await projekte.locator('.segmente .zeit').nth(1).click();
await page.locator('.app-rahmen > .player audio').waitFor();
await shot('transkript');
schritt('Verarbeitung · Zusammenfassung · Transkript mit 5 Aufnahmen · Sprung ins Audio');

// 7 · Umbenennen, und nach Neuladen ist alles da
await projekte.getByRole('button', { name: 'Projekt umbenennen' }).click();
await projekte.getByLabel('Projektname').fill(`${PROJEKT} (umbenannt)`);
await projekte.getByRole('button', { name: 'Namen speichern' }).click();
await page.reload();
await projekte.getByRole('heading', { name: `${PROJEKT} (umbenannt)` }).waitFor();
await projekte.getByText('Erfolgreich abgeschlossen').waitFor();
schritt('Umbenannt, nach Neuladen unverändert');

await page.goto(`${BASE}/#/projekte`);
await projekte.getByText(`${PROJEKT} (umbenannt)`).waitFor();
await shot('projekte');

assert.deepEqual(fehler, [], `Fehler im Browser: ${fehler.join(' | ')}`);
console.log('Alle Schritte bestanden.');
await browser.close();
