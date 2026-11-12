"""Einzelteile ohne HTTP: JSON-Lesen, Pakete, OpenRouter-Fehlerbehandlung."""

from __future__ import annotations

import httpx
import pytest


def test_lies_json_mit_codezaun_und_text():
    from backend.services.summarizer import lies_json

    assert lies_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert lies_json('Hier: {"a": 2} fertig') == {"a": 2}


def test_normalisiere_fuellt_nichts_auf():
    from backend.services.summarizer import LISTEN, normalisiere

    n = normalisiere({"ueberblick": "x"})
    assert n["ueberblick"] == "x" and n["themen"] == []
    assert all(n[k] == [] for k in LISTEN)
    n = normalisiere({"fakten": "ein einzelner String", "erkenntnisse": [None, "", {"text": " "}, "ok"]})
    assert n["fakten"] == [{"text": "ein einzelner String", "quelle": ""}]
    assert n["erkenntnisse"] == [{"text": "ok", "quelle": ""}]


def test_packe_wiederholt_kopf_als_fortsetzung():
    from backend.models.schemas import Segment, TranscriptBlock
    from backend.services.summarizer import als_text, packe, transkript_zeilen

    segs = [Segment(start=i * 50, end=i * 50 + 50, text="wort " * 60) for i in range(10)]
    zeilen = transkript_zeilen([TranscriptBlock(recording_id="r", filename="a.mp3", duration_s=500, segments=segs)])
    pakete = packe(zeilen, 200)
    assert len(pakete) > 1
    assert "(Fortsetzung)" in als_text(pakete[1])
    assert "[00:00:50]" in als_text(pakete[0]) or "[00:00:50]" in als_text(pakete[1])


class _Antworten:
    """Spielt eine Folge von HTTP-Antworten ab."""

    def __init__(self, folge):
        self.folge = list(folge)
        self.bodies = []

    def __call__(self, request: httpx.Request):
        import json

        self.bodies.append(json.loads(request.content))
        status, body = self.folge.pop(0)
        return httpx.Response(status, json=body)


@pytest.fixture()
def openrouter(monkeypatch):
    from backend.services import openrouter as mod

    def baue(folge):
        ant = _Antworten(folge)
        echt = httpx.Client

        monkeypatch.setattr(mod.httpx, "Client", lambda **kw: echt(transport=httpx.MockTransport(ant), **kw))
        monkeypatch.setattr(mod.OpenRouterClient, "_warte", staticmethod(lambda *a, **k: None))
        return mod.OpenRouterClient(), ant

    return baue


OK = {"choices": [{"message": {"content": '{"x":1}'}, "finish_reason": "stop"}],
      "model": "deepseek/deepseek-v4.1-flash", "usage": {"prompt_tokens": 10, "completion_tokens": 5, "cost": 0.00001}}


def test_openrouter_wiederholt_bei_429_und_500(openrouter):
    c, ant = openrouter([(429, {"error": {"message": "rate"}}), (502, {}), (200, OK)])
    comp = c.complete("s", "u", json_mode=True, kind="final", project_id=None)
    assert comp.text == '{"x":1}' and comp.cost_usd == 0.00001
    assert len(ant.bodies) == 3
    from backend.config import get_settings

    assert ant.bodies[0]["model"] == get_settings().openrouter_model
    assert ant.bodies[0]["response_format"] == {"type": "json_object"}


def test_openrouter_bricht_bei_401_sofort_ab(openrouter):
    from backend.services.openrouter import LLMError

    c, ant = openrouter([(401, {"error": {"message": "bad key"}})])
    with pytest.raises(LLMError, match="ungültig"):
        c.complete("s", "u", json_mode=False, kind="final", project_id=None)
    assert len(ant.bodies) == 1


def test_openrouter_ohne_json_modus_zweiter_versuch(openrouter):
    c, ant = openrouter([(400, {"error": {"message": "response_format not supported"}}), (200, OK)])
    c.complete("s", "u", json_mode=True, kind="final", project_id=None)
    assert "response_format" not in ant.bodies[1]


def test_openrouter_abgeschnittene_antwort(openrouter):
    from backend.services.openrouter import LLMError

    cut = {**OK, "choices": [{"message": {"content": '{"x":'}, "finish_reason": "length"}]}
    c, _ = openrouter([(200, cut)])
    with pytest.raises(LLMError, match="abgeschnitten"):
        c.complete("s", "u", json_mode=True, kind="final", project_id=None)


def test_openrouter_gibt_nach_allen_versuchen_auf(openrouter):
    from backend.services.openrouter import LLMError

    c, ant = openrouter([(503, {})] * 3)
    with pytest.raises(LLMError, match="nicht erreichbar"):
        c.complete("s", "u", json_mode=False, kind="final", project_id=None)
