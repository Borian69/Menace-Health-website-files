# Übersetzungstabelle

**Jeder Wunsch wird übersetzt, nicht abgelehnt.** Behalte die Empfindung, verwirf die
wörtliche Form, wenn sie im professionellen Kontext gegen dich arbeitet.

Diese Tabelle ist das Arbeitsdokument der Marke. Sie wächst mit jeder Entscheidung und
begründet jede Abweichung von einem ursprünglichen Wunsch. **Kommt eine dieser Anfragen,
lieferst du Spalte 3, nicht Spalte 1.**

| Wunsch | Warum das schadet | Stattdessen im System |
|---|---|---|
| Holztextur als Hintergrund | Fotorealistische Materialtexturen lesen sich als Hobby-Projekt, kosten Lesbarkeit, skalieren nicht klein, drucken nicht sauber | Die Farbe von dunklem Walnussholz wird zur Primärfarbe. Die Wärme bleibt vollständig erhalten, die Seriosität auch. Holz erscheint als **Ton**, nicht als Bild |
| Gold | Gold als Fläche oder Metallverlauf kippt ins Billige und funktioniert im Einfarbdruck nicht. Goldener Text hat auf hellem Grund fast nie genug Kontrast | Flaches Messing, nur für Haarlinien, Trennstriche, Labels, Fokus-Ringe. Max. 2 % der Fläche. Genau diese Sparsamkeit erzeugt den Premium-Eindruck |
| Dunkelrot als zweite Leitfarbe | In jeder Software-Oberfläche bedeutet Rot „Fehler". Eine rote Markenfarbe neben roten Fehlermeldungen macht beide unlesbar | Oxblood bleibt — aber nur als Flächen- und Sektionsfarbe, nie als Status. Statusrot ist ein eigener, hellerer Ton, der nie neben Oxblood steht |
| Mehr Kontrast durch mehr Farbe | Sättigung hochzudrehen macht ein System lauter, nicht kontrastreicher — und zerstört die Zurückhaltung, die Premium trägt | Kontrast über die **Fläche**: dunklerer Grund, hellere Karten, sichtbarere Linien — und ein heller Hemd-Block als härtester Wechsel |
| Sehr dünne Schrift | Thin 100 und ExtraLight 200 brechen unter 24 px optisch weg. Das liest sich als Nachlässigkeit, nicht als Eleganz | Der Charakter kommt nicht aus dem Gewicht, sondern aus dem Gattungswechsel — siehe Display-Schrift unten |
| Naturtöne, auch Oxblood und Mitternachtsblau | Drei dunkle Farbwelten nebeneinander wirken beliebig; Braun als Grund unter braunen Blöcken liefert zu wenig Unterschied | Drei **Fonds** statt drei Farben: Alternativen, nie nebeneinander. Braun wird vom Grund zum Akzent. So bleibt die Marke eine, gewinnt aber drei Stimmungen |
| Dezente Muster wie beim strukturierten Hemd | Ein sichtbares Muster hinter Text kostet Lesbarkeit, erzeugt Moiré, wirkt im Druck schmutzig. Zwei Farben machen es zu Dekor | Vier zugelassene Strukturen, ausschließlich Ton in Ton mit max. 1,20 : 1, nie hinter Fließtext, höchstens eine pro Dokument |
| Dark Theme als Standard | Angebote, Rechnungen und Verträge werden gedruckt. Ein dunkles PDF ist unbrauchbar. Reines Schwarz erzeugt Halo-Effekte bei dünner Schrift | Zwei gleichwertige Themes. Dark ist die Bühne, Elfenbein das Dokument. Beide teilen denselben Farbkern, deshalb bleibt die Marke erkennbar |
| **Ecken als G2-Kurve statt Kreisbogen**<br>*25.08.2026* | Das Regelwerk regelt den Radius, nicht die Kurvenart. Zusätzlich ist `corner-shape` eine junge CSS-Eigenschaft — ältere Engines zeigen weiter den Kreisbogen | `superellipse(1.2)`: krümmungsstetig, aber nur 13 % flacher als der Kreisbogen. **Die Radien bleiben bei 2 und 4 px**, damit das Ergebnis ohne Unterstützung exakt dem Regelwerk entspricht |
| **Display in einer fetten Didone**<br>*25.08.2026* | Das Regelwerk baute den Charakter auf einem Gewichtssprung auf. Eine Plakat-Didone bricht damit: nur ein Schnitt, unter 24 px unruhig, Punzen laufen bei enger Laufweite zu | **Abril Fatface** als Display-Schrift. Der Kontrast verlagert sich vom Gewicht auf die **Gattung**. Bedingungen: erst ab 24 px, Laufweite +1,2 %, nie im Fließtext. Familienzahl bleibt drei |
| **Ziffern auch in der Display-Zeile monospaced**<br>*25.08.2026* | Regel 1 entstand, als Display eine Grotesk war. Neben einer fetten Didone ist eine Mono-Ziffer bei 93 % so viel leichter, dass die Zeile zerreißt | **In Display-Zeilen laufen Ziffern in Abril mit.** Überall sonst gilt `.n` ohne Ausnahme. Die Regel verliert nichts: Der Beweis steht weiter in der Zahl, er wird nur in der leisen Hälfte des Bruchs vorgetragen |
| **Eigene Layoutklassen für die App `bordbuch/`**<br>*04.09.2026* | Das Vokabular ist abgeschlossen, und jede neue Klasse zersplittert das System. Eine Telefon-App braucht aber Dinge, die es im Regelwerk nicht gibt: Tabs, ein Monatsgitter, zwei Diagramme, eine Tafel von unten | Systemklassen überall, wo es sie gibt (`.card` `.shirt` `.btn` `.field` `.n` `.label` `.muted`). Alles Weitere ist reine Möblierung mit Präfix (`kal-` `dg-` `eintrag-` `beleg-` `tank-`) und **ohne einen einzigen eigenen Farb- oder Schriftwert** — `bordbuch/assets/app.css` enthält keinen Hexwert, nur Tokens |
| **Body-Polster 48 px entfällt in der App**<br>*04.09.2026* | Das Polster der Komponentenschicht ist für Dokumente gedacht. Mit fester Kopf- und Fußleiste stünde der Inhalt in einem Kasten im Kasten, und auf 390 px Breite blieben 294 px Text | Polster wandert vom `body` in die Scrollflächen: **24 px Seitenrand**, exakt der Wert, den das Regelwerk für unter 720 px vorschreibt. Die Achterskala bleibt unangetastet |
| **Eingabefelder über volle Breite, Schriftgröße 16 px**<br>*04.09.2026* | `.field` ist auf 340 px begrenzt und setzt 15 px. Auf dem Telefon lässt eine Eingabeschrift unter 16 px iOS beim Antippen in das Feld hineinzoomen — die Ansicht springt und der Nutzer verliert die Stelle | Breite auf 100 %, Schriftgröße auf 16 px. Beides betrifft nur die Bedienelemente der App; Label, Rahmen, Radius und Fokusring bleiben, wie die Vorlage sie setzt |
| **Kilometerstand als Display-Zeile ohne `h1`/`h2`**<br>*04.09.2026* | Die Zahl ist die wichtigste Aussage der Ansicht und gehört in die Display-Schrift. Ein `h1` an dieser Stelle wäre semantisch falsch — es ist keine Überschrift, sondern ein Messwert | Eigene Klasse `.odo` mit denselben Werten, die die Vorlage für Display setzt, **inklusive der `.n`-Ausnahme**: In der Display-Zeile laufen die Ziffern in Abril mit, wie schon für `h1`, `h2` und `.shirt h3` begründet |
| **Balken in Walnuss, Kurve in Messing**<br>*04.09.2026* | Zwei Diagramme untereinander sind viel Farbe. Eine Balkenfläche ist eine gesättigte Akzentfläche und zählt damit als lautes Element; zwei davon plus Hemd-Block plus Primärknopf sprengen die Grenze von zwei | Die Balken tragen Walnuss — die eine Akzentfläche dieser Ansicht. Die Jahreskurve ist eine **Linie** und darf deshalb Messing tragen, ohne die Regel zu brechen; auf eine gefüllte Fläche darunter wird verzichtet. Der Hemd-Block bleibt der Ansicht „Eintragen“ vorbehalten, hier steht eine ruhige `.card` |
| **PDF in Helvetica statt Abril und Archivo**<br>*04.09.2026* | Abril und Archivo lassen sich ohne eingebettete Schriftdateien nicht in ein PDF schreiben. Ein Fallback auf Times wäre laut Regelwerk ausdrücklich verboten | Helvetica für alles — die vom Regelwerk benannte Ersatzschrift. Ihre Ziffern sind alle gleich breit, Zahlenspalten stehen also von selbst tabellarisch. Die Versal-Labels werden gesperrt gesetzt und übernehmen so die Rolle der Mono-Beschriftung. Damit fällt in der Druckfassung die Display-Zeile pro Seite weg: Ohne Didone gibt es keinen Gattungsbruch zu inszenieren |

