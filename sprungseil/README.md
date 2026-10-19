# Sprungseil

Seilspringen im mittleren Tempo setzt bei 80 kg rund 15 kcal pro Minute über dem
Ruheumsatz um, zügiges Gehen rund 5. Die App führt in
fünf Stufen von 5 auf 15 Minuten reine Springzeit, sagt Runden und Pausen an und
zeigt, was davon auf der Waage ankommt.

Eine installierbare Web-App (PWA) für das Telefon. Kein Build, kein Framework,
keine Abhängigkeiten — nur statische Dateien. Alles bleibt auf dem Gerät.

---

## Starten

Der Ordner ist eine fertige statische Seite, genau wie `bordbuch/`. Mit GitHub
Pages liegt die App unter

```
https://<dein-name>.github.io/Menace-Health-website-files/sprungseil/
```

**Das Verzeichnis `design/` muss mitveröffentlicht werden** — von dort kommen
`moch.css` und `moch-motion.js`.

Im Browser öffnen → Teilen → *Zum Home-Bildschirm*. Danach startet die App ohne
Adressleiste und funktioniert offline.

---

## Die drei Bereiche

### Training

Über allem steht die Einheit, die gleich läuft — **das Objekt ist der Titel**.
Darunter die Kennzahl: Trainingsminuten dieser Woche als Zählwerk, die Bemaßung
bis zum Wochenziel und eine Datenzeile mit Einheiten, Springzeit, kcal und Fett.

**Der Plan.** Fünf Stufen, jede springt länger als die davor:

| Stufe | Einheit | Runden | Springen | Pause | Springzeit | Gesamt |
|---|---|---|---|---|---|---|
| 1 | Einstieg  | 10 | 30 s  | 30 s | 5:00  | 9:30  |
| 2 | Aufbau    | 10 | 45 s  | 30 s | 7:30  | 12:00 |
| 3 | Ausdauer  | 8  | 60 s  | 30 s | 8:00  | 11:30 |
| 4 | Intervall | 15 | 40 s  | 20 s | 10:00 | 14:40 |
| 5 | Lang      | 5  | 3 min | 60 s | 15:00 | 19:00 |

Dazu **Tabata** (8 × 20 s / 10 s) und **Eigene** (Runden, Springen, Pause frei,
1–40 Runden, 5–600 s, 0–300 s). Beide zählen nicht zum Plan.

Hoch geht es nach **zwei vollständigen Einheiten, von denen keine hart war** —
oder nach einer, die leicht war. Eine harte oder abgebrochene Einheit wird
wiederholt. Der Hinweis über der Auswahl sagt, welche Stufe als Nächstes kommt und
warum; sie ist beim Öffnen vorgewählt.

**Ablauf** zeigt die Einheit als Strecke: Springen als Fläche, Pause als Linie,
Länge gleich Dauer. Darunter Springzeit, Gesamtzeit, kcal und Sprünge.

**Tempo** — ruhig (unter 100 Sprünge pro Minute), mittel (100–120) oder schnell
(120–160). Es bestimmt den MET-Wert, solange niemand zählt.

### Laufansicht

Eine Zahl: die Restzeit der Phase, so groß, dass sie aus zwei Metern lesbar ist.
Darüber *Springen* in der Hauptfarbe oder *Pause* gedämpft, darunter, was danach
kommt, die Bemaßung über die ganze Einheit und eine Datenzeile, die live mitzählt.

- **Vorlauf** (5, 10 oder 15 s), um das Seil zu greifen.
- **Drei kurze Töne** vor jedem Wechsel, dann ein hoher (springen) oder tiefer
  (Pause) Ton. Hörbar ohne Worte.
- **Ansage**: „Springen“, „Pause. Noch 7 Runden.“, „Letzte Runde“, „Geschafft.“
- **Vibration** bei jedem Wechsel, für das Telefon in der Hosentasche.
- **Der Bildschirm bleibt an** (Wake Lock) und holt sich die Sperre nach einem
  Blick in eine andere App zurück.
- **Anhalten** hält an; erst dann erscheint *Training beenden*. Ein versehentlicher
  Tipp beendet nichts.

Die Uhr zählt nicht mit, sie **misst**: Jeder Stand wird aus der verstrichenen
Wanduhrzeit berechnet (`standBei()` in `rechnen.js`). Drosselt der Browser den
Takt, weil die Seite kurz verdeckt war, fehlt danach keine Sekunde.

### Abschluss

Netto-kcal als Zählwerk, dazu Springzeit, Sprünge und Fett. Zwei Fragen:

- **Wie war’s?** Leicht, passend oder hart. Ohne Antwort erscheint *Einheit
  speichern* nicht — davon hängt die nächste Stufe ab.
- **Sprünge gezählt** (optional). Wer einen Zähler im Griff hat, trägt die Zahl
  ein. Dann bestimmt die gemessene Trittfrequenz den MET-Wert, nicht die Wahl vor
  dem Start. Mehr als 300 pro Minute wird abgelehnt.

### Gewicht

