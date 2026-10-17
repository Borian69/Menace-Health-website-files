# Chat

Ein schlichter Chatbot für **DeepSeek V4.1 Flash** über OpenRouter. Aktiver Chat,
gespeicherter Verlauf, Einstellungen für API-Key und Hell/Dunkel.

Kein Build, kein Framework, keine Abhängigkeiten — nur statische Dateien.

## Starten

- **Lokal:** `chat/index.html` im Browser öffnen (Doppelklick reicht).
- **Online:** Der Ordner läuft auf jedem Static-Host, z. B. GitHub Pages unter
  `https://<dein-name>.github.io/Menace-Health-website-files/chat/`.

Dann **Einstellungen → OpenRouter API-Key** eintragen (Key auf
[openrouter.ai/keys](https://openrouter.ai/keys) erstellen) → Speichern.

## Was die App kann

| | |
|---|---|
| **Aktiver Chat** | Antwort erscheint Wort für Wort, formatiert: fett, kursiv, Listen mit Einrückung, Überschriften, Tabellen, Code. Enter sendet, Shift+Enter macht eine neue Zeile. „Stopp“ bricht ab. |
| **Verlauf** | Jeder Chat wird gespeichert und steht links. Antippen öffnet ihn, ✕ löscht ihn. Auf dem Handy über ☰. |
| **Einstellungen** | API-Key, Modell, wie viel das Modell vor der Antwort nachdenkt, wie das Modell antworten soll, Darstellung (System / Hell / Dunkel). |

Das Modell ist auf `deepseek/deepseek-v4.1-flash` vorbelegt und lässt sich in
den Einstellungen gegen jede andere OpenRouter-Modell-ID tauschen.

**Wie das Modell antwortet:** Eine Systemanweisung geht mit jeder Nachricht mit:
lockerer Ton bei lockeren Fragen, ehrlich und direkt, so lang wie die Frage es
verlangt, ausführlich nur auf Nachfrage. Sie steht in den Einstellungen und lässt
sich dort umschreiben; „Standard wiederherstellen“ holt die Vorgabe zurück.
Modellname und Datum setzt die App selbst davor, damit das Modell weiß, wer es ist.

**Nachdenken:** DeepSeek V4.1 Flash denkt standardmäßig gründlich nach, bevor es
antwortet. Für schnelle Antworten in den Einstellungen auf „Aus“ stellen.

## Wo die Daten liegen

Alles bleibt im Browser (`localStorage`): Chats unter `chat.chats`, Einstellungen
samt Key unter `chat.settings`. Die Anfragen gehen direkt vom Browser an OpenRouter,
ohne Server dazwischen. Ein anderer Browser oder ein anderes Gerät hat einen eigenen,
leeren Verlauf.

Fehlschläge (falscher Key, kein Guthaben, keine Verbindung) erscheinen als rote
Meldung; die Frage landet dann wieder im Eingabefeld und lässt sich erneut senden.

## Formatierung

Antworten des Modells kommen als Markdown und werden von `markdown.js` umgesetzt —
eigener kleiner Renderer, keine Bibliothek. Jeder Text wird vor dem Umsetzen maskiert,
Links gehen nur auf http(s); eine Antwort kann also kein eigenes HTML in die Seite
bringen. Eigene Nachrichten bleiben wörtlich. Die Abstände und Einrückungen in
`app.css` sind vorläufig und werden mit dem Design verfeinert.

## Abweichung vom Moch-Design-System

Diese Fassung nutzt `design/moch.css` **bewusst noch nicht**. Auf Wunsch zuerst
nur Funktion; das Design kommt in einem zweiten Schritt. Bis dahin gelten eigene,
schlichte Systemfarben in `app.css` — die Regeln aus `CLAUDE.md` (Farbe, φ-Raum,
Typografie, Eingaben als Linie) sind hier ausdrücklich noch nicht umgesetzt.