| **Belegfotos im Gerät**<br>*04.09.2026* | Fotos gehören nicht in den Textspeicher: Ein Bild müsste nach Base64 umkodiert werden, wächst dabei um ein Drittel, und beim Überlaufen verliert man nicht das Bild, sondern den ganzen Speicher | Belege liegen in IndexedDB als Blob, verkleinert auf 1.600 px und als JPEG. Für Vorschauen gibt es ein zweites, kleines Bild. Durchsichtige Stellen bekommen **Hemd-Elfenbein** als Grund, nicht Reinweiß — die Regel gilt auch dort, wo niemand ein Stylesheet vermutet |


## So erweiterst du die Tabelle

1. **Wunsch** — wörtlich notieren, ohne ihn schon zu bewerten.
2. **Risiko** — konkret benennen, was im professionellen Einsatz dagegen spricht.
   „Gefällt mir nicht" ist kein Eintrag.
3. **Umsetzung** — die Empfindung retten, die Form ersetzen.
   **Bleibt diese Spalte leer, gehört die Idee nicht ins System.**

Datiere neue Zeilen. Eine Abweichung, die nur im Code-Kommentar begründet ist, gilt als
nicht begründet.

## Was nicht verhandelbar ist

Die acht Signatur-Regeln aus `CLAUDE.md`. Alles andere ist Hygiene und darf mit Eintrag
hier abweichen.
