"""Aufnahmen: hochladen (Import oder Browser-Aufnahme), abspielen, verwalten."""

from __future__ import annotations

import logging
import re
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..config import get_settings
from ..models import repo
from ..models.schemas import LAUFEND, RecordingOut
from ..services import audio, storage

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["aufnahmen"])


def _gesperrt(project_id: str) -> None:
    status = repo.get_project_status(project_id)
    if status is None:
        raise HTTPException(404, "Projekt nicht gefunden.")
    if status in LAUFEND:
        raise HTTPException(409, "Das Projekt wird gerade verarbeitet. Änderungen sind danach wieder möglich.")


def _sauberer_name(name: str, fallback: str) -> str:
    name = re.sub(r"[\x00-\x1f/\\]", "", (name or "").strip())[:160]
    return name or fallback


@router.post("/projects/{project_id}/recordings", response_model=RecordingOut, status_code=201)
async def upload_recording(
    project_id: str,
    parts: list[UploadFile] = File(..., description="Eine Datei – oder mehrere Teilstücke einer unterbrochenen Aufnahme"),
    filename: str = Form(""),
    source: str = Form("import"),
    client_id: str = Form(""),
):
    _gesperrt(project_id)
    if source not in ("import", "aufnahme"):
        source = "import"

    client_id = client_id.strip()[:80] or None
    if client_id:
        vorhanden = repo.recording_by_client_id(client_id)
        if vorhanden:
            if vorhanden.project_id != project_id:
                raise HTTPException(409, "Diese Aufnahme liegt bereits in einem anderen Projekt.")
            log.info("Upload %s bereits vorhanden, nichts doppelt angelegt", client_id)
            return vorhanden

    if not parts:
        raise HTTPException(400, "Keine Datei erhalten.")

    rid = repo.new_id()
    erste = parts[0]
    ext = storage.endung_fuer(erste.filename or "", erste.content_type)
    if not ext:
        erlaubt = ", ".join(sorted({e.lstrip(".").upper() for e in storage.FORMATE}))
        raise HTTPException(415, f"Format nicht unterstützt. Erlaubt: {erlaubt}.")

    work = storage.arbeitsordner(f"upload-{rid}")
    try:
        if len(parts) == 1:
            ziel = storage.ziel_fuer(project_id, rid, ext)
            groesse = await storage.speichere_upload(erste, ziel)
        else:
            # Teilstücke (Aufnahme mit Unterbrechungen) zu einer Datei zusammensetzen.
            pfade: list[Path] = []
            for i, teil in enumerate(parts):
                tex = storage.endung_fuer(teil.filename or "", teil.content_type) or ext
                p = work / f"teil-{i:03d}{tex}"
                await storage.speichere_upload(teil, p)
                pfade.append(p)
            ext = ".ogg"
            ziel = storage.ziel_fuer(project_id, rid, ext)
            audio.concat_to_ogg(pfade, ziel)
            groesse = ziel.stat().st_size

        if groesse == 0:
            raise HTTPException(400, "Die Datei ist leer.")
        try:
            if not audio.has_audio_stream(ziel):
                raise HTTPException(415, "Die Datei enthält keine Tonspur.")
            dauer = audio.duration_s(ziel)
        except audio.AudioError as e:
            raise HTTPException(415, str(e)) from e
    except storage.UploadTooLarge:
        raise HTTPException(413, f"Die Datei ist größer als {get_settings().max_upload_mb} MB.")
    except HTTPException:
        storage.loesche_datei_sicher(locals().get("ziel"))
        raise
    except audio.AudioError as e:
        storage.loesche_datei_sicher(locals().get("ziel"))
        raise HTTPException(422, str(e)) from e
    finally:
        storage.raeume_arbeitsordner(f"upload-{rid}")

    name = _sauberer_name(filename or erste.filename or "", f"Aufnahme{ext}")
    rec = repo.add_recording(
        recording_id=rid,
        project_id=project_id,
        filename=name,
        file_path=storage.relative(ziel),
        mime=storage.FORMATE.get(ext),
        source=source,
        duration_s=round(dauer, 2),
        size_bytes=groesse,
        client_id=client_id,
    )
    log.info("Aufnahme gespeichert: %s · %.0f s · %d Bytes · Projekt %s", name, dauer, groesse, project_id)
    return rec


@router.get("/recordings/{recording_id}/audio")
def get_audio(recording_id: str):
    row = repo.get_recording_row(recording_id)
    if not row:
        raise HTTPException(404, "Aufnahme nicht gefunden.")
    pfad = storage.absolute(row["file_path"])
    if not pfad.exists():
        raise HTTPException(410, "Die Audiodatei fehlt auf dem Server.")
    return FileResponse(pfad, media_type=row["mime"] or "application/octet-stream", filename=row["filename"])


class RecordingPatch(BaseModel):
    filename: str | None = Field(default=None, min_length=1, max_length=160)
    move: int | None = Field(default=None, description="-1 = nach oben, 1 = nach unten")


@router.patch("/recordings/{recording_id}", response_model=RecordingOut)
def patch_recording(recording_id: str, body: RecordingPatch):
    row = repo.get_recording_row(recording_id)
    if not row:
        raise HTTPException(404, "Aufnahme nicht gefunden.")
    _gesperrt(row["project_id"])
    if body.filename:
        repo.rename_recording(recording_id, _sauberer_name(body.filename, row["filename"]))
    if body.move:
        repo.move_recording(recording_id, body.move)
    return next(r for r in repo.list_recordings(row["project_id"]) if r.id == recording_id)


@router.delete("/recordings/{recording_id}", status_code=204)
def delete_recording(recording_id: str):
    row = repo.get_recording_row(recording_id)
    if not row:
        raise HTTPException(404, "Aufnahme nicht gefunden.")
    _gesperrt(row["project_id"])
    storage.loesche(repo.delete_recording(recording_id))
    storage.raeume_arbeitsordner(recording_id)
    log.info("Aufnahme gelöscht: %s", recording_id)
