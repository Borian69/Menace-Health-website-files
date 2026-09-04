# Moch — Design System

Du arbeitest im Moch-Design-System. Dieses Dokument ist verbindlich: Was hier steht,
gilt. Was hier nicht steht, erfindest du nicht.

**Einbinden:** `@import url("./design/styles.css")` — oder die Datei direkt verlinken.
Sie lädt Schriften, Tokens, Formsprache und Komponentenschicht in der richtigen
Reihenfolge. Gerenderte Seiten erhalten nur die @import-Hülle dieser Datei.

**Es gibt keine importierbaren Komponenten.** Kein `<Button variant="primary">`. Dies ist
ein Token- und Klassensystem — du schreibst das Markup selbst gegen das Vokabular unten.

## Die Marke in einem Satz

Moch soll nicht aussehen wie KI, sondern wie eine Marke, die Technologie außergewöhnlich
gut beherrscht. Premium heißt nicht Luxus: schnell, präzise, hochwertig, zuverlässig.
Drei Achsen: **ruhig statt laut · warm statt steril · präzise statt gefällig.**

## Acht Signatur-Regeln — nie brechen

1. **Zahlensatz.** Jede Ziffer monospaced und tabellarisch, optisch 93 % der Textgröße
   (`.n`). Ausnahme: in Display-Zeilen laufen Ziffern in der Display-Schrift mit — das
   erledigt die Komponentenschicht automatisch, schreib `.n` ruhig überall.
2. **Datenzeile.** Metadaten zwischen Messing- und Sandlinie (`.dataline`), unter jedem
   veröffentlichten Bild und Film.
3. **Der Bruch.** Fette Didone laut über stiller Grotesk leise — Serife gegen serifenlos.
   Nie beides in der Mitte, nie beide Gattungen in derselben Rolle.
4. **Hemd-Block.** Genau eine helle Fläche pro Ansicht trägt die wichtigste Aussage
   (`.shirt`).
5. **Ein Fond, ein Akzent.** Nacht, Mitternacht oder Oxblood — nie zwei. Walnuss oder
   Oxblood — nie beide gesättigt.
6. **Messing nur als Linie.** Haarlinien, Labels, Fokus. Nie Fläche, nie Verlauf, nie
   Metalleffekt.
7. **Der Beweis in Zahlen.** Keine Superlative. Jede Leistungsaussage nennt eine messbare
   Größe.
8. **Der eingefrorene Sturzflug.** Die Bildmarke zeigt Geschwindigkeit nie durch Effekte —
   nur durch die Haltung.

Alles andere ist Hygiene und darf begründet abweichen.
**Prüffrage: Erkennt jemand die Arbeit ohne Logo als Moch? Dann ist es Signatur.**

## Themes — ein Fond pro Ansicht

```html
<html data-theme="nacht">        <!-- Bühne: Web, Produkt, Dashboard, Social · 60 % -->
<html data-theme="mitternacht">  <!-- Präsentation, Cover, Technik · 30 % -->
<html data-theme="oxblood">      <!-- nur Cover und Kapiteltrenner · 10 % -->
<html>                           <!-- ohne Attribut: Elfenbein — Dokument, Print -->
```

**Im Zweifel:** Wird es gezeigt, ist es dunkel. Wird es gelesen, unterschrieben oder
gedruckt, ist es Elfenbein. Taucht Oxblood häufiger auf als Mitternacht, kippt die Marke
ins Dekorative.

## Farbe — nur Tokens, nie Hex

`--ground` Grundfläche · `--surface` Karten · `--surface-2` eingelassen · `--line` Linien ·
`--line-strong` starke Trennung · `--text` · `--muted` Sekundärtext · `--brand` Walnuss ·
`--brand-ink` (nur dunkle Themes) · `--accent-2` Oxblood · `--brass` Messing textsicher ·
`--brass-line` Messing als Linie · `--shirt` Hemd ·
`--pattern-light` / `-dark` / `-card` / `-accent` ·
Status: `--success` `--warning` `--error` `--info` — nie als Markenfarbe.

**Kein `#FFFFFF`, kein `#000000`** — nirgends. Weiß existiert nur als unbedruckte
Druckfassung. Braun ist Akzent, nie Grundfläche.
Mengenverhältnis **70 Fond / 22 Flächen / 6 Akzent / 2 Messing**, mindestens 45 % freie
Fläche in Marketing-Layouts.

**Lautstärke: höchstens zwei laute Elemente pro Ansicht.** Laut sind die Display-Zeile,
`.shirt`, `.btn-primary` und eine gesättigte Akzentfläche. Brauchst du Hemd-Block und
große Zeile: **die Zeile gehört in den Block hinein, nicht daneben** — dann zählen beide
als eines.

## Kontrast — nur freigegebene Kombinationen

Was nicht in dieser Liste steht, ist nicht freigegeben.

