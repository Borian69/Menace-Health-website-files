# Bordbuch

Datum, Kilometerstand, Arbeit. Mehr braucht ein Serviceheft nicht — und genau das
fehlt den meisten Autos. Beim Verkauf in vier Jahren ist diese Liste bares Geld.

Eine installierbare Web-App (PWA) für das Telefon. Kein Build, kein Framework,
keine Abhängigkeiten — nur statische Dateien. Alles bleibt auf dem Gerät.

---

## In zwei Schritten startklar

### 1. Veröffentlichen

Der Ordner ist eine fertige statische Seite. Mit GitHub Pages:

*Repository → Settings → Pages → Source: `Deploy from a branch`, Branch: `main`, Ordner `/ (root)`.*

Danach liegt die App unter

```
https://<dein-name>.github.io/Menace-Health-website-files/bordbuch/
```

Wichtig: **Das Verzeichnis `design/` muss mitveröffentlicht werden** — die App lädt
von dort `moch.css`, also Tokens, Raumskala und Schriften.

### 2. Auf den Startbildschirm legen

Im Browser öffnen → Teilen → *Zum Home-Bildschirm*. Danach startet das Bordbuch wie
eine App, ohne Adressleiste, und funktioniert offline.

### 3. Fahrzeug eintragen

Einstellungen → Fahrzeug. Bezeichnung, Kennzeichen und Baujahr stehen im Kopf des
PDF. Ohne sie ist die Liste nur eine Liste; mit ihnen ist sie ein Nachweis.

---

## Die zwei Bereiche

### Eintragen

Eine Ansicht, ein Ziel: in zehn Sekunden fertig sein.

- **Datum** steht auf heute.
- **Kilometerstand** — darunter steht sofort, wie viel seit dem letzten Eintrag
  gefahren wurde. Ein Stand unter dem letzten wird angemeckert, aber nicht verboten:
  Tachos werden getauscht, und die App weiß nicht alles besser.
- **Arbeit** — sichtbar sind die **fünf Arten, die in diesem Auto am häufigsten
  vorkommen**, gezählt aus den eigenen Einträgen. Die übrigen vier liegen hinter
  *Weitere anzeigen*; eine gewählte Art bleibt immer sichtbar. Neun gleich laute
  Schaltflächen wären die Standardlösung jeder App — hier steht der häufige Weg
  zuerst. Ein Tipp füllt die Beschreibung vor.
- **Beim Tanken** erscheinen zwei zusätzliche Felder: getankte Liter und bezahlter
  Betrag, dazu der Schalter *Vollgetankt*. Das Kosten-Feld aus dem Klappbereich
  verschwindet dann — zwei Felder für dieselbe Zahl wären eine Falle.
- **Beleg** — Rechnung oder Quittung direkt fotografieren oder aus der Galerie
  wählen. Das Bild wird auf 1.600 px verkleinert und als JPEG abgelegt; aus vier
  Megabyte Handyfoto werden rund 300 Kilobyte, ohne dass eine Rechnung unlesbar
  wird. Angetippt öffnet es sich groß.
- **Kosten, Werkstatt, Notiz** liegen zugeklappt darunter. Wer sie nicht braucht,
  sieht sie nicht.

Oben steht der aktuelle Kilometerstand als Hemd-Block — die eine laute Aussage dieser
Ansicht. Im Dunkeln ist das **keine Fläche**: Eine Fläche hinter einer großen Zahl
leistet nichts, die Zahl ist schon groß. Die Betonung trägt die Zahl selbst, in
Literata, über einer Linie in der Hauptfarbe.

### Verlauf

Vier Ansichten über denselben Daten:

| Ansicht | Zeigt |
|---|---|
| **Liste** | Alle Einträge, neueste zuerst, nach Jahren getrennt. Mit Suche und einem Filter, der wie das Formular die fünf häufigsten Arten zeigt. Jede Zeile nennt die Strecke seit dem Eintrag davor, bei Tankungen zusätzlich Liter, Spritpreis und den gemessenen Verbrauch. Antippen öffnet die Tafel zum Ändern oder Löschen |
| **Kalender** | Ein Monatsgitter, Wochenstart Montag. Tage mit Einträgen tragen einen Punkt je Eintrag. Ein Tipp zeigt, was an dem Tag war. Öffnet im Monat des jüngsten Eintrags |
| **Kilometer** | Zwei Diagramme je Jahr: Kilometer je Monat als Balken, aufsummiert als Kurve. Dazu Ø je Monat, Ø je Tag, stärkster Monat, Hochrechnung aufs Jahr und — wenn Kosten erfasst sind — Kosten gesamt und je 100 km |
| **Verbrauch** | Was der Wagen wirklich braucht: Ø L/100 km, bester und schlechtester Wert, Ø Preis je Liter, Spritkosten je 100 km. Dazu zwei Kurven über die Zeit — Verbrauch je Tankfüllung und Preis je Liter — und eine Tabelle aller Messungen |

