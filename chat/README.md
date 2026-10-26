# Chat

Ein Chatbot für **DeepSeek V4.1 Flash** über OpenRouter, im Moch-Design-System v4.0.
Aktiver Chat, gespeicherter Verlauf, Einstellungen für API-Key, Antwortstil und
Hell/Dunkel.

Kein Build, kein Framework, keine Abhängigkeiten — nur statische Dateien.

## Starten

- **Lokal:** `chat/index.html` im Browser öffnen (Doppelklick reicht). Der Ordner
  `design/` muss daneben liegen, wie im Repo.
- **Online:** Das Repo läuft auf jedem Static-Host, z. B. GitHub Pages unter
  `https://<dein-name>.github.io/Menace-Health-website-files/chat/`.

Dann **Key eintragen** (Key auf [openrouter.ai/keys](https://openrouter.ai/keys)
erstellen) → **Einstellungen speichern**.

## Was die App kann

| | |
|---|---|
| **Aktiver Chat** | Antwort erscheint Wort für Wort, formatiert: fett, kursiv, Listen mit Einrückung, Überschriften, Tabellen, Code. Enter sendet, Shift+Enter macht eine neue Zeile. „Stoppen“ bricht ab. |
| **Datenzeile** | Unter jeder Antwort: Modell, Uhrzeit und Kosten in US-Cent — so, wie OpenRouter sie meldet. Links im Verlauf die Summe aller Chats. |
| **Verlauf** | Jeder Chat wird gespeichert, gruppiert nach Heute, Gestern, Letzte 7 Tage und Monaten. Antippen öffnet ihn, ✕ löscht ihn. Auf dem Handy über ☰. |
| **Einstellungen** | API-Key (mit Formatprüfung), Modell, wie viel das Modell vor der Antwort nachdenkt, Antwortstil, Darstellung (System / Hell / Dunkel). |

Das Modell ist auf `deepseek/deepseek-v4.1-flash` vorbelegt und lässt sich in
den Einstellungen gegen jede andere OpenRouter-Modell-ID tauschen.

**Wie das Modell antwortet:** Eine Systemanweisung geht mit jeder Nachricht mit:
lockerer Ton bei lockeren Fragen, ehrlich und direkt, so lang wie die Frage es
verlangt, ausführlich nur auf Nachfrage. Sie steht in den Einstellungen unter
„Antwortstil“; „Standard wiederherstellen“ holt die Vorgabe zurück. Modellname und
Datum setzt die App selbst davor, damit das Modell weiß, wer es ist.

**Nachdenken:** DeepSeek V4.1 Flash denkt standardmäßig gründlich nach, bevor es
antwortet. Für schnelle Antworten in den Einstellungen auf „Aus“ stellen.

## Wo die Daten liegen

Alles bleibt im Browser (`localStorage`): Chats unter `chat.chats`, Einstellungen
samt Key unter `chat.settings`. Die Anfragen gehen direkt vom Browser an OpenRouter,
ohne Server dazwischen. Ein anderer Browser oder ein anderes Gerät hat einen eigenen,
leeren Verlauf.

Fehlschläge (falscher Key, kein Guthaben, keine Verbindung) erscheinen als Meldung
mit dem Wort „Fehler.“; die Frage landet wieder im Eingabefeld und lässt sich erneut
senden.

## Formatierung

Antworten des Modells kommen als Markdown und werden von `markdown.js` umgesetzt —
eigener kleiner Renderer, keine Bibliothek. Jeder Text wird vor dem Umsetzen maskiert,
Links gehen nur auf http(s); eine Antwort kann also kein eigenes HTML in die Seite
bringen. Eigene Nachrichten bleiben wörtlich.

## Design

Moch v4.0 (Stand 18.10.2026), Fassung **Walnuss** — dieselbe Hauptfarbe wie das
Bordbuch, denn ein Projekt hat genau eine (Regel 3). Gold entfällt bei Walnuss;
Linien (`--brass`) sind dort neutral, die Hauptfarbe trägt Fläche, Schrift und die
Fokuslinie der Felder. Kennzahlen stehen in Archivo 600, Literata ist entfallen.

`design/4.0/moch.css` und `design/4.0/moch-motion.js` sind unveränderte Kopien aus dem
Skill `moch-design` v4.0. Sie werden dort erzeugt und hier nie von Hand geändert. Nach jedem Austausch
`?v=` in `chat/index.html` hochzählen. Das
Bordbuch läuft weiter auf `design/moch.css` (v3.2) und ist von diesem Umbau nicht
berührt.

Die Signatur, wie sie hier umgesetzt ist:

- **Der Chat ist das Objekt und damit der Titel:** h1 in Instrument Serif, Kennung in
  Mono darunter (Datum · Fragen · Kosten). Beim Scrollen wandert er in die Glasleiste.
- **Der Bruch:** Deine Frage steht in Instrument Serif, die Antwort still in Archivo.
  Keine Sprechblasen — gegliedert wird über Linie und Abstand.
- **Datenzeile** unter jeder Antwort; ihre Linie zieht auf, sobald die Antwort steht.
- **Zahlen zählen:** die Summen im Verlauf zählen zum neuen Wert.
- **Eingaben sind Linien;** im Fokus zieht die Linie in `--accent-ink` auf.
- **Senden erscheint erst, wenn es etwas zu senden gibt** (bedingte Hauptaktion).
- Warten zeigt Label und Platzhalterzeilen, nie einen Spinner.

### Abweichungen, begründet

| Regel | Hier | Warum |
|---|---|---|
| Standardfarbe Amber | Walnuss | Eine Hauptfarbe je Projekt; das Bordbuch steht auf Walnuss. |
| Leiste mit einem Icon-Ziel rechts | drei Ziele: Verlauf links, Neu und Einstellungen rechts | Der Chat braucht alle drei ohne Umweg. |
| h1/h2 in Instrument Serif | Markdown-Überschriften in Antworten werden h3 (Archivo 600) bzw. h4 (Mono-Versalien) | h2 mit 36–52 px wäre innerhalb einer Antwort lauter als die Frage darüber. |
| Display in Instrument Serif ab 24 px | Fragen in Instrument Serif 26 px, lange Fragen (über 200 Zeichen oder vier Zeilen) in Archivo | Eine eingefügte Seite Text als Serifen-Überschrift erschlägt die Antwort. |
| Schriften selbst gehostet für ausgelieferte Produkte | Google Fonts über `moch.css` | Das Repo hat noch kein Schrift-Bundle; nachziehen, wenn es eins gibt. |
