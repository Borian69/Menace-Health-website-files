"""Startet die App mit Attrappen statt Whisper und OpenRouter – für
Oberflächentests ohne Modell-Download und ohne API-Kosten.

    STORAGE_DIR=/tmp/mitschrift-demo python -m backend.tests.demo_server
"""

from __future__ import annotations

import os

import uvicorn

os.environ.setdefault("OPENROUTER_API_KEY", "demo")

from backend.services import openrouter, transcription  # noqa: E402

from .fakes import FakeLLM, FakeTranscriber  # noqa: E402

transcription.set_transcriber(FakeTranscriber())
openrouter.set_llm(FakeLLM())

from backend.main import app  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