**Wie die Kurve entsteht.** Ein Eintrag misst einen *Stand*, keine Strecke. Gefahren
wurde zwischen zwei Ständen. Liegen vier Monate dazwischen, verteilt die App die
Kilometer gleichmäßig auf diese Tage — die einzige ehrliche Annahme, wenn dazwischen
niemand gezählt hat. Das steht auch unter dem Diagramm. Häufigere Einträge machen die
Kurve genauer. Fällt ein Stand unter den vorherigen, zählt diese Strecke gar nicht mit
und die Liste zeigt eine Warnung.

---

## Wie der Verbrauch gerechnet wird

Nach der Voll-zu-Voll-Methode, der einzigen, die einen echten Wert liefert:

Wer volltankt, weiß danach genau, wie viel im Tank ist — nämlich voll. Tankt er
später wieder voll, füllt er exakt die Menge nach, die er dazwischen verbraucht hat.
Auf die Strecke bezogen ergibt das den tatsächlichen Verbrauch.

Daraus folgt dreierlei, und die App sagt es auch so:

1. **Der erste volle Tank zählt nur als Startpunkt.** Wie viel vor ihm verbraucht
   wurde, weiß niemand.
2. **Teilbetankungen dazwischen gehen mit ein** — sie liegen ja auch im Tank. Nur den
   Abschluss muss eine volle Füllung bilden.
3. **Ohne zwei volle Tankfüllungen gibt es keine Zahl.** Eine Schätzung wäre hier
   schlimmer als gar kein Ergebnis; stattdessen steht dort, was noch fehlt.

Der Schnitt wird über die Summen gebildet, nicht als Mittel der Einzelwerte — sonst
zählte eine kurze Stadtfahrt so viel wie eine lange Reise.

**Vergessene Tankfüllungen** erzeugen Messungen wie 0,4 L/100 km über 12.000 km. Solche
Werte werden in der Tabelle mit einem Sternchen gezeigt, aber nicht mitgemittelt; die
Fußnote sagt, wie viele es sind und woran es liegt. Die Grenzen liegen bei 2 und
30 L/100 km.

## Das PDF

Der Knopf unten in der Verlauf-Ansicht schreibt alle Einträge in eine echte
PDF-Datei — aufsteigend wie ein Scheckheft, mit Kopf, Kennzahlen, Tabelle,
Seitenzahlen und Fußzeile. Erzeugt wird sie im Gerät, ohne Server und ohne
Bibliothek (`assets/js/pdf.js` ist ein kleiner PDF-Schreiber, rund 400 Zeilen).

Zwei Fassungen, wie das Regelwerk es für gedruckte Dokumente verlangt:

- **Versandfassung** — mit Grundfläche, zum Verschicken und Ansehen.
- **Druckfassung** (`…-DRUCK.pdf`, in den Einstellungen) — ohne Hintergrundfläche.
  Weiß ist dort kein Farbauftrag. Inhalt und Seitenzahlen sind identisch.

Tankungen bringen ihre Liter, die Angabe *vollgetankt* und den Spritpreis mit ins
Dokument — sie sind der Beleg für die Verbrauchsrechnung. Steht ein Verbrauch fest,
erscheint er im Kennzahlenblock auf Seite 1.

**Belege werden angehängt**: eine Seite je Foto, mit Datum, Kilometerstand und Arbeit
darüber. Das Bild wandert unverändert als JPEG in die Datei (`/DCTDecode`), wird also
nicht noch einmal umgerechnet. Genau das macht aus der Liste einen Nachweis: Wer den
Wagen kauft, sieht die Rechnung neben dem Eintrag und muss nichts glauben.

In den Einstellungen lässt sich festlegen, ob Kosten, Notizen und Belege mit ins PDF
wandern. Beim Verkauf ist Ersteres oft besser aus, Letzteres besser an.

---

## Diagnose

Alles unter *Einstellungen → Diagnose*. Für jede Funktion, nicht nur für eine.

**Debug-Modus** schaltet das Protokoll ein. Darunter erscheint je ein Schalter für
Daten & Speicher, Einträge, Auswertung, Kalender, Diagramm, PDF und Oberfläche — wer
nur ein Problem sucht, schaltet den Rest ab. Bei eingeschaltetem Diagramm-Bereich
stehen die Rohwerte unter den Balken, bei eingeschaltetem Kalender das Datum in jeder
Zelle.

