"""Vom Transkript zur strukturierten Zusammenfassung.

Kurz genug (LLM_SINGLE_PASS_TOKENS): ein Aufruf, direkt das Ergebnis.
Länger: Abschnitte einzeln zu Notizen verdichten, Notizen bei Bedarf
stufenweise zusammenführen, dann ein letzter Aufruf für das Ergebnis.

Jeder Aufruf wird über seinen Inhalt zwischengespeichert. Ein Neustart nach
einem Fehler wiederholt nur, was noch nicht geklappt hat.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from ..config import get_settings
from ..models import repo
from ..models.schemas import TranscriptBlock
from .openrouter import LLMClient, LLMError

log = logging.getLogger(__name__)

PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"

# Abschnitt-Zeitstempel: ein Stempel je ~45 s spart gegenüber einem Stempel
# pro Whisper-Segment etwa ein Drittel der Token.
ABSATZ_SEKUNDEN = 45.0

LISTEN = ("erkenntnisse", "fakten", "entscheidungen", "aufgaben", "offene_fragen", "widersprueche", "unklar")


def _prompt(name: str) -> str:
    return (PROMPT_DIR / f"{name}.md").read_text(encoding="utf-8").strip()


def zeit(sek: float) -> str:
    s = int(max(0, sek))
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


@dataclass
class Zeile:
    kopf: str        # „=== A1 · Dateiname … ===“, für Fortsetzungen wiederholt
    text: str


def transkript_zeilen(blocks: list[TranscriptBlock]) -> list[Zeile]:
    """Alle Aufnahmen als Absätze mit Zeitstempel, Aufnahmen getrennt."""
    zeilen: list[Zeile] = []
    for i, b in enumerate(blocks, start=1):
        kopf = f"=== A{i} · {b.filename} · Dauer {zeit(b.duration_s)} ==="
        if not b.segments:
            zeilen.append(Zeile(kopf, "[keine Sprache erkannt]"))
            continue
        absatz: list[str] = []
        start = b.segments[0].start
        for seg in b.segments:
            if absatz and seg.start - start >= ABSATZ_SEKUNDEN:
                zeilen.append(Zeile(kopf, f"[{zeit(start)}] " + " ".join(absatz)))
                absatz, start = [], seg.start
            absatz.append(seg.text)
        if absatz:
            zeilen.append(Zeile(kopf, f"[{zeit(start)}] " + " ".join(absatz)))
    return zeilen


def als_text(zeilen: list[Zeile]) -> str:
    out: list[str] = []
    letzter = None
    for z in zeilen:
        if z.kopf != letzter:
            if out:
                out.append("")
            out.append(z.kopf)
            letzter = z.kopf
        out.append(z.text)
    return "\n".join(out)


def token_schaetzung(text: str) -> int:
    return int(len(text) / get_settings().llm_chars_per_token) + 1


def packe(zeilen: list[Zeile], max_tokens: int) -> list[list[Zeile]]:
    """Zeilen in Pakete bis max_tokens, an Absatzgrenzen. Ein Paket, das
    mitten in einer Aufnahme beginnt, trägt ihren Kopf als Fortsetzung."""
    pakete: list[list[Zeile]] = []
    aktuell: list[Zeile] = []
    groesse = 0
    for z in zeilen:
        t = token_schaetzung(z.text) + 4
        if aktuell and groesse + t > max_tokens:
            pakete.append(aktuell)
            aktuell, groesse = [], 0
        if not aktuell and pakete and pakete[-1][-1].kopf == z.kopf:
            z = Zeile(z.kopf.replace(" ===", " (Fortsetzung) ==="), z.text)
        aktuell.append(z)
        groesse += t
    if aktuell:
        pakete.append(aktuell)
    return pakete


def gruppiere_texte(texte: list[str], max_tokens: int) -> list[list[str]]:
    gruppen: list[list[str]] = []
    aktuell: list[str] = []
    groesse = 0
    for t in texte:
        n = token_schaetzung(t)
        if aktuell and groesse + n > max_tokens:
            gruppen.append(aktuell)
            aktuell, groesse = [], 0
        aktuell.append(t)
        groesse += n
    if aktuell:
        gruppen.append(aktuell)
    return gruppen


# ── JSON robust lesen ────────────────────────────────────────


def lies_json(text: str) -> dict[str, Any]:
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*", "", t)
    t = re.sub(r"\s*```$", "", t)
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        a, b = t.find("{"), t.rfind("}")
        if a >= 0 and b > a:
            return json.loads(t[a : b + 1])
        raise


def _eintrag(x: Any, mit_aufgabe: bool = False) -> dict[str, str] | None:
    if isinstance(x, str):
        x = {"text": x}
    if not isinstance(x, dict):
        return None
    text = str(x.get("text") or x.get("inhalt") or x.get("aufgabe") or "").strip()
    if not text:
        return None
    e = {"text": text, "quelle": str(x.get("quelle") or "").strip()}
    if mit_aufgabe:
        e["wer"] = str(x.get("wer") or x.get("verantwortlich") or "").strip()
        e["bis"] = str(x.get("bis") or x.get("frist") or "").strip()
    return e


def normalisiere(raw: dict[str, Any]) -> dict[str, Any]:
    """Bringt die Antwort in die feste Form, die die Oberfläche erwartet.
    Fehlende Abschnitte werden leere Listen – nie erfundene Inhalte."""
    out: dict[str, Any] = {"ueberblick": str(raw.get("ueberblick") or "").strip()}
    for k in LISTEN:
        items = raw.get(k) or []
        if not isinstance(items, list):
            items = [items]
        out[k] = [e for e in (_eintrag(x, k == "aufgaben") for x in items) if e]
    themen = []
    for th in raw.get("themen") or []:
        if not isinstance(th, dict):
            continue
        titel = str(th.get("titel") or "").strip()
        punkte = [e for e in (_eintrag(x) for x in th.get("punkte") or []) if e]
        unter = []
        for u in th.get("unterthemen") or []:
            if isinstance(u, dict) and str(u.get("titel") or "").strip():
                unter.append({
                    "titel": str(u["titel"]).strip(),
                    "punkte": [e for e in (_eintrag(x) for x in u.get("punkte") or []) if e],
                })
        if titel or punkte:
            themen.append({"titel": titel, "punkte": punkte, "unterthemen": unter})
    out["themen"] = themen
    return out


# ── Ablauf ───────────────────────────────────────────────────


class Summarizer:
    def __init__(self, llm: LLMClient, project_id: str, on_progress: Callable[[str, int, int, str], None]):
        self.llm = llm
        self.project_id = project_id
        self.on_progress = on_progress
        self.s = get_settings()

    def _key(self, kind: str, system: str, user: str) -> str:
        h = hashlib.sha256()
        for teil in (self.llm.model_name, f"{self.s.openrouter_temperature}", kind, system, user):
            h.update(teil.encode())
            h.update(b"\x00")
        return h.hexdigest()

    def _rufe(self, kind: str, system: str, user: str, json_mode: bool) -> tuple[str, bool]:
        """Gibt (Antwort, aus_cache) zurück."""
        key = self._key(kind, system, user)
        hit = repo.cache_get(key)
        if hit is not None:
            log.info("Cache-Treffer %s (%s…)", kind, key[:10])
            return hit, True
        comp = self.llm.complete(system, user, json_mode=json_mode, kind=kind, project_id=self.project_id)
        if json_mode:
            lies_json(comp.text)  # nur gültiges JSON wird gespeichert
        repo.cache_put(key, kind, comp.text)
        return comp.text, False

    def _final(self, inhalt: str, art: str) -> dict[str, Any]:
        system = _prompt("zusammenfassung")
        user = f"{art}:\n\n{inhalt}"
        try:
            text, _ = self._rufe("final", system, user, json_mode=True)
            return normalisiere(lies_json(text))
        except json.JSONDecodeError:
            # Ein zweiter Versuch mit ausdrücklicher Erinnerung, dann aufgeben.
            log.warning("Zusammenfassung war kein gültiges JSON, zweiter Versuch")
            system2 = system + "\n\nWICHTIG: Deine letzte Antwort war kein gültiges JSON. Nur das JSON-Objekt ausgeben."
            try:
                text, _ = self._rufe("final", system2, user, json_mode=True)
                return normalisiere(lies_json(text))
            except json.JSONDecodeError as e:
                raise LLMError("Die KI hat keine lesbare Zusammenfassung geliefert. Bitte erneut starten.") from e

    def run(self, blocks: list[TranscriptBlock]) -> dict[str, Any]:
        zeilen = transkript_zeilen(blocks)
        if not any(b.segments for b in blocks):
            raise LLMError("In keiner Aufnahme wurde Sprache erkannt – es gibt nichts zusammenzufassen.")
        voll = als_text(zeilen)
        tokens = token_schaetzung(voll)
        log.info("Projekt %s: Transkript ≈ %d Token, %d Aufnahmen", self.project_id, tokens, len(blocks))

        if tokens <= self.s.llm_single_pass_tokens:
            self.on_progress("zusammenfassung", 0, 1, "Ein Aufruf für das gesamte Transkript")
            ergebnis = self._final(voll, "Transkripte")
            ergebnis["_meta"] = {"verfahren": "einstufig", "token_geschaetzt": tokens, "abschnitte": 1}
            return ergebnis

        # Stufe 1: Abschnitte verdichten
        pakete = packe(zeilen, self.s.llm_chunk_tokens)
        notizen: list[str] = []
        for i, paket in enumerate(pakete, start=1):
            self.on_progress("analysiert", i - 1, len(pakete), f"Abschnitt {i} von {len(pakete)} wird verdichtet")
            text, _ = self._rufe("abschnitt", _prompt("abschnitt"), als_text(paket), json_mode=False)
            notizen.append(f"### Abschnitt {i}\n{text.strip()}")
        self.on_progress("analysiert", len(pakete), len(pakete), "Alle Abschnitte verdichtet")

        # Stufe 2: zusammenführen, bis die Notizen in einen Aufruf passen
        stufe = 0
        while token_schaetzung("\n\n".join(notizen)) > self.s.llm_single_pass_tokens and len(notizen) > 1:
            stufe += 1
            gruppen = gruppiere_texte(notizen, self.s.llm_chunk_tokens)
            if len(gruppen) == len(notizen):
                # Jede Notiz allein schon zu groß: paarweise zusammenführen.
                gruppen = [notizen[i : i + 2] for i in range(0, len(notizen), 2)]
            neu: list[str] = []
            for j, g in enumerate(gruppen, start=1):
                self.on_progress("analysiert", j - 1, len(gruppen), f"Notizen zusammenführen, Stufe {stufe}: {j} von {len(gruppen)}")
                text, _ = self._rufe("verdichten", _prompt("verdichten"), "\n\n".join(g), json_mode=False)
                neu.append(text.strip())
            notizen = neu
            if stufe >= 4:
                break

        # Stufe 3: Ergebnis
        self.on_progress("zusammenfassung", 0, 1, "Gesamtzusammenfassung wird erstellt")
        ergebnis = self._final("\n\n".join(notizen), "Verdichtete Notizen aus allen Abschnitten")
        ergebnis["_meta"] = {
            "verfahren": "mehrstufig",
            "token_geschaetzt": tokens,
            "abschnitte": len(pakete),
            "stufen": stufe + 2,
        }
        return ergebnis
