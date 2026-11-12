# Einschränkungen

Was die App kann, was sie nicht kann, und was in dieser ersten Fassung nicht geprüft wurde.

## Aufnahme bei gesperrtem Bildschirm

Ein Browser oder eine PWA ist keine native App. Ob das Mikrofon weiterläuft, wenn der
Bildschirm ausgeht, entscheidet das Betriebssystem, nicht die App.

| Plattform | Verhalten | Was die App tut |
|---|---|---|
| **iOS / iPadOS** (Safari und jede andere iOS-App, alle nutzen WebKit) | Das Mikrofon einer Web-App wird beim Sperren, beim Wechsel in eine andere App und bei Anrufen beendet oder stummgeschaltet. Eine zuverlässige Hintergrundaufnahme gibt es nicht. | Hält den Bildschirm per Wake Lock wach (Safari ab iOS 16.4; als installierte Home-Bildschirm-App nach Berichten erst ab iOS 18.4 zuverlässig, die App zeigt an, ob es greift). Erkennt das Ende des Mikrofons (`track.ended`, `mute`, Rückkehr aus dem Hintergrund), zeigt „Unterbrochen“ und bietet „Weiter aufnehmen“ im selben Stück an. Meldet Hintergrundzeiten als mögliche Lücke. Empfiehlt für lange Aufnahmen mit gesperrtem Gerät die Sprachmemos-App plus Import. |
| **Android** (Chrome) | Läuft in der Regel weiter, auch bei ausgeschaltetem Bildschirm (Chrome zeigt eine Benachrichtigung). Manche Hersteller (z. B. mit aggressivem Energiesparen) beenden Hintergrund-Apps trotzdem. | Dieselbe Erkennung wie oben. Hinweis: Akku-Optimierung für Chrome ausschalten. Alternativ mit der Rekorder-App aufnehmen und an Mitschrift **teilen**. |
| **Desktop** | Läuft, solange der Tab offen ist, auch im Hintergrund. | – |

Die App zeigt den Zustand nur als „läuft“ an, wenn er nachweislich läuft: Zeit und
Pegel bewegen sich nur bei aktivem Recorder, eine Unterbrechung wird als Fehler gemeldet.

## Datensicherheit während der Aufnahme

- Der Recorder liefert alle **4 Sekunden** einen Block. Jeder Block wird sofort in
  IndexedDB gespeichert. Bei Absturz, Neuladen oder leerem Akku gehen höchstens die
  letzten 4 Sekunden verloren.
- Beim nächsten Öffnen erscheint die Aufnahme unter „Noch auf diesem Gerät“ und lässt sich
  speichern oder verwerfen.
- Erst wenn der Server den Upload bestätigt, wird die Aufnahme auf dem Gerät gelöscht. Ein
  abgebrochener Upload lässt sich wiederholen. Die Sitzungs-ID verhindert eine doppelte
  Anlage auf dem Server.
- Die App bittet den Browser um dauerhaften Speicher (`navigator.storage.persist`).
  Safari kann Website-Daten trotzdem nach 7 Tagen ohne Nutzung löschen. Als installierte
  PWA (Home-Bildschirm) gilt diese Frist nicht. Aufnahmen also zeitnah speichern.

## Online-Fassung (Gerätebetrieb)

- **Daten je Gerät.** Ohne Server gibt es keinen Abgleich: Handy und Laptop haben getrennte
  Projekte. Den Browserspeicher zu löschen oder die App zu deinstallieren, löscht die
  Projekte. Wichtiges als Markdown exportieren.
- **Verarbeitung nur bei geöffneter App.** Im Hintergrund pausieren Browser die Arbeit. Die
  App hält den Bildschirm wach. Nach einer Unterbrechung geht es ab dem letzten fertigen
  2-Minuten-Abschnitt weiter, bezahlte Abschnitte werden nicht wiederholt.
