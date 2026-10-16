# Moch — Design System v3.2

Moch soll nicht aussehen wie KI, sondern wie eine Marke, die Technologie außergewöhnlich
gut beherrscht. Premium heißt nicht Luxus: schnell, präzise, hochwertig, zuverlässig.

**Prüffrage für jedes Element: Belegt es etwas, oder schmückt es nur?**

## So wendest du es an

In diesem Repo liegt das System unter `design/moch.css`. Einbinden und zwei
Attribute setzen:

```html
<html data-scheme="dunkel" data-farbe="walnuss">
<link rel="stylesheet" href="../design/moch.css">
```

**Diese Fassung ist in Benutzung:** `bordbuch/` läuft auf `dunkel` + `walnuss`.
Eine zweite Hauptfarbe im selben Projekt gibt es nicht (Regel 3).

Für ein Artifact oder eine einzelne HTML-Datei: Inhalt von `moch.css` in einen
`<style>`-Block kopieren. Die Schriften lädt die Datei selbst von Google Fonts.

`data-scheme`: `hell` (Standard) oder `dunkel`.
`data-farbe`: `walnuss` · `oxblood` · `taupe` · `stahlblau` · `petrol` · `smaragd`.

**Es gibt keine importierbaren Komponenten.** Dies ist ein Token- und Klassensystem;
das Markup schreibst du selbst gegen das Vokabular unten.

## Die sieben Regeln, die nie gebrochen werden

1. **Der Grund trägt nie eine Markenfarbe.** Chroma unter 0,012 — gerade genug für eine
   Temperatur, zu wenig, um als Farbe gelesen zu werden. Nie eine gesättigte Fläche als
   Hintergrund.
2. **Die Temperatur kehrt um.** Warmer Grund trägt kühle Schrift, kalter Grund warme.
   Immer unter 0,015 Chroma — man sieht es nicht, man spürt es.
3. **Genau eine Hauptfarbe pro Projekt.** Kein zweiter Akzent, keine Palette. Die eine
   Farbe trägt Fläche, Linie, Rahmen und Schrift.
4. **Gold `#FCBE11` ist nur Linie, nie Text.** Auf dunklem Grund trägt es 11,0 : 1, auf
   hellem nur 1,4 : 1. Abgedunkelt würde es oliv. Label-Text läuft über `--label`.
5. **Kein Schwarz, kein Weiß.** Kein Kanal unter 3 oder über 250.
6. **Der Beweis in Zahlen.** Keine Superlative, kein „innovativ", kein „revolutionär".
   Jede Leistungsaussage nennt eine messbare Größe.
7. **Genau ein Fokuspunkt pro Ansicht.** Ein Hemd-Block (`.shirt`), eine große
   Display-Zeile — nicht beides nebeneinander.

## Farbe

Zwei Fassungen einer Farbe teilen **Farbton und Gamut-Anteil**, nie die absolute Chroma.
Wer eine Farbe nur aufhellt, entsättigt sie relativ — sie wird pastellig und wirkt billig.

Im Dunkelmodus trennen sich zwei Rollen: `--accent` ist die **tiefe Fläche**, die hellen
Text trägt; `--accent-ink` die **hellere Schriftfassung** auf dem Grund. Im Hellmodus
genügt eine Fassung.

Hauptfarben sind gesättigt auf min(85 % des Gamuts, Deckel 0,125 warm / 0,090 kalt).
Beide Grenzen sind gemessen, nicht geschätzt.

Maßgeblich sind die Namen, die in `design/moch.css` stehen — nicht die der
Kurzfassung. Vier heißen dort anders, und `--text` ist **die Schriftfamilie**,
nicht die Textfarbe:

| Token | Rolle |
|---|---|
| `--ground` `--surface` `--sunken` | Grundfläche, Karten, eingelassen |
| `--line` `--line-strong` | Linien, starke Trennung |
| `--ink` `--muted` | Text, Sekundärtext |
| `--accent` `--accent-ink` `--auf-accent` | Hauptfarbe: Fläche, Schrift, Text darauf |
| `--brass` `--brass-text` | Gold als Linie, Label-Text |
| `--shirt` `--shirt-text` `--shirt-muted` | Hemd-Block |
| `--kante` `--glas` `--scrim` | helle Oberkante, Milchglas, Abdunklung |
| `--display` `--text` `--mono` | die drei Schriftfamilien |

**Status hat keine Tokens.** Fehler, Warnung und Erfolg kommen im System nicht
vor. Wer sie braucht, definiert sie im Projekt, hält sie von der Hauptfarbe
fern und lässt sie nie allein durch Farbe sprechen — Text oder Form gehören
dazu. Eintrag in der Übersetzungstabelle.

## Raum: φ

Layout-Abstände sind Potenzen von φ: **6 · 10 · 16 · 26 · 42 · 68 · 110 · 177**
(`--f1` bis `--f8`). Alles leitet sich aus einem Modul `--m` ab — deshalb trägt dieselbe
Datei alle Medien:

