"""Projekte: anlegen, auflisten, umbenennen, löschen, verarbeiten, exportieren."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from ..models import repo
from ..models.schemas import (
    LAUFEND,
    ProjectCreate,
    ProjectDetail,
    ProjectRename,
    ProjectSummaryRow,
    TranscriptBlock,
)
from ..services import pipeline, storage
from ..services.summarizer import zeit

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projekte"])


def _project_or_404(project_id: str) -> ProjectDetail:
    p = repo.get_project(project_id)
    if not p:
        raise HTTPException(404, "Projekt nicht gefunden.")
    return p


@router.get("", response_model=list[ProjectSummaryRow])
def list_projects():
    return repo.list_projects()


@router.post("", response_model=ProjectDetail, status_code=201)
def create_project(body: ProjectCreate):
    pid = repo.create_project(body.name)
    log.info("Projekt angelegt: %s (%s)", body.name, pid)
    return _project_or_404(pid)


@router.get("/{project_id}", response_model=ProjectDetail)
def get_project(project_id: str):
    return _project_or_404(project_id)


@router.patch("/{project_id}", response_model=ProjectDetail)
def rename_project(project_id: str, body: ProjectRename):
    _project_or_404(project_id)
    repo.rename_project(project_id, body.name)
    return _project_or_404(project_id)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str):
    p = _project_or_404(project_id)
    if p.status in LAUFEND:
        raise HTTPException(409, "Das Projekt wird gerade verarbeitet. Bitte warten, bis es fertig ist.")
    for rel in repo.delete_project(project_id):
        storage.loesche(rel)
    storage.loesche_projektordner(project_id)
    log.info("Projekt gelöscht: %s", project_id)


@router.post("/{project_id}/process", response_model=ProjectDetail, status_code=202)
def process_project(project_id: str):
    p = _project_or_404(project_id)
    if not p.recordings:
        raise HTTPException(400, "Das Projekt enthält noch keine Aufnahmen.")
    if not pipeline.enqueue(project_id):
        raise HTTPException(409, "Das Projekt wird bereits verarbeitet.")
    log.info("Verarbeitung angefordert: %s (%d Aufnahmen)", project_id, len(p.recordings))
    return _project_or_404(project_id)


@router.get("/{project_id}/transcript", response_model=list[TranscriptBlock])
def get_transcript(project_id: str):
    _project_or_404(project_id)
    return repo.transcripts_for_project(project_id)


@router.get("/{project_id}/export.md", response_class=PlainTextResponse)
def export_markdown(project_id: str):
    """Zusammenfassung und Transkript als Markdown – zum Weitergeben oder Archivieren."""
    p = _project_or_404(project_id)
    out: list[str] = [f"# {p.name}", ""]
    s = p.summary or {}
    if s:
        if s.get("ueberblick"):
            out += ["## Überblick", "", s["ueberblick"], ""]

        def liste(titel: str, key: str) -> None:
            items = s.get(key) or []
            if not items:
                return
            out.extend([f"## {titel}", ""])
            for e in items:
                extra = []
                if e.get("wer"):
                    extra.append(f"wer: {e['wer']}")
                if e.get("bis"):
                    extra.append(f"bis: {e['bis']}")
                if e.get("quelle"):
                    extra.append(e["quelle"])
                out.append(f"- {e['text']}" + (f" _({'; '.join(extra)})_" if extra else ""))
            out.append("")

        liste("Wichtigste Erkenntnisse", "erkenntnisse")
        if s.get("themen"):
            out += ["## Themen", ""]
            for th in s["themen"]:
                out += [f"### {th['titel']}", ""]
                out += [f"- {e['text']}" + (f" _({e['quelle']})_" if e.get("quelle") else "") for e in th["punkte"]]
                for u in th.get("unterthemen", []):
                    out += ["", f"#### {u['titel']}", ""]
                    out += [f"- {e['text']}" + (f" _({e['quelle']})_" if e.get("quelle") else "") for e in u["punkte"]]
                out.append("")
        liste("Fakten, Zahlen, Fachbegriffe", "fakten")
        liste("Entscheidungen und Ergebnisse", "entscheidungen")
        liste("Aufgaben", "aufgaben")
        liste("Offene Fragen", "offene_fragen")
        liste("Widersprüche", "widersprueche")
        liste("Unklare Stellen", "unklar")
    out += ["## Transkript", ""]
    for i, b in enumerate(repo.transcripts_for_project(project_id), start=1):
        out += [f"### A{i} · {b.filename} ({zeit(b.duration_s)})", ""]
        out += [f"[{zeit(seg.start)}] {seg.text}" for seg in b.segments] or ["_(noch nicht transkribiert)_"]
        out.append("")
    return PlainTextResponse("\n".join(out), media_type="text/markdown; charset=utf-8")