| Vordergrund | Hintergrund | Verhältnis | Freigabe |
|---|---|---|---|
| Elfenbein | Nacht / Mitternacht / Oxblood | 15,2–16,2 : 1 | AAA — jede Größe |
| Elfenbein | Kohle `--surface` | 12,6 : 1 | AAA — Text auf Karten |
| Leinen `--muted` | Nacht | 7,9 : 1 | AAA — Sekundärtext |
| Messing `--brass` | Nacht | 9,0 : 1 | AAA — Labels, Links |
| Elfenbein | Walnuss `--brand` | 6,7 : 1 | AA — Button-Text |
| Tinte | Hemd `--shirt` | 16,5 : 1 | AAA — Hemd-Block |
| Tinte `--text` | Elfenbein | 16,2 : 1 | AAA — jede Größe |
| Asche `--muted` | Elfenbein | 6,6 : 1 | AA — Sekundärtext |
| Walnuss Tief | Elfenbein | 8,4 : 1 | AAA — Links, Buttons |
| Messing Tief `--brass` | Elfenbein | 5,3 : 1 | AA — Labels im hellen Theme |

**Nur Linien, nie Text:** Messing auf Elfenbein 1,9 : 1 · Kante auf Nacht 2,1 : 1 · Naht
auf Nacht 1,5 : 1 · Sand auf Elfenbein 1,6 : 1. Eine fette Schrift ändert daran nichts —
Strichstärke ändert kein Kontrastverhältnis.

**Fokus** ist immer Messing, 2 px, 2 px Abstand, in beiden Themes:
`outline:2px solid var(--brass-line); outline-offset:2px`. Kein Bedienelement verliert
seinen sichtbaren Fokus. **Farbe allein trägt nie Bedeutung** — Status braucht zusätzlich
Text oder Form.

## Typografie

`--font-display` **Abril Fatface** · `--font-text` **Archivo** · `--font-mono`
**IBM Plex Mono**. Keine vierte Familie. Zeilenabstand immer 1,5. Drei Größen:
17 / 14,5 / 11 px. Zeilenlänge max. 66 Zeichen. Kein Kursiv, kein Blocksatz.

Abril hat **nur Schnitt 400** und ist reine Display-Schrift:

- **Erst ab 24 px** (`--display-min`) — darunter Archivo 600. Bei 16 px wird die fette
  Didone unruhig. `h3` ist deshalb bewusst nicht Display.
- **Laufweite `--display-track` (+1,2 %)**, nie negativ — die Punzen laufen sonst zu.
- **Nie im Fließtext**, nie als Sekundärtext, nie in Tabellen, nie in Labels.

`h1` und `h2` sind bereits richtig gesetzt. Nicht überschreiben.

## Raum

**Layout-Abstände** — Sektionen, Blöcke, Spalten, Karten — sind Vielfache von 8:
`--s1` 8px bis `--s9` 160px. Dort keine Zwischenwerte.
**Ausgenommen: Polster in Bedienelementen** (4–12 px). Ein Button mit 11 px Polster trifft
die geforderten 44 px Höhe; 8 oder 16 wären falsch. Dort zählt das Außenmaß auf dem Raster.

Radius `--radius` 2 px strukturell, `--radius-interactive` 4 px interaktiv.
**Die Ecke läuft als G2-Superellipse** statt als Kreisbogen — `corner-shape` liegt global
auf `*`, du musst nichts tun. Setz nur die Radius-Tokens, nie eigene Werte.
**Rahmen statt Schatten** — `box-shadow` kommt im System nicht vor. Linien 1 px.
Seitenrand mobil 24 px (unter 720 px), Dokumentrand A4 18–20 mm.

## Klassenvokabular

Genau diese Namen existieren. Keine weiteren erfinden. Für eigenes Layout `var(--s*)` und
die Farbtokens.

| Klasse | Zweck |
|---|---|
| `.eyebrow` | Mono-Versalien in Messing über der Überschrift |
| `.n` | **jede Ziffer** — monospaced, tabellarisch, 93 % |
| `.muted` | Sekundärtext |
| `.rule` | Messing-Haarlinie als Trenner |
| `.card` | Fläche mit Linie, ohne Schatten |
| `.shirt` | Hemd-Block — genau einer pro Ansicht |
| `.dataline` / `.lb` | Datenzeile zwischen Messing- und Sandlinie |
| `.grid` / `.row` | Layout, Abstände aus dem 8er-Raster |
| `.btn` + `.btn-primary` / `.btn-ghost` / `.btn-quiet` | Höhe 44 px, genau ein Primary pro Abschnitt |
| `.field` | Label über dem Feld, nie Placeholder als Label-Ersatz |
| `.badge` + `.b-brand` / `.b-brass` / `.b-red` | rechteckig, 1 px Rahmen, **nie gefüllt** |
| `.is-circle` / `.is-pill` | Ausnahme: echter Kreisbogen statt G2 |

`h1`/`h2`/`h3`, `p`, `table`/`th`/`td` sind bereits gestylt — nicht überschreiben.

