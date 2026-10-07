# Suche im Hintergrund — Arbeitsanweisung

Diese Datei steuert die wöchentliche Routine, die neue Rezepte für das Protein-Rezeptbuch
sucht, prüft und einträgt. Sie wird bei jedem Lauf von einer frischen Claude-Sitzung gelesen.

**Rezeptbuch:** https://claude.ai/artifact/SZCGx6ejxckomWAXsyhuHC
**Ziel:** neue Rezepte, die *gut* sind. Die Menge ist zweitrangig. Null neue Rezepte ist ein
gültiges Ergebnis; höchstens 10 pro Lauf.

## 1 · Stand lesen

Mit dem Werkzeug `ArtifactData` (bei Bedarf per ToolSearch laden), `url` wie oben:

- `list` auf `rezepte` (limit 1000) — was schon drin ist. Keine Dubletten: gleiches Gericht
  mit gleicher Hauptzutat gilt als Dublette, auch unter anderem Namen.
- `list` auf `bewertungen` — Urteile des Nutzers. `gern` = mehr in diese Richtung,
  `nein` = Ähnliches meiden.
- `get` auf `system/zutaten_extra` — Zutaten, die frühere Läufe ergänzt haben (kann fehlen).

## 2 · Kandidaten finden

Mit `WebSearch`, deutsch und englisch, abwechselnde Suchbegriffe, z. B.
„eiweißreich schnell günstig“, „Meal Prep High Protein kalt“, „high protein cheap easy dinner“,
„high protein lunch eaten cold“. Nur Quellen mit **sichtbarer Nutzerbewertung und Anzahl**
(z. B. Chefkoch, Lecker, Kitchen Stories, BBC Good Food, Allrecipes). Ziel: 15–30 Kandidaten.
Etwa ein Drittel sollte kalt gut schmecken (Uni).

Pro Kandidat mit `WebFetch` die Seite lesen und festhalten: Bewertung, Anzahl Bewertungen,
Zutaten mit Mengen, Zeiten, Portionen.

Sofort aussortieren:
- Bewertung unter 4,5 oder weniger als 50 Bewertungen
- Soße auf Basis von Skyr, Quark, Joghurt oder Proteinpudding (als Dip daneben ist erlaubt)
- teure Zutaten als Hauptsache (Rinderfilet, Ribeye, Lachs frisch, Garnelen, Pinienkerne)
- Gerichte, die nur mit Spezialprodukten funktionieren (Protein-Nudeln, Proteinriegel)

## 3 · Übertragen

- Mengen in Gramm, Portionen wie im Original. Englische Rezepte auf Deutsch, cups → g.
- Jede Zutat auf eine ID aus `daten/zutaten.json` abbilden. Fehlt eine, darf sie in
  `system/zutaten_extra` ergänzt werden — **nur mit belastbaren Nährwerten** (BLS, USDA
  oder Herstellerangabe je 100 g) und einem Preis als Richtwert. Einkaufslogik: Aldi, sonst
  Edeka, sonst Bio-Markt. Fleisch vom Metzger, Geflügel bei Aldi Bio oder Haltungsform 3+.
- Nur kleine Anpassungen: Markenprodukt → Aldi-Entsprechung, Öl auf übliche Menge. Wird das
  Gericht dadurch ein anderes, Kandidat verwerfen.
- **Titel, Kurztext, Schritte und Tipps in eigenen Worten.** Keine Texte kopieren.
- Felder wie in `daten/grundstock.json`: `typ` (warm/kalt), `mahlzeit`, `arbeitszeit`,
  `gesamtzeit`, `geraete`, `sossenbasis`, `tipps.strecken` (günstiger strecken, mit Ersparnis
  in Euro und Proteinänderung), `tipps.fertig` (welches Fertigprodukt spart Zeit oder Geld
  und ist vertretbar: Nutri-Score A–C, ≤ 1,5 g Salz/100 g, kein Zuckerzusatz), `tipps.pulver`
  (nur wo neutrales Proteinpulver passt; nie in kochende Soßen — Whey flockt aus),
  `unterwegs` (Pflicht bei kalt: haltbarkeit_tage, kuehlakku, transport), `tags`, und
  `quelle: {name, url, bewertung, bewertungen}`.
- Ersparnis- und Proteinangaben in den Tipps nachrechnen, nicht schätzen.

## 4 · Prüfen

Repo `Borian69/Menace-Health-website-files`, Ordner `rezeptbuch/` (Branch `main`; solange
der Rezeptbuch-PR offen ist, Branch `ccr-dcbed199-3k5glo`).

```
python3 rezeptbuch/tools/pruefen.py kandidaten.json --aus bestanden.json --extra zutaten_extra.json
```

Nur was das Skript besteht, kommt ins Buch. Regeln nie lockern, um ein Rezept durchzubringen.
Ein Rezept anpassen (z. B. weniger Reis) ist erlaubt, wenn es danach noch dasselbe Gericht ist
und die Quelle das trägt.

## 5 · Eintragen

Ein `ArtifactData`-`batch`:
- je bestandenes Rezept `set` auf `rezepte/<id>` mit allen Feldern aus `bestanden.json`, plus
  `hinzugefuegt` (jetzt, ISO) und `herkunft: "suche"`
- `set` auf `system/suche`: `letzter_lauf`, `geprueft` (Kandidaten mit gelesener Seite),
  `aufgenommen`, `naechster_lauf` (nächster Sonntag 17:59 Europe/Berlin, als ISO in UTC)
- `set` auf `laeufe/<YYYY-MM-DD>`: `kandidaten` als Liste `{titel, url, ergebnis, grund}`
- ggf. `system/zutaten_extra` aktualisieren

Dokumente, die schon existieren, brauchen `if_version` aus dem vorherigen Lesen.

## 6 · Abschluss

Kurze Zusammenfassung: wie viele geprüft, wie viele aufgenommen, die häufigsten
Ablehnungsgründe. Keine weiteren Aktionen (keine Pushes, keine PRs).
