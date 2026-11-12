"""Lokale Transkription mit faster-whisper.

Das Modell wird beim ersten Bedarf geladen (und beim allerersten Mal von
Hugging Face heruntergeladen, danach liegt es in storage/models). Es bleibt
im Speicher, solange der Server läuft.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Protocol

from ..config import get_settings
from ..models.schemas import Segment

log = logging.getLogger(__name__)


class TranscriptionError(Exception):
    pass


class Transcriber(Protocol):
    @property
    def model_name(self) -> str: ...

    def transcribe(self, wav: Path, offset_s: float = 0.0) -> list[Segment]: ...


class WhisperTranscriber:
    def __init__(self) -> None:
        self._model = None
        self._lock = threading.Lock()
        s = get_settings()
        self._name = s.whisper_model

    @property
    def model_name(self) -> str:
        return f"faster-whisper/{self._name}"

    def _load(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is None:
                try:
                    from faster_whisper import WhisperModel
                except ImportError as e:  # pragma: no cover
                    raise TranscriptionError("faster-whisper ist nicht installiert.") from e
                s = get_settings()
                log.info("Lade Whisper-Modell %s (%s, %s)", s.whisper_model, s.whisper_device, s.whisper_compute_type)
                try:
                    self._model = WhisperModel(
                        s.whisper_model,
                        device=s.whisper_device,
                        compute_type=s.whisper_compute_type,
                        cpu_threads=s.whisper_threads,
                        download_root=str(s.models_dir),
                    )
                except Exception as e:
                    raise TranscriptionError(
                        f"Whisper-Modell „{s.whisper_model}“ konnte nicht geladen werden: {e}"
                    ) from e
        return self._model

    def transcribe(self, wav: Path, offset_s: float = 0.0) -> list[Segment]:
        s = get_settings()
        model = self._load()
        try:
            segments, info = model.transcribe(
                str(wav),
                language=s.whisper_language or None,
                beam_size=s.whisper_beam_size,
                vad_filter=s.whisper_vad,
                condition_on_previous_text=False,  # verhindert Endlosschleifen bei Stille
            )
            out = [
                Segment(start=round(seg.start + offset_s, 2), end=round(seg.end + offset_s, 2), text=seg.text.strip())
                for seg in segments
                if seg.text.strip()
            ]
        except Exception as e:
            raise TranscriptionError(f"Transkription fehlgeschlagen: {e}") from e
        log.info("Transkribiert: %s (%d Segmente, Sprache %s)", wav.name, len(out), getattr(info, "language", "?"))
        return out


_instance: Transcriber | None = None


def get_transcriber() -> Transcriber:
    global _instance
    if _instance is None:
        _instance = WhisperTranscriber()
    return _instance


def set_transcriber(t: Transcriber | None) -> None:
    """Für Tests: einen anderen Transkribierer einsetzen."""
    global _instance
    _instance = t
