# Suche im Hintergrund — Arbeitsanweisung

Diese Datei steuert die wöchentliche Routine, die neue Rezepte für das Protein-Rezeptbuch
sucht, prüft und einträgt. Sie wird bei jedem Lauf von einer frischen Claude-Sitzung gelesen.

**Rezeptbuch:** https://claude.ai/artifact/SZCGx6ejxckomWAXsyhuHC
**Ziel:** neue Rezepte, die *gut* sind, Rezepte nach dem Feedback des Nutzers verbessern und
Vorschläge für die kommende Woche machen. Die Menge ist zweitrangig. Null neue Rezepte ist ein
gültiges Ergebnis; höchstens 10 pro Lauf.

## 1 · Stand lesen

Mit dem Werkzeug `ArtifactData` (bei Bedarf per ToolSearch laden), `url` wie oben:

- `list` auf `rezepte` (limit 1000) — was schon drin ist. Keine Dubletten: gleiches Gericht
  mit gleicher Hauptzutat gilt als Dublette, auch unter anderem Namen.
- `list` auf `bewertungen` — Urteile und Feedback des Nutzers. Felder: `urteil` (`gern`, `ok`,
  `nein`), `notiz` (neuestes Feedback), `verlauf` (alle Einträge mit Datum), `status`
  (`offen` = Feedback noch nicht verarbeitet). `gern` = mehr in diese Richtung, `nein` =
  Ähnliches meiden. Die Texte sagen oft mehr als das Urteil („zu scharf“, „Koriander mag ich
  nicht“) — lies sie alle und leite daraus Vorlieben und Abneigungen ab.
- `list` auf `favoriten` — Rezepte, die der Nutzer als Favorit markiert hat. Stärkstes Signal.
- `get` auf `system/zutaten_extra` — Zutaten, die frühere Läufe ergänzt haben (kann fehlen).

## 2 · Feedback verarbeiten

Für jede Bewertung mit `status: "offen"` und Text in `notiz`:

- Nur Lob oder kein konkreter Änderungswunsch → Rezept bleibt. Bewertung auf
  `status: "erledigt"` und `antwort` (1–2 Sätze, Du-Form) setzen.
- Konkreter Wunsch („Zutat X schmeckte komisch“, „zu trocken“, „zu viel Kreuzkümmel“) →
  **Rezept anpassen, nicht streichen.** Zutat ersetzen oder reduzieren, Würzung oder Garzeit
  ändern. Es bleibt dasselbe Gericht. Das geänderte Rezept mit `tools/pruefen.py` prüfen —
  besteht es nicht, eine andere Änderung versuchen oder es lassen und in `antwort` erklären.
- Beim Schreiben: `original` = das Rezept vor der ersten Anpassung (nur setzen, wenn noch
  keins existiert), `anpassungen` um `{datum, feedback, aenderung}` ergänzen. Dieselbe Form
  nutzt die App, wenn der Nutzer selbst „Nach meinem Feedback anpassen“ tippt.
- Danach Bewertung auf `status: "angepasst"` mit `antwort` (was geändert wurde und warum).
- Feedback, das ein Muster zeigt (z. B. zweimal „zu scharf“), auch bei der Suche beachten.

## 3 · Kandidaten finden

**Mischung:** etwa zwei Drittel der Kandidaten passen zu dem, was der Nutzer mag (Favoriten,
`gern`, positive Texte: ähnliche Zutaten, Küchen, Zubereitungen). Etwa ein Drittel ist
bewusst **neu** — Zutaten, Küchen oder Zubereitungen, die im Buch noch fehlen oder selten sind
(z. B. Gerichte aus einer anderen Länderküche, eine Proteinquelle, die noch nicht vorkommt).
So wird es nicht immer dasselbe. Abneigungen aus dem Feedback gelten für beide Gruppen.


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

## 4 · Übertragen

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

## 5 · Prüfen

Repo `Borian69/Menace-Health-website-files`, Ordner `rezeptbuch/` (Branch `main`; solange
der Rezeptbuch-PR offen ist, Branch `ccr-dcbed199-3k5glo`).

```
python3 rezeptbuch/tools/pruefen.py kandidaten.json --aus bestanden.json --extra zutaten_extra.json
```

Nur was das Skript besteht, kommt ins Buch. Regeln nie lockern, um ein Rezept durchzubringen.
Ein Rezept anpassen (z. B. weniger Reis) ist erlaubt, wenn es danach noch dasselbe Gericht ist
und die Quelle das trägt.

## 6 · Eintragen

Ein `ArtifactData`-`batch`:
- je bestandenes Rezept `set` auf `rezepte/<id>` mit allen Feldern aus `bestanden.json`, plus
  `hinzugefuegt` (jetzt, ISO) und `herkunft: "suche"`
- angepasste Rezepte und bearbeitete Bewertungen aus Schritt 2
- `set` auf `system/suche`: `letzter_lauf`, `geprueft` (Kandidaten mit gelesener Seite),
  `aufgenommen`, `angepasst` (Rezepte nach Feedback geändert), `naechster_lauf` (nächster
  Sonntag 17:59 Europe/Berlin, als ISO in UTC)
- `set` auf `system/empfehlung`: Vorschläge für die kommende Woche aus dem *ganzen* Buch,
  `{datum, passend: [{id, grund}], neu: [{id, grund}]}` — 2–3 passende (zu Favoriten und
  positivem Feedback) und 1–2 neue (noch nicht bewertet, anders als das Übliche). `grund` ist
  ein Satz in Du-Form, z. B. „Wie die Bolognese, die dir geschmeckt hat – diesmal mit Pute.“
  Nichts vorschlagen, was in den letzten 10 Tagen bewertet wurde oder `nein` hat.
- `set` auf `laeufe/<YYYY-MM-DD>`: `kandidaten` als Liste `{titel, url, ergebnis, grund}`
- ggf. `system/zutaten_extra` aktualisieren

Dokumente, die schon existieren, brauchen `if_version` aus dem vorherigen Lesen.

## 7 · Abschluss

Kurze Zusammenfassung: wie viele geprüft, wie viele aufgenommen, welche Rezepte nach
Feedback angepasst wurden, die häufigsten Ablehnungsgründe. Keine weiteren Aktionen (keine
Pushes, keine PRs).

Die Offline-App auf dem Handy bekommt diese Änderungen erst mit dem nächsten Bau
(`python3 rezeptbuch/tools/bauen.py --rezepte <export>`) und Merge — das macht dieser Lauf nicht.
