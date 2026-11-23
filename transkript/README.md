# Transkript

Eine oder mehrere Audiodateien wählen, OpenRouter-Schlüssel eintragen, Text erhalten – zum Kopieren,
als .txt oder als PDF. Eine Stunde Audio kostet
mit Whisper Large V3 höchstens ≈ 0,11 $, mit Turbo ≈ 0,04 $. Lange Pausen werden nicht
mitgeschickt und deshalb auch nicht berechnet.

**Online:** https://borian69.github.io/Menace-Health-website-files/transkript/
(nach dem Merge nach `main`). Lokal reicht ein beliebiger Webserver im Repo-Wurzelordner,
z. B. `python3 -m http.server`, dann `/transkript/` öffnen. Ein Build-Schritt entfällt.

## Was mit der Aufnahme passiert

Alles läuft im Browser. Nur die fertigen MP3-Abschnitte gehen an openrouter.ai.

| Schritt | Warum |
|---|---|
| Dekodieren auf 16 kHz mono | Mit dieser Rate rechnet Whisper intern. Mehr ist nur zusätzliche Upload-Last. |
| Hochpass 80 Hz | Entfernt Brummen, Wind und Trittschall. Stimmen liegen darüber. |
| Schnitte an der leisesten Stelle zwischen 90 und 150 s | Kein Wort wird zerteilt. |
| Stille Abschnitte überspringen | Whisper erfindet bei Stille Sätze („Untertitel im Auftrag des ZDF“). |
| Pausen über 1,5 s auf 0,5 s kürzen | Spart Kosten (Abrechnung pro Sekunde) und erfundene Sätze. Grenze 24 dB unter dem Sprechpegel: Bei Rauschen bleibt alles stehen. |
| Pegel je Abschnitt auf ≈ −20 dBFS, höchstens +30 dB, weich begrenzt | Leise Sprecher werden hörbar, der MP3-Kodierer verliert weniger Details. |
| MP3 48 kbit/s | 2 min ≈ 720 KB. Etwas Reserve für verrauschte Aufnahmen. |
| 3 Abschnitte gleichzeitig, bis zu 4 Versuche mit Wartezeit, 2 min Zeitlimit | Ein Hänger hält den Lauf nicht an. |
| `temperature: 0`, Sprache fest (Standard Deutsch) | Whisper rät dann nicht, welche Sprache gesprochen wird. |
| Namen und Fachbegriffe als `prompt` | Whisper übernimmt deren Schreibweise. Lehnt der Anbieter das Feld ab, entfällt es für die Sitzung. |
| Aufräumen | Bekannte Abspann-Sätze aus TV-Untertiteln fallen weg. Ein Satz, der mehr als zweimal hintereinander kommt, und Wortschleifen werden gekürzt. |

Mehrere Dateien laufen nacheinander. Immer nur eine ist dekodiert im Speicher. Bei mehreren Dateien
steht im Ergebnis über jedem Text der Dateiname, im PDF fett.

**402 „in-flight requests“:** OpenRouter hält für jede laufende Anfrage Guthaben zurück. Bei
kleinem Guthaben oder Schlüssel-Limit scheitern parallele Anfragen, obwohl jede einzeln durchginge.
Das Tool schickt dann nur noch eine Anfrage gleichzeitig und wartet bei Bedarf 6, 12, 24 und 48 s.
Erst wenn auch eine einzelne Anfrage abgelehnt wird, bricht es ab und verweist auf das Limit des
Schlüssels (openrouter.ai/settings/keys).

Scheitern Abschnitte, bleibt alles Fertige erhalten. Der Knopf heißt dann „n fehlende
Abschnitte wiederholen“, und im Text steht an der Stelle `[Abschnitt 3:11–5:00 fehlt]`.
Bei 401/402/403/404 bricht der Lauf sofort ab und nennt den Grund.

## Schlüssel

Der Schlüssel liegt in `localStorage` und geht nur an openrouter.ai. Steht in der Mitschrift
auf demselben Gerät schon einer, wird er übernommen. Bei OpenRouter für diesen Schlüssel ein
Ausgabenlimit setzen.

## Grenzen

- Der Browser dekodiert die ganze Datei auf einmal: 1 h ≈ 230 MB Arbeitsspeicher. Auf älteren
  Handys Aufnahmen über etwa 1 h am Computer verarbeiten.
- Während des Laufs muss die Seite offen bleiben. Der Bildschirm wird dafür wachgehalten.
- Ohne Sprechererkennung und ohne Zeitmarken. Für Projekte mit Zusammenfassung gibt es die
  Mitschrift (`../mitschrift/`).

## Dateien

`index.html` · `app.css` (nur Ergänzungen zu `../design/moch.css`) · `app.js` ·
`vendor/jspdf.js` (jsPDF 4.2.1, MIT, wird erst beim ersten PDF geladen) ·
`vendor/lamejs.js` (MP3-Kodierer `@breezystack/lamejs` 1.2.7, LGPL, siehe `vendor/lamejs-LICENSE`).

**Cache:** GitHub Pages und Browser halten Dateien bis zu 10 Minuten. Bei jeder Änderung `?v=` in
`index.html` und die Version im Kopf (`v5`) hochzählen. So sieht man auf dem Gerät sofort, welche
Fassung läuft.

## Abweichungen vom Design-System

- **Keine neuen Klassen.** Ablage, Ergebnisfeld und Knopfzeile sind über IDs gestaltet.
- **`.aktion` und `.toast` sitzen tiefer**, weil die Seite keine Tab-Leiste hat.
- **Farbe (Regel 1–3), auf Wunsch:** Grund Anthrazit mit 30 % Blau (`#22272C`) statt Blau `#0F1A26`.
  Amber nur noch auf der Hauptaktion (≈ 5 % der Fläche). Auswahl, Fokuslinie, Fortschritt und Toast
  laufen neutral. Die Werte stehen am Ende von `app.css`.
- **Die Seite ist auf 640 px begrenzt**, damit der Text am Computer nicht über die ganze Breite läuft.
