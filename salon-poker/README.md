# Salon – Poker lernen

Texas Hold'em lernen an einem Spieltisch wie um 1925. Ein Browser-Spiel mit 3D-Pokertisch, vier Gegnern mit eigenem Spielstil, Lernmodus, Coach und Regelbuch.

## Spielen

Online über GitHub Pages: über GitHub Pages dieses Repos im Ordner `salon-poker/`, falls Pages aktiviert ist.

Lokal braucht es nur einen einfachen Webserver, weil die Musik per `fetch` geladen wird:

```bash
python3 -m http.server 8000
```

Dann http://localhost:8000 öffnen. Das Spiel ist fürs Querformat gebaut und läuft auf Handy und Desktop.

## Was drin ist

- **Lernmodus** mit Erklärkarten zu jeder Phase (Preflop, Flop, Turn, River, Showdown)
- **Coach**, der Gewinnchance, Pot Odds und eine Empfehlung für deine Situation zeigt
- **Regelbuch** mit Ablauf, Handrangfolge, Aktionen und Begriffen
- **Vier Gegner** mit eigenen Persönlichkeiten: Vivienne (vorsichtig), Baron (solide), Maxim (wild), Ottilie (listig)
- Side-Pots, All-in, Nachkaufen
- Klänge, Raumatmosphäre und Jazz der 1920er/30er, jeweils abschaltbar

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Bühne, Styles, Overlays |
| `engine.js` | Karten, Handbewertung, Side-Pots, Monte-Carlo-Gewinnchance, Bot-Logik |
| `app.js` | Spielablauf, 3D-Tisch, Animationen, Sound, Lernmodus, Coach |
| `tex/` | Texturen (Teppich, Holz, Samt) |
| `sfx/`, `music/` | Soundeffekte und Musik |

Keine Abhängigkeiten, kein Build-Schritt. Die Schriften (Bodoni Moda, Jost) kommen von Google Fonts.

## Audio

Musik und Soundeffekte stammen von Epidemic Sound und unterliegen deren Lizenz. Sie sind nicht Teil einer freien Lizenz dieses Repos.

## Abweichung vom Moch-Designsystem

Salon nutzt bewusst nicht `design/moch.css`. Das Spiel hat eine eigene Bildwelt (Spielsalon um 1925: Filz, Holz, Samt, Messing, Bodoni Moda + Jost) und ist als eigenständiges Projekt in diesem Repo abgelegt.
