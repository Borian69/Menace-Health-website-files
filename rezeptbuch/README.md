# Protein-Rezeptbuch

Ein durchsuchbares Rezeptbuch für Gerichte mit viel Protein, wenig Aufwand und kleinem
Preis. Warm und kalt — kalt heißt: schmeckt auch in der Uni ohne Mikrowelle.

Zwei Fassungen aus einer Quelle:

| | Online-Rezeptbuch | Offline-App |
|---|---|---|
| Wo | https://claude.ai/artifact/SZCGx6ejxckomWAXsyhuHC (privat) | https://borian69.github.io/Menace-Health-website-files/rezeptbuch/ |
| Netz | nötig | nach dem ersten Öffnen nicht mehr |
| Rezepte | live, neue kommen jeden Sonntag dazu | Stand des letzten Baus |
| Favoriten und Bewertungen | in der Artifact-Datenbank | nur auf dem Handy |
| Anpassen nach Feedback | sofort per Knopf oder sonntags automatisch | nach Übertragen ins Online-Rezeptbuch |

## Offline-App aufs Handy

1. Die Adresse oben im Browser öffnen (Safari auf dem iPhone, Chrome auf Android).
2. Teilen → *Zum Home-Bildschirm*. Danach startet die App wie eine normale App und
   funktioniert ohne Netz — auch im Supermarkt-Keller.

Voraussetzung: der Ordner liegt auf `main` (GitHub Pages veröffentlicht von dort, wie beim
Bordbuch). Rezepte, Schriften und Icons stecken in `index.html` bzw. im Offline-Speicher.

## Favoriten, Feedback und Vorschläge

- **Favorit:** im Rezept „Als Favorit merken“. Filter „Favoriten“ oben in der Liste.
- **Bewertung:** „Sehr gut – wieder kochen“, „Okay“ oder „Nicht mein Fall“, dazu ein freier
  Text. „Nicht mein Fall“ blendet das Rezept aus.
- **Anpassen statt streichen:** Steht im Text, was nicht gepasst hat („der Oregano war zu
  viel“), schlägt Claude eine geänderte Fassung vor. Sie wird nachgerechnet und gegen dieselben
  Regeln geprüft; du siehst vorher, was sich ändert. Die Originalfassung bleibt gespeichert und
  lässt sich wiederherstellen.
- **Für dich:** oben in der Liste zwei passende Gerichte und eines, das bewusst anders ist.
  Offline rechnet die App das selbst aus Favoriten und Urteilen; online setzt die Routine am
  Sonntag Vorschläge mit Begründung, die auch dein Feedback lesen.
- **Übertragen:** Unten in der Liste „Bewertungen übertragen und sichern“ → „Bewertungen
  kopieren“ in der einen Fassung, „Einfügen und zusammenführen“ in der anderen. Doppelte
  Einträge werden zusammengeführt, nichts wird überschrieben. Dient auch als Sicherung.

## Was ein Rezept bestehen muss

Steht in `daten/regeln.json` und wird von `tools/pruefen.py` geprüft:

| Regel | Grenze |
|---|---|
| Protein pro Portion | mindestens 30 g |
| Anteil Protein an den Kalorien | mindestens 25 % |
| Arbeitszeit / Gesamtzeit | höchstens 20 / 45 Minuten |
| Zutaten ohne Vorrat | höchstens 10 |
| Töpfe, Pfannen, Bleche | höchstens 2 |
| Preis pro Portion | höchstens 3,50 € |
| Soßenbasis | nicht Skyr, Quark, Joghurt |
| Gefundene Rezepte | Bewertung ab 4,5 bei mindestens 50 Stimmen |
| Kalte Rezepte | Haltbarkeit, Kühlakku und Transport angegeben |

Nährwerte und Preise rechnet das Skript aus den Zutaten in `daten/zutaten.json` selbst nach.
Preise sind Richtwerte (Stand Oktober 2026): Aldi, sonst Edeka, sonst Bio-Markt; Fleisch
vom Metzger, Geflügel bei Aldi Bio oder Haltungsform 3+.

## Dateien

- `quelle/` — die App: `app.css`, `rahmen.html`, `app.js`, `sw.vorlage.js`. **Hier ändern.**
- `tools/bauen.py` — baut daraus `rezeptbuch.html` (online), `index.html`, `sw.js` und
  `manifest.webmanifest` (offline). Neue Rezepte aus der Datenbank übernehmen:
  `python3 rezeptbuch/tools/bauen.py --rezepte <ordner mit einem JSON je Rezept>`
- `daten/rezepte.json` — die Rezepte der Offline-App (Export aus der Datenbank)
- `tools/make-icons.mjs` — erzeugt die App-Icons (`node rezeptbuch/tools/make-icons.mjs`)
- `daten/grundstock.json` — die 35 Startrezepte als Zutatenlisten in Gramm
- `daten/zutaten.json` — Nährwerte je 100 g und Preis je kg
- `daten/regeln.json` — die Prüfregeln
- `tools/pruefen.py` — rechnet nach und prüft: `python3 tools/pruefen.py daten/grundstock.json`
- `SUCHE.md` — Arbeitsanweisung für die wöchentliche Suche im Hintergrund

Die Rezepte selbst liegen in der Datenbank der App, nicht im Repo. Neue Rezepte schreibt die
wöchentliche Routine (sonntags 17:59 Uhr) direkt dorthin.