**Selbsttest** prüft siebzehn Dinge und sagt bei jedem, was herauskam:

| Prüfung | Fängt was ab |
|---|---|
| Speicher beschreibbar | Privatmodus, voller Speicher |
| Einstellungen vollständig | fehlende Felder nach einem Update |
| Zahlen einlesen | „123.456 km“, „1.234,56“ |
| Datum rechnen | Schaltjahr, Sommerzeit, Jahreswechsel |
| Eingaben prüfen | falsches Datum, negativer Stand, unbekannte Art |
| Formular schaltet um | drückt *Tanken* wirklich: erscheinen Liter und Betrag, weicht das Kostenfeld |
| Reihenfolge und Kennzahlen | Sortierung, Fahrleistung, Kostensumme |
| Ausreißer erkennen | rückwärts laufender Tacho |
| Monatsverteilung | Summe der Monate, monoton steigende Kurve |
| Kalender aufbauen | Vorlauf, Tageszahl, volle Wochen |
| Diagramme zeichnen | Trefferflächen, Pfad, kein NaN im Bild |
| Textumbruch im PDF | zu breite Zeilen, überlange Einzelwörter, Umlaute |
| PDF erzeugen | Dateikopf, Seitenumbruch bei 90 Einträgen, Dateiende |
| Verbrauch rechnen | Voll-zu-Voll, Teilbetankung, vergessene Füllung, einzelner Tank |
| Belege ablegen | IndexedDB schreiben, lesen, als JPEG-Bytes holen, löschen |
| Fassung und Offline-Speicher | `BUILD` gegen den Cache-Namen in `sw.js` |
| Keine unbehandelten Fehler | Fehler aus Klick-Handlern, die sonst nur still im Protokoll stehen |

**Testdaten** legen zwei Jahre Fahrzeugleben an — mit Sommer-Winter-Verlauf, damit
die Jahreskurve etwas zu zeigen hat. Sie tragen eine Markierung und lassen sich mit
einem Knopf wieder entfernen, ohne echte Einträge zu berühren.

**Ereignis-Protokoll** hält die letzten 300 Ereignisse fest, kopierbar. Fehler landen
immer darin — auch bei ausgeschaltetem Debug-Modus. Rückwirkend einschalten geht
nicht, und genau die Fehler will man später sehen.

**PDF-Testseite** prüft Schrift, Umlaute, Eurozeichen, Ziffernflucht und Klammern,
ohne dass ein einziger Eintrag nötig ist.

**Neue Fassung holen** leert den Offline-Speicher und lädt die App neu. Einträge und
Belege bleiben: Die liegen in `localStorage` und IndexedDB, und die rührt der Knopf
nicht an. Nötig ist er im Normalfall nicht — er ist der Notausgang, falls doch einmal
eine Fassung hängenbleibt.

---

## Daten

Einträge und Einstellungen liegen im `localStorage` dieses Browsers, die Belegfotos in
IndexedDB — dort passen sie hinein, ohne den kleinen Textspeicher zu sprengen. Kein
Konto, kein Server, keine Übertragung — auch nicht anonymisiert.

Das heißt aber: **Die Sicherung in den Einstellungen ist die einzige Kopie.** Wer den
Browser-Speicher löscht oder das Telefon wechselt, braucht sie. Die Datei ist lesbares
JSON und lässt sich wieder einlesen, wahlweise ersetzend oder anhängend. **Die Belege
sind darin enthalten** (als Base64), deshalb wird sie deutlich größer — die
Einstellungen zeigen vorher an, wie viel die Ablage belegt.

---

## Gestaltung

Die App läuft auf dem **Moch-Design-System v3.2** (`../design/moch.css`) im Schema
`dunkel` mit der Hauptfarbe `walnuss` — beides steht als Attribut am `<html>`-Element:

```html
<html lang="de" data-scheme="dunkel" data-farbe="walnuss">
```

Eine andere Hauptfarbe ist ein Wort: `oxblood`, `taupe`, `stahlblau`, `petrol` oder
`smaragd`. Zwei gleichzeitig gibt es nicht — das System erlaubt genau eine je Projekt.

**Der Grund ist komplementär zur Hauptfarbe.** Walnuss steht bei Farbton 55°, der
Grund bei 235° — ein sehr dunkles Blau (`#040F16`). Warme Schrift auf kühlem Grund;
man sieht es nicht, man spürt es. **Gold entfällt hier**: Zwischen Walnuss und Gold
liegen 30° Farbtonabstand, unter den 35°, ab denen beide als verschiedene Farben
lesbar sind. `--brass` trägt deshalb die Hauptfarbe, und Linien, aktiver Bereich und
Fokus sehen aus wie die Marke, nicht wie ein zweiter Akzent.

