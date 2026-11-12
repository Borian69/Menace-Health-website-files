# storage/

Hier legt der Server alles ab, was nicht Code ist. Nichts davon gehört ins Repository
(siehe `.gitignore`).

| Pfad | Inhalt |
|---|---|
| `mitschrift.db` | SQLite: Projekte, Aufnahmen, Transkripte, Zusammenfassungen, KI-Verbrauch |
| `audio/<projekt-id>/` | Originaldateien der Aufnahmen |
| `work/` | Zwischenstände der Transkription (werden nach Erfolg gelöscht) |
| `models/` | Heruntergeladene Whisper-Modelle |
| `.secret` | Schlüssel für Sitzungs-Cookies (wird erzeugt) |

**Sichern** = diesen Ordner kopieren, bei gestopptem Server oder mit
`sqlite3 mitschrift.db ".backup sicherung.db"`.
