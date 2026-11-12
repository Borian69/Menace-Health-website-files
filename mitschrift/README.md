# Mitschrift

Aufnehmen oder Audiodateien importieren, Projekten zuordnen, auf Knopfdruck lokal
transkribieren und über alle Aufnahmen eines Projekts strukturiert zusammenfassen.
Ziel ist, dass man die Zusammenfassung liest und die Aufnahme danach nicht mehr anhören muss.

- **Oberfläche:** React + TypeScript + Vite, als PWA installierbar, für Telefone ausgelegt
- **Server:** Python + FastAPI, SQLite, FFmpeg
- **Transkription:** faster-whisper, lokal auf dem Server, keine Kosten pro Minute
- **Analyse:** DeepSeek V4.1 Flash über OpenRouter (Modell per `.env` austauschbar)

Kosten pro Stunde Audio: Die Transkription kostet nur Rechenzeit. Die Zusammenfassung ist
ein einziger KI-Aufruf, solange das Transkript unter ≈ 90.000 Token liegt (≈ 5 Stunden
Gespräch). Eine Stunde Gespräch ergibt ≈ 15.000–20.000 Token. Was ein Lauf tatsächlich
gekostet hat, zeigt die Projektansicht nach den Angaben von OpenRouter.

---

## Schnellstart lokal

Voraussetzungen: Python ≥ 3.11, Node ≥ 20, FFmpeg (`ffmpeg` und `ffprobe` im Pfad).

```bash
cd mitschrift
cp .env.example .env
```

In `.env` mindestens `OPENROUTER_API_KEY` eintragen. `APP_PASSWORD` darf lokal leer bleiben.

```bash
python3 -m venv .venv
```

```bash
.venv/bin/pip install -r backend/requirements-dev.txt
```

```bash
cd frontend && npm install && npm run build && cd ..
```

```bash
.venv/bin/uvicorn backend.main:app --port 8000
```

Dann <http://localhost:8000> öffnen. Beim ersten Transkribieren lädt der Server das
Whisper-Modell (Standard `small`, ≈ 480 MB) von huggingface.co nach `storage/models/`.

**Mit Live-Neuladen der Oberfläche:** Backend wie oben starten, zusätzlich
`cd frontend && npm run dev` und <http://localhost:5173> öffnen (Vite leitet `/api` an Port 8000 weiter).

**Ohne Whisper-Modell und ohne API-Kosten** (Attrappen, z. B. um die Oberfläche zu testen):

```bash
STORAGE_DIR=/tmp/mitschrift-demo .venv/bin/python -m backend.tests.demo_server
```

### Auf dem Handy testen

Mikrofon und Service Worker gibt es nur über **HTTPS** (Ausnahme: `localhost`). Im WLAN
geht das am schnellsten mit einem Tunnel, z. B. `cloudflared tunnel --url http://localhost:8000`,
oder gleich auf dem Server mit Caddy (unten).

---

## Betrieb auf einem VPS

Empfohlen: 2–4 vCPU, 4 GB RAM, Docker. Whisper `small` braucht im Betrieb ≈ 1 GB RAM.

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

Die App lauscht nur auf `127.0.0.1:8000`. HTTPS davor, z. B. mit Caddy (holt das
Zertifikat selbst):

```
# /etc/caddy/Caddyfile
mitschrift.example.de {
    request_body {
        max_size 1GB
    }
    reverse_proxy 127.0.0.1:8000
}
```

Daten liegen in `mitschrift/storage/` (Datenbank, Audio, Modelle). **Sichern** heißt diesen
Ordner sichern. **Aktualisieren:** `git pull && docker compose up -d --build`.

---

## Bedienung

1. **Aufnahme** (Startseite): großer Knopf → Pause / Fortsetzen → Beenden.
2. Name vergeben, **Projekt wählen oder neu anlegen**, „Aufnahme speichern“. Der Knopf
   erscheint erst, wenn ein Projekt gewählt ist.
3. **Projekte** → Projekt öffnen → weitere Aufnahmen oder Dateien hinzufügen, entfernen,
   umsortieren, umbenennen.
