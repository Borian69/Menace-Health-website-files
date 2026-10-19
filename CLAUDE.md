
# Moch — Design System v4.0

Moch soll nicht aussehen wie KI, sondern wie eine Marke, die Technologie außergewöhnlich
gut beherrscht. Premium heißt nicht Luxus: schnell, präzise, hochwertig, zuverlässig.

**Prüffrage für jedes Element: Belegt es etwas, oder schmückt es nur?**

**Quelle:** Das Repo `C:\Users\alexa\Downloads\moch-design-system\moch-design-system` ist die
einzige Quelle (Regelwerk `CLAUDE.md`, Werte `tokens/tokens.css`). `moch.css` und
`moch-motion.js` neben dieser Datei werden von `.design-sync/build.sh` daraus **erzeugt** –
nie hier von Hand ändern, sondern im Repo und dann bauen.

## So wendest du es an

In diesem Repo liegt das System unter `design/`. Einbinden:

```html
<html lang="de" data-scheme="dunkel" data-farbe="amber">
<link rel="stylesheet" href="../design/moch.css">
<script src="../design/moch-motion.js" defer></script>
```

**Diese Fassung ist in Benutzung:** `bordbuch/` und `sprungseil/` laufen auf `dunkel` + `amber`.
Eine zweite Hauptfarbe im selben Projekt gibt es nicht (Regel 3). Bei Amber
entfällt Gold (20°) — `--brass` ist dort `--line-strong`, eine stille Linie.
Der Grund steht eine Nuance unter dem Tokenwert (`#0D1824` statt `#0F1A26`,
L 0,2050 statt 0,2136) — begründet in `referenz/UEBERSETZUNGSTABELLE.md`.

Für ein Artifact oder eine einzelne HTML-Datei: Inhalt von `moch.css` in einen `<style>`-Block,
`moch-motion.js` in einen `<script>`-Block kopieren. Die Schriften lädt `moch.css` von Google Fonts
(nur für Entwürfe; ausgelieferte Produkte nutzen das Repo-Bundle mit selbst gehosteten Schriften).

`data-scheme`: `hell` (Standard) oder `dunkel` · `data-farbe`: `amber` (Standard) · `walnuss` ·
`oxblood` · `taupe` · `stahlblau` · `petrol` · `smaragd`. **Beide auf demselben Element.**

**Es gibt keine importierbaren Komponenten.** Dies ist ein Token- und Klassensystem; das Markup
schreibst du selbst gegen das Vokabular unten. **Für Apps** ist `beispiel-app.html` (neben dieser Datei) die
Vorlage – lies sie, bevor du eine App baust.

## Die sieben Farbregeln

1. **Der Grund ist komplementär zur Hauptfarbe.** Grund-Farbton = Hauptfarbton + 180°. Amber (66°)
   steht auf blauem Grund (246°), Petrol (192°) auf warmem (12°). **Schrift und Hauptfarbe teilen
   eine Temperatur.** Ton in Ton ist die Ausnahme und braucht eine Begründung.
2. **Der Grund ist nie die Hauptfarbe, sondern ihre gedämpfte Gegenfarbe.** Chroma hell 0,008–0,012,
   dunkel 0,022–0,060, L 0,20–0,30 – darunter liest er sich als Schwarz. Referenzen: B3 `#0F1A26`,
   Mappen-Navy `#102A43` (satt, ausdrücklich erlaubt).
   Ausnahme Amber hell: Grund `#FFFDF7` (Ton in Ton, bewusst entschieden).
3. **Genau eine Hauptfarbe pro Projekt.** Sie trägt Fläche (`--accent`), Schrift (`--accent-ink`),
   Linie und Rahmen. Text auf der Fläche: `--auf-accent`.
4. **Gold nur bei ≥ 35° Abstand.** Bei Amber (20°), Walnuss (30°), Taupe (14°) entfällt Gold; die
   Hauptfarbe übernimmt `--brass`. Wo Gold bleibt: **nur Linie und Fokus, nie Text.**
   `--label` ist kein Gold. Die Bildmarke ist immer Gold.
5. **Kein reines Schwarz, kein reines Weiß.** Das Weiß des Systems ist `#FFFDF7`, nie `#FFFFFF`.
   Schwarz: kein Kanal unter 3.
6. **Der Beweis in Zahlen.** Keine Superlative. Jede Leistungsaussage nennt eine messbare Größe.
7. **Genau ein Fokuspunkt pro Ansicht.** Ein Hemd-Block, eine Display-Zeile oder eine große
   Kennzahl – nicht zwei davon.

Zwei Fassungen einer Farbe teilen Farbton und Gamut-Anteil, nie die absolute Chroma.
Amber ist von Natur aus hell: Fläche `#D98A2B` trägt in beiden Modi dunklen Text.
Amber dunkel: Grund `#0F1A26`, Schrift `#FFFDF7`, Akzentschrift `#EDB065`.

