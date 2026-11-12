# Architektur

## Zwei Betriebsarten, eine Oberfläche

Beim Start fragt die Oberfläche `./api/status` ab:

- **Antwortet der FastAPI-Server** → Server-Betrieb (`src/engine/server.ts`). Daten in SQLite,
  Transkription mit faster-whisper auf dem Server, Schlüssel in `.env`.
- **Sonst** (GitHub Pages) → Gerätebetrieb (`src/engine/geraet/`). Daten in IndexedDB,
  Transkription und Zusammenfassung über OpenRouter direkt aus dem Browser, Schlüssel in den
  Einstellungen des Geräts.

Beide implementieren dasselbe Interface (`src/engine/types.ts`). Die Seiten kennen nur
dieses Interface. Die Zusammenfassung nutzt in beiden Fällen dieselben Prompt-Dateien aus
`backend/prompts/` und dasselbe Verfahren (einstufig bis ≈ 90.000 Token, sonst mehrstufig,
Cache über den Inhalt).

**Gerätebetrieb im Detail:** Aufnahmen liegen als Teilstücke in IndexedDB (neues Teilstück
alle 15 Minuten und nach jeder Unterbrechung). Zur Transkription wird jedes Teilstück
dekodiert (OfflineAudioContext, 16 kHz), in 2-Minuten-Abschnitte geteilt, Stille übersprungen,
als MP3 kodiert (lamejs, LGPL) und an `POST /api/v1/audio/transcriptions` geschickt
(`response_format: verbose_json` für Segmente mit Zeitstempeln). Jeder fertige Abschnitt wird
sofort gespeichert.

## Überblick Server-Betrieb

```
Browser (PWA)                          Server (ein Prozess)
───────────────                        ─────────────────────────────────────
MediaRecorder ─► IndexedDB             FastAPI ──► SQLite (storage/mitschrift.db)
      │  (Block alle 4 s)                 │   └──► Dateien (storage/audio/<projekt>/)
      └──► Upload (Teilstücke) ─────────► │
Datei-Import ──► Upload ────────────────► │
                                          └─► Warteschlange ─► 1 Worker-Thread
                                                 FFmpeg → faster-whisper → OpenRouter
```

Ein Container, ein Port. FastAPI liefert auch die gebaute Oberfläche aus. Kein Redis,
keine zweite Datenbank, kein externer Dienst außer OpenRouter.

## Daten

**Projekt:** id, name, created_at, updated_at, status, progress, error, summary_json,
summary_key, summary_at.
**Aufnahme:** id, project_id, filename, file_path (relativ zu `storage/`), mime, source
(`aufnahme` / `import`), duration_s, size_bytes, created_at, position, status, error,
transcript_json (Segmente mit Start, Ende, Text), transcript_model, client_id.
**transcript_parts:** fertige Abschnitte einer laufenden Transkription.
**llm_cache:** KI-Antworten, adressiert über den Hash aus Modell, Temperatur, Prompt und Eingabe.
**llm_calls:** jeder bezahlte Aufruf mit Token und Kosten.

Status eines Projekts: `wartet` → `transkribiert` → `analysiert` → `zusammenfassung` →
`fertig`, oder `fehler`. Ändern sich die Aufnahmen eines fertigen Projekts, steht es
wieder auf `wartet`. Die alte Zusammenfassung bleibt sichtbar und ist als „nicht mehr
aktuell“ markiert.

## Verarbeitung

1. Alle Aufnahmen des Projekts in ihrer Reihenfolge.
2. Für jede Aufnahme ohne Transkript: FFmpeg → 16 kHz mono WAV; bei mehr als
   `TRANSCRIBE_CHUNK_MINUTES` in Abschnitte teilen.
3. faster-whisper je Abschnitt (VAD an, `condition_on_previous_text` aus gegen
   Wiederholungsschleifen). Jeder fertige Abschnitt wird sofort gespeichert, die
   Zeitstempel werden auf die Gesamtaufnahme verschoben.
4. Transkript speichern, Arbeitsdateien löschen.
5. Transkripte zu Text: je Aufnahme ein Kopf („A2 · Dateiname · Dauer“), ein Zeitstempel
   je ≈ 45 s. Das spart gegenüber einem Stempel pro Segment etwa ein Drittel der Token.
6. **Bis `LLM_SINGLE_PASS_TOKENS`:** ein Aufruf → JSON-Zusammenfassung.
   **Darüber:** Abschnitte zu Notizen verdichten (Markierungen ENTSCHEIDUNG, AUFGABE, OFFEN,
   VERMUTUNG, UNKLAR, Quelle je Punkt), Notizen bei Bedarf stufenweise zusammenführen, dann
   ein Aufruf für das Ergebnis.
7. Ergebnis normalisieren (feste Felder, leere Abschnitte bleiben leer) und am Projekt speichern.

**Wiederaufnahme:** Ein erneuter Start überspringt fertige Transkripte und fertige
Abschnitte. KI-Aufrufe mit identischer Eingabe kommen aus `llm_cache`. Nach einem
OpenRouter-Ausfall kostet der zweite Versuch also nur die Aufrufe, die noch fehlten. Ein
unverändertes, fertiges Projekt erneut zu starten, kostet nichts.

**Neustart des Servers:** Laufende Verarbeitungen stehen danach auf `fehler` mit einem
Hinweis. Sie werden nicht automatisch neu gestartet, damit keine unerwarteten Kosten entstehen.

## KI-Anbindung

`services/openrouter.py` ist die einzige Stelle, die mit OpenRouter spricht. Modell,
Temperatur, Ausgabegrenze, Zeitlimit und Wiederholungen kommen aus `config.py`. JSON-Modus
(`response_format`) wird angefragt. Lehnt ein Modell ihn ab, folgt ein Versuch ohne.
Wiederholt wird bei 429, 5xx und Netzfehlern (exponentiell, mit `Retry-After`).
Abgebrochen wird bei 400/401/402/403/404 und bei abgeschnittener Antwort.

Prompts liegen als Markdown in `backend/prompts/`. Eine Änderung am Prompt ändert den
Cache-Schlüssel. Alte Antworten werden dann nicht wiederverwendet.

## Gestaltung

Die Oberfläche nutzt das Moch-Design-System aus `design/moch.css` (dunkel · amber, wie
Bordbuch und Sprungseil). Vite bindet die Datei direkt aus `design/` ein, sie wird nicht
kopiert.

**Abweichungen, begründet:**

- **`moch-motion.js` wird nicht geladen.** React verwaltet das DOM. Die Motion-Bibliothek
  setzt eigene Knoten und Zustände, beides zusammen wäre fehleranfällig. Bewegung gibt es
  nur, wo sie Bedeutung trägt, über CSS-Übergänge: Seitenwechsel, gleitende Tab-Linie,
  Pegel, Fortschrittslinie, erscheinende Hauptaktion. Kein Zählwerk: Die Aufnahmezeit
  ändert sich jede Sekunde, eine rollende Walze wäre dort Ablenkung.
- **Seiten nicht wischbar.** Navigation nur über die Tab-Leiste. Der Auftrag verlangt
  „keine aufwendigen Animationen“, und Wischgesten kollidieren mit horizontal
  scrollenden Elementen wie dem Audio-Player.
- **Runder Aufnahmeknopf.** Echte Kreise sind im System vorgesehen (`.is-circle`). Der
  Knopf ist das eine Ziel der Startseite und muss blind treffbar sein.
- **Kennzahlen in Archivo statt Literata.** Die erzeugte `moch.css` setzt `--font-zahl`
  auf die Textschrift. Die Datei ist die Quelle und wird hier nicht überschrieben.
