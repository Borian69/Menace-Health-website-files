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

## Was geprüft wurde – und wo

| Bereich | Geprüft | Wie |
|---|---|---|
| Upload aller sieben Formate, Dauer, Größe, Abspielen mit Range | ja | pytest, echtes FFmpeg |
| Mehrere Aufnahmen pro Projekt, Umsortieren, Entfernen, Umbenennen | ja | pytest, Browser |
| Aufnahme, Pause, Fortsetzen, Beenden, Speichern | ja | Chromium mit künstlichem Mikrofon (Telefonansicht) |
| Wiederherstellung nach Neuladen mitten in der Aufnahme | ja | Chromium |
| Unterbrechung durch das System + „Weiter aufnehmen“ + Zusammensetzen | ja | Chromium (simuliertes `ended`), pytest |
| Verarbeitung, Wiederaufnahme nach Fehler, Neustart des Servers | ja | pytest, Browser |
| OpenRouter: Wiederholung bei 429/5xx, Abbruch bei 401/402, abgeschnittene Antworten | ja | pytest mit nachgebildeten HTTP-Antworten |
| **Echte Transkription mit faster-whisper** | **nein** | Die Entwicklungsumgebung hatte keinen Zugriff auf huggingface.co; das Modell ließ sich nicht laden. Code, Abschnitte und Fehlerweg sind getestet, die Erkennungsqualität nicht. |
| **Echter Aufruf von DeepSeek über OpenRouter** | **nein** | openrouter.ai war aus der Entwicklungsumgebung gesperrt. Anfrageformat und Fehlerbehandlung sind gegen nachgebildete Antworten getestet. |
| **iPhone (Safari) und Android (Chrome) auf echten Geräten** | **nein** | Keine Geräte verfügbar. Besonders zu prüfen: Safari-MP4-Blöcke, Unterbrechung beim Sperren, Wake Lock, Teilen unter Android. |
| **Docker-Image** | **nein** | Kein Docker-Daemon in der Entwicklungsumgebung. Dockerfile folgt dem lokal getesteten Ablauf. |

**Erster Test auf dem Server:** eine kurze echte Aufnahme verarbeiten. Dabei zeigt sich, ob
das Whisper-Modell lädt (Log: „Lade Whisper-Modell …“) und ob OpenRouter antwortet
(Log: „OpenRouter final: … Token“).

## Weitere Grenzen dieser Fassung

- **Ein Benutzer / ein Passwort.** Keine Benutzerkonten. Wer das Passwort kennt, sieht alle Projekte.
- **Eine Verarbeitung zur Zeit.** Weitere Projekte warten in der Schlange. Auf einem kleinen
  VPS ist das Absicht.
- **Keine Sprechertrennung.** Whisper unterscheidet keine Sprecher. Die Zusammenfassung
  nennt Personen nur, wenn sie im Gesagten vorkommen.
- **Transkriptionsdauer auf CPU** hängt stark vom VPS ab und wurde nicht gemessen. Vor dem
  ernsthaften Einsatz eine Stunde Audio messen und `WHISPER_MODEL` danach wählen.
- **iOS kann nicht „Teilen an“ eine PWA.** Dort Dateien über „Audiodatei importieren“ aus
  der Dateien-App wählen.
