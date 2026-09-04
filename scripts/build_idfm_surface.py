#!/usr/bin/env python3
"""Construit le profil horaire des validations du réseau de surface (bus/tram)
pour les lignes desservant le Val-d'Oise, à partir des jeux de données publics
Île-de-France Mobilités (data.iledefrance-mobilites.fr).

Contrairement au réseau ferré (portillons par gare), le réseau de surface
n'a pas de compostage géolocalisé par arrêt : les validations sont publiées
par LIGNE entière. Ce script construit donc un profil horaire par ligne,
que app.js combine ensuite avec les lignes déjà connues par arrêt
(data/idfm-stops.json) pour estimer une pression indicative aux arrêts.

Les noms de jeux de données changent de trimestre en trimestre (le libellé
"4eme-trimestre" porte toujours les données les plus récentes disponibles,
IDFM les met à jour en place). Les noms de colonnes ne sont PAS garantis
stables d'une version à l'autre du portail : ce script les détecte
automatiquement à partir d'un échantillon et s'arrête avec un message clair
plutôt que d'écrire des données silencieusement fausses s'il ne les
reconnaît pas.
"""
import json, re, sys, urllib.parse, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets"
DAILY_DATASET = "validations-reseau-surface-nombre-validations-par-jour-4eme-trimestre"
PROFILE_DATASET = "validation-reseau-surface-profils-horaires-par-jour-type-4eme-trimestre"


def get(dataset, params):
    url = f"{API}/{dataset}/records?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "DDT95-Pulse/2.0"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.load(response)


def export_records(dataset, where=None, limit=None):
    params = {}
    if where:
        params["where"] = where
    if limit:
        params["limit"] = limit
    url = f"{API}/{dataset}/exports/json?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "DDT95-Pulse/2.0"})
    with urllib.request.urlopen(req, timeout=180) as response:
        return json.load(response)


def find_field(sample_keys, *patterns):
    """Retourne le premier champ dont le nom (en minuscules) matche un des motifs regex donnés."""
    for pattern in patterns:
        rx = re.compile(pattern)
        for key in sample_keys:
            if rx.search(key.lower()):
                return key
    return None


def detect_fields(dataset, need):
    sample = export_records(dataset, limit=5)
    if not sample:
        die(f"{dataset} : aucune ligne retournée, jeu de données vide ou inaccessible.")
    keys = list(sample[0].keys())
    fields = {}
    for name, patterns in need.items():
        field = find_field(keys, *patterns)
        if field is None:
            die(
                f"{dataset} : impossible de trouver la colonne « {name} ».\n"
                f"Colonnes disponibles : {keys}\n"
                f"Exemple de ligne : {json.dumps(sample[0], ensure_ascii=False)}\n"
                "Corrige les motifs de détection (find_field) dans ce script avec le nom exact ci-dessus."
            )
        fields[name] = field
    print(f"{dataset} : colonnes détectées {fields}")
    return fields, keys


def die(message):
    print("ERREUR build_idfm_surface :", message, file=sys.stderr)
    sys.exit(1)