```html
<p class="eyebrow">Modul 01</p>
<h1>Vier Stunden werden acht Minuten.</h1>
<div class="rule"></div>
<div class="grid" style="grid-template-columns:1fr 1fr;gap:var(--s2)">
  <div class="card">
    <h3>Angebotsautomatisierung</h3>
    <p class="muted" style="font-size:14.5px">Laufzeit <span class="n">8</span> Minuten
      statt <span class="n">4</span> Stunden.</p>
  </div>
  <div class="shirt"><h3>Der Beweis steht in Zahlen.</h3></div>
</div>
<button class="btn btn-primary">Angebot anfordern</button>
```

## Marke

`design/brand/*.svg` sind freigestellt und ohne festen Farbwert — der Pfad übernimmt
`currentColor`. Nie in der Datei umfärben, nie verzerren, nie mit Schatten versehen, nie in
eine Form einsperren.

Bildmarke = 0,85 × Wortbreite · Abstand 1,4 × Versalhöhe · **optische Achse 62 %, nie
mathematisch mittig** · Schutzraum 1,5 × Versalhöhe · Mindestgröße 140 px mit Deskriptor,
24 px Bildmarke allein.

Deskriptor (STUDIOS, PRODUKTION …): Versalhöhe 6 %, **Breite 32 % fix**, Mitte 53 %,
Grundlinie 12 % unter MOCH, 6–12 Zeichen. Die Breite bleibt gleich, nur die Laufweite
ändert sich. Immer serifenlos — **nie in der Display-Schrift.**

## Muster

Ton in Ton, Kontrast max. 1,20 : 1 — gemessen, nicht geschätzt. Immer als SVG, nie als
CSS-Verlauf (PDF-Viewer färben ihn falsch), nie als Pixelbild. Nie hinter Fließtext,
höchstens eines pro Dokument, nie zweifarbig, nie auf Walnuss- oder Messingflächen.

## Bewegung

Hover 180 ms ease-out (nur Farbwechsel) · Panel 240 ms ease-out +8 px · Reveal 600 ms ease
+14 px · Theme 350 ms ease · Seitenwechsel 200 ms linear.
Keine Parallaxe, kein Bounce, keine Auto-Karussells, nichts fliegt herein. Muster bewegen
sich nie. `prefers-reduced-motion` wird immer respektiert.

## Gedruckte Dokumente

Immer **zwei Fassungen**: Versandfassung nach Regelwerk und Druckfassung **ohne
Hintergrundfläche** (`…-DRUCK.pdf`). Inhalt und Seitenzahlen identisch. In der Druckfassung
ist Weiß keine Farbe, sondern die Abwesenheit von Farbauftrag.
Eine fette Didone trägt viel Farbe auf: in der Druckfassung **eine Display-Zeile pro
Seite**, nur auf Titel- und Kapitelseiten.

## Sprache

Professionell, aber nahbar. Kurze Hauptsätze. Nutzen im ersten Satz, Beweis im zweiten.
Keine Superlative, kein „innovativ", kein „revolutionär". Im B2B gesiezt, im persönlichen
Kontext geduzt — nie gemischt innerhalb eines Dokuments. Button-Beschriftungen sind
Handlungen, nie Substantive: „Angebot anfordern", nicht „Anfrage".

> Nicht: „Wir revolutionieren Ihre Geschäftsprozesse mit modernster KI-Technologie."
> Sondern: „Ihre Angebotserstellung dauert heute vier Stunden. Nach der Automatisierung
> acht Minuten."

## Wenn du abweichen musst

Radius, Abstände und Schriftgrößen sind Hygiene und dürfen begründet abweichen — die acht
Signatur-Regeln nicht. **Jede Abweichung gehört in die Übersetzungstabelle**
(`referenz/UEBERSETZUNGSTABELLE.md`): Wunsch, Risiko, Umsetzung.

1. **Wunsch** — wörtlich notieren, ohne ihn zu bewerten.
2. **Risiko** — konkret benennen, was im professionellen Einsatz dagegen spricht.
   „Gefällt mir nicht" ist kein Eintrag.
3. **Umsetzung** — die Empfindung retten, die Form ersetzen.
   **Bleibt diese Spalte leer, gehört die Idee nicht ins System.**

**Eine Abweichung, die nur im Code-Kommentar begründet ist, gilt als nicht begründet** —
wer nur die Komponente liest, kennt die ursprüngliche Regel dann nicht mehr.

## Weiterführend

- `referenz/Moch-Design-System_Uebergabe.pdf` — die vollständige Fassung mit Begründungen,
  Messwerten und allen 14 Kapiteln. Extrahieren mit
  `pdftotext -enc UTF-8 <datei>.pdf -` (ohne `-layout`).
- `referenz/karten/` — 16 eigenständige HTML-Seiten, die jede Regel zeigen. Im Browser
  öffnen, wenn du unsicher bist, wie etwas aussehen soll.
- `referenz/UEBERSETZUNGSTABELLE.md` — alle bisherigen Abweichungen mit Begründung.
