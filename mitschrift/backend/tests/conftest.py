"""Testumgebung: eigene Ablage in einem Temp-Ordner, FFmpeg echt, Whisper und
OpenRouter als Attrappen (kein Modell-Download, keine Kosten)."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

WURZEL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL))


@pytest.fixture(scope="session", autouse=True)
def _env(tmp_path_factory):
    store = tmp_path_factory.mktemp("storage")
    os.environ.update(
        STORAGE_DIR=str(store),
        APP_PASSWORD="",
        OPENROUTER_API_KEY="test-key",
        FRONTEND_DIST=str(store / "kein-frontend"),
        LOG_LEVEL="WARNING",
    )
    from backend.config import get_settings

    get_settings.cache_clear()
    yield


from .fakes import FINAL, FakeLLM, FakeTranscriber  # noqa: E402,F401


@pytest.fixture()
def fakes():
    from backend.services import openrouter, transcription

    t, llm = FakeTranscriber(), FakeLLM()
    transcription.set_transcriber(t)
    openrouter.set_llm(llm)
    yield t, llm
    transcription.set_transcriber(None)
    openrouter.set_llm(None)


@pytest.fixture()
def client(fakes):
    from fastapi.testclient import TestClient

    from backend.main import app

    with TestClient(app) as c:
        yield c


# ── Testaudio ───────────────────────────────────────────────

CODECS = {
    "mp3": ["-c:a", "libmp3lame"],
    "wav": ["-c:a", "pcm_s16le"],
    "m4a": ["-c:a", "aac"],
    "aac": ["-c:a", "aac", "-f", "adts"],
    "ogg": ["-c:a", "libvorbis"],
    "flac": ["-c:a", "flac"],
    "webm": ["-c:a", "libopus", "-ar", "48000"],
}


@pytest.fixture(scope="session")
def audio_dir(tmp_path_factory):
    return tmp_path_factory.mktemp("audio")


def make_audio(audio_dir: Path, fmt: str, seconds: float = 3.0, freq: int = 440) -> Path:
    p = audio_dir / f"ton-{freq}-{seconds:g}s.{fmt}"
    if not p.exists():
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
             "-i", f"sine=frequency={freq}:duration={seconds}", "-ac", "1", "-ar", "44100", *CODECS[fmt], str(p)],
            check=True,
        )
    return p