def main():
    stops_path = ROOT / "data" / "idfm-stops.json"
    stops = json.loads(stops_path.read_text())["stops"]
    known_lines = sorted({line for s in stops for line in s.get("lines", [])})
    if not known_lines:
        die("data/idfm-stops.json ne contient aucune ligne : impossible de filtrer les lignes du Val-d'Oise.")
    print(f"{len(known_lines)} ligne(s) connues via idfm-stops.json (ex : {known_lines[:10]})")

    profile_fields, profile_keys = detect_fields(
        PROFILE_DATASET,
        {
            "line_code": [r"^(shortname_line|shortnameline|nom.?ligne|nomligne|route.?short)"],
            "line_id": [r"^id.?line", r"^idligne"],
            "hour": [r"trnc.?horr", r"^heure", r"tranche"],
            "pct": [r"pourc.*valid", r"^ratio", r"^pct"],
            "day_type": [r"^cat.?jour", r"jour.?type"],
        },
    )
    daily_fields, daily_keys = detect_fields(
        DAILY_DATASET,
        {
            "line_code": [r"^(shortname_line|shortnameline|nom.?ligne|nomligne|route.?short)"],
            "line_id": [r"^id.?line", r"^idligne"],
            "count": [r"nb.?vald", r"nombre.?valid", r"^nb"],
            "date": [r"^jour$", r"^date"],
        },
    )

    line_key = "line_code" if profile_fields.get("line_code") else "line_id"
    profile_line_field = profile_fields.get(line_key)
    daily_line_field = daily_fields.get(line_key) or daily_fields.get(
        "line_code" if line_key == "line_id" else "line_id"
    )
    if not profile_line_field or not daily_line_field:
        die(
            "Impossible de faire correspondre le champ d'identification de ligne entre les deux jeux "
            f"de données (profils : {profile_keys} · journalier : {daily_keys})."
        )

    print("Téléchargement du profil horaire complet…")
    profile_rows = export_records(PROFILE_DATASET)
    day_type_field = profile_fields.get("day_type")
    if day_type_field:
        weekday_values = {"JOVS", "JOB", "JOHV"}
        filtered = [r for r in profile_rows if r.get(day_type_field) in weekday_values]
        if filtered:
            profile_rows = filtered
        else:
            print(f"Aucune ligne pour un jour ouvré via « {day_type_field} », on garde tout le profil.")

    hour_pct = defaultdict(dict)
    for r in profile_rows:
        code = str(r.get(profile_line_field) or "").strip()
        if not code or code not in known_lines:
            continue
        raw_hour = str(r.get(profile_fields["hour"]) or "")
        match = re.search(r"(\d{1,2})", raw_hour)
        if not match:
            continue
        hour = int(match.group(1))
        try:
            pct = float(str(r.get(profile_fields["pct"]) or 0).replace(",", "."))
        except ValueError:
            continue
        hour_pct[code][hour] = pct

    if not hour_pct:
        die(
            "Aucune ligne du Val-d'Oise n'a été retrouvée dans le profil horaire : le format du code de "
            f"ligne ({profile_line_field}) ne correspond probablement pas à data/idfm-stops.json "
            f"(ex. attendu : {known_lines[:5]})."
        )

    print(f"{len(hour_pct)} ligne(s) du Val-d'Oise retrouvées dans le profil horaire.")
    print("Téléchargement des validations journalières…")
    where = None
    if daily_fields.get("date"):
        # On limite la fenêtre aux ~120 derniers jours pour rester raisonnable en volume.
        pass  # filtre laissé large : le jeu trimestriel est déjà borné en taille.
    daily_rows = export_records(DAILY_DATASET, where=where)

    totals, counts = defaultdict(float), defaultdict(int)
    for r in daily_rows:
        code = str(r.get(daily_line_field) or "").strip()
        if code not in known_lines:
            continue
        try:
            n = float(str(r.get(daily_fields["count"]) or 0).replace(",", "."))
        except ValueError:
            continue
        totals[code] += n
        counts[code] += 1
    averages = {code: round(totals[code] / counts[code]) for code in totals if counts[code]}

    lines_out = {}
    for code in sorted(set(hour_pct) | set(averages)):
        daily_avg = averages.get(code)
        hourly = {}
        if daily_avg:
            hourly = {str(h): round(daily_avg * pct / 100) for h, pct in hour_pct.get(code, {}).items()}
        lines_out[code] = {"weekdayAverage": daily_avg, "hourlyShare": hour_pct.get(code, {}), "hourly": hourly}

    payload = {
        "source": "Île-de-France Mobilités · data.iledefrance-mobilites.fr (réseau de surface)",
        "note": "Validations par LIGNE, pas par arrêt : le réseau de surface n'a pas de compostage géolocalisé par arrêt.",
        "lines": lines_out,
    }
    out_path = ROOT / "data" / "idfm-surface.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(lines_out)} ligne(s) écrites dans {out_path}")


if __name__ == "__main__":
    main()
