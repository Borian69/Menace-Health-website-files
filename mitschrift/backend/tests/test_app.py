"""Ende-zu-Ende über die HTTP-API: Upload, Projekte, Verarbeitung,
Wiederaufnahme, Neustart."""

from __future__ import annotations

import pytest

from .conftest import CODECS, make_audio


def neues_projekt(client, name="Testprojekt") -> str:
    r = client.post("/api/projects", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def lade_hoch(client, pid, pfad, **form):
    with open(pfad, "rb") as f:
        return client.post(
            f"/api/projects/{pid}/recordings",
            files=[("parts", (pfad.name, f, "application/octet-stream"))],
            data=form,
        )


def verarbeite(client, pid):
    from backend.services import pipeline

    r = client.post(f"/api/projects/{pid}/process")
    assert r.status_code == 202, r.text
    pipeline.wait_idle()
    return client.get(f"/api/projects/{pid}").json()


@pytest.mark.parametrize("fmt", sorted(CODECS))
def test_upload_alle_formate(client, audio_dir, fmt):
    pid = neues_projekt(client, f"Format {fmt}")
    r = lade_hoch(client, pid, make_audio(audio_dir, fmt))
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["filename"].endswith(f".{fmt}")
    assert 2.5 < rec["duration_s"] < 3.6, rec["duration_s"]
    assert rec["size_bytes"] > 0
    assert rec["status"] == "gespeichert"
    # abspielbar, mit Range-Unterstützung (iOS Safari braucht das)
    a = client.get(f"/api/recordings/{rec['id']}/audio", headers={"Range": "bytes=0-99"})
    assert a.status_code == 206 and len(a.content) == 100


def test_upload_abgelehnt(client, audio_dir, tmp_path):
    pid = neues_projekt(client)
    txt = tmp_path / "notiz.txt"
    txt.write_text("kein audio")
    assert lade_hoch(client, pid, txt).status_code == 415
    falsch = tmp_path / "kaputt.mp3"
    falsch.write_bytes(b"\x00" * 2048)
    assert lade_hoch(client, pid, falsch).status_code in (415, 422)
    assert client.get(f"/api/projects/{pid}").json()["recording_count"] == 0


def test_mehrere_aufnahmen_ein_projekt(client, audio_dir):
    pid = neues_projekt(client)
    for fmt in ("mp3", "m4a", "webm"):
        assert lade_hoch(client, pid, make_audio(audio_dir, fmt)).status_code == 201
    p = client.get(f"/api/projects/{pid}").json()
    assert p["recording_count"] == 3
    assert 8 < p["total_duration_s"] < 10.5
    assert [r["position"] for r in p["recordings"]] == [0, 1, 2]
    zeile = next(x for x in client.get("/api/projects").json() if x["id"] == pid)
    assert zeile["recording_count"] == 3 and zeile["status"] == "wartet"


def test_teilstuecke_werden_eine_aufnahme(client, audio_dir):
    """Eine unterbrochene Browser-Aufnahme kommt in mehreren Teilen an."""
    pid = neues_projekt(client)
    a, b = make_audio(audio_dir, "webm", 3), make_audio(audio_dir, "webm", 2, 660)
    with open(a, "rb") as fa, open(b, "rb") as fb:
        r = client.post(
            f"/api/projects/{pid}/recordings",
            files=[("parts", ("t1.webm", fa, "audio/webm")), ("parts", ("t2.webm", fb, "audio/webm"))],
            data={"filename": "Gespräch", "source": "aufnahme", "client_id": "sitzung-1"},
        )
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["source"] == "aufnahme" and rec["filename"] == "Gespräch"
    assert 4.5 < rec["duration_s"] < 5.6


def test_wiederholter_upload_keine_dublette(client, audio_dir):
    pid = neues_projekt(client)
    f = make_audio(audio_dir, "ogg")
    r1 = lade_hoch(client, pid, f, client_id="abc-123")
    r2 = lade_hoch(client, pid, f, client_id="abc-123")
    assert r1.json()["id"] == r2.json()["id"]
    assert client.get(f"/api/projects/{pid}").json()["recording_count"] == 1


def test_verarbeitung_komplett(client, fakes, audio_dir):
    transcriber, llm = fakes
    pid = neues_projekt(client)
    lade_hoch(client, pid, make_audio(audio_dir, "wav", 40))
    lade_hoch(client, pid, make_audio(audio_dir, "mp3", 20))
    p = verarbeite(client, pid)
    assert p["status"] == "fertig", p["error"]
    s = p["summary"]
    assert s["ueberblick"] == "Besprechung zum Budget."
    # normalisiert: Strings werden Einträge, alte Feldnamen werden übernommen
    assert s["themen"][0]["punkte"][0] == {"text": "Budget 4.200 Euro", "quelle": ""}
    assert s["aufgaben"][0] == {"text": "Angebot einholen", "quelle": "", "wer": "Jana", "bis": ""}
    assert s["entscheidungen"] == [] and s["_meta"]["verfahren"] == "einstufig"
    assert [k for k, _ in llm.calls] == ["final"]
    # beide Aufnahmen im Prompt, unterscheidbar
    assert "=== A1 ·" in llm.calls[0][1] and "=== A2 ·" in llm.calls[0][1]
    assert p["usage"]["calls"] == 1
    assert all(r["status"] == "transkribiert" for r in p["recordings"])

    t = client.get(f"/api/projects/{pid}/transcript").json()
    assert len(t) == 2 and t[0]["segments"][0]["start"] == 0
    md = client.get(f"/api/projects/{pid}/export.md").text
    assert "## Überblick" in md and "### A2" in md

    # Nochmal starten ohne Änderung: weder Whisper noch KI erneut
    vorher = transcriber.calls
    p2 = verarbeite(client, pid)
    assert p2["status"] == "fertig"
    assert transcriber.calls == vorher
    assert len(llm.calls) == 1


def test_lange_aufnahme_abschnitte_und_mehrstufig(client, fakes, audio_dir, monkeypatch):
    from backend.config import get_settings

    transcriber, llm = fakes
    s = get_settings()
    monkeypatch.setattr(s, "transcribe_chunk_minutes", 1)
    monkeypatch.setattr(s, "llm_single_pass_tokens", 150)
    monkeypatch.setattr(s, "llm_chunk_tokens", 120)

    pid = neues_projekt(client)
    lade_hoch(client, pid, make_audio(audio_dir, "flac", 150))
    p = verarbeite(client, pid)
    assert p["status"] == "fertig", p["error"]
    assert transcriber.calls == 3  # 150 s in Abschnitten zu 60 s
    segs = client.get(f"/api/projects/{pid}/transcript").json()[0]["segments"]
    starts = [x["start"] for x in segs]
    assert starts == sorted(starts) and max(starts) >= 120  # Zeitstempel über Abschnitte fortlaufend
    kinds = [k for k, _ in llm.calls]
    assert kinds.count("abschnitt") >= 2 and kinds[-1] == "final"
    assert p["summary"]["_meta"]["verfahren"] == "mehrstufig"


def test_fehler_und_wiederaufnahme(client, fakes, audio_dir):
    transcriber, llm = fakes
    pid = neues_projekt(client)
    lade_hoch(client, pid, make_audio(audio_dir, "m4a", 30))
    llm.fail_next = 1
    p = verarbeite(client, pid)
    assert p["status"] == "fehler" and "nicht erreichbar" in p["error"]
    assert p["recordings"][0]["has_transcript"]  # Transkript ist gesichert
    calls_vorher = transcriber.calls

    p = verarbeite(client, pid)
    assert p["status"] == "fertig"
    assert transcriber.calls == calls_vorher  # nicht erneut transkribiert


def test_aenderung_macht_zusammenfassung_veraltet(client, fakes, audio_dir):
    pid = neues_projekt(client)
    r = lade_hoch(client, pid, make_audio(audio_dir, "ogg", 10)).json()
    verarbeite(client, pid)
    lade_hoch(client, pid, make_audio(audio_dir, "webm", 10))
    p = client.get(f"/api/projects/{pid}").json()
    assert p["status"] == "wartet" and p["summary_stale"] and p["summary"]
    # Entfernen der neuen Aufnahme: Zusammenfassung passt wieder
    neu = p["recordings"][1]["id"]
    assert client.delete(f"/api/recordings/{neu}").status_code == 204
    p = client.get(f"/api/projects/{pid}").json()
    assert not p["summary_stale"] and p["recording_count"] == 1
    assert p["recordings"][0]["id"] == r["id"]


def test_umbenennen_verschieben_loeschen(client, audio_dir):
    pid = neues_projekt(client, "Alt")
    assert client.patch(f"/api/projects/{pid}", json={"name": "Neu"}).json()["name"] == "Neu"
    a = lade_hoch(client, pid, make_audio(audio_dir, "mp3")).json()
    b = lade_hoch(client, pid, make_audio(audio_dir, "wav")).json()
    client.patch(f"/api/recordings/{b['id']}", json={"move": -1, "filename": "Zweite"})
    recs = client.get(f"/api/projects/{pid}").json()["recordings"]
    assert [r["id"] for r in recs] == [b["id"], a["id"]] and recs[0]["filename"] == "Zweite"
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert client.get(f"/api/projects/{pid}").status_code == 404
    assert client.get(f"/api/recordings/{a['id']}/audio").status_code == 404


def test_neustart_daten_bleiben_und_unterbrechung_wird_gemeldet(client, fakes, audio_dir):
    from backend.models import repo

    pid = neues_projekt(client, "Bleibt")
    lade_hoch(client, pid, make_audio(audio_dir, "mp3", 10))
    verarbeite(client, pid)
    repo.set_status(pid, "analysiert")  # als wäre der Server mitten drin gestorben

    from fastapi.testclient import TestClient

    from backend.main import app

    with TestClient(app) as neu:  # Lifespan läuft erneut = Neustart
        p = neu.get(f"/api/projects/{pid}").json()
    assert p["status"] == "fehler" and "neu gestartet" in p["error"]
    assert p["summary"]["ueberblick"] and p["recordings"][0]["has_transcript"]


def test_ohne_schluessel_bleiben_transkripte(client, fakes, audio_dir, monkeypatch):
    from backend.config import get_settings

    monkeypatch.setattr(get_settings(), "openrouter_api_key", "")
    pid = neues_projekt(client)
    lade_hoch(client, pid, make_audio(audio_dir, "aac", 10))
    p = verarbeite(client, pid)
    assert p["status"] == "fehler" and "OPENROUTER_API_KEY" in p["error"]
    assert p["recordings"][0]["has_transcript"]


def test_anmeldung(client, monkeypatch):
    from backend.config import get_settings

    monkeypatch.setattr(get_settings(), "app_password", "geheim")
    client.cookies.clear()
    assert client.get("/api/projects").status_code == 401
    assert client.get("/api/status").json() == {**client.get("/api/status").json(), "auth_required": True, "authenticated": False}
    assert client.post("/api/session", json={"password": "falsch"}).status_code == 401
    assert client.post("/api/session", json={"password": "geheim"}).status_code == 200
    assert client.get("/api/projects").status_code == 200
    monkeypatch.setattr(get_settings(), "app_password", "anders")  # Passwortwechsel beendet Sitzungen
    assert client.get("/api/projects").status_code == 401