| Token | Rolle |
|---|---|
| `--ground` `--surface` `--surface-2` | Grund, eine Flächenebene, eingelassen |
| `--line` `--line-strong` | Linien |
| `--text` `--muted` `--label` | Text, Sekundärtext, Label |
| `--accent` `--accent-ink` `--auf-accent` | Hauptfarbe: Fläche, Schrift, Text darauf |
| `--brass` `--focus` | Linienfarbe (Gold oder Hauptfarbe), Fokus |
| `--success` `--warning` `--error` `--info` | Status, nie ohne Wort |
| `--shirt` `--shirt-text` `--shirt-line` | Hemd-Block |
| `--glass` `--press` `--hover` `--disabled` `--kante` | abgeleitet |

## Typografie: vier Rollen

| Rolle | Schrift | Token |
|---|---|---|
| Überschrift, Statement | **Instrument Serif** 400 – schmal, hoch, mit Charakter. Nie fett. | `--font-display` |
| Große Kennzahl, Zählwerk | **Literata** 600 – ruhig, kräftig | `--font-zahl` |
| Text | **Archivo** | `--font-text` |
| Ziffern, Labels, Datenzeile | **IBM Plex Mono** | `--font-mono` |

**Register Dokument** (`data-register="dokument"`, für Bewerbung, Lebenslauf, Brief): keine plakative
Display-Serife – Überschriften Archivo-Versalien gesperrt, Zwischentitel Mono über `--brass`-Linie.

Keine fünfte Familie. **Der Bruch ist die Signatur:** schmale Serife laut über stiller Grotesk.
Überschriften groß und eng (h1 56–72 px, Zeilenabstand 0,96; App-Titel ≥ 58 px, 0,94).
Jede Ziffer monospaced und tabellarisch (`.n`), 93 % der Textgröße – in Display- und Kennzahlzeilen
läuft sie in der Schrift der Zeile. Laufweite größenabhängig (`--display-track`). Kein Text unter 12 px.

## Raum: φ

`--f1`…`--f8` = **6 · 10 · 16 · 26 · 42 · 68 · 110 · 177**, alle aus dem Modul `--m`
(Web 16 px · `.medium-overlay` 2,2vh · `.medium-karte` 2,6 mm · Druck 3,6 mm automatisch).

**Premium entsteht zwischen Gruppen, nicht innerhalb:** innerhalb einer Zeile `--f2` 10 · zwischen
Feldern `--f3`/`--f4` · **zwischen Gruppen `--f5` 42** (`.gruppe + .gruppe`) · über einer tragenden
Kennzahl `--f6` 68 · zwischen Abschnitten `.abschnitt` 110 (als Klasse, nicht auf `section`).
Ein Label gehört zu seinem Wert: 4 px darüber. Mindestens 45 % freie Fläche.

## Form folgt Funktion

- **Ein Radius, `--r` 10 px (Apple), Kurve G2** – nur für das, was man anfasst (Button, Chip, Icon-Ziel)
  und das, was schwebt (Toast, Menü). Flächen, Karten, Zahlen haben keine Ecken.
- **Eine Flächenebene.** Gliederung über Linien und Abstand. `.card` ist eine Linie oben, keine Box.
- **Eine Zahl steht einfach da.** Ein Icon ist schon ein Ziel: kein Rahmen darum.
- **Bilder dürfen eine Form haben, wenn sie einen Ausschnitt setzt** (`.bild-bogen`, `.bild-rund`,
  `.bild-kontur`). Verboten: Ornamente und verzierte Rahmen.
- **Eingaben sind Linien.** Grundlinie statt Kasten; im Fokus zieht eine 2-px-Linie in `--accent-ink`
  von links auf. Meldung live darunter, mit Wort.
- **Der häufige Weg zuerst:** 3–5 sichtbar, der Rest hinter „Weitere anzeigen“ (`.mehr`).
- **Hemd-Block im Dunkeln ist keine helle Fläche** – dort trägt die Zahl über der `--brass`-Linie die Aussage.
- Touch-Ziele ≥ 44 px. Rahmen statt Schatten.

## Klassenvokabular

Genau diese Namen existieren – keine weiteren erfinden. Teilelemente (z. B. `.zw` `.ziffer` im Zählwerk,
`.spur` `.fill` `.jetzt` `.tick` `.unten` `.rest` in der Bemaßung, `.tag` `.was` `.wert` im Eintrag, `.mini`, `.ind`,
`.wort`) stehen in `beispiel-app.html` und gehören zu ihrem Baustein:

