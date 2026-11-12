"""Attrappen für Whisper und OpenRouter – für Tests und den Demo-Server."""

from __future__ import annotations

import json


class FakeTranscriber:
    """Liefert pro 15 s Audio einen Satz. Zählt Aufrufe."""

    model_name = "fake-whisper"

    def __init__(self):
        self.calls = 0

    def transcribe(self, wav, offset_s=0.0):
        from backend.models.schemas import Segment
        from backend.services import audio

        self.calls += 1
        d = audio.duration_s(wav)
        segs, t = [], 0.0
        while t < d - 0.5:
            segs.append(Segment(start=round(t + offset_s, 2), end=round(min(t + 15, d) + offset_s, 2),
                                text=f"Satz bei {int(t + offset_s)} Sekunden. Das Budget beträgt 4.200 Euro."))
            t += 15
        return segs


FINAL = {
    "ueberblick": "Besprechung zum Budget.",
    "erkenntnisse": [{"text": "Das Budget beträgt 4.200 Euro.", "quelle": "A1 · 00:00:00"}],
    "themen": [{"titel": "Budget", "punkte": ["Budget 4.200 Euro"], "unterthemen": []}],
    "fakten": ["4.200 Euro"],
    "entscheidungen": [],
    "aufgaben": [{"aufgabe": "Angebot einholen", "verantwortlich": "Jana"}],
    "offene_fragen": [],
    "widersprueche": [],
    "unklar": [],
}


class FakeLLM:
    model_name = "fake/llm"

    def __init__(self):
        self.calls: list[tuple[str, str]] = []
        self.fail_next = 0

    def complete(self, system, user, *, json_mode, kind, project_id):
        from backend.models import repo
        from backend.services.openrouter import Completion, LLMError

        if self.fail_next:
            self.fail_next -= 1
            raise LLMError("OpenRouter nicht erreichbar (Test).")
        self.calls.append((kind, user))
        repo.log_llm_call(project_id, kind, self.model_name, len(user) // 4, 100, 0.0001)
        if kind == "final":
            text = "```json\n" + json.dumps(FINAL, ensure_ascii=False) + "\n```"
        else:
            text = f"## Notizen\n- {len(user)} Zeichen verdichtet (A1 · 00:00:00)"
        return Completion(text=text, model=self.model_name, prompt_tokens=len(user) // 4,
                          completion_tokens=100, cost_usd=0.0001)


