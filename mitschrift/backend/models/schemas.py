"""Was die API nach außen gibt und annimmt."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ProjectStatus = Literal["wartet", "transkribiert", "analysiert", "zusammenfassung", "fertig", "fehler"]
RecordingStatus = Literal["gespeichert", "transkribiert", "fehler"]

# Status, in denen gerade gearbeitet wird. Solange einer davon gilt, sind
# Änderungen an den Aufnahmen gesperrt.
LAUFEND: frozenset[str] = frozenset({"transkribiert", "analysiert", "zusammenfassung"})


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ProjectRename(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class Progress(BaseModel):
    step: str
    done: int = 0
    total: int = 0
    detail: str = ""


class Segment(BaseModel):
    start: float
    end: float
    text: str


class RecordingOut(BaseModel):
    id: str
    project_id: str
    filename: str
    mime: str | None
    source: str
    duration_s: float
    size_bytes: int
    created_at: str
    position: int
    status: RecordingStatus
    error: str | None
    has_transcript: bool


class ProjectSummaryRow(BaseModel):
    id: str
    name: str
    created_at: str
    updated_at: str
    status: ProjectStatus
    recording_count: int
    total_duration_s: float
    has_summary: bool
    summary_stale: bool


class Usage(BaseModel):
    calls: int
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float | None


class ProjectDetail(ProjectSummaryRow):
    progress: Progress | None
    error: str | None
    summary: dict[str, Any] | None
    summary_at: str | None
    recordings: list[RecordingOut]
    usage: Usage


class TranscriptBlock(BaseModel):
    recording_id: str
    filename: str
    duration_s: float
    segments: list[Segment]


class LoginIn(BaseModel):
    password: str


class StatusOut(BaseModel):
    auth_required: bool
    authenticated: bool
    llm_ready: bool
    model: str
    whisper_model: str
    max_upload_mb: int
    formats: list[str]
