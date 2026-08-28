#!/usr/bin/env python3
"""Construit data/accidents.json à partir du BAAC (ONISR, data.gouv.fr).

Millésime annuel, pas de flux temps réel : ce script s'exécute manuellement
lorsqu'un nouveau millésime est publié (généralement fin d'année suivante).

Usage : build_accidents.py <Caract_AAAA.csv> <Usagers_AAAA.csv> <sortie> <annee>
"""
import csv, json, sys
from collections import defaultdict
from pathlib import Path

# 1 indemne, 2 tué, 3 blessé hospitalisé, 4 blessé léger (codes BAAC officiels)
GRAV_LABEL = {1: "indemne", 2: "tué", 3: "blessé hospitalisé", 4: "blessé léger"}

def main():
    caract_path, usagers_path, out_path, year = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

    caract = {}
    with open(caract_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=";"):
            if row.get("dep") not in ("95", "095"):
                continue
            lat, lon = row.get("lat", "").replace(",", "."), row.get("long", "").replace(",", ".")
            if not lat or not lon:
                continue
            caract[row["Num_Acc"]] = row

    tally = defaultdict(lambda: {"killed": 0, "hospitalized": 0, "light": 0, "unharmed": 0})
    with open(usagers_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=";"):
            num = row.get("Num_Acc")
            if num not in caract:
                continue
            grav = int(row.get("grav") or 1)
            key = {2: "killed", 3: "hospitalized", 4: "light"}.get(grav, "unharmed")
            tally[num][key] += 1

    features = []
    for num, row in caract.items():
        t = tally[num]
        worst = 2 if t["killed"] else 3 if t["hospitalized"] else 4 if t["light"] else 1
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(row["long"].replace(",", ".")), float(row["lat"].replace(",", "."))]},
            "properties": {
                "id": num,
                "date": f"{row['an']}-{row['mois']}-{row['jour']}",
                "time": row.get("hrmn"),
                "road": row.get("adr") or None,
                "commune": row.get("com"),
                "worstSeverity": worst,
                "worstLabel": GRAV_LABEL[worst],
                "killed": t["killed"],
                "hospitalized": t["hospitalized"],
                "light": t["light"],
                "agglomeration": row.get("agg") == "2",
            },
        })

    payload = {
        "source": "ONISR · BAAC · data.gouv.fr",
        "year": year,
        "count": len(features),
        "type": "FeatureCollection",
        "features": features,
    }
    Path(out_path).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    killed = sum(f["properties"]["killed"] for f in features)
    hosp = sum(f["properties"]["hospitalized"] for f in features)
    print(f"{len(features)} accident(s) corporel(s) {year} dans le 95 · {killed} tué(s) · {hosp} hospitalisé(s)")

if __name__ == "__main__":
    main()
