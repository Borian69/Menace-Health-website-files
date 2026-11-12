/* Browser-Test für den Gerätebetrieb (GitHub Pages, kein eigener Server).
   OpenRouter wird im Browser abgefangen und nachgebildet; geprüft wird, was
   die App tatsächlich sendet (Schlüssel, Modell, gültiges MP3).

   Voraussetzung: statischer Server auf der Repo-Wurzel, z. B.
     python3 -m http.server 8100
   Aufruf:
     node mitschrift/tools/e2e-geraet.mjs <ordner-mit-vortrag.mp3-und-memo.m4a> [screenshot-ordner] */

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const URL_APP = process.env.APP ?? 'http://localhost:8100/mitschrift/app/';
const DATEIEN = process.argv[2];
const SHOTS = process.argv[3];
const KEY = 'sk-or-v1-test-schluessel';
const PROJEKT = `Gerät ${new Date().toISOString().slice(11, 19)}`;
const mp3Ordner = mkdtempSync(join(tmpdir(), 'mp3-'));

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone'] });
const page = await ctx.newPage();
const fehler = [];
page.on('pageerror', (e) => fehler.push(e.message));

// ── OpenRouter nachbilden ─────────────────────────────────
const stt = [];
const chats = [];
await page.route('https://openrouter.ai/api/v1/**', async (route) => {
  const req = route.request();
  const auth = req.headers().authorization;
  const pfad = new URL(req.url()).pathname;
  if (auth !== `Bearer ${KEY}`) return route.fulfill({ status: 401, json: { error: { message: 'bad key' } } });
  if (pfad.endsWith('/key')) {
    return route.fulfill({ json: { data: { label: 'test', usage: 0.12, limit: 5, limit_remaining: 4.88 } } });
  }
  if (pfad.endsWith('/audio/transcriptions')) {
    const b = req.postDataJSON();
    const datei = join(mp3Ordner, `stueck-${stt.length}.mp3`);
    writeFileSync(datei, Buffer.from(b.input_audio.data, 'base64'));
    stt.push({ model: b.model, format: b.input_audio.format, language: b.language, rf: b.response_format, datei });
    return route.fulfill({ json: {
      text: 'Wir bestellen 40 Stühle. Frau Lenz klärt den Liefertermin.',
      segments: [
        { start: 0, end: 4, text: 'Wir bestellen 40 Stühle.' },
        { start: 4, end: 8, text: 'Frau Lenz klärt den Liefertermin.' },
      ],
      usage: { cost: 0.0004 },
    } });
  }
  if (pfad.endsWith('/chat/completions')) {
    const b = req.postDataJSON();
    chats.push({ model: b.model, rf: b.response_format, user: b.messages[1].content });
    const summary = {
      ueberblick: 'Besprechung zur Bestuhlung.',
      erkenntnisse: [{ text: 'Es werden 40 Stühle bestellt.', quelle: 'A1 · 00:00:00' }],
      themen: [{ titel: 'Bestellung', punkte: [{ text: '40 Stühle', quelle: 'A2 · 00:00:00' }], unterthemen: [] }],
      fakten: [], entscheidungen: [{ text: 'Bestellung von 40 Stühlen', quelle: 'A1 · 00:00:00' }],
      aufgaben: [{ text: 'Liefertermin klären', wer: 'Frau Lenz', bis: '', quelle: 'A1 · 00:00:04' }],
      offene_fragen: [], widersprueche: [], unklar: [],
    };
    return route.fulfill({ json: {
      model: b.model, choices: [{ message: { content: JSON.stringify(summary) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 812, completion_tokens: 240, cost: 0.0003 },
    } });
  }
  return route.fulfill({ status: 404, json: { error: { message: 'unbekannt' } } });
});

let n = 0;
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, `g${String(++n).padStart(2, '0')}-${name}.png`) }); };
const schritt = (t) => console.log('✓', t);
const aufnahme = page.locator('section[aria-label="Aufnahme"]');
const projekte = page.locator('section[aria-label="Projekte"]');
const einstellungen = page.locator('section[aria-label="Einstellungen"]');

await page.goto(URL_APP);
await page.evaluate(() => localStorage.setItem('mitschrift.test.teilMs', '5000'));
await page.reload();
await aufnahme.getByRole('button', { name: 'Aufnahme starten' }).waitFor();
assert.equal(await page.locator('.leiste .punkt').count(), 1, 'Hinweispunkt am Zahnrad ohne Schlüssel');
await shot('start');
schritt('Gerätebetrieb erkannt (kein Server unter ./api)');

// 1 · Aufnahme über drei Teilstücke (Testschalter: Wechsel alle 5 s)
await aufnahme.getByRole('button', { name: 'Aufnahme starten' }).click();
await page.waitForTimeout(18500);  // Wechsel an Blockgrenzen (4 s): bei 8 s und 16 s
await aufnahme.getByRole('button', { name: 'Aufnahme beenden' }).click();
await aufnahme.getByLabel('Name der Aufnahme').waitFor();
const teile = await aufnahme.locator('.dataline').innerText();
assert.match(teile, /Teilstücke\s+[3-4]/i, teile);
const neu = aufnahme.getByRole('button', { name: 'Neues Projekt' });
if ((await neu.getAttribute('aria-pressed')) !== 'true') await neu.click();
await aufnahme.getByLabel('Name des neuen Projekts').fill(PROJEKT);
await aufnahme.getByLabel('Name der Aufnahme').fill('Besprechung');
await page.getByRole('button', { name: 'Aufnahme speichern' }).click();
await aufnahme.locator('.notice.is-success').waitFor({ timeout: 15000 });
schritt(`Aufnahme mit ${teile.match(/TEILSTÜCKE\s+(\d)/i)[1]} Teilstücken gespeichert, ohne Server`);

