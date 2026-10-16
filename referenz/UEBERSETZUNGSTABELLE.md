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
| **Eigene Layoutklassen**<br>*16.10.2026* | Das Vokabular ist abgeschlossen; jede neue Klasse zersplittert das System. Eine Telefon-App braucht aber Dinge, die es dort nicht gibt: Tabs, ein Monatsgitter, zwei Diagramme, eine Tafel von unten | Systemklassen überall, wo es sie gibt (`.card` `.shirt` `.btn` `.field` `.eyebrow` `.n` `.klein` `.muted`). Alles Weitere ist Möblierung mit Präfix (`kal-` `dg-` `eintrag-` `beleg-` `tank-`) und **ohne einen einzigen eigenen Farb-, Abstands- oder Radiuswert** — `bordbuch/assets/app.css` kennt nur Tokens |
| **`section` ohne das 110-px-Polster**<br>*16.10.2026* | Das System polstert jedes `section` mit `--f7`. Die Flächen der App sind ebenfalls `<section>`; auf 390 px Breite stünde ein leeres Drittel über dem Inhalt | `padding: 0` auf `.pane`, `.voll` und `.abschnitt`. Der Abstand kommt stattdessen aus der Nähe-Regel: `--f4` in der Scrollfläche, `--f6` zwischen Abschnitten |
| **Hemd-Block mit einer Stufe weniger Polster**<br>*16.10.2026* | Das System setzt `--f6 --f5` (68/42 px). Auf einem Telefon bliebe für die wichtigste Zahl der Ansicht zu wenig Breite | `--f5 --f4`. Eine Stufe der φ-Skala, kein freier Wert. Die Zahl steht **im** Block, nicht daneben — damit bleibt es ein Fokuspunkt (Regel 7) |
| **Kennzahlen zweispaltig statt `.drei`**<br>*16.10.2026* | `.drei` ist dreispaltig mit `--f5`-Polster und klappt unter 860 px auf eine Spalte. Sechs Kennzahlen untereinander ergäben eine Kolonne von anderthalb Bildschirmen | Eigenes Raster aus zwei Spalten mit `--f2`-Abstand, Felder als `.card`. Werte in `.n`, Label wie im Feld des Systems |
| **Label in Kennzahlen nicht in Gold**<br>*16.10.2026* | `.eyebrow` ist im dunklen Schema Gold und mit 11 : 1 als Text freigegeben. Auf jeder einzelnen Kennzahl wird daraus trotzdem eine goldene Wand — gegen „max. 2 % Gold" und gegen „ruhig statt laut" | `.eyebrow` bleibt den Überschriften vorbehalten (Diagramm-Titel, Abschnitte). In Kennzahl und Hemd-Block läuft dasselbe Label über `--muted`, wie `label` im Feld des Systems |
| **Datenkurven in der Hauptfarbe, nicht in Gold**<br>*16.10.2026* | Eine Kurve ist formal eine Linie, Gold wäre also erlaubt. Zwei volle Kurven über die Bildbreite sind aber mehr Gold, als 2 % Flächenanteil hergeben | Regel 3 sagt: Die eine Hauptfarbe trägt Fläche, Linie, Rahmen und Schrift. Balken in `--accent`, Kurven und Punkte in `--accent-ink`. Gold bleibt der Struktur: Trennlinien, Tabellenkopf, aktiver Bereich, Fokus |
| **Drei Statustöne**<br>*16.10.2026* | Das System nennt keine Statusfarben. Eine Fehlermeldung in der Hauptfarbe wäre nicht als Fehler lesbar, und Rot neben Walnuss sähe aus wie eine zweite Markenfarbe | Drei bewusst stumpfe Töne in `bordbuch/assets/app.css` (`--warnung` `--fehler` `--gut`), weit genug von Walnuss entfernt. **Nie allein durch Farbe**: Die Fehlerzeile trägt ein Dreieck, die ausgelassene Messung ein Sternchen, jede Warnung einen Satz |
| **PDF in Helvetica**<br>*16.10.2026* | Literata und Archivo lassen sich nur als eingebettete Schriftdateien ins PDF schreiben — die wiegen mehr als die ganze App, und ein Fallback auf Times wäre eine vierte Familie | Helvetica für alles. Ihre Ziffern sind alle gleich breit, Zahlenspalten stehen also von selbst tabellarisch. Die Versal-Labels werden gesperrt gesetzt und übernehmen die Rolle der Mono-Beschriftung. Der Gattungsbruch entfällt im PDF — das ist der Preis, und er ist kleiner als eine eingebettete Didone |
| **Belegfotos im Gerät**<br>*04.09.2026* | Fotos gehören nicht in den Textspeicher: Ein Bild müsste nach Base64 umkodiert werden, wächst dabei um ein Drittel, und beim Überlaufen verliert man nicht das Bild, sondern den ganzen Speicher | Belege liegen in IndexedDB als Blob, verkleinert auf 1.600 px und als JPEG. Durchsichtige Stellen bekommen `--shirt` als Grund, nicht Reinweiß — Regel 5 gilt auch dort, wo niemand ein Stylesheet vermutet |
| **Vier Stellen führen Farbwerte als Zahl**<br>*16.10.2026* | „Nur Tokens, nie Hex" lässt sich dort nicht einhalten, wo kein Stylesheet gilt: im PNG-Generator der Icons, im selbst geschriebenen PDF, auf dem Canvas der Belegablage und in der Data-URI des Auswahlpfeils | Die Werte stehen an genau diesen vier Stellen, jeweils mit Tokennamen im Kommentar daneben und dem Hinweis, bei einer Token-Änderung nachzuziehen. Nirgends sonst steht ein Hexwert — Ausnahme sind die drei Statustöne, die eine Zeile höher begründet sind |
| **Eingabefelder über volle Breite**<br>*16.10.2026* | Die Felder des Systems sind für Formulare in Dokumenten gesetzt | Breite auf 100 %. Schriftgröße bleibt bei `--t0` (16 px) — genau die Grenze, unter der iOS beim Antippen ins Feld zoomt und die Ansicht wegspringt |

## Was im System selbst nicht zusammenpasst

| Beobachtung | Risiko | Umsetzung |
|---|---|---|
| **Die Kurzfassung nennt vier Tokens anders als `moch.css`**<br>*16.10.2026* | `SKILL.md` führt `--text` als Textfarbe, `--surface-2`, `--label`, `--radius` und `--radius-interactive`. In der CSS heißen sie `--ink`, `--sunken`, `--brass-text`, `--r-chip`, `--r-ctrl` — und `--text` ist dort **die Schriftfamilie**. Wer nach der Tabelle baut, schreibt Regeln, die ins Leere greifen | `CLAUDE.md` in diesem Repo führt die Namen, die wirklich in `design/moch.css` stehen, mit einem Hinweis auf die Abweichung. Die CSS ist maßgeblich, nicht die Kurzfassung |

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
