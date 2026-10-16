# Übersetzungstabelle

**Jeder Wunsch wird übersetzt, nicht abgelehnt.** Behalte die Empfindung, verwirf die
wörtliche Form, wenn sie im professionellen Kontext gegen dich arbeitet.

Diese Tabelle ist das Arbeitsdokument der Marke. Sie wächst mit jeder Entscheidung und
begründet jede Abweichung von einem ursprünglichen Wunsch. **Kommt eine dieser Anfragen,
lieferst du Spalte 3, nicht Spalte 1.**

## Grundsätzliches

| Wunsch | Warum das schadet | Stattdessen im System |
|---|---|---|
| Holztextur als Hintergrund | Fotorealistische Materialtexturen lesen sich als Hobby-Projekt, kosten Lesbarkeit, skalieren nicht klein, drucken nicht sauber | Die Farbe von dunklem Walnussholz wird zur Hauptfarbe. Die Wärme bleibt vollständig erhalten, die Seriosität auch. Holz erscheint als **Ton**, nicht als Bild |
| Gold | Gold als Fläche oder Metallverlauf kippt ins Billige und funktioniert im Einfarbdruck nicht. Auf hellem Grund trägt es nur 1,4 : 1 | Flaches Gold `#FCBE11`, nur für Haarlinien, Trennstriche, Labels und Fokus-Ringe. Auf hellem Grund läuft Label-Text über `--brass-text`. Genau diese Sparsamkeit erzeugt den Premium-Eindruck |
| Dunkelrot als zweite Leitfarbe | In jeder Software-Oberfläche bedeutet Rot „Fehler". Eine rote Markenfarbe neben roten Fehlermeldungen macht beide unlesbar | Oxblood ist eine der sechs Hauptfarben — aber je Projekt gilt genau eine (Regel 3). Status ist davon getrennt |
| Mehr Kontrast durch mehr Farbe | Sättigung hochzudrehen macht ein System lauter, nicht kontrastreicher — und zerstört die Zurückhaltung, die Premium trägt | Kontrast über die **Fläche**: dunklerer Grund, hellere Karten, sichtbarere Linien — und ein heller Hemd-Block als härtester Wechsel |
| Dark Theme als Standard | Angebote, Rechnungen und Verträge werden gedruckt. Ein dunkles PDF ist unbrauchbar | Zwei Schemata. `dunkel` ist die Bühne, `hell` das Dokument. Beide teilen Farbkern und Raumskala, deshalb bleibt die Marke erkennbar |

## Bordbuch — die App unter `bordbuch/`

Fassung 3.2 des Systems, Schema `dunkel`, Hauptfarbe `walnuss`.

