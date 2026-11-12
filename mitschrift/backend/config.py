"""Zentrale Konfiguration. Jeder Wert kommt aus der Umgebung oder aus `.env`.

Das Modell und seine Parameter stehen nur hier. Kein anderer Teil des Codes
nennt eine Modell-ID.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJEKT_WURZEL = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(PROJEKT_WURZEL / ".env", PROJEKT_WURZEL / "backend" / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Ablage ──────────────────────────────────────────────
    # Datenbank, Audiodateien und Zwischenstände liegen getrennt vom Code.
    storage_dir: Path = PROJEKT_WURZEL / "storage"

    # ── Zugang ──────────────────────────────────────────────
    # Leer = offen (nur für lokale Entwicklung). Auf einem Server immer setzen.
    app_password: str = ""
    # Signiert das Sitzungs-Cookie. Leer = wird beim ersten Start erzeugt und
    # in storage/.secret abgelegt.
    session_secret: str = ""
    session_days: int = 90
    # Nur über HTTPS ausliefern (Server hinter TLS). Lokal auf False lassen.
    cookie_secure: bool = False

    # ── Upload ──────────────────────────────────────────────
    max_upload_mb: int = 1024

    # ── Transkription (faster-whisper, lokal) ──────────────
    whisper_model: str = "small"          # tiny · base · small · medium · large-v3
    whisper_device: str = "cpu"           # cpu · cuda · auto
    whisper_compute_type: str = "int8"    # int8 ist auf CPU am günstigsten
    whisper_language: str = "de"          # leer = automatisch erkennen
    whisper_beam_size: int = 1            # 1 = schnell, 5 = etwas genauer
    whisper_vad: bool = True              # Stille überspringen
    whisper_threads: int = 0              # 0 = ctranslate2 wählt
    whisper_cache_dir: Path | None = None  # Standard: storage/models
    # Lange Aufnahmen werden in Abschnitte dieser Länge geschnitten. Jeder
    # fertige Abschnitt wird sofort gespeichert; ein Abbruch kostet höchstens einen.
    transcribe_chunk_minutes: int = 10

    # ── KI-Analyse (OpenRouter) ─────────────────────────────
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "deepseek/deepseek-v4.1-flash"
    openrouter_temperature: float = 0.2
    openrouter_max_output_tokens: int = 8000
    openrouter_timeout_s: float = 300.0
    openrouter_retries: int = 3
    # Optional, erscheint in der OpenRouter-Statistik.
    openrouter_app_title: str = "Mitschrift"
    openrouter_app_url: str = ""

    # Bis zu dieser Länge (geschätzte Token) geht das Transkript in EINEM
    # Aufruf zur Zusammenfassung. Darüber: erst Abschnitte verdichten, dann
    # zusammenführen. Ein Aufruf ist billiger und verliert keine Bezüge.
    llm_single_pass_tokens: int = 90_000
    llm_chunk_tokens: int = 30_000
    llm_chars_per_token: float = 3.6

    # ── Server ──────────────────────────────────────────────
    log_level: str = "INFO"
    frontend_dist: Path = PROJEKT_WURZEL / "frontend" / "dist"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # Abgeleitete Pfade
    @property
    def db_path(self) -> Path:
        return self.storage_dir / "mitschrift.db"

    @property
    def audio_dir(self) -> Path:
        return self.storage_dir / "audio"

    @property
    def work_dir(self) -> Path:
        return self.storage_dir / "work"

    @property
    def models_dir(self) -> Path:
        return self.whisper_cache_dir or (self.storage_dir / "models")

    @property
    def llm_ready(self) -> bool:
        return bool(self.openrouter_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.storage_dir = s.storage_dir.resolve()
    for d in (s.storage_dir, s.audio_dir, s.work_dir, s.models_dir):
        d.mkdir(parents=True, exist_ok=True)
    return s