Der Trend als Zählwerk: **Ø der letzten sieben Tage**, nicht die letzte Messung —
die schwankt mit Wasser und Mahlzeit um bis zu ein Kilo. Darunter: zuletzt
gemessen, seit Start, **Tempo pro Woche** und, wenn es zum Ziel passt, das Datum,
an dem das Zielgewicht erreicht wäre. Die Bemaßung läuft vom ersten Wert zum Ziel.

Das Tempo braucht **mindestens drei Messungen über sieben Tage** und ist die
Steigung einer Ausgleichsgeraden über die letzten 28 Tage. Darunter wäre es
Rauschen; dann steht dort nichts.

Unter dem Formular steht ein Satz mit Zahlen statt eines Versprechens: wie viel
Fett die Einheiten der letzten sieben Tage entsprechen — und dass 500 kcal weniger
am Tag rund 450 g pro Woche sind. Seilspringen hilft; die Ernährung entscheidet.

Ein Eintrag je Tag. Wer zweimal wiegt, ersetzt den ersten Wert.

### Verlauf

Netto-kcal gesamt, Springzeit, Sprünge, Fett. Ein Balkendiagramm der letzten acht
Wochen gegen das Wochenziel, darunter alle Einheiten nach Monaten. Antippen öffnet
die Einzelheiten und das Löschen.

---

## Wie gerechnet wird

| Größe | Rechnung | Quelle |
|---|---|---|
| kcal je Minute | MET · 3,5 · kg / 200 | ACSM |
| MET Seilspringen | ruhig 8,8 · mittel 11,8 · schnell 12,3 | Compendium of Physical Activities |
| MET Pause | 2,5 (Stehen, leichte Bewegung) | Compendium |
| netto | MET − 1: der Ruheumsatz ist abgezogen | — |
| Fett | kcal / 7.700 kcal je kg | — |
| Wochenziel | 75 Minuten Trainingszeit | WHO, intensive Bewegung |

**Netto, nicht brutto.** Die meisten Fitness-Apps zeigen den Gesamtumsatz. Der
enthält, was der Körper auch auf dem Sofa verbrannt hätte — und macht deshalb
niemanden leichter. Die Zahl hier ist kleiner und ehrlich.

**Ohne Gewicht keine Kalorien.** Bis das erste Gewicht eingetragen ist, zeigt der
Abschluss die Springzeit als Kennzahl, und die Trainingsseite sagt, was fehlt.

Das Gewicht einer Einheit ist der letzte Eintrag bis zu ihrem Tag. Es wird mit der
Einheit gespeichert; spätere Messungen ändern alte Kalorien nicht.

---

## Daten

Einheiten, Messungen und Einstellungen liegen im `localStorage` dieses Browsers
(`sprungseil.*.v1`). Kein Konto, kein Server, keine Übertragung.

**Die Sicherung in den Einstellungen ist die einzige Kopie.** Sie ist lesbares
JSON; beim Einlesen wird jeder Eintrag geprüft, Unlesbares bleibt draußen und wird
gezählt.

---

## Gestaltung

Moch-Design-System v4.0 im Schema `dunkel` mit der Hauptfarbe `amber` — dieselbe
Fassung wie das Bordbuch, auf demselben Grund (`#0D1824`). Eine zweite Hauptfarbe
im selben Projekt gibt es nicht.

Gebaut wird ausschließlich mit der App-Schicht des Systems (`.app-kopf`
`.zaehlwerk` `.mass` `.dataline` `.aktion` `.chip` `.field` `.eintrag` `.tabs` …).
`assets/app.css` enthält Möblierung — Laufansicht, Ablaufstreifen, Diagramme,
Schalter, Tafel — und genau einen Farbwert: den Grund.

Jede Abweichung steht mit Risiko und Umsetzung in
`../referenz/UEBERSETZUNGSTABELLE.md`.

## Dateien

```
sprungseil/
  index.html              Aufbau der Ansichten
  manifest.webmanifest    Name, Farben, Icons
  sw.js                   Offline-Speicher
  assets/app.css          Möblierung, alles aus Tokens
  assets/js/
    app.js                Ablauf und Verdrahtung
    rechnen.js            Einheiten, Kalorien, Wochen, Gewichtstrend, Plan, Phasen
    uhr.js                Die Uhr einer laufenden Einheit
    signal.js             Töne, Ansage, Vibration, Wake Lock
    walzwerk.js           Zählwerk für „7:30“ und „84,2“
    diagramm.js           Balken und Kurve als SVG
    store.js              localStorage, Sicherung
    datum.js zahl.js      Datum und Zahlen als Text
    util.js               DOM-Helfer
    fassung.js            BUILD — muss zum Cache-Namen in sw.js passen
  tools/make-icons.mjs    node sprungseil/tools/make-icons.mjs
  tools/pruefe.mjs        node sprungseil/tools/pruefe.mjs — 14 Prüfungen der Rechnungen
```

## Nach einer Änderung

`node sprungseil/tools/pruefe.mjs` laufen lassen. Wird eine Datei aus der
`SHELL`-Liste in `sw.js` geändert, müssen **beide** Zähler hoch: `CACHE` in `sw.js`
und `BUILD` in `assets/js/fassung.js`. Die Prüfung schlägt sonst fehl.