4. **„Transkribieren und zusammenfassen“** → Übersicht prüfen → „Jetzt starten“. Der
   Fortschritt steht auf der Seite. Man kann sie verlassen, der Server arbeitet weiter.
5. Zusammenfassung lesen. Quellenangaben („A2 · 00:14:10“) und Zeitstempel im Transkript
   springen an die Stelle im Audio.

**Import:** MP3, WAV, M4A, AAC, OGG, FLAC, WebM (auch Opus, MP4-Audio), bis 1 GB pro Datei.
Unter Android können Rekorder-Apps eine Datei direkt an die installierte App **teilen**.

---

## Konfiguration

Alle Werte stehen mit Erklärung in [`.env.example`](.env.example). Die wichtigsten:

| Variable | Standard | Wirkung |
|---|---|---|
| `APP_PASSWORD` | leer | Gemeinsames Passwort. Leer = offen (nur lokal!) |
| `OPENROUTER_API_KEY` | – | Nur auf dem Server. Ohne Schlüssel läuft die Transkription, die Zusammenfassung nicht |
| `OPENROUTER_MODEL` | `deepseek/deepseek-v4.1-flash` | Einzige Stelle, an der das Modell steht |
| `WHISPER_MODEL` | `small` | `base` schneller, `medium` / `large-v3` genauer und deutlich langsamer |
| `WHISPER_LANGUAGE` | `de` | Leer = automatisch erkennen |
| `TRANSCRIBE_CHUNK_MINUTES` | `10` | Lange Aufnahmen werden in solche Abschnitte geteilt; jeder fertige wird gespeichert |
| `LLM_SINGLE_PASS_TOKENS` | `90000` | Darunter ein Aufruf, darüber mehrstufig |

---

## Tests

```bash
cd mitschrift && .venv/bin/python -m pytest backend/tests -q
```

27 Tests über die HTTP-API, mit echtem FFmpeg und Attrappen für Whisper und OpenRouter:
Upload aller sieben Formate, Ablehnung kaputter Dateien, mehrere Aufnahmen pro Projekt,
Zusammensetzen unterbrochener Aufnahmen, keine Dubletten bei wiederholtem Upload,
vollständige Verarbeitung, Abschnitte und mehrstufige Zusammenfassung, Wiederaufnahme nach
Fehler ohne erneutes Transkribieren, Neustart, Anmeldung, OpenRouter-Wiederholungen und -Fehler.

**Im Browser** (Chromium mit künstlichem Mikrofon, Demo-Server muss laufen):

```bash
node tools/e2e.mjs <ordner-mit-vortrag.mp3-und-memo.m4a> [screenshot-ordner]
```

Prüft Aufnahme, Pause, Fortsetzen, Speichern, Wiederherstellung nach Neuladen mitten in der
Aufnahme, System-Unterbrechung mit „Weiter aufnehmen“, Import, Verarbeitung, Zusammenfassung,
Transkript, Umbenennen.

---

## Aufbau

```
mitschrift/
├── backend/
│   ├── main.py            App, Anmeldung, Auslieferung der Oberfläche
│   ├── config.py          sämtliche Einstellungen (auch Modell und Parameter)
│   ├── db.py              SQLite-Schema
│   ├── auth.py            Passwort und Sitzungs-Cookie
│   ├── api/               HTTP-Routen: Projekte, Aufnahmen
│   ├── models/            Schemas und Datenbankzugriffe
│   ├── services/          FFmpeg, Whisper, OpenRouter, Zusammenfassung, Verarbeitung
│   ├── prompts/           System-Prompts als Markdown
│   └── tests/
├── frontend/              React-PWA
├── storage/               Datenbank, Audio, Modelle (nicht im Repo)
├── docs/                  Architektur und Einschränkungen
├── tools/                 Icon-Generator, Browser-Test
├── Dockerfile
└── docker-compose.yml
```

Mehr in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md). Was auf welchem Gerät geht und was
nicht, steht in [`docs/EINSCHRAENKUNGEN.md`](docs/EINSCHRAENKUNGEN.md).
