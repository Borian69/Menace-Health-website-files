"""Verarbeitung eines Projekts: konvertieren → transkribieren → zusammenfassen.

Ein einziger Hintergrund-Thread arbeitet die Warteschlange ab. Auf einem
kleinen VPS ist das Absicht: zwei Whisper-Läufe gleichzeitig wären nicht
schneller, nur doppelt so speicherhungrig.

Wiederaufnahme: Fertige Transkripte, fertige Transkript-Abschnitte und
KI-Antworten liegen in der Datenbank. Ein erneuter Start überspringt sie.
"""

from __future__ import annotations

import logging
import queue
import threading
import traceback

from ..models import repo
from ..models.schemas import Progress, Segment
from . import audio, storage
from .openrouter import LLMError, get_llm
from .summarizer import Summarizer
from .transcription import TranscriptionError, get_transcriber
from ..config import get_settings

log = logging.getLogger(__name__)

_queue: "queue.Queue[str]" = queue.Queue()
_worker: threading.Thread | None = None
_worker_lock = threading.Lock()


class PipelineError(Exception):
    pass


def enqueue(project_id: str) -> bool:
    """Reiht das Projekt ein. False, wenn es bereits verarbeitet wird."""
    if not repo.claim_for_processing(project_id):
        return False
    _ensure_worker()
    _queue.put(project_id)
    return True


def _ensure_worker() -> None:
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_loop, name="mitschrift-worker", daemon=True)
            _worker.start()


def _loop() -> None:
    while True:
        pid = _queue.get()
        try:
            process_project(pid)
        except Exception:  # pragma: no cover – letzte Sicherung
            log.error("Unerwarteter Fehler im Worker:\n%s", traceback.format_exc())
        finally:
            _queue.task_done()


def wait_idle() -> None:
    """Für Tests: wartet, bis die Warteschlange leer ist."""
    _queue.join()


def _transcribe_recording(row, nummer: int, anzahl: int, project_id: str) -> None:
    transcriber = get_transcriber()
    rid = row["id"]
    src = storage.absolute(row["file_path"])
    if not src.exists():
        raise PipelineError(f"Audiodatei von „{row['filename']}“ fehlt auf dem Server.")

    def fortschritt(detail: str, done: int, total: int) -> None:
        repo.set_status(
            project_id,
            "transkribiert",
            Progress(step="transkribiert", done=done, total=total, detail=f"Aufnahme {nummer} von {anzahl} · {detail}"),
        )

    work = storage.arbeitsordner(rid)
    wav = work / "voll.wav"
    if not wav.exists():
        fortschritt("wird vorbereitet", 0, 1)
        audio.to_whisper_wav(src, wav)

    dauer = audio.duration_s(wav)
    if dauer > 0 and abs(dauer - (row["duration_s"] or 0)) > 1:
        from ..db import connect
        with connect() as c:
            c.execute("UPDATE recordings SET duration_s = ? WHERE id = ?", (round(dauer, 2), rid))

    chunk_s = max(60, get_settings().transcribe_chunk_minutes * 60)
    teile = audio.split_wav(wav, work / "teile", chunk_s, dauer)
    alle: list[Segment] = []
    for i, (pfad, start) in enumerate(teile):
        fortschritt(f"Abschnitt {i + 1} von {len(teile)}", i, len(teile))
        fertig = repo.get_transcript_part(rid, i, transcriber.model_name)
        if fertig is None:
            fertig = transcriber.transcribe(pfad, offset_s=start)
            repo.save_transcript_part(rid, i, transcriber.model_name, fertig)
        alle.extend(fertig)

    repo.save_transcript(rid, alle, transcriber.model_name)
    storage.raeume_arbeitsordner(rid)


def process_project(project_id: str) -> None:
    log.info("Verarbeitung startet: %s", project_id)
    try:
        rows = repo.recording_rows_for_project(project_id)
        if not rows:
            raise PipelineError("Das Projekt enthält keine Aufnahmen.")

        # 1–4: konvertieren und transkribieren, was noch fehlt
        model_name = get_transcriber().model_name
        offen = [r for r in rows if not r["transcript_json"] or r["transcript_model"] != model_name]
        for n, row in enumerate(offen, start=1):
            try:
                _transcribe_recording(row, n, len(offen), project_id)
            except (audio.AudioError, TranscriptionError, PipelineError) as e:
                repo.set_recording_status(row["id"], "fehler", str(e))
                raise PipelineError(f"„{row['filename']}“: {e}") from e

        # 5–7: Analyse
        if not get_settings().llm_ready:
            raise PipelineError(
                "Transkripte sind fertig. Für die Zusammenfassung fehlt der OpenRouter-Schlüssel "
                "(OPENROUTER_API_KEY)."
            )
        repo.set_status(project_id, "analysiert", Progress(step="analysiert", detail="Transkripte werden gelesen"))

        def on_progress(step: str, done: int, total: int, detail: str) -> None:
            repo.set_status(project_id, step, Progress(step=step, done=done, total=total, detail=detail))

        blocks = repo.transcripts_for_project(project_id)
        ergebnis = Summarizer(get_llm(), project_id, on_progress).run(blocks)
        repo.save_summary(project_id, ergebnis, repo.recordings_key([b.recording_id for b in blocks]))
        log.info("Verarbeitung fertig: %s", project_id)

    except (PipelineError, LLMError, audio.AudioError, TranscriptionError) as e:
        log.warning("Verarbeitung %s fehlgeschlagen: %s", project_id, e)
        repo.set_status(project_id, "fehler", None, str(e))
    except Exception as e:
        log.error("Verarbeitung %s: unerwarteter Fehler\n%s", project_id, traceback.format_exc())
        repo.set_status(project_id, "fehler", None, f"Unerwarteter Fehler: {e.__class__.__name__}: {e}")
