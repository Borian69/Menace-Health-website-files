#!/usr/bin/env python3
"""Prüft Rezepte gegen daten/regeln.json und rechnet Nährwerte und Preis selbst nach.

Aufruf:
    python3 rezeptbuch/tools/pruefen.py <eingabe.json> [--aus <ausgabe.json>] [--extra <zutaten-extra.json>]

Eingabe ist eine Liste von Rezepten. Jede Zutat steht als [zutat_id, gramm] oder
[zutat_id, gramm, "Anzeige"] und muss in daten/zutaten.json oder in der Extra-Datei
stehen (gleiches Format; die Suche im Hintergrund pflegt sie in der App-Datenbank). Fehlt eine
Zutat, bricht die Prüfung für dieses Rezept ab — Nährwerte werden nie geschätzt,
ohne dass der Wert in der Zutatenliste steht.

Die Ausgabe enthält nur bestandene Rezepte, fertig für die Datenbank der App.
Abgelehnte Rezepte stehen mit Grund im Bericht auf stdout.
"""
import json
import sys
from pathlib import Path

BASIS = Path(__file__).resolve().parent.parent / "daten"
ZUTATEN = {k: v for k, v in json.loads((BASIS / "zutaten.json").read_text()).items() if not k.startswith("_")}
REGELN = json.loads((BASIS / "regeln.json").read_text())


def anzeige(zid, gramm, text):
    if text:
        return text
    if gramm == 0:
        return "nach Bedarf"
    z = ZUTATEN[zid]
    if "stueck_g" in z:
        n = gramm / z["stueck_g"]
        if abs(n - round(n)) < 0.15 and round(n) >= 1:
            ein, mehr = z["stueck"].split("|")
            n = round(n)
            return f"{n} {ein if n == 1 else mehr}"
    if gramm >= 1000:
        return f"{gramm / 1000:g} kg".replace(".", ",")
    return f"{gramm:g} g"


def rechne(r):
    port = r["portionen"]
    summe = {"kcal": 0.0, "p": 0.0, "f": 0.0, "kh": 0.0, "eur": 0.0}
    zutaten, fehlend = [], []
    for eintrag in r["zutaten"]:
        zid, gramm = eintrag[0], eintrag[1]
        text = eintrag[2] if len(eintrag) > 2 else None
        z = ZUTATEN.get(zid)
        if not z:
            fehlend.append(zid)
            continue
        for k in ("kcal", "p", "f", "kh"):
            summe[k] += z[k] * gramm / 100
        preis = z["eur_kg"] * gramm / 1000
        summe["eur"] += preis
        zutaten.append({
            "id": zid, "name": z["name"], "menge": anzeige(zid, gramm, text), "gramm": gramm,
            "laden": z["laden"], "basic": bool(z.get("basic")), "preis": round(preis, 2),
            **({"stueck_g": z["stueck_g"], "stueck": z["stueck"]} if "stueck_g" in z else {}),
        })
    if fehlend:
        return None, fehlend
    pro = {k: v / port for k, v in summe.items()}
    pro["eur"] += REGELN["basics_pauschale_eur_portion"]
    kcal = max(pro["kcal"], 1)
    werte = {
        "kcal": round(pro["kcal"]),
        "protein": round(pro["p"], 1),
        "fett": round(pro["f"], 1),
        "kh": round(pro["kh"], 1),
        "protein_anteil": round(pro["p"] * 4 / kcal, 3),
        "preis_portion": round(pro["eur"], 2),
        "preis_30g_protein": round(pro["eur"] / max(pro["p"], 0.1) * 30, 2),
        "zutaten_anzahl": sum(1 for z in zutaten if not z["basic"]),
    }
    tiere = {ZUTATEN[z["id"]].get("tier") for z in zutaten} - {None}
    werte["vegetarisch"] = not tiere
    return (zutaten, werte), None


