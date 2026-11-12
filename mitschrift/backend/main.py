"""Einstieg: FastAPI-App. Liefert die API unter /api und – falls gebaut –
die Oberfläche aus frontend/dist. Ein Prozess, ein Port, ein Container.

Start (aus dem Ordner mitschrift/):
    uvicorn backend.main:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import auth
from .api import projects, recordings
from .config import get_settings
from .models import repo
from .models.schemas import LoginIn, StatusOut
from .services import audio, storage

settings = get_settings()
logging.basicConfig(
    level=settings.log_level.upper(),
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("mitschrift")


@asynccontextmanager
async def lifespan(_: FastAPI):
    n = repo.reset_interrupted()
    if n:
        log.warning("%d Verarbeitung(en) waren beim letzten Stopp unterbrochen und stehen auf „Fehler“.", n)
    if not audio.ffmpeg_available():
        log.error("FFmpeg/ffprobe nicht gefunden – Uploads und Transkription funktionieren nicht.")
    if not settings.app_password:
        log.warning("APP_PASSWORD ist leer: Die App ist ohne Anmeldung erreichbar. Nur lokal so betreiben.")
    if not settings.llm_ready:
        log.warning("OPENROUTER_API_KEY fehlt: Transkription läuft, Zusammenfassungen nicht.")
    log.info("Ablage: %s · Whisper: %s · Modell: %s", settings.storage_dir, settings.whisper_model, settings.openrouter_model)
    yield


app = FastAPI(title="Mitschrift", version="1.0.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OFFEN = {"/api/health", "/api/status", "/api/session"}


@app.middleware("http")
async def zugang(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and path not in OFFEN and request.method != "OPTIONS":
        if not auth.is_authenticated(request):
            return JSONResponse({"detail": "Anmeldung erforderlich."}, status_code=401)
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"ok": True, "ffmpeg": audio.ffmpeg_available()}


@app.get("/api/status", response_model=StatusOut)
def status(request: Request):
    return StatusOut(
        auth_required=auth.auth_required(),
        authenticated=auth.is_authenticated(request),
        llm_ready=settings.llm_ready,
        model=settings.openrouter_model,
        whisper_model=settings.whisper_model,
        max_upload_mb=settings.max_upload_mb,
        formats=sorted({e.lstrip(".") for e in storage.FORMATE}),
    )


@app.post("/api/session")
def login(body: LoginIn, response: Response):
    if not auth.auth_required():
        return {"ok": True}
    if not auth.password_ok(body.password):
        log.warning("Fehlgeschlagene Anmeldung")
        return JSONResponse({"detail": "Passwort stimmt nicht."}, status_code=401)
    token, max_age = auth.new_token()
    response.set_cookie(
        auth.COOKIE, token, max_age=max_age, httponly=True, samesite="lax", secure=settings.cookie_secure, path="/"
    )
    return {"ok": True}


@app.delete("/api/session")
def logout(response: Response):
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


app.include_router(projects.router)
app.include_router(recordings.router)


@app.post("/teilen", include_in_schema=False)
def teilen_ohne_service_worker():
    """Android-Teilen landet normalerweise im Service Worker. Ist er (noch)
    nicht aktiv, führt dieser Weg wenigstens zum Import statt zu einem Fehler."""
    return RedirectResponse("/#/import", status_code=303)


# ── Oberfläche ──────────────────────────────────────────────
dist = settings.frontend_dist
if dist.exists() and (dist / "index.html").exists():
    if (dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{pfad:path}", include_in_schema=False)
    def spa(pfad: str):
        if pfad.startswith("api/"):
            return JSONResponse({"detail": "Nicht gefunden."}, status_code=404)
        datei = (dist / pfad).resolve()
        if pfad and datei.is_file() and dist.resolve() in datei.parents:
            headers = {"Cache-Control": "no-cache"} if datei.name in ("sw.js", "manifest.webmanifest") else None
            return FileResponse(datei, headers=headers)
        return FileResponse(dist / "index.html", headers={"Cache-Control": "no-cache"})
else:
    log.info("Kein gebautes Frontend unter %s – nur die API läuft.", dist)