- **Lange importierte Dateien auf dem Handy.** Zum Transkribieren dekodiert der Browser eine
  Datei vollständig (16 kHz mono ≈ 230 MB Arbeitsspeicher pro Stunde). Eigene Aufnahmen sind
  davon nicht betroffen: Die App legt alle 15 Minuten ein neues Teilstück an. Eine importierte
  Datei von mehreren Stunden kann auf älteren Handys am Speicher scheitern. Dann am Computer
  verarbeiten.
- **Formate:** Was ein Browser nicht dekodieren kann, lässt sich dort nicht transkribieren
  (z. B. OGG/Opus auf älteren iPhones). Die App sagt das mit einer Meldung. Am Computer klappt es.
- **Kosten:** Ohne eigenen Server kostet auch die Transkription Geld (Whisper über
  OpenRouter, pro Audiosekunde). Stille wird nicht gesendet.

## Was geprüft wurde – und wo

| Bereich | Geprüft | Wie |
|---|---|---|
| Online-Fassung statisch unter einem Unterordner ausgeliefert, Gerätebetrieb erkannt | ja | Chromium, `tools/e2e-geraet.mjs` |
| Schlüssel eintragen, prüfen, Hinweis ohne Schlüssel | ja | Chromium, OpenRouter nachgebildet |
| Aufnahme über mehrere Teilstücke, Dauer, Sprung in ein späteres Teilstück | ja | Chromium (Teilstück-Wechsel per Testschalter alle 5 s) |
| Gesendete Anfragen: Schlüssel im Header, Modell-IDs, Sprache, **gültiges MP3 16 kHz mono** | ja | abgefangen und mit ffprobe geprüft |
| Zusammenfassung, Transkript, Neuladen, Markdown-Export im Gerätebetrieb | ja | Chromium |
| Server-Betrieb: Upload aller sieben Formate, Verarbeitung, Wiederaufnahme, Neustart, Anmeldung | ja | pytest (27), Chromium |
| Wiederherstellung nach Neuladen mitten in der Aufnahme, System-Unterbrechung | ja | Chromium |
| **Echte Antworten von OpenRouter** (Whisper und DeepSeek) | **nein** | openrouter.ai ist aus der Entwicklungsumgebung gesperrt. Format und Felder folgen der OpenRouter-Dokumentation zu `/audio/transcriptions` und `/chat/completions`. Ob der Transkriptions-Endpunkt Aufrufe direkt aus dem Browser (CORS) zulässt, ist ungeprüft. |
| **GitHub Pages live** | **nein** | github.io ist aus der Entwicklungsumgebung gesperrt |
| **iPhone (Safari) und Android (Chrome) auf echten Geräten** | **nein** | Besonders zu prüfen: Safari-MP4-Teilstücke, Dekodieren auf dem iPhone, Unterbrechung beim Sperren, Wake Lock |
| **Echte Transkription mit faster-whisper (Server)** | **nein** | huggingface.co gesperrt; Modell nicht ladbar |
| **Docker-Image** | **nein** | kein Docker-Daemon |

**Erster echter Test:** eine kurze Aufnahme (10–20 s) verarbeiten. Klappt es, ist die
Kette Browser → OpenRouter → Ergebnis bestätigt. Erscheint „Netzwerkfehler“ schon bei der
Transkription, blockiert der Browser den Aufruf (CORS). Das bitte melden.

## Weitere Grenzen dieser Fassung

- **Server-Betrieb: ein Benutzer / ein Passwort.** Keine Benutzerkonten. Wer das Passwort kennt, sieht alle Projekte.
- **Eine Verarbeitung zur Zeit** (in beiden Betriebsarten). Weitere Projekte warten in der Schlange. Auf einem kleinen
  VPS ist das Absicht.
- **Keine Sprechertrennung.** Whisper unterscheidet keine Sprecher. Die Zusammenfassung
  nennt Personen nur, wenn sie im Gesagten vorkommen.
- **Transkriptionsdauer auf CPU** hängt stark vom VPS ab und wurde nicht gemessen. Vor dem
  ernsthaften Einsatz eine Stunde Audio messen und `WHISPER_MODEL` danach wählen.
- **iOS kann nicht „Teilen an“ eine PWA.** Dort Dateien über „Audiodatei importieren“ aus
  der Dateien-App wählen.
