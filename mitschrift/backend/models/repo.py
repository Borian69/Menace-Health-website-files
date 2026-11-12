"""Datenbankzugriffe für Projekte und Aufnahmen. Die API und die Verarbeitung
gehen ausschließlich hier durch."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from typing import Any

from ..db import connect, now_iso
from .schemas import (
    ProjectDetail,
    ProjectSummaryRow,
    Progress,
    RecordingOut,
    Segment,
    TranscriptBlock,
    Usage,
)


def new_id() -> str:
    return uuid.uuid4().hex


def recordings_key(recording_ids: list[str]) -> str:
    """Fingerabdruck der Aufnahmen, aus denen eine Zusammenfassung entstand."""
    return hashlib.sha256("|".join(recording_ids).encode()).hexdigest()[:24]


# ── Projekte ──────────────────────────────────────────────────


def create_project(name: str) -> str:
    pid = new_id()
    ts = now_iso()
    with connect() as c:
        c.execute(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (pid, name.strip(), ts, ts),
        )
    return pid


def _row_to_summary(row: sqlite3.Row, ids: list[str]) -> dict[str, Any]:
    has_summary = row["summary_json"] is not None
    return {
        "id": row["id"],
        "name": row["name"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "status": row["status"],
        "recording_count": row["recording_count"],
        "total_duration_s": row["total_duration_s"] or 0.0,
        "has_summary": has_summary,
        "summary_stale": has_summary and row["summary_key"] != recordings_key(ids),
    }


_PROJECT_SELECT = """
SELECT p.*,
       (SELECT COUNT(*) FROM recordings r WHERE r.project_id = p.id) AS recording_count,
       (SELECT COALESCE(SUM(duration_s), 0) FROM recordings r WHERE r.project_id = p.id) AS total_duration_s
