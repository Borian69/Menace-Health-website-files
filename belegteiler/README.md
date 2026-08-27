# Belegteiler

Kassenbon fotografieren → alle Positionen werden automatisch erkannt und nach
Warengruppen sortiert → antippen, was davon Deins ist → fertige Übersicht an die
Eltern schicken, mit dem Betrag, der überwiesen werden soll.

Eine installierbare Web-App (PWA). Kein Build, kein Framework, keine
Abhängigkeiten — nur statische Dateien.

---

## In drei Schritten startklar

### 1. Veröffentlichen

Der Ordner `belegteiler/` ist eine fertige statische Seite. Mit GitHub Pages:

*Repository → Settings → Pages → Source: `Deploy from a branch`, Branch: `main`, Ordner `/ (root)`.*

Danach liegt die App unter

```
https://<dein-name>.github.io/Menace-Health-website-files/belegteiler/
```

Jeder andere Static-Host (Netlify, Vercel, Cloudflare Pages) geht genauso.
Wichtig ist nur **HTTPS** — sonst gibt es keine Kamera und keinen Service Worker.

### 2. Zugang zur Erkennung hinterlegen

Die Belege liest Claude. Dafür braucht die App einen API-Key von
[console.anthropic.com](https://console.anthropic.com) (dort Guthaben aufladen,
schon ein paar Euro reichen für sehr viele Belege).

App öffnen → Zahnrad oben rechts → **Anthropic API-Key** einfügen. Fertig.
Unten kannst Du gleich noch Deinen Namen, „Für wen“ und den Zahlungshinweis
(IBAN oder PayPal) eintragen — das erscheint dann auf der Übersicht.

### 3. Auf den Home-Bildschirm legen

- **iPhone:** in Safari öffnen → Teilen-Symbol → *Zum Home-Bildschirm*
- **Android:** in Chrome öffnen → Menü → *App installieren*

Danach startet sie wie eine normale App im Vollbild.

---

## So läuft ein Einkauf ab

1. **Icon antippen → „Beleg scannen“.** Die Kamera geht auf, Bon abfotografieren.
2. **Warten.** Das Bild wird zugeschnitten und gelesen. Lange Bons werden
   automatisch in überlappende Abschnitte zerlegt, damit die Schrift scharf
   bleibt.
3. **Zuordnen.** Alle Positionen stehen nach Warengruppen sortiert da. Häkchen
   setzen heißt „das ist meins“ — die Position fällt aus der Summe der Eltern
   raus. Über *Alles meins* / *Alles für Eltern* kannst Du die Richtung
   umdrehen, wenn nur ein paar Sachen für die Eltern sind.
   Ein Tipp auf den Namen öffnet die Bearbeitung (Preis korrigieren, Kategorie
   ändern, löschen). Über `+` unten fügst Du etwas hinzu, über `+` oben rechts
   einen zweiten Beleg.
4. **Prüfen.** Weicht die Summe der Positionen von der aufgedruckten Endsumme
   ab, warnt die App. Schlecht lesbare Positionen bekommen einen gelben Punkt.
5. **Übersicht erstellen → Als Bild teilen.** Das Bild landet direkt in
   WhatsApp, Signal, Mail — wohin Du willst. Alternativ als Text kopieren oder
   das Bild speichern.

Jede fertige Abrechnung bleibt im Verlauf auf dem Startbildschirm und lässt sich
später wieder öffnen.

---

## Die beiden Betriebsarten

| | **Direkt** (Standard) | **Über eigenen Server** |
|---|---|---|
| Wo liegt der Key | im Browser des Handys (`localStorage`) | auf Deinem Server |
| Aufwand | Key einfügen, fertig | zusätzlich einen Endpunkt deployen |
| Wofür | Dein eigenes Handy | wenn die Seite öffentlich erreichbar ist |

**Zum Direktmodus offen gesagt:** Der Key liegt im Browser-Speicher und wird von
dort an die Claude-API geschickt. Wer Zugriff auf das entsperrte Handy hat, kommt
an ihn heran. Für ein privates Werkzeug auf dem eigenen Telefon ist das der
dokumentierte, vorgesehene Weg (`anthropic-dangerous-direct-browser-access`) — auf
einem geteilten Gerät solltest Du stattdessen den Proxy nehmen. Ein Key lässt sich
in der Console jederzeit widerrufen und neu erstellen.

**Proxy einrichten:** `server/scan.js` ist ein fertiger Handler nach Web-Standard
und läuft unverändert auf Cloudflare Workers, Deno Deploy, Vercel Edge und
Netlify Edge. Zwei Umgebungsvariablen setzen:

```
ANTHROPIC_API_KEY = sk-ant-…
ALLOWED_ORIGIN    = https://<dein-name>.github.io
```

Danach in den Einstellungen auf *Über eigenen Server* umstellen und die URL des
Endpunkts eintragen.

---

## Was das ungefähr kostet

Pro Beleg wird ein Bild (bei langen Bons zwei bis drei Abschnitte) übertragen und
eine Liste zurückgegeben. Grob gerechnet:

| Modell | pro Beleg |
|---|---|
| Claude Opus 5 — beste Erkennung | ca. 5–8 Cent |
| Claude Sonnet 5 | ca. 2–3 Cent |
| Claude Haiku 4.5 | ca. 1–2 Cent |

Voreingestellt ist Opus 5, weil bei verknitterten Thermobons jeder falsch gelesene
Preis am Ende in der falschen Überweisung landet. Umstellen kannst Du es in den
Einstellungen jederzeit.

---

## Datenschutz

Einstellungen und Verlauf liegen ausschließlich im `localStorage` dieses Geräts.
Belegfotos werden für die Erkennung übertragen und danach nicht gespeichert — weder
lokal noch anderswo. Über *Einstellungen → Alle Daten löschen* ist alles wieder weg.

---

## Aufbau

```
belegteiler/
├── index.html                 alle Ansichten
├── manifest.webmanifest       PWA-Manifest
├── sw.js                      Service Worker (App offline verfügbar)
├── assets/
│   ├── app.css                Design-System
│   ├── icons/                 App-Icons
│   └── js/
│       ├── app.js             Ablaufsteuerung, Ereignisse, Ansichten
│       ├── claude.js          Aufruf der Messages API + Werkzeug-Schema
│       ├── image.js           Zuschnitt, Skalierung, Aufteilung langer Bons
│       ├── receipt.js         Datenmodell einer Abrechnung, Summen
│       ├── categories.js      Warengruppen + Notfall-Zuordnung
│       ├── summary.js         Übersicht als Karte und als Text
│       ├── canvas.js          Übersicht als Bild zum Verschicken
│       ├── store.js           localStorage
│       └── util.js            Geld, Datum, kleine Helfer
├── server/scan.js             optionaler Proxy
└── tools/make-icons.mjs       erzeugt die App-Icons neu
```

Alle Beträge werden intern in ganzen Cent gerechnet, damit sich keine
Rundungsfehler in die Summe schleichen.

### Entwickeln

```bash
cd belegteiler
python3 -m http.server 8099
# → http://127.0.0.1:8099
```

Icons neu erzeugen (braucht nur Node, keine Pakete):

```bash
node tools/make-icons.mjs
```

Nach Änderungen an den App-Dateien die Zahl in `CACHE` in `sw.js` hochzählen,
sonst hält der Service Worker die alte Fassung fest.
