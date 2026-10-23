#!/usr/bin/env python3
"""Baut beide Fassungen des Rezeptbuchs aus einer Quelle.

Aufruf (aus dem Repo-Wurzelverzeichnis):
    python3 rezeptbuch/tools/bauen.py [--rezepte <ordner-mit-json-dateien>]

Eingaben:
    quelle/app.css, quelle/rahmen.html, quelle/app.js — die App
    daten/zutaten.json, daten/regeln.json             — Nährwerte, Preise, Regeln
    daten/rezepte.json                                — Rezepte für die Offline-App

--rezepte liest einen Datenbank-Export (ein JSON je Rezept, z. B. von
ArtifactData list mit out_dir) und schreibt ihn vorher nach daten/rezepte.json.

Ausgaben:
    rezeptbuch.html       — Online-Fassung (claude.ai-Artifact, Daten aus der Artifact-Datenbank)
    index.html            — Offline-Fassung (Handy-App, Rezepte eingebettet)
    sw.js                 — Service Worker; Cache-Name hängt am Inhalt, Updates kommen von selbst
    manifest.webmanifest  — App-Manifest
"""
import hashlib
import json
import sys
from datetime import date
from pathlib import Path

BASIS = Path(__file__).resolve().parent.parent
Q, D = BASIS / "quelle", BASIS / "daten"
TITEL = "Protein-Rezeptbuch"
BESCHREIBUNG = "Proteinreiche Rezepte mit wenig Aufwand und kleinem Preis – warm und kalt, offline nutzbar."
SCHRIFTEN = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
             '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
             '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Abril+Fatface'
             '&family=Archivo:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">')
# Hexwerte nur hier, weil Manifest und Meta-Tags keine CSS-Variablen lesen (aus design/tokens.css).
NACHT, ELFENBEIN = "#0E0F11", "#F4EEE3"


def lies(p):
    return p.read_text(encoding="utf-8")


def ohne_meta(d):
    return {k: v for k, v in d.items() if not k.startswith("_")}


def daten_skript(daten):
    roh = json.dumps(daten, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    return f"<script>window.RB_DATEN={roh};</script>"


def rezepte_aus_export(ordner):
    rezepte = []
    for datei in sorted(Path(ordner).rglob("*.json")):
        r = json.loads(lies(datei))
        if r.get("titel") and r.get("werte"):
            r.setdefault("id", datei.stem)
            rezepte.append(r)
    (D / "rezepte.json").write_text(json.dumps(rezepte, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"daten/rezepte.json  {len(rezepte)} Rezepte aus {ordner}")


def main():
    if "--rezepte" in sys.argv:
        rezepte_aus_export(sys.argv[sys.argv.index("--rezepte") + 1])
    css, rahmen, js = lies(Q / "app.css"), lies(Q / "rahmen.html"), lies(Q / "app.js")
    zutaten = ohne_meta(json.loads(lies(D / "zutaten.json")))
    regeln = ohne_meta(json.loads(lies(D / "regeln.json")))
    rezepte = json.loads(lies(D / "rezepte.json"))

    online = "\n".join([
        f"<title>{TITEL}</title>", SCHRIFTEN, f"<style>\n{css}</style>", rahmen,
        daten_skript({"zutaten": zutaten, "regeln": regeln, "rezepte": None, "stand": None}),
        f"<script>\n{js}</script>", ""])
    (BASIS / "rezeptbuch.html").write_text(online, encoding="utf-8")

    stand = date.today().isoformat()
    offline = "\n".join([
        "<!doctype html>", '<html lang="de">', "<head>", '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
        f"<title>{TITEL}</title>", f'<meta name="description" content="{BESCHREIBUNG}">',
        f'<meta name="theme-color" content="{ELFENBEIN}" media="(prefers-color-scheme: light)">',
        f'<meta name="theme-color" content="{NACHT}" media="(prefers-color-scheme: dark)">',
        '<link rel="manifest" href="manifest.webmanifest">',
        '<link rel="icon" href="assets/icons/icon-192.png" sizes="192x192" type="image/png">',
        '<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">',
        '<meta name="apple-mobile-web-app-capable" content="yes">', '<meta name="mobile-web-app-capable" content="yes">',
        '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
        '<meta name="apple-mobile-web-app-title" content="Rezepte">',
        SCHRIFTEN, f"<style>\n{css}body{{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}\n</style>",
        "</head>", "<body>", rahmen,
        daten_skript({"zutaten": zutaten, "regeln": regeln, "rezepte": rezepte, "stand": stand}),
        f"<script>\n{js}</script>",
        "<script>if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>",
        "</body>", "</html>", ""])
    (BASIS / "index.html").write_text(offline, encoding="utf-8")

    manifest = {
        "name": TITEL, "short_name": "Rezepte", "description": BESCHREIBUNG, "lang": "de", "dir": "ltr",
        "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
        "background_color": NACHT, "theme_color": NACHT, "categories": ["food", "lifestyle"],
        "icons": [
            {"src": "assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
            {"src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
            {"src": "assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        ],
    }
    (BASIS / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    fassung = hashlib.sha256((offline + json.dumps(manifest)).encode()).hexdigest()[:10]
    (BASIS / "sw.js").write_text(lies(Q / "sw.vorlage.js").replace("__FASSUNG__", fassung), encoding="utf-8")
    print(f"rezeptbuch.html  {len(online) // 1024} KB · index.html  {len(offline) // 1024} KB · "
          f"{len(rezepte)} Rezepte · Stand {stand} · Cache rezeptbuch-{fassung}")


if __name__ == "__main__":
    main()