| Abweichung | Risiko | Umsetzung |
|---|---|---|
| **Von 2.0 auf 3.2 umgebaut**<br>*16.10.2026* | Ein Wechsel mitten im Betrieb bricht gewachsene Gewohnheiten: andere Schrift, andere Abstände, andere Tokennamen. Wer die App auf dem Telefon hat, findet sie am nächsten Morgen anders vor | Vollständiger Umbau statt halber Angleichung: `design/moch.css` ersetzt die fünf Dateien der 2.0, die App läuft auf φ-Raum, Literata und den neuen Tokens. **Walnuss bleibt die Hauptfarbe** — die App ist auf einen Blick dieselbe. Fassung auf `v3` gezählt, damit installierte Telefone neu laden |
| **Auf die zweite Fassung der 3.2 nachgezogen**<br>*16.10.2026* | Drei Dinge, die hier als Abweichung standen, löst das System inzwischen selbst — wer sie trotzdem von Hand nachbaut, hält eine Lösung am Leben, die niemand mehr pflegt | Die drei Zeilen sind gestrichen: `--label` ist jetzt eine eigene, neutrale Textrolle statt Gold, Status hat vier Tokens je Schema, und das 110-px-Polster hängt an `.abschnitt` statt am `section`-Element. Dazu umbenannte Tokens (`--ink`→`--text`, `--sunken`→`--surface-2`, `--brass-text`→`--label`, `--r-chip`/`--r-ctrl`→`--radius`/`--radius-interactive`) und die Schriftfamilien als `--font-*`. `assets/app.css` enthält jetzt **keinen Hexwert mehr** |
| **`.abschnitt` heißt im Projekt anders**<br>*16.10.2026* | `.abschnitt` ist seit der neuen Fassung eine Systemklasse mit 110 px Polster. Dieselbe Klasse trug in der App bis eben die Gruppen in den Einstellungen — die hätten damit ein Drittel Bildschirm Polster bekommen | Die Gruppen holen ihren Abstand jetzt aus der Nähe-Regel: Die Scrollfläche der Einstellungen ist ein `.stapel-weit`, die Gruppen selbst sind schlichte `<div>`. Der eine Sonderfall in der Eintragen-Ansicht hängt an seiner Kennung, nicht an einer neuen Klasse |
| **Eigene Layoutklassen**<br>*16.10.2026* | Das Vokabular ist abgeschlossen; jede neue Klasse zersplittert das System. Eine Telefon-App braucht aber Dinge, die es dort nicht gibt: Tabs, ein Monatsgitter, zwei Diagramme, eine Tafel von unten | Systemklassen überall, wo es sie gibt (`.card` `.shirt` `.btn` `.field` `.eyebrow` `.n` `.klein` `.muted`). Alles Weitere ist Möblierung mit Präfix (`kal-` `dg-` `eintrag-` `beleg-` `tank-`) und **ohne einen einzigen eigenen Farb-, Abstands- oder Radiuswert** — `bordbuch/assets/app.css` kennt nur Tokens |
| **Hemd-Block mit einer Stufe weniger Polster**<br>*16.10.2026* | Das System setzt `--f6 --f5` (68/42 px). Auf einem Telefon bliebe für die wichtigste Zahl der Ansicht zu wenig Breite | `--f5 --f4`. Eine Stufe der φ-Skala, kein freier Wert. Die Zahl steht **im** Block, nicht daneben — damit bleibt es ein Fokuspunkt (Regel 7) |
| **Kennzahlen zweispaltig statt `.drei`**<br>*16.10.2026* | `.drei` ist dreispaltig mit `--f5`-Polster und klappt unter 860 px auf eine Spalte. Sechs Kennzahlen untereinander ergäben eine Kolonne von anderthalb Bildschirmen | Eigenes Raster aus zwei Spalten mit `--f2`-Abstand, Felder als `.card`. Werte in `.n`, Label wie im Feld des Systems |
| **Datenkurven in der Hauptfarbe, nicht in Gold**<br>*16.10.2026* | Eine Kurve ist formal eine Linie, Gold wäre also erlaubt. Zwei volle Kurven über die Bildbreite sind aber mehr Gold, als 2 % Flächenanteil hergeben | Regel 3 sagt: Die eine Hauptfarbe trägt Fläche, Linie, Rahmen und Schrift. Balken in `--accent`, Kurven und Punkte in `--accent-ink`. Gold bleibt der Struktur: Trennlinien, Tabellenkopf, aktiver Bereich, Fokus |
| **PDF in Helvetica**<br>*16.10.2026* | Literata und Archivo lassen sich nur als eingebettete Schriftdateien ins PDF schreiben — die wiegen mehr als die ganze App, und ein Fallback auf Times wäre eine vierte Familie | Helvetica für alles. Ihre Ziffern sind alle gleich breit, Zahlenspalten stehen also von selbst tabellarisch. Die Versal-Labels werden gesperrt gesetzt und übernehmen die Rolle der Mono-Beschriftung. Der Gattungsbruch entfällt im PDF — das ist der Preis, und er ist kleiner als eine eingebettete Didone |
| **Belegfotos im Gerät**<br>*04.09.2026* | Fotos gehören nicht in den Textspeicher: Ein Bild müsste nach Base64 umkodiert werden, wächst dabei um ein Drittel, und beim Überlaufen verliert man nicht das Bild, sondern den ganzen Speicher | Belege liegen in IndexedDB als Blob, verkleinert auf 1.600 px und als JPEG. Durchsichtige Stellen bekommen `--shirt` als Grund, nicht Reinweiß — Regel 5 gilt auch dort, wo niemand ein Stylesheet vermutet |
| **Vier Stellen führen Farbwerte als Zahl**<br>*16.10.2026* | „Nur Tokens, nie Hex" lässt sich dort nicht einhalten, wo kein Stylesheet gilt: im PNG-Generator der Icons, im selbst geschriebenen PDF, auf dem Canvas der Belegablage und in der Data-URI des Auswahlpfeils | Die Werte stehen an genau diesen vier Stellen, jeweils mit Tokennamen im Kommentar daneben und dem Hinweis, bei einer Token-Änderung nachzuziehen. Nirgends sonst steht ein Hexwert — Ausnahme sind die drei Statustöne, die eine Zeile höher begründet sind |
| **Eingabefelder über volle Breite**<br>*16.10.2026* | Die Felder des Systems sind für Formulare in Dokumenten gesetzt | Breite auf 100 %. Schriftgröße bleibt bei `--t0` (16 px) — genau die Grenze, unter der iOS beim Antippen ins Feld zoomt und die Ansicht wegspringt |

## So erweiterst du die Tabelle

1. **Wunsch** — wörtlich notieren, ohne ihn schon zu bewerten.
2. **Risiko** — konkret benennen, was im professionellen Einsatz dagegen spricht.
   „Gefällt mir nicht" ist kein Eintrag.
3. **Umsetzung** — die Empfindung retten, die Form ersetzen.
   **Bleibt diese Spalte leer, gehört die Idee nicht ins System.**

Datiere neue Zeilen. Eine Abweichung, die nur im Code-Kommentar begründet ist, gilt als
nicht begründet.

## Was nicht verhandelbar ist

Die sieben Regeln aus `CLAUDE.md`. Alles andere ist Hygiene und darf mit Eintrag hier
abweichen.
