# Mitschrift

Aufnehmen oder Audiodateien importieren, Projekten zuordnen, auf Knopfdruck transkribieren
und über alle Aufnahmen eines Projekts strukturiert zusammenfassen. Wer die Zusammenfassung
liest, muss die Aufnahme danach nicht mehr anhören.

## Online nutzen

**https://borian69.github.io/Menace-Health-website-files/mitschrift/app/**

1. Adresse auf dem Handy öffnen und zum Home-Bildschirm hinzufügen
   (iPhone: Safari → Teilen → *Zum Home-Bildschirm* · Android: Chrome → Menü → *App installieren*).
2. Zahnrad oben rechts → OpenRouter-Schlüssel eintragen (von [openrouter.ai/keys](https://openrouter.ai/keys)) →
   „Schlüssel speichern“. Die App prüft ihn sofort. Das ist einmal je Gerät nötig.
3. Aufnehmen, Projekt wählen, speichern. In der Projektansicht „Transkribieren und zusammenfassen“.

Mehr ist nicht einzurichten. Die Seite liefert GitHub Pages aus dem Ordner `mitschrift/app/`
auf `main` aus, es gibt keinen Server. Ist Pages für das Repository noch aus: einmal
*Settings → Pages → Source: Deploy from a branch → main / (root)*.

### So arbeitet die Online-Fassung

- **Alles bleibt auf dem Gerät:** Projekte, Aufnahmen, Transkripte und Zusammenfassungen
  liegen im Speicher des Browsers (IndexedDB). Ein zweites Gerät sieht sie nicht. Wichtiges
  per „Als Markdown exportieren“ sichern.
- **Transkription:** Whisper über OpenRouter (`openai/whisper-large-v3-turbo`). Die App teilt
  das Audio in Abschnitte zu 2 Minuten, kodiert sie als MP3 (16 kHz mono, 32 kbit/s, eine
  Stunde ≈ 14 MB) und überspringt Stille.
- **Zusammenfassung:** DeepSeek V4.1 Flash über OpenRouter (`deepseek/deepseek-v4.1-flash`).
  Bis ≈ 5 Stunden Gespräch reicht ein einziger Aufruf.
- **Schlüssel:** liegt nur auf dem Gerät und geht nur an openrouter.ai. Bei OpenRouter für
  diesen Schlüssel ein Ausgabenlimit setzen.
- **Während der Verarbeitung muss die App geöffnet bleiben.** Der Bildschirm bleibt dafür an.
  Wird sie unterbrochen, geht es beim nächsten Start ab dem letzten fertigen Abschnitt weiter.
- **Modelle tauschen:** Einstellungen → „Modelle und Sprache“.

**Kosten pro Stunde Audio:** Die Transkription wird pro Audiosekunde abgerechnet. Je nach
Anbieter kostet sie bei Whisper etwa 0,04 $ bis 0,36 $ pro Stunde. Die Zusammenfassung
liest ≈ 15.000–20.000 Token pro Stunde Gespräch. Was ein Lauf tatsächlich gekostet hat, zeigt
die Projektansicht nach den Angaben von OpenRouter. Aktuelle Preise stehen auf den
Modellseiten bei openrouter.ai.

### Nach Änderungen am Code neu veröffentlichen

```bash
cd mitschrift/frontend && npm install && npm run build:pages
```

Dann `mitschrift/app/` committen und nach `main` bringen.

---

## Alternative: eigener Server (kostenlose Transkription)

Dieselbe Oberfläche läuft auch mit dem Python-Server in `backend/`. Sie erkennt ihn
automatisch (antwortet `./api/status`, gilt der Server-Betrieb). Dann transkribiert
**faster-whisper lokal auf dem Server**, ohne Kosten pro Minute, und alle Geräte teilen
dieselben Projekte. Der OpenRouter-Schlüssel steht dann nur in der `.env` des Servers.

- **Server:** Python + FastAPI, SQLite, FFmpeg, faster-whisper
- **Empfohlen:** VPS mit 2–4 vCPU, 4 GB RAM, Docker. Whisper `small` braucht ≈ 1 GB RAM.

```bash
git clone <repo> && cd <repo>/mitschrift
```

```bash
cp .env.example .env
```

In `.env` setzen: `APP_PASSWORD`, `OPENROUTER_API_KEY`, `COOKIE_SECURE=true`.

```bash
docker compose up -d --build
```

Die App lauscht auf `127.0.0.1:8000`. HTTPS davor, z. B. mit Caddy:

```
mitschrift.example.de {
    request_body {
        max_size 1GB
    }
    reverse_proxy 127.0.0.1:8000
}
```

Daten liegen in `mitschrift/storage/`. Alle Einstellungen stehen mit Erklärung in
[`.env.example`](.env.example).

### Lokal entwickeln

Voraussetzungen: Python ≥ 3.11, Node ≥ 20, FFmpeg.

```bash
cd mitschrift && python3 -m venv .venv && .venv/bin/pip install -r backend/requirements-dev.txt
```

```bash
cd frontend && npm install && npm run build && cd ..
```

```bash
.venv/bin/uvicorn backend.main:app --port 8000
```

Mit Attrappen statt Whisper und OpenRouter (keine Kosten):

```bash
STORAGE_DIR=/tmp/mitschrift-demo .venv/bin/python -m backend.tests.demo_server
```

Nur die Online-Fassung ausprobieren: aus der Repo-Wurzel `python3 -m http.server 8100`, dann
<http://localhost:8100/mitschrift/app/> öffnen.

---

## Tests

```bash
cd mitschrift && .venv/bin/python -m pytest backend/tests -q
```

27 Server-Tests mit echtem FFmpeg sowie Attrappen für Whisper und OpenRouter.

**Im Browser** (Chromium mit künstlichem Mikrofon):

- `node tools/e2e-geraet.mjs <ordner> [screenshots]`: die Online-Fassung, statisch
  ausgeliefert. Die Anfragen an OpenRouter werden abgefangen und geprüft (Schlüssel, Modell,
  gültiges MP3).
- `node tools/e2e.mjs <ordner> [screenshots]`: der Server-Betrieb gegen den Demo-Server.

`<ordner>` enthält `vortrag.mp3` und `memo.m4a` (beliebige kurze Audiodateien).

---

## Aufbau

```
mitschrift/
├── app/                   gebaute Oberfläche für GitHub Pages (eingecheckt)
├── frontend/              React + TypeScript + Vite (PWA)
│   └── src/engine/        geraet/ (IndexedDB + OpenRouter) · server.ts (FastAPI)
├── backend/               FastAPI, SQLite, FFmpeg, faster-whisper
│   └── prompts/           System-Prompts – von beiden Betriebsarten genutzt
├── storage/               Server-Daten (nicht im Repo)
├── docs/                  Architektur und Einschränkungen
├── tools/                 Icon-Generator, Browser-Tests
├── Dockerfile
└── docker-compose.yml
```

Mehr in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md). Was auf welchem Gerät geht und was
nicht, steht in [`docs/EINSCHRAENKUNGEN.md`](docs/EINSCHRAENKUNGEN.md).