FROM projects p
"""


def _recording_ids(c: sqlite3.Connection, project_id: str) -> list[str]:
    return [
        r["id"]
        for r in c.execute(
            "SELECT id FROM recordings WHERE project_id = ? ORDER BY position, created_at", (project_id,)
        )
    ]


def list_projects() -> list[ProjectSummaryRow]:
    with connect() as c:
        rows = c.execute(_PROJECT_SELECT + " ORDER BY p.updated_at DESC").fetchall()
        return [ProjectSummaryRow(**_row_to_summary(r, _recording_ids(c, r["id"]))) for r in rows]


def project_exists(project_id: str) -> bool:
    with connect() as c:
        return c.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone() is not None


def get_project_status(project_id: str) -> str | None:
    with connect() as c:
        row = c.execute("SELECT status FROM projects WHERE id = ?", (project_id,)).fetchone()
        return row["status"] if row else None


def get_project(project_id: str) -> ProjectDetail | None:
    with connect() as c:
        row = c.execute(_PROJECT_SELECT + " WHERE p.id = ?", (project_id,)).fetchone()
        if not row:
            return None
        recs = _list_recordings(c, project_id)
        base = _row_to_summary(row, [r.id for r in recs])
        usage = c.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(prompt_tokens),0) AS pt, COALESCE(SUM(completion_tokens),0) AS ct,"
            " SUM(cost_usd) AS cost FROM llm_calls WHERE project_id = ?",
            (project_id,),
        ).fetchone()
        return ProjectDetail(
            **base,
            progress=Progress(**json.loads(row["progress_json"])) if row["progress_json"] else None,
            error=row["error"],
            summary=json.loads(row["summary_json"]) if row["summary_json"] else None,
            summary_at=row["summary_at"],
            recordings=recs,
            usage=Usage(
                calls=usage["n"],
                prompt_tokens=usage["pt"],
                completion_tokens=usage["ct"],
                cost_usd=usage["cost"],
            ),
        )


def rename_project(project_id: str, name: str) -> None:
    with connect() as c:
        c.execute("UPDATE projects SET name = ?, updated_at = ? WHERE id = ?", (name.strip(), now_iso(), project_id))


def delete_project(project_id: str) -> list[str]:
    """Löscht das Projekt und gibt die Dateipfade seiner Aufnahmen zurück."""
    with connect() as c:
        paths = [r["file_path"] for r in c.execute("SELECT file_path FROM recordings WHERE project_id = ?", (project_id,))]
        c.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        return paths


def touch_project(project_id: str, c: sqlite3.Connection | None = None) -> None:
    """Änderung an den Aufnahmen: Zeitstempel neu; ein fertiges oder
    fehlgeschlagenes Projekt wartet wieder auf Verarbeitung."""
    sql = (
        "UPDATE projects SET updated_at = ?,"
        " status = CASE WHEN status IN ('fertig','fehler') THEN 'wartet' ELSE status END,"
        " error = CASE WHEN status IN ('fertig','fehler') THEN NULL ELSE error END"
        " WHERE id = ?"
    )
    if c is not None:
        c.execute(sql, (now_iso(), project_id))
    else:
        with connect() as conn:
            conn.execute(sql, (now_iso(), project_id))


def set_status(
    project_id: str,
    status: str,
    progress: Progress | None = None,
    error: str | None = None,
) -> None:
    with connect() as c:
        c.execute(
            "UPDATE projects SET status = ?, progress_json = ?, error = ? WHERE id = ?",
            (status, progress.model_dump_json() if progress else None, error, project_id),
        )


def claim_for_processing(project_id: str) -> bool:
    """Setzt das Projekt atomar auf 'transkribiert'. False, wenn es schon läuft."""
    with connect() as c:
        cur = c.execute(
            "UPDATE projects SET status = 'transkribiert', error = NULL, progress_json = ?"
            " WHERE id = ? AND status NOT IN ('transkribiert','analysiert','zusammenfassung')",
            (Progress(step="warteschlange", detail="In der Warteschlange").model_dump_json(), project_id),
        )
        return cur.rowcount == 1


def save_summary(project_id: str, summary: dict[str, Any], key: str) -> None:
    ts = now_iso()
    with connect() as c:
        c.execute(
            "UPDATE projects SET summary_json = ?, summary_key = ?, summary_at = ?, status = 'fertig',"
            " progress_json = NULL, error = NULL, updated_at = ? WHERE id = ?",
            (json.dumps(summary, ensure_ascii=False), key, ts, ts, project_id),
        )


def reset_interrupted() -> int:
    """Nach einem Neustart: laufende Verarbeitungen gelten als abgebrochen."""
    with connect() as c:
        cur = c.execute(
            "UPDATE projects SET status = 'fehler', progress_json = NULL,"
            " error = 'Der Server wurde während der Verarbeitung neu gestartet. Erneut starten – fertige Schritte bleiben erhalten.'"
            " WHERE status IN ('transkribiert','analysiert','zusammenfassung')"
        )
        return cur.rowcount


# ── Aufnahmen ─────────────────────────────────────────────────


def _rec_from_row(r: sqlite3.Row) -> RecordingOut:
    return RecordingOut(
        id=r["id"],
        project_id=r["project_id"],
        filename=r["filename"],
        mime=r["mime"],
        source=r["source"],
        duration_s=r["duration_s"],
        size_bytes=r["size_bytes"],
        created_at=r["created_at"],
        position=r["position"],
        status=r["status"],
        error=r["error"],
        has_transcript=r["transcript_json"] is not None,
    )


def _list_recordings(c: sqlite3.Connection, project_id: str) -> list[RecordingOut]:
    rows = c.execute(
        "SELECT * FROM recordings WHERE project_id = ? ORDER BY position, created_at", (project_id,)
    ).fetchall()
    return [_rec_from_row(r) for r in rows]


def list_recordings(project_id: str) -> list[RecordingOut]:
    with connect() as c:
        return _list_recordings(c, project_id)


def add_recording(
    *,
    recording_id: str,
    project_id: str,
    filename: str,
    file_path: str,
    mime: str | None,
    source: str,
    duration_s: float,
    size_bytes: int,
    client_id: str | None = None,
) -> RecordingOut:
    ts = now_iso()
    with connect() as c:
        pos = c.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 AS p FROM recordings WHERE project_id = ?", (project_id,)
        ).fetchone()["p"]
        c.execute(
            "INSERT INTO recordings (id, project_id, filename, file_path, mime, source, duration_s, size_bytes,"
            " created_at, position, client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (recording_id, project_id, filename, file_path, mime, source, duration_s, size_bytes, ts, pos, client_id),
        )
        touch_project(project_id, c)
        row = c.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,)).fetchone()
        return _rec_from_row(row)


def recording_by_client_id(client_id: str) -> RecordingOut | None:
    """Ein wiederholter Upload derselben Aufnahme (gleiche client_id) legt
    keine zweite an."""
    with connect() as c:
        row = c.execute("SELECT * FROM recordings WHERE client_id = ?", (client_id,)).fetchone()
        return _rec_from_row(row) if row else None


def get_recording_row(recording_id: str) -> sqlite3.Row | None:
    with connect() as c:
        return c.execute("SELECT * FROM recordings WHERE id = ?", (recording_id,)).fetchone()


def delete_recording(recording_id: str) -> str | None:
    with connect() as c:
        row = c.execute("SELECT project_id, file_path FROM recordings WHERE id = ?", (recording_id,)).fetchone()
        if not row:
            return None
        c.execute("DELETE FROM recordings WHERE id = ?", (recording_id,))
        touch_project(row["project_id"], c)
        return row["file_path"]


def rename_recording(recording_id: str, filename: str) -> None:
    with connect() as c:
        c.execute("UPDATE recordings SET filename = ? WHERE id = ?", (filename.strip(), recording_id))


def move_recording(recording_id: str, direction: int) -> None:
    """Tauscht die Position mit der Nachbaraufnahme (-1 hoch, +1 runter).
    Die Reihenfolge bestimmt, in welcher Folge die KI die Aufnahmen liest."""
    with connect() as c:
        row = c.execute("SELECT project_id FROM recordings WHERE id = ?", (recording_id,)).fetchone()
        if not row:
            return
        ids = _recording_ids(c, row["project_id"])
        i = ids.index(recording_id)
        j = i + (1 if direction > 0 else -1)
        if j < 0 or j >= len(ids):
            return
        ids[i], ids[j] = ids[j], ids[i]
        for pos, rid in enumerate(ids):
            c.execute("UPDATE recordings SET position = ? WHERE id = ?", (pos, rid))
        touch_project(row["project_id"], c)


def recording_rows_for_project(project_id: str) -> list[sqlite3.Row]:
    with connect() as c:
        return c.execute(
            "SELECT * FROM recordings WHERE project_id = ? ORDER BY position, created_at", (project_id,)
        ).fetchall()


def set_recording_status(recording_id: str, status: str, error: str | None = None) -> None:
    with connect() as c:
        c.execute("UPDATE recordings SET status = ?, error = ? WHERE id = ?", (status, error, recording_id))


def save_transcript(recording_id: str, segments: list[Segment], model: str) -> None:
    with connect() as c:
        c.execute(
            "UPDATE recordings SET transcript_json = ?, transcript_model = ?, transcribed_at = ?,"
            " status = 'transkribiert', error = NULL WHERE id = ?",
            (json.dumps([s.model_dump() for s in segments], ensure_ascii=False), model, now_iso(), recording_id),
        )
        c.execute("DELETE FROM transcript_parts WHERE recording_id = ?", (recording_id,))


def get_transcript_part(recording_id: str, idx: int, model: str) -> list[Segment] | None:
    with connect() as c:
        row = c.execute(
            "SELECT segments_json FROM transcript_parts WHERE recording_id = ? AND idx = ? AND model = ?",
            (recording_id, idx, model),
        ).fetchone()
        return [Segment(**s) for s in json.loads(row["segments_json"])] if row else None


def save_transcript_part(recording_id: str, idx: int, model: str, segments: list[Segment]) -> None:
    with connect() as c:
        c.execute(
            "INSERT OR REPLACE INTO transcript_parts (recording_id, idx, model, segments_json) VALUES (?, ?, ?, ?)",
            (recording_id, idx, model, json.dumps([s.model_dump() for s in segments], ensure_ascii=False)),
        )


def transcripts_for_project(project_id: str) -> list[TranscriptBlock]:
    blocks: list[TranscriptBlock] = []
    for r in recording_rows_for_project(project_id):
        segs = [Segment(**s) for s in json.loads(r["transcript_json"])] if r["transcript_json"] else []
        blocks.append(
            TranscriptBlock(recording_id=r["id"], filename=r["filename"], duration_s=r["duration_s"], segments=segs)
        )
    return blocks


# ── KI-Zwischenspeicher und Verbrauch ─────────────────────────


def cache_get(key: str) -> str | None:
    with connect() as c:
        row = c.execute("SELECT content FROM llm_cache WHERE key = ?", (key,)).fetchone()
        return row["content"] if row else None


def cache_put(key: str, kind: str, content: str) -> None:
    with connect() as c:
        c.execute(
            "INSERT OR REPLACE INTO llm_cache (key, kind, content, created_at) VALUES (?, ?, ?, ?)",
            (key, kind, content, now_iso()),
        )


def log_llm_call(
    project_id: str | None,
    kind: str,
    model: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    cost_usd: float | None,
) -> None:
    with connect() as c:
        c.execute(
            "INSERT INTO llm_calls (project_id, kind, model, prompt_tokens, completion_tokens, cost_usd, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (project_id, kind, model, prompt_tokens, completion_tokens, cost_usd, now_iso()),
        )
