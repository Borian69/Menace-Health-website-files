"""SQLite-Zugang. Kein ORM: das Schema ist klein, die Abfragen sind lesbar.

WAL-Modus, damit die Verarbeitung im Hintergrund schreiben kann, während die
Oberfläche liest.
"""

from __future__ import annotations

import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator

from .config import get_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'wartet',
    progress_json TEXT,
    error         TEXT,
    summary_json  TEXT,
    summary_key   TEXT,
    summary_at    TEXT
);

CREATE TABLE IF NOT EXISTS recordings (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename        TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    mime            TEXT,
    source          TEXT NOT NULL DEFAULT 'import',
    duration_s      REAL NOT NULL DEFAULT 0,
    size_bytes      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    position        INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'gespeichert',
    error           TEXT,
    transcript_json TEXT,
    transcript_model TEXT,
    transcribed_at  TEXT,
    client_id       TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS ix_recordings_project ON recordings(project_id, position);

-- Fertige Abschnitte einer laufenden Transkription. Nach einem Abbruch geht
-- es beim nächsten offenen Abschnitt weiter.
CREATE TABLE IF NOT EXISTS transcript_parts (
    recording_id  TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    idx           INTEGER NOT NULL,
    model         TEXT NOT NULL,
    segments_json TEXT NOT NULL,
    PRIMARY KEY (recording_id, idx, model)
);

-- Ergebnisse von KI-Aufrufen, adressiert über den Inhalt (Hash aus Modell,
-- Prompt-Fassung und Eingabe). Gleiche Eingabe = kein neuer Aufruf.
CREATE TABLE IF NOT EXISTS llm_cache (
    key        TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- Jeder tatsächlich bezahlte Aufruf, für die Kostenanzeige.
CREATE TABLE IF NOT EXISTS llm_calls (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        TEXT,
    kind              TEXT NOT NULL,
    model             TEXT NOT NULL,
    prompt_tokens     INTEGER,
    completion_tokens INTEGER,
    cost_usd          REAL,
    created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_llm_calls_project ON llm_calls(project_id);
"""

_init_lock = threading.Lock()
_initialised: set[str] = set()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    path = get_settings().db_path
    conn = sqlite3.connect(path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    key = str(path)
    if key not in _initialised:
        with _init_lock:
            if key not in _initialised:
                conn.execute("PRAGMA journal_mode = WAL")
                conn.executescript(SCHEMA)
                conn.commit()
                _initialised.add(key)
    return conn


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Eine Verbindung pro Vorgang; commit am Ende, rollback bei Fehler."""
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def reset_for_tests() -> None:
    _initialised.clear()
