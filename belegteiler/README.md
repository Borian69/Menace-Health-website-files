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

Die Belege liest ein Bildmodell. Die App kann zwei Anbieter:

**OpenRouter** (Voreinstellung) — ein Zugang, viele Modelle, darunter kostenlose.
Key auf [openrouter.ai/keys](https://openrouter.ai/keys) erstellen. Für die
Modelle mit „gratis“ im Namen braucht es kein Guthaben; es gelten 20 Anfragen
pro Minute und 50 pro Tag.

**Claude (Anthropic)** — Key auf [console.anthropic.com](https://console.anthropic.com).
Kein kostenloses Kontingent, dafür sehr zuverlässig bei schwierigen Bons.

App öffnen → Zahnrad oben rechts → Anbieter wählen → Key einfügen. Fertig.
Unten kannst Du gleich noch Deinen Namen, „Für wen“ und den Zahlungshinweis
(IBAN oder PayPal) eintragen — das erscheint dann auf der Übersicht.

### 3. Auf den Home-Bildschirm legen

- **iPhone:** in Safari öffnen → Teilen-Symbol → *Zum Home-Bildschirm*
- **Android:** in Chrome öffnen → Menü → *App installieren*

Danach startet sie wie eine normale App im Vollbild.

---

## So läuft ein Einkaufstag ab

Belege sammeln sich über den Tag zu **einer** Abrechnung. Erst wenn Du sie
abschließt, ist sie fertig — bis dahin kannst Du jederzeit weitere Bons anhängen,
auch nachdem die App zwischendurch zu war.

1. **Icon antippen → „Beleg scannen".** Die Kamera des Handys öffnet sich. Es
   dürfen ruhig **mehrere Bons nebeneinander** liegen.
2. **Warten.** Positionen, Preise und Warengruppen werden erkannt; unklare Zeilen
   danach nachgeschlagen. Lange Bons werden automatisch in überlappende
   Abschnitte zerlegt, damit die Schrift scharf bleibt.
3. **Zuordnen.** Häkchen setzen heißt „das ist meins" — die Position fällt aus der
   Summe der Eltern raus. Über *Alles meins* / *Alles für Eltern* drehst Du die
   Richtung um. Ein Tipp auf den Namen öffnet die Bearbeitung; dort steht die
   Originalzeile vom Bon und ein Knopf zum Nachschlagen des Produkts.
4. **Zurück zum Start.** Auf dem Startbildschirm steht jetzt die laufende
   Abrechnung: Zwischensumme, wie viele Belege, welche Läden und um wie viel Uhr.
   Der nächste Scan hängt sich automatisch daran.
5. **Abrechnung erstellen.** Ab zwei Belegen gliedert sich die Rechnung nach
   Einkauf: Laden, Datum und Uhrzeit als Überschrift, darunter die Positionen und
   eine Zwischensumme. Bei einem einzelnen Beleg bleibt die Gliederung nach
   Warengruppen.
6. **Als Bild teilen.** Landet direkt in WhatsApp, Signal, Mail. Alternativ als
   Text kopieren oder das Bild speichern.
7. **Abschließen.** Damit wandert die Abrechnung in den Verlauf und das Fach ist
   frei für den nächsten Tag. Vorher passiert das nicht — Du kannst also erst
   teilen und später noch etwas ergänzen.

Weicht die Summe der Positionen von der aufgedruckten Endsumme ab, warnt die App.
Schlecht lesbare Positionen bekommen einen Punkt.

---

## Die beiden Betriebsarten

| | **Direkt** (Standard) | **Über eigenen Server** |
|---|---|---|
| Wo liegt der Key | im Browser des Handys (`localStorage`) | auf Deinem Server |
| Aufwand | Key einfügen, fertig | zusätzlich einen Endpunkt deployen |
| Wofür | Dein eigenes Handy | wenn die Seite öffentlich erreichbar ist |

**Zum Direktmodus:** Der Key liegt im Browser-Speicher und geht von dort direkt an
den Anbieter. Beide erlauben das ausdrücklich — OpenRouter über offene
CORS-Freigabe, Anthropic über den Header
`anthropic-dangerous-direct-browser-access`. Auf dem eigenen Telefon ist das in
Ordnung; auf einem geteilten Gerät oder wenn die Seite öffentlich erreichbar ist,
lieber den Proxy nehmen. Ein Key lässt sich beim Anbieter jederzeit widerrufen und
neu erstellen.

**Proxy einrichten:** `server/scan.js` ist ein fertiger Handler nach Web-Standard
und läuft unverändert auf Cloudflare Workers, Deno Deploy, Vercel Edge und
Netlify Edge. Zwei Umgebungsvariablen setzen:

```
OPENROUTER_API_KEY = sk-or-v1-…      # für OpenRouter
ANTHROPIC_API_KEY  = sk-ant-…        # für Claude
ALLOWED_ORIGIN     = https://<dein-name>.github.io
```

Es genügt der Key des Anbieters, den die App tatsächlich nutzt.

Danach in den Einstellungen auf *Über eigenen Server* umstellen und die URL des
Endpunkts eintragen.

---

## Wie die Erkennung arbeitet

Zwei Durchgänge:

1. **Lesen.** Ein Bildmodell bekommt das Foto und gibt die Positionen zurück:
   Bezeichnung, Menge, Preis, Warengruppe. Es soll dabei nicht den abgekürzten
   Kassentext abtippen, sondern das Produkt dahinter bestimmen — anhand des
   Händlers, seiner Eigenmarken, der Abkürzungsmuster und der Preishöhe.
   Zeilen, bei denen es sich nicht sicher ist, markiert es.
2. **Nachschlagen.** Nur die markierten Zeilen gehen in einen zweiten Durchgang,
   diesmal ohne Bild — reiner Text, deshalb um Größenordnungen billiger. Dieses
   Modell bestimmt das Produkt und formuliert dazu eine Suchanfrage.

Die Suchanfrage landet als Knopf **„Produkt nachschlagen“** in der Bearbeitung
der Position. Auch ohne den zweiten Durchgang gibt es den Knopf — dann mit einer
Anfrage aus Händler und Originalzeile. Abschalten lässt sich der zweite Durchgang
in den Einstellungen.

Daneben steht immer die Originalzeile vom Bon, damit sich jede Deutung nachprüfen
lässt. Und die App vergleicht die Summe der Positionen mit der aufgedruckten
Endsumme und warnt bei Abweichung.

## Was das kostet

Pro Foto wird ein Bild (bei langen Bons zwei bis drei Abschnitte) übertragen.
Der zweite Durchgang fällt kaum ins Gewicht, weil er nur Text sieht.

| Modell | pro Beleg | bei einem Einkauf pro Woche |
|---|---|---|
| OpenRouter, Modelle mit „gratis“ | 0 | 0 |
| Qwen3.7 Flash | ~0,03 Cent | ~2 Cent im Jahr |
| GPT-5 nano | ~0,06 Cent | ~3 Cent im Jahr |
| Gemini 2.5 Flash Lite | ~0,08 Cent | ~4 Cent im Jahr |
| Gemini 2.5 Flash | ~0,4 Cent | ~20 Cent im Jahr |
| Claude Haiku 4.5 | ~1 Cent | ~0,50 € im Jahr |
| Claude Sonnet 5 | ~3 Cent | ~1,50 € im Jahr |
| Claude Opus 5 | ~7 Cent | ~3,60 € im Jahr |

Die App rechnet mit: unter *Einstellungen → Erkennung* steht, was seit dem ersten
Scan zusammengekommen ist. Bei OpenRouter sind das die exakten Beträge, die die
API je Anfrage zurückmeldet; bei Anthropic eine Rechnung aus den Token.

Voreingestellt ist ein kostenloses Modell. Kostenlose Modelle sind kleiner und
lesen verknitterte Thermobons schlechter — wenn Positionen kryptisch bleiben oder
die Summe nicht passt, lohnt sich der Schritt zu einem der Cent-Bruchteil-Modelle
weiter unten in der Liste deutlich mehr, als er kostet.

### Ausweichmodell

Gratis-Modelle laufen auf knapper Kapazität und melden regelmäßig „überlastet“,
auch beim ersten Scan des Tages — das hat mit der eigenen Nutzung nichts zu tun.
Zwei Sicherungen greifen deshalb:

1. Bei vorübergehenden Fehlern wartet die App die vom Anbieter genannte Zeit ab
   (höchstens 25 Sekunden) und fragt still ein zweites Mal.
2. Hilft das nicht, wechselt sie auf das **Ausweichmodell** aus den Einstellungen.
   Voreingestellt ist Gemini 2.5 Flash Lite — das braucht Guthaben, kostet aber
   nur einen Bruchteil eines Cents und ist immer erreichbar. Ein Hinweis sagt
   hinterher, dass gewechselt wurde. Auf „Keins“ gestellt, zeigt die App
   stattdessen den Fehler.

## Kamera

Fotografiert wird mit der Kamera-App des Handys, angestoßen über
`<input type="file" accept="image/*" capture="environment">`.

Es gab zwischendurch eine nachgebaute Kamera in der App über `getUserMedia` —
der Gedanke war, dass `capture="environment"` für den Browser nur ein Vorschlag
ist und manche Browser trotzdem die Frontkamera öffnen. Im Alltag hat sich das
nicht bewährt: die Bilder wurden unschärfer als die der Kamera-App. Das ist auch
kein Wunder — Autofokus, Belichtung, Bildstabilisierung und die volle Auflösung
des Sensors sind genau das, worin die Kamera-App gut ist, und für die feine
Schrift auf einem Kassenbon zählt nichts davon wenig. Sie ist deshalb wieder der
Weg, „Bild aus der Galerie wählen" die Alternative.

## Rückmeldung

Der Ton ist dreiteilig: **tiefer Anlauf — Stille — Piep.** Die Stille dazwischen
trägt das Ganze. Läuft der Anlauf direkt in den Ton, verschwimmen beide zu einem
Geräusch; erst die Lücke macht aus dem Anlauf eine Frage und aus dem Piep die
Antwort. Und der Anlauf beginnt tief (98 Hz bei der Bestätigung, 73 Hz beim
Abschluss) — von unten hat er Platz zu steigen, weiter oben klingt er dünn.
`test16` misst die Hüllkurve nach: Aufbau um Faktor 8, Pause exakt still, Piep
mehr als fünfmal so laut wie der Anlauf.

Erkannter Beleg und abgeschlossene Abrechnung werden bestätigt wie eine Zahlung
am Handy: ein Ring läuft nach außen, ein Haken zeichnet sich, dazu der Ton und
ein kurzer Impuls in der Hand. Beträge zählen hoch statt zu
springen, Häkchen ploppen beim Antippen.

Die Töne werden im Browser erzeugt, nicht als Datei geladen — die App bleibt
dadurch ohne Zusatzgewicht und funktioniert offline. Ton und Vibration lassen
sich einzeln abschalten (*Einstellungen → Rückmeldung*). Wer im System „Bewegung
reduzieren“ eingestellt hat, bekommt die Bestätigung ohne Animation.

Die **Hörprobe** dort sagt hinterher, was tatsächlich passiert ist: ob der
Tonkanal offen war, ob der Browser ihn angehalten hat, oder ob abgespielt wurde —
und über welchen der beiden Wege.

**Zwei Wege, gleicher Klang.** Der schöne Weg ist Web Audio. Manche Browser
dämpfen oder blockieren das aber (Brave zählt es zum Fingerprinting-Schutz), und
dann bleibt still, was klingen sollte. Deshalb gibt es einen zweiten Weg:
dieselben Glockentöne werden als Zahlenreihe berechnet, in eine WAV-Datei
verpackt und von einem gewöhnlichen `<audio>`-Element abgespielt. Die App nimmt
automatisch, was gerade funktioniert.

**Lautstärke** ist einstellbar. Sie wirkt auf beide Wege — aber beide hängen an
der **Medienlautstärke** des Geräts. Steht das Telefon auf lautlos oder ist der
Medienregler unten, bleibt es still, und keine App kann das überstimmen.

**Ausgabegerät** lässt sich nur am Rechner wählen; der Knopf erscheint auch nur
dort. Auf dem Telefon entscheidet das Betriebssystem, wohin der Ton geht — eine
Berechtigung dafür gibt es im Browser nicht.

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
│       ├── scan.js            Anweisungen, Schema, beide Durchgänge
│       ├── providers.js       Anthropic und OpenRouter hinter einer Schnittstelle
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

Nach Änderungen an den App-Dateien **zwei** Zahlen hochzählen, die zusammen
gehören: `CACHE` in `sw.js` und `BUILD` in `assets/js/app.js`. Laufen sie
auseinander, zeigen die Einstellungen eine falsche Fassung an — `test13` prüft
das deshalb.

## Was mit dem Foto passiert, bevor es losgeht

Ein Kassenbon ist der unangenehmste Fall für ein Kameraauge: graue
Nadeldruck-Schrift auf weissem Thermopapier, im Laden unter Mischlicht.
Zwei Schritte machen daraus etwas Lesbares.

**Zerlegen nach Auflösung, nicht nach Seitenverhältnis.** Vorher wurde nur
geteilt, wenn ein Bild deutlich höher als breit war. Ein Handyfoto im
Querformat mit zwei Bons nebeneinander (4080 × 3060, Verhältnis 0,75) fiel
durch dieses Raster: Es wurde gar nicht zerlegt, sondern komplett auf die
Zielkante heruntergerechnet — Faktor 2,6, und von der Kassenschrift blieb
zu wenig übrig. Jetzt entscheidet die Auflösung: Ist die lange Kante ein
Vielfaches der Zielgrösse, wird entlang dieser Kante so oft geteilt (höchstens
viermal). An eben diesem Foto gemessen: statt einem Bild mit 1176 × 1568
jetzt zwei mit je 2000 × 1440 — **gut dreimal so viele Pixel**.

**Spreizen und Nachschärfen.** Der Tonwertumfang wird auf Schwarz bis Weiss
gezogen (zwei Prozent an jedem Ende abgeschnitten, damit ein Lichtreflex die
Spreizung nicht bestimmt), die Buchstabenkanten per Unscharfmaskierung
nachgezogen, alles in Graustufen — Farbe trägt auf einem Bon keine
Information. Beim Foto, das den Anstoss gab, lag der Weisspunkt bei 181 statt
255; danach bei 255.

Abschaltbar in den Einstellungen. `test20` misst beides am echten Foto:
Abschnittszahl, Kantenlänge je Abschnitt, Tonwertumfang, und dass
ausgeschaltet wirklich nichts angefasst wird.

Ein Bon pro Foto bleibt trotzdem die schärfere Aufnahme — bei zweien teilen
sich beide dieselben Pixel.

## Wenn das Display ausgeht

Die Seite wird eingefroren, sobald das Handy in den Standby geht oder sie
in den Hintergrund wandert. Eine Anfrage, die aus der Seite heraus läuft,
hängt dann fest — die Antwort mag da sein, aber der Code, der sie annimmt,
läuft nicht. Für eine Erkennung, die zwanzig Sekunden dauert, reicht ein
Blick zur Seite.

Ein Service Worker gehört nicht zur Seite. Läuft einer, bekommt er die
Anfrage (`netz.js` → `sw.js`), und `event.waitUntil` hält ihn für ihre
Dauer am Leben. Das Ergebnis wird **haltbar abgelegt, bevor es gemeldet
wird**; verpasst die eingefrorene Seite die Meldung, holt sie es beim
Zurückkommen ab. Abgeholtes wird gelöscht, alles Ältere als eine Stunde
ebenfalls. Ohne Worker wird direkt gefragt — langsamer, aber nie ein
Totalausfall.

Was `test15` belegt: Der Durchlauf über den Worker kommt sauber durch,
ein verpasstes Ergebnis lässt sich nachträglich abholen, und es wird
nicht doppelt ausgeliefert. Was er **nicht** belegt: dass das Einfrieren
allein ohne Worker etwas kaputtmacht — im Testbrowser läuft das Netz auch
in der eingefrorenen Seite weiter, die Antwort wird beim Aufwachen
nachgereicht. Der Lauf ohne Worker steht als Gegenprobe drin, wird aber
bewusst nicht bewertet.

Zum Testen wichtig: Playwright kann Anfragen aus einem Service Worker
nicht abfangen — weder `page.route()` noch `context.route()` (geprüft mit
1.56). Die Logik-Suiten laufen deshalb mit `serviceWorkers: 'block'` über
den direkten Weg; `test15` mockt auf Server-Ebene und deckt den Weg über
den Worker ab.

## Wie eine Änderung auf dem Gerät ankommt

Das ging zwischendurch schief, und zwar auf eine Art, die von aussen wie „der
Code ist gar nicht angekommen" aussah. Der Service Worker holte zuerst aus dem
Cache und erneuerte ihn nur im Hintergrund. Damit war jeder Start **eine
Fassung hinterher**: Wer die App öffnete, sah den alten Stand; der neue landete
bloss im Cache und wurde erst beim übernächsten Start sichtbar. Zweimal
schliessen und öffnen hätte geholfen — nur ahnt das niemand.

Jetzt gilt: **Netz zuerst, Cache als Rückfalllinie.** Wer online ist, bekommt
immer den aktuellen Stand; offline kommt alles aus dem Cache wie vorher.
Dazu drei Dinge, damit es nicht wieder still schiefgehen kann:

- `registration.update()` beim Start und jedes Mal, wenn die App wieder in den
  Vordergrund kommt.
- Übernimmt ein neuer Service Worker, lädt die Seite **einmal** selbst neu —
  sonst läuft im Fenster weiter der Code, der vor dem Wechsel geladen wurde.
- Die laufende Fassung steht in den Einstellungen unter *App*, daneben ein Knopf
  *Neueste Fassung holen*: Service Worker abmelden, alle Caches leeren, neu
  laden. Der Notausgang, falls doch einmal etwas klemmt.

`test14` prüft das Ganze gegen einen Testserver, der `Cache-Control: max-age=600`
sendet wie GitHub Pages: Datei am Server ändern, App neu aufrufen, die Änderung
muss beim **nächsten** Start da sein — und offline muss es weiterhin laufen.