// 2 · Projekt: Verarbeiten ohne Schlüssel geht nicht, mit Hinweis
await aufnahme.getByRole('button', { name: 'Projekt öffnen' }).click();
await projekte.getByRole('heading', { name: PROJEKT }).waitFor();
const dauerText = await projekte.locator('.eintrag.aufnahme').first().innerText();
assert.match(dauerText, /0:1[7-9]/, `Dauer über alle Teile: ${dauerText}`);
await projekte.getByText('Schlüssel fehlt.').waitFor();
schritt(`Dauer über Teilstücke korrekt (${dauerText.match(/0:1\d/)[0]}), Hinweis „Schlüssel fehlt“`);

// 3 · Schlüssel in den Einstellungen eintragen und prüfen
await projekte.getByRole('button', { name: 'Zu den Einstellungen' }).click();
await einstellungen.getByLabel('API-Schlüssel').fill(KEY);
await einstellungen.getByRole('button', { name: 'Schlüssel speichern' }).click();
await einstellungen.getByText(/Schlüssel gültig/).waitFor();
const pruef = await einstellungen.locator('.field-msg').first().innerText();
await shot('einstellungen');
assert.equal(await page.locator('.leiste .punkt').count(), 0, 'Punkt verschwindet mit Schlüssel');
schritt(`Schlüssel gespeichert und geprüft: ${pruef}`);

// 4 · Dateien importieren, verarbeiten
await einstellungen.getByRole('button', { name: '‹ Zurück' }).click();
await projekte.getByRole('heading', { name: PROJEKT }).waitFor();
await projekte.getByRole('button', { name: 'Dateien hinzufügen' }).click();
await projekte.locator('input[type=file]').setInputFiles([join(DATEIEN, 'vortrag.mp3'), join(DATEIEN, 'memo.m4a')]);
await projekte.getByRole('button', { name: '2 Dateien hinzufügen' }).click();
await projekte.locator('.eintrag.datei .badge').nth(1).waitFor({ timeout: 20000 });
await page.waitForTimeout(500);
await projekte.getByRole('button', { name: 'Transkribieren und zusammenfassen' }).click();
await projekte.getByRole('button', { name: 'Jetzt starten' }).click();
await projekte.getByText('Erfolgreich abgeschlossen').waitFor({ timeout: 90000 });
await projekte.getByRole('heading', { name: 'Zusammenfassung' }).evaluate((h) => h.scrollIntoView());
await shot('zusammenfassung');

assert.ok(stt.length >= 3, `Whisper-Aufrufe: ${stt.length}`);
for (const s of stt) {
  assert.equal(s.model, 'openai/whisper-large-v3-turbo');
  assert.equal(s.format, 'mp3');
  assert.equal(s.language, 'de');
  const info = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'csv=p=0', s.datei]).toString().trim();
  assert.equal(info, 'mp3,16000,1', `gültiges MP3: ${info}`);
}
assert.equal(chats.length, 1, 'genau ein Aufruf für die Zusammenfassung');
assert.equal(chats[0].model, 'deepseek/deepseek-v4.1-flash');
assert.match(chats[0].user, /=== A1 · Besprechung/);
assert.match(chats[0].user, /=== A3 · memo\.m4a/);
const daten = await projekte.locator('.zf-titel + * , .dataline').filter({ hasText: /KI-Aufrufe/i }).first().innerText();
schritt(`Verarbeitet: ${stt.length}× Whisper (je gültiges MP3, 16 kHz mono), 1× DeepSeek · ${daten.replace(/\s+/g, ' ')}`);

// 5 · Sprung ins Audio über Teilstücke hinweg
await projekte.getByText('Vollständiges Transkript anzeigen').click();
await projekte.locator('.segmente p').first().waitFor();
const zeiten = await projekte.locator('details.transkript .gruppe').first().locator('.zeit').allInnerTexts();
assert.ok(zeiten.length >= 3, `Segmente aus mehreren Teilstücken: ${zeiten.join(', ')}`);
await projekte.locator('details.transkript .gruppe').first().locator('.zeit').last().click();
await page.locator('.app-rahmen > .player audio').waitFor();
const kopf = await page.locator('.player .lb').innerText();
assert.match(kopf, /Teil [2-4]\//i, `Sprung landet in späterem Teil: ${kopf}`);
await shot('transkript');
schritt(`Transkript-Zeiten über Teilstücke fortlaufend (${zeiten.join(' · ')}), Sprung öffnet ${kopf.match(/Teil \d\/\d/i)[0]}`);

// 6 · Neu laden: alles noch da (IndexedDB)
const vorher = stt.length;
await page.reload();
await projekte.getByText('Erfolgreich abgeschlossen').waitFor();
await projekte.getByText('Wichtigste Erkenntnisse').waitFor();
// Erneut starten ohne Änderung ist nicht nötig (kein Knopf), Kosten bleiben gleich
assert.equal(await projekte.getByRole('button', { name: 'Transkribieren und zusammenfassen' }).count(), 0);
assert.equal(stt.length, vorher);
schritt('Nach Neuladen: Projekt, Zusammenfassung und Transkript unverändert da');

// 7 · Markdown-Export
const [download] = await Promise.all([page.waitForEvent('download'), projekte.getByRole('button', { name: 'Als Markdown exportieren' }).click()]);
const pfad = await download.path();
const md = require('node:fs').readFileSync(pfad, 'utf8');
assert.match(md, /## Überblick/);
assert.match(md, /\[00:00:04\] Frau Lenz/);
schritt('Markdown-Export enthält Zusammenfassung und Transkript');

assert.deepEqual(fehler, [], `Fehler im Browser: ${fehler.join(' | ')}`);
console.log('Alle Schritte bestanden.');
await browser.close();