**Form folgt Funktion.** Es gibt genau einen Radius (`--r`, 10 px), und ihn bekommt
nur, was man drückt. Flächen, Zahlen und Textblöcke haben gerade Kanten. Gegliedert
wird über Linien und Abstand, nicht über gestapelte Hintergründe — eine Flächenebene.
Deshalb ist die Liste eine Folge von Linien statt von Kacheln, und eine Kennzahl steht
einfach da, mit ihrem Label 2 px darüber.

Abstände sind `--f1` bis `--f8` (6 · 10 · 16 · 26 · 42 · 68 · 110 · 177),
Schriftgrößen `--t-2` bis `--t6`. Die Zahl im Hemd-Block läuft in Literata, alles
andere in Archivo, jede Ziffer in IBM Plex Mono.

**Eingaben sind Linien, keine Kästen** — wie ein Formular auf Papier. Im Fokus trägt
die Linie die Hauptfarbe. Diese vier Zeilen stehen vorerst in `assets/app.css`, weil
`moch.css` die Felder noch mit Rahmen zeichnet; zieht die Datei nach, fallen sie weg.

`assets/app.css` enthält genau **einen** Hexblock: die vier Statustöne für den
Dunkelmodus. Das Regelwerk fordert zwei Fassungen je Schema, `moch.css` liefert seit
dem letzten Umbau nur die helle — die trägt auf diesem Grund 3,4 : 1 statt der
4,5 : 1, die Fließtext braucht. Gemessen, begründet, und wieder draußen, sobald die
Datei nachzieht.

Das PDF steht im hellen Schema: Was gelesen, unterschrieben oder gedruckt wird, ist
hell. Dort ist die Schrift Helvetica — Literata ließe sich nur als eingebettete
Schriftdatei verwenden, und die wiegt mehr als die ganze App.

Jede Abweichung vom Regelwerk ist in `../referenz/UEBERSETZUNGSTABELLE.md` mit Wunsch,
Risiko und Umsetzung begründet.

Ohne Netzverbindung greifen beim ersten Start die Ersatzschriften — das Layout bleibt
stabil, der Charakter geht verloren. Nach dem ersten Laden liegen die Schriften im
Cache des Service Workers.

## Dateien

```
bordbuch/
  index.html                Aufbau der Ansichten
  manifest.webmanifest      Name, Farben, Icons für die Installation
  sw.js                     Offline-Speicher
  assets/app.css            Nur Layout, alles aus Tokens
  assets/js/
    app.js                  Ablauf und Verdrahtung
    util.js                 DOM, Zahlen, Datum
    store.js                localStorage, Sicherung
    eintraege.js            Sortierung, Strecken, Kennzahlen, Monatsverteilung
    kalender.js             Monatsgitter
    diagramm.js             Balken und Kurve als SVG
    pdf.js                  PDF-Schreiber und Dokumentaufbau
    verbrauch.js            Voll-zu-Voll-Rechnung
    belege.js               Belegablage in IndexedDB
    demo.js                 Testdaten
    debug.js                Protokoll und Bereichsschalter
    selbsttest.js           Die siebzehn Prüfungen
    fassung.js              BUILD — muss zum Cache-Namen in sw.js passen
  tools/make-icons.mjs      Erzeugt die App-Icons: node tools/make-icons.mjs
```

## Nach einer Änderung

Wird eine Datei aus der `SHELL`-Liste in `sw.js` geändert, müssen **beide** Zähler
hoch: `CACHE` in `sw.js` und `BUILD` in `assets/js/fassung.js`. Sonst behält ein
installiertes Telefon die alte Fassung. Der Selbsttest prüft genau das.

**Wie ein Update ankommt.** Code — HTML, CSS, JS — holt der Service Worker **zuerst
aus dem Netz**, alles andere zuerst aus dem Cache. Die Shell entscheidet, welche
Module geladen werden; sie muss aktuell sein, sobald eine Verbindung da ist. Offline
springt nach 2,5 Sekunden der Cache ein, die Tiefgarage bleibt also bedient.

Dazu fragt die Seite beim Start selbst nach einer neuen Fassung (`registration
.update()`) und lädt einmal neu, sobald ein neuer Worker übernimmt — sonst mischten
sich alte Shell und neue Module.

Bis `v7` lief alles cache-zuerst und ohne diese Nachfrage. Gemessen: Eine neue
Fassung brauchte **zwei** vollständige Starts, bis sie zu sehen war. Wer die App nur
kurz öffnet, erreichte den zweiten nie und blieb auf einem alten Stand. Seit `v7`
genügt **ein** Neuladen (im Versuch 90 ms), und offline startet die App unverändert.