| Medium | `--m` |
|---|---|
| Web | 16px |
| Filmbild, Overlay | `2.2vh` (Klasse `.medium-overlay`) |
| Visitenkarte 85 × 55 mm | 2,6mm (Klasse `.medium-karte`) |
| Druck | 3,6mm (automatisch per `@media print`) |

**Nähe kodiert Beziehung.** Der Abstand *zwischen* Gruppen ist immer mindestens zwei
φ-Stufen größer als *innerhalb*: `.stapel-eng` (10) innerhalb einer Einheit, `.stapel`
(26) zwischen verwandten, `section` (110) zwischen Abschnitten.

**Mindestens 45 % freie Fläche.** Weißraum ist kein Rest, sondern das Material, das
Premium herstellt — er wird zuerst geplant.

Radien: `--r-chip` 6 · `--r-ctrl` 10 · `--r-card` 16 · `--r-sheet` 26.
Konzentrisch: innen = außen − Polster. Ecken laufen als **G2-Superellipse**
(`corner-shape`), nicht als Kreisbogen. **Rahmen statt Schatten** — `box-shadow` nur als
helle Oberkante (`--kante`).

## Typografie

**Literata** (Display, variabel opsz 7–72) · **Archivo** (Text) · **IBM Plex Mono**
(Zahlen, Labels). Keine vierte Familie.

Größen folgen √φ: 10 · 12,5 · 16 · 20,5 · 26 · 33 · 42 · 53,5 (`--t-2` bis `--t5`).
Jede zweite Stufe trifft exakt die Raumskala.

Zeilenabstand aus φ: **1,618** Fließtext · **1,272** Lead und Überschriften ·
**1,128** Display.

Laufweite größenabhängig: `calc(.3px - .012em)` — große Schrift enger, kleine weiter.
Nie ein fester Wert für alle Größen.

**Der Bruch ist die Signatur:** Serifen-Display laut über stiller Grotesk leise.
Jede Ziffer monospaced und tabellarisch (`.n`), optisch 93 % der Textgröße — außer in
der Display-Zeile, dort läuft sie mit.

## Klassenvokabular

Genau diese Namen existieren — keine weiteren erfinden:

| Klasse | Zweck |
|---|---|
| `.bund` | Satzspiegel, zentriert |
| `.display` `.display-gross` | Display-Zeile in Literata |
| `.eyebrow` | Mono-Versalien über der Überschrift |
| `.n` | jede Ziffer |
| `.lead` `.klein` `.muted` | Lead, kleiner Text, Sekundärtext |
| `.haar` `.doppel` | Goldlinie, Doppellinie |
| `.marke` | Wortmarke mit Flankenlinien |
| `.dataline` | Datenzeile unter Bild und Film |
| `.card` + `.inner` | Fläche mit Linie, eingelassene Ebene |
| `.shirt` | Hemd-Block — genau einer pro Ansicht |
| `.btn` + `.btn-primary` / `.btn-ghost` / `.btn-quiet` | genau ein Primary je Abschnitt |
| `.badge` `.field` | Badge mit Goldrahmen, Feld mit Label darüber |
| `.gold` `.gold-kehr` | Spaltenteilung 1 : 1,618 |
| `.drei` | symmetrisches Dreifeld mit Kennzahlen |
| `.reihe` | gleichmäßiges Raster |
| `.bild` `.bild-hoch` | Bildfeld im φ-Verhältnis |
| `.stapel-eng` `.stapel` | Abstandsgruppen (siehe Nähe) |
| `.medium-overlay` `.medium-karte` | Filmbild-Overlay, Visitenkarte |

`h2`, `h3`, `p`, `table` sind bereits gestylt — nicht überschreiben.

## Bewegung

Nach Apple: Federn statt fester Kurven, **kritisch gedämpft** (kein Nachfedern), Response
0,3–0,4 s. Rückmeldung **beim Drücken**, nicht beim Loslassen. Animationen starten vom
sichtbaren Wert und bleiben jederzeit unterbrechbar. Ein Wisch landet dort, wohin er
zeigt (Momentum-Projektion `v/1000 · d/(1−d)`, d = 0,998). An Grenzen Gummiband statt
hartem Stopp. Touch-Ziele mindestens 44 × 44 px.

Keine Parallaxe, kein Bounce, keine Auto-Karussells. `prefers-reduced-motion`,
`prefers-reduced-transparency` und `prefers-contrast` werden immer respektiert — das
steht in `moch.css` bereits drin.

## Sprache

Kurze Hauptsätze. Nutzen im ersten Satz, Beweis im zweiten. Button-Beschriftungen sind
Handlungen, nie Substantive: „Angebot anfordern", nicht „Anfrage".

Nicht: „Wir revolutionieren Ihre Prozesse mit KI."
Sondern: „Ihre Angebotserstellung dauert heute vier Stunden. Nach der Automatisierung
acht Minuten."

## Abweichen

Jede Abweichung von diesen Regeln wird **begründet und notiert**, nicht stillschweigend
vorgenommen. Wenn eine Regel im konkreten Fall nicht trägt, sag das — und schreib dazu,
was stattdessen gilt und warum.
