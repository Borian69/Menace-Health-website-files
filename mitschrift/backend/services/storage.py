"""Audiodateien auf der Platte. Die Datenbank speichert nur relative Pfade,
damit sich `storage/` als Ganzes verschieben oder sichern lässt."""

from __future__ import annotations

import logging
import shutil
from pathlib import Path

from fastapi import UploadFile

from ..config import get_settings

log = logging.getLogger(__name__)

# Endung → MIME. Diese Formate nimmt der Import an.
FORMATE: dict[str, str] = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".opus": "audio/ogg",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
}

# Was Browser beim Aufnehmen liefern (MediaRecorder), auf eine Endung abgebildet.
MIME_ZU_ENDUNG: dict[str, str] = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/flac": ".flac",
    "video/webm": ".webm",
    "video/mp4": ".m4a",
}


class UploadTooLarge(Exception):
    pass


def endung_fuer(filename: str, content_type: str | None) -> str | None:
    ext = Path(filename or "").suffix.lower()
    if ext in FORMATE:
        return ext
    if content_type:
        base = content_type.split(";")[0].strip().lower()
        return MIME_ZU_ENDUNG.get(base)
    return None


def absolute(rel: str) -> Path:
    return get_settings().storage_dir / rel


def relative(path: Path) -> str:
    return path.resolve().relative_to(get_settings().storage_dir).as_posix()


def ziel_fuer(project_id: str, recording_id: str, ext: str) -> Path:
    d = get_settings().audio_dir / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{recording_id}{ext}"


async def speichere_upload(upload: UploadFile, ziel: Path) -> int:
    """Schreibt den Upload in 1-MB-Blöcken auf die Platte, nie ganz in den
    Speicher. Bricht ab, sobald die Obergrenze überschritten ist."""
    limit = get_settings().max_upload_mb * 1024 * 1024
    groesse = 0
    tmp = ziel.with_suffix(ziel.suffix + ".part")
    try:
        with tmp.open("wb") as f:
            while True:
                block = await upload.read(1024 * 1024)
                if not block:
                    break
                groesse += len(block)
                if groesse > limit:
                    raise UploadTooLarge()
                f.write(block)
        tmp.replace(ziel)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return groesse


def loesche(rel: str | None) -> None:
    if not rel:
        return
    p = absolute(rel)
    try:
        p.unlink(missing_ok=True)
    except OSError as e:
        log.warning("Datei konnte nicht gelöscht werden: %s (%s)", p, e)


def loesche_projektordner(project_id: str) -> None:
    d = get_settings().audio_dir / project_id
    shutil.rmtree(d, ignore_errors=True)


def arbeitsordner(recording_id: str) -> Path:
    d = get_settings().work_dir / recording_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def raeume_arbeitsordner(recording_id: str) -> None:
    shutil.rmtree(get_settings().work_dir / recording_id, ignore_errors=True)


def loesche_datei_sicher(path: Path | None) -> None:
    """Räumt eine halb angelegte Datei nach einem abgelehnten Upload weg."""
    if path is None:
        return
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        pass
