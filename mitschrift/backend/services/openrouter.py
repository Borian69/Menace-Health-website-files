"""OpenRouter-Anbindung (OpenAI-kompatible Chat-Schnittstelle).

Das Modell und alle Parameter kommen aus `config.py`. Ein anderes Modell
einzusetzen heißt: OPENROUTER_MODEL in `.env` ändern. Sonst nichts.
"""

from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass
from typing import Protocol

import httpx

from ..config import get_settings
from ..models import repo

log = logging.getLogger(__name__)


class LLMError(Exception):
    """Der Aufruf ist endgültig gescheitert. Die Meldung ist für Menschen."""


@dataclass
class Completion:
    text: str
    model: str
    prompt_tokens: int | None
    completion_tokens: int | None
    cost_usd: float | None


class LLMClient(Protocol):
    @property
    def model_name(self) -> str: ...

    def complete(self, system: str, user: str, *, json_mode: bool, kind: str, project_id: str | None) -> Completion: ...


# Diese Antworten lohnen keinen zweiten Versuch.
_ENDGUELTIG = {
    400: "Die Anfrage wurde abgelehnt (400). Ist die Modell-ID richtig?",
    401: "Der OpenRouter-Schlüssel ist ungültig (401).",
    402: "Das OpenRouter-Guthaben reicht nicht (402).",
    403: "OpenRouter hat die Anfrage blockiert (403).",
    404: "Das Modell wurde bei OpenRouter nicht gefunden (404).",
}


class OpenRouterClient:
    def __init__(self) -> None:
        self.s = get_settings()

    @property
    def model_name(self) -> str:
        return self.s.openrouter_model

    def _headers(self) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {self.s.openrouter_api_key}",
            "Content-Type": "application/json",
            "X-Title": self.s.openrouter_app_title,
        }
        if self.s.openrouter_app_url:
            h["HTTP-Referer"] = self.s.openrouter_app_url
        return h

    def complete(self, system: str, user: str, *, json_mode: bool, kind: str, project_id: str | None) -> Completion:
        if not self.s.llm_ready:
            raise LLMError("Kein OpenRouter-Schlüssel hinterlegt (OPENROUTER_API_KEY in .env).")

        body: dict = {
            "model": self.s.openrouter_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "temperature": self.s.openrouter_temperature,
            "max_tokens": self.s.openrouter_max_output_tokens,
            "usage": {"include": True},
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        url = self.s.openrouter_base_url.rstrip("/") + "/chat/completions"
        versuche = max(1, self.s.openrouter_retries)
        letzter_fehler = "unbekannt"

        for versuch in range(1, versuche + 1):
            try:
                with httpx.Client(timeout=httpx.Timeout(self.s.openrouter_timeout_s, connect=20)) as client:
                    r = client.post(url, headers=self._headers(), json=body)
            except httpx.HTTPError as e:
                letzter_fehler = f"Netzwerkfehler: {e.__class__.__name__}"
                log.warning("OpenRouter %s, Versuch %d/%d: %s", kind, versuch, versuche, letzter_fehler)
                self._warte(versuch, versuche)
                continue

            if r.status_code in _ENDGUELTIG:
                detail = _fehlertext(r)
                # Manche Modelle kennen den JSON-Modus nicht: einmal ohne versuchen.
                if r.status_code == 400 and json_mode and "response_format" in detail.lower():
                    log.info("Modell ohne JSON-Modus, erneuter Versuch ohne response_format")
                    body.pop("response_format", None)
                    json_mode = False
                    continue
                raise LLMError(f"{_ENDGUELTIG[r.status_code]} {detail}".strip())

            if r.status_code == 429 or r.status_code >= 500:
                letzter_fehler = f"OpenRouter antwortet mit {r.status_code}"
                log.warning("OpenRouter %s, Versuch %d/%d: %s %s", kind, versuch, versuche, letzter_fehler, _fehlertext(r))
                self._warte(versuch, versuche, r.headers.get("retry-after"))
                continue

            try:
                data = r.json()
            except ValueError:
                letzter_fehler = "Antwort war kein JSON"
                self._warte(versuch, versuche)
                continue

            if "error" in data and not data.get("choices"):
                letzter_fehler = f"OpenRouter-Fehler: {data['error'].get('message', data['error'])}"
                log.warning("OpenRouter %s, Versuch %d/%d: %s", kind, versuch, versuche, letzter_fehler)
                self._warte(versuch, versuche)
                continue

            try:
                choice = data["choices"][0]
                text = choice["message"]["content"] or ""
            except (KeyError, IndexError, TypeError):
                letzter_fehler = "Antwort ohne Inhalt"
                self._warte(versuch, versuche)
                continue

            usage = data.get("usage") or {}
            comp = Completion(
                text=text,
                model=data.get("model", self.s.openrouter_model),
                prompt_tokens=usage.get("prompt_tokens"),
                completion_tokens=usage.get("completion_tokens"),
                cost_usd=usage.get("cost"),
            )
            repo.log_llm_call(project_id, kind, comp.model, comp.prompt_tokens, comp.completion_tokens, comp.cost_usd)
            log.info(
                "OpenRouter %s: %s Token rein, %s raus, %s USD",
                kind, comp.prompt_tokens, comp.completion_tokens, comp.cost_usd,
            )

            if choice.get("finish_reason") == "length":
                raise LLMError(
                    "Die Antwort der KI wurde abgeschnitten. OPENROUTER_MAX_OUTPUT_TOKENS erhöhen "
                    "oder LLM_CHUNK_TOKENS senken."
                )
            if not text.strip():
                letzter_fehler = "Leere Antwort"
                self._warte(versuch, versuche)
                continue
            return comp

        raise LLMError(f"OpenRouter nicht erreichbar nach {versuche} Versuchen ({letzter_fehler}).")

    @staticmethod
    def _warte(versuch: int, versuche: int, retry_after: str | None = None) -> None:
        if versuch >= versuche:
            return
        try:
            pause = float(retry_after) if retry_after else 0.0
        except ValueError:
            pause = 0.0
        pause = max(pause, 2 ** versuch + random.uniform(0, 1))
        time.sleep(min(pause, 60))


def _fehlertext(r: httpx.Response) -> str:
    try:
        err = r.json().get("error", {})
        return str(err.get("message", ""))[:300] if isinstance(err, dict) else str(err)[:300]
    except ValueError:
        return r.text[:300]


_instance: LLMClient | None = None


def get_llm() -> LLMClient:
    global _instance
    if _instance is None:
        _instance = OpenRouterClient()
    return _instance


def set_llm(client: LLMClient | None) -> None:
    """Für Tests: einen anderen Client einsetzen."""
    global _instance
    _instance = client
