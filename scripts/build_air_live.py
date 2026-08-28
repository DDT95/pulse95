#!/usr/bin/env python3
"""Extrait les mesures horaires du Val-d'Oise depuis le fichier national
« temps réel » LCSQA/INERIS (data.gouv.fr), sans clé ni inscription.

Usage : build_air_live.py <csv_du_jour> <data/air-stations.json> <sortie>

Le fichier source couvre toute la France pour une journée ; ce script ne
conserve que les stations listées dans air-stations.json (réseau AIRPARIF,
Val-d'Oise) et, pour chacune, la dernière valeur disponible par polluant.

Ce n'est PAS l'indice ATMO officiel : celui-ci est calculé quotidiennement
par polluant à l'échelle de la commune/EPCI à partir d'une modélisation
(cf. atmo-france.org/article/lindice-atmo), pas d'une simple lecture de
station. Les valeurs ici sont les concentrations horaires mesurées brutes.
"""
import csv, json, sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Seuils indicatifs OMS 2021 (lignes directrices mondiales sur la qualité de
# l'air, moyenne 24 h, µg/m3) : PM2.5 15, PM10 45, NO2 25. Utilisés uniquement
# pour situer une valeur horaire, pas pour calculer un indice réglementaire.
WHO_24H_GUIDELINE = {"PM2.5": 15, "PM10": 45, "NO2": 25}

def main():
    csv_path, stations_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    stations = json.loads(Path(stations_path).read_text())["stations"]
    by_code = {s["code"]: s for s in stations}
    wanted = set(by_code)

    latest = defaultdict(dict)  # code -> pollutant -> row
    with open(csv_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f, delimiter=";"):
            code = row.get("code site")
            if code not in wanted:
                continue
            pollutant = row.get("Polluant")
            value = row.get("valeur", "").strip()
            if not pollutant or not value:
                continue
            start = row.get("Date de début", "")
            prev = latest[code].get(pollutant)
            if prev is None or start > prev["start"]:
                latest[code][pollutant] = {
                    "start": start,
                    "value": float(value),
                    "unit": row.get("unité de mesure", "µg-m3"),
                    "quality": row.get("code qualité"),
                }

    stations_out = []
    for code, pollutants in latest.items():
        s = by_code[code]
        readings = {}
        for pollutant, r in pollutants.items():
            readings[pollutant] = {
                "value": r["value"],
                "unit": r["unit"],
                "hour": r["start"],
                "validated": r["quality"] == "A",
                "whoGuideline24h": WHO_24H_GUIDELINE.get(pollutant),
            }
        stations_out.append({
            "code": code, "name": s["name"], "lat": s["lat"], "lon": s["lon"],
            "readings": readings,
        })

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": "LCSQA/INERIS · réseau AIRPARIF · data.gouv.fr, moyennes horaires temps réel",
        "note": "Concentrations horaires brutes, pas l'indice ATMO officiel (quotidien, modélisé à l'échelle communale).",
        "stations": stations_out,
    }
    Path(out_path).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(stations_out)} station(s) air Val-d'Oise")

if __name__ == "__main__":
    main()
