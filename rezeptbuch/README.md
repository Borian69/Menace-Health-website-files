# Protein-Rezeptbuch

Ein durchsuchbares Rezeptbuch für Gerichte mit viel Protein, wenig Aufwand und kleinem
Preis. Warm und kalt — kalt heißt: schmeckt auch in der Uni ohne Mikrowelle.

**App:** https://claude.ai/artifact/SZCGx6ejxckomWAXsyhuHC (privat, auf claude.ai)

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

- `rezeptbuch.html` — die App (Moch-Design, eingebettet, weil Artifacts keine Repo-Dateien laden)
- `daten/grundstock.json` — die 35 Startrezepte als Zutatenlisten in Gramm
- `daten/zutaten.json` — Nährwerte je 100 g und Preis je kg
- `daten/regeln.json` — die Prüfregeln
- `tools/pruefen.py` — rechnet nach und prüft: `python3 tools/pruefen.py daten/grundstock.json`
- `SUCHE.md` — Arbeitsanweisung für die wöchentliche Suche im Hintergrund

Die Rezepte selbst liegen in der Datenbank der App, nicht im Repo. Neue Rezepte schreibt die
wöchentliche Routine (sonntags 17:59 Uhr) direkt dorthin.