| Klasse | Zweck |
|---|---|
| `.bund` `.container` `.cols` `.grid` `.row` `.zwei` | Satzspiegel und Raster |
| `.gold` `.gold-kehr` `.drei` `.reihe` `.mitte` | Goldener Schnitt, Dreifeld, gleichmäßiges Raster |
| `.stapel-eng` `.stapel` `.stapel-weit` `.gruppe` `.abschnitt` | Nähe |
| `.display` `.display-gross` `h1` `h2` | Instrument Serif |
| `.number` | Kennzahl in Literata 600 |
| `.eyebrow` `.lb` `.lead` `.klein` `.small` `.muted` `.n` | Textrollen |
| `.haar` `.doppel` `.marke` `.dataline` (`.offen`) `.rule` | Linien und Signatur |
| `.card` (+ `.inner`) `.shirt` `.tone` `.deep` | Flächen |
| `.btn` + `.btn-primary` / `.btn-ghost` / `.btn-quiet` / `.btn-block`, `.icon-btn` | genau ein Primary je Ansicht |
| `.field` `.field-msg` `.has-error` `.is-valid` | Feld als Linie |
| `.wahl` `.chip` `.mehr-wrap` `.mehr` | Auswahl |
| `.notice` `.toast` `.badge` `.empty` `.placeholder` | Meldungen und Zustände |
| `.site-nav` `.site-nav-menu` `.bar` | Web-Navigation |
| `.bild` `.bild-hoch` `.bild-bogen` `.bild-rund` `.bild-kontur` `.medium-overlay` `.medium-karte` | Bild und Medien |
| `[data-register="dokument"]` | Register für allgemeingültige Unterlagen |
| **App:** `body.app` `.app-rahmen` `.leiste` `.app-kopf` (`.kz`, `[data-auftritt]`) `.seiten` `.seite` `.rein` `.zaehlwerk` `.einheit` `.mass` `.aktion` `.monat` `.eintrag` `.tabs` | Bordbuch-Muster |

## Apps

Muster aus dem Bordbuch (`beispiel-app.html` neben dieser Datei):
- **Kopf:** Das Objekt ist der Titel („Audi A4 B7“), Kennung in Mono darunter. Kein App-Name, keine
  Linie. Oben Safe Area + 92 px. Beim Scrollen wandert der Titel in die Glasleiste.
- **Kennzahl:** Zählwerk rollt beim Start hoch; Datenzeile zieht auf; Bemaßung bis zum nächsten Ereignis.
- **Hauptaktion erscheint erst, wenn es etwas Gültiges zu speichern gibt.** Speichern: Linie im
  Button → Zählwerk rollt → Toast mit Wort.
- **Navigation:** Tab-Leiste unten mit gleitender Linie, Seiten wischbar.

`moch-motion.js` → `window.Moch`: `Anim` (Feder), `Zaehlwerk`, `Zaehler`, `zieheLinie`, `Mass`,
`titelWoerter` + `zeigeTitel`, `staffel`, `chipDruck`, `mehr`, `Bedingt`, `Toast`, `kopf`, `Seiten`.

## Bewegung

Nach Apple: Federn, **kritisch gedämpft**, Response 0,35–0,7 s. Rückmeldung **beim Drücken**
(0,97 / Chips 0,96 / Icons 0,92). Startet am sichtbaren Wert, jederzeit unterbrechbar. Wisch 1 : 1,
Gummiband 0,3, Momentum-Projektion `v/1000 · d/(1−d)`, d = 0,998.
**Bewegung zeigt Bedeutung:** Zahlen zählen, Linien ziehen auf, Füllungen wachsen vom Druckpunkt.
Staffelung: Titelwörter 70 ms, Gruppen 70 ms, Ziffern 45 ms, Listen 35 ms – nie alles zugleich.
Keine Parallaxe, kein Bounce, keine Auto-Karussells. Reduzierte Bewegung, Transparenz und
erhöhter Kontrast werden respektiert – das steht in `moch.css` und `moch-motion.js` bereits drin.

## Sprache

Kurze Hauptsätze. Nutzen im ersten Satz, Beweis im zweiten. Buttons sind Handlungen:
„Eintrag speichern“, nicht „Speichern-Funktion“.

Nicht: „Wir revolutionieren Ihre Prozesse mit KI.“
Sondern: „Ihre Angebotserstellung dauert heute vier Stunden. Nach der Automatisierung acht Minuten.“

## Abweichen

Jede Abweichung wird **begründet und notiert**, nicht stillschweigend vorgenommen.

## Die Prüffrage

**Erkennt jemand die Arbeit ohne Logo als Moch?** Die Signatur: schmale Serifen-Überschrift über
stiller Grotesk · Datenzeile in Mono-Versalien unter einer Linie · durchgehend tabellarischer
Zahlensatz · Eingaben als Linie · Zahlen, die zählen, und Linien, die aufziehen.