def pruefe(r, werte):
    g = REGELN
    gruende = []
    if werte["protein"] < g["protein_min_g_portion"]:
        gruende.append(f"nur {werte['protein']} g Protein pro Portion (mind. {g['protein_min_g_portion']})")
    if werte["protein_anteil"] < g["protein_anteil_min"]:
        gruende.append(f"Protein nur {werte['protein_anteil']:.0%} der Kalorien (mind. {g['protein_anteil_min']:.0%})")
    if r["arbeitszeit"] > g["arbeitszeit_max_min"]:
        gruende.append(f"{r['arbeitszeit']} min Arbeitszeit (max. {g['arbeitszeit_max_min']})")
    if r["gesamtzeit"] > g["gesamtzeit_max_min"]:
        gruende.append(f"{r['gesamtzeit']} min Gesamtzeit (max. {g['gesamtzeit_max_min']})")
    if werte["zutaten_anzahl"] > g["zutaten_max"]:
        gruende.append(f"{werte['zutaten_anzahl']} Zutaten (max. {g['zutaten_max']})")
    if r["geraete"] > g["geraete_max"]:
        gruende.append(f"{r['geraete']} Töpfe/Pfannen/Bleche (max. {g['geraete_max']})")
    if werte["preis_portion"] > g["preis_portion_max_eur"]:
        gruende.append(f"{werte['preis_portion']:.2f} € pro Portion (max. {g['preis_portion_max_eur']:.2f})")
    basis = (r.get("sossenbasis") or "").lower()
    if any(v in basis for v in g["sossenbasis_verboten"]):
        gruende.append(f"Soßenbasis „{r['sossenbasis']}“ ist nicht erlaubt")
    q = r.get("quelle")
    if q and q.get("url"):
        if (q.get("bewertung") or 0) < g["bewertung_min"] or (q.get("bewertungen") or 0) < g["bewertungen_anzahl_min"]:
            gruende.append(
                f"Quelle bewertet mit {q.get('bewertung')} bei {q.get('bewertungen')} Stimmen "
                f"(mind. {g['bewertung_min']} bei {g['bewertungen_anzahl_min']})")
    if r["typ"] == "kalt":
        for feld in g["kalt_pflichtfelder"]:
            if r.get("unterwegs", {}).get(feld) in (None, ""):
                gruende.append(f"kaltes Rezept ohne Angabe „{feld}“")
    return gruende


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    if "--extra" in sys.argv:
        extra = json.loads(Path(sys.argv[sys.argv.index("--extra") + 1]).read_text())
        ZUTATEN.update({k: v for k, v in extra.items() if not k.startswith("_") and k not in ZUTATEN})
    eingabe = json.loads(Path(sys.argv[1]).read_text())
    aus = Path(sys.argv[sys.argv.index("--aus") + 1]) if "--aus" in sys.argv else None
    bestanden, abgelehnt = [], []
    for r in eingabe:
        ergebnis, fehlend = rechne(r)
        if fehlend:
            abgelehnt.append((r["id"], [f"Zutat fehlt in zutaten.json: {', '.join(fehlend)}"]))
            continue
        zutaten, werte = ergebnis
        gruende = pruefe(r, werte)
        if gruende:
            abgelehnt.append((r["id"], gruende))
            continue
        fertig = {k: v for k, v in r.items() if k != "zutaten"}
        fertig.update({"zutaten": zutaten, "werte": werte})
        bestanden.append(fertig)
        print(f"OK    {r['id']:<28} {werte['protein']:>5} g P  {werte['kcal']:>4} kcal  "
              f"{werte['protein_anteil']:.0%}  {werte['preis_portion']:.2f} €  "
              f"{werte['preis_30g_protein']:.2f} €/30 g P  {werte['zutaten_anzahl']} Zut.")
    for rid, gruende in abgelehnt:
        print(f"NEIN  {rid:<28} " + " · ".join(gruende))
    print(f"\n{len(bestanden)} bestanden, {len(abgelehnt)} abgelehnt")
    if aus:
        aus.write_text(json.dumps(bestanden, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
