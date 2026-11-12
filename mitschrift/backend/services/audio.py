"""FFmpeg-Aufrufe: Dauer messen, für Whisper vorbereiten, in Abschnitte
teilen, Teilstücke einer Aufnahme zusammensetzen."""

from __future__ import annotations

import json
import logging
import math
import shutil
import subprocess
from pathlib import Path

log = logging.getLogger(__name__)


class AudioError(Exception):
    """Eine Datei ist kein lesbares Audio oder FFmpeg fehlt."""


def _bin(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise AudioError(f"{name} ist nicht installiert.")
    return path


def _run(args: list[str], timeout: float | None = None) -> subprocess.CompletedProcess[str]:
    try:
        res = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as e:
        raise AudioError("FFmpeg hat zu lange gebraucht.") from e
    if res.returncode != 0:
        tail = (res.stderr or "").strip().splitlines()[-3:]
        log.warning("ffmpeg/ffprobe fehlgeschlagen: %s :: %s", " ".join(args[:6]), " | ".join(tail))
        raise AudioError("Die Datei lässt sich nicht als Audio lesen. " + (tail[-1] if tail else ""))
    return res


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def has_audio_stream(path: Path) -> bool:
    res = _run(
        [_bin("ffprobe"), "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "json", str(path)],
        timeout=60,
    )
    return bool(json.loads(res.stdout or "{}").get("streams"))


def duration_s(path: Path) -> float:
    """Dauer in Sekunden. Browser-WebM trägt oft keine Dauer im Kopf; dann
    wird die Datei einmal durchgelesen."""
    res = _run(
        [_bin("ffprobe"), "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
        timeout=60,
    )
    try:
        d = float(json.loads(res.stdout)["format"]["duration"])
        if math.isfinite(d) and d > 0:
            return d
    except (KeyError, ValueError, TypeError):
        pass
    # Durchlesen: letzter Zeitstempel des Audiostroms.
    res = _run(
        [_bin("ffmpeg"), "-hide_banner", "-nostats", "-i", str(path), "-map", "0:a:0", "-f", "null", "-"],
        timeout=1800,
    )
    letzter = 0.0
    for line in res.stderr.splitlines():
        if "time=" in line:
            t = line.split("time=")[-1].split()[0]
            try:
                h, m, s = t.split(":")
                letzter = int(h) * 3600 + int(m) * 60 + float(s)
            except ValueError:
                continue
    return letzter


def to_whisper_wav(src: Path, dst: Path) -> Path:
    """16 kHz, mono, 16 bit – das Format, das Whisper intern ohnehin nutzt.
    Kleiner als das Original-PCM und ohne erneutes Dekodieren pro Abschnitt."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(".tmp.wav")
    _run(
        [_bin("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-i", str(src), "-vn", "-map", "0:a:0",
         "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(tmp)],
        timeout=3600,
    )
    tmp.replace(dst)
    return dst


def split_wav(src: Path, out_dir: Path, chunk_s: float, total_s: float) -> list[tuple[Path, float]]:
    """Teilt eine WAV-Datei in Abschnitte. Gibt (Pfad, Startzeit) zurück.
    Kurze Aufnahmen bleiben ein Stück."""
    if total_s <= chunk_s * 1.15:
        return [(src, 0.0)]
    out_dir.mkdir(parents=True, exist_ok=True)
    teile: list[tuple[Path, float]] = []
    n = math.ceil(total_s / chunk_s)
    for i in range(n):
        start = i * chunk_s
        ziel = out_dir / f"teil-{i:04d}.wav"
        if not ziel.exists():
            tmp = ziel.with_suffix(".tmp.wav")
            _run(
                [_bin("ffmpeg"), "-hide_banner", "-nostdin", "-y", "-ss", f"{start:.3f}", "-t", f"{chunk_s:.3f}",
                 "-i", str(src), "-c:a", "pcm_s16le", str(tmp)],
                timeout=600,
            )
            tmp.replace(ziel)
        teile.append((ziel, start))
    return teile


def concat_to_ogg(parts: list[Path], dst: Path) -> Path:
    """Setzt Teilstücke einer unterbrochenen Aufnahme zu einer Datei zusammen
    (Opus, 48 kbit/s mono: Sprache bleibt verständlich, eine Stunde ≈ 21 MB)."""
    args = [_bin("ffmpeg"), "-hide_banner", "-nostdin", "-y"]
    for p in parts:
        args += ["-i", str(p)]
    inputs = "".join(f"[{i}:a:0]" for i in range(len(parts)))
    args += ["-filter_complex", f"{inputs}concat=n={len(parts)}:v=0:a=1[a]", "-map", "[a]",
             "-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "48k", str(dst)]
    _run(args, timeout=3600)
    return dst
