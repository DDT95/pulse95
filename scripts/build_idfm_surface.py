#!/usr/bin/env python3
"""Construit le profil horaire des validations du réseau de surface (bus/tram)
pour les lignes desservant le Val-d'Oise, à partir des jeux de données publics
Île-de-France Mobilités (data.iledefrance-mobilites.fr).

Contrairement au réseau ferré (portillons par gare), le réseau de surface
n'a pas de compostage géolocalisé par arrêt : les validations sont publiées
par LIGNE entière, identifiée par un couple (code_stif_res, code_stif_ligne)
qui n'a rien à voir avec les codes de ligne utilisés dans
data/idfm-stops.json (route_short_name GTFS, ex. "1206", "100", "J").

Ce script construit donc :
1. un profil horaire par ligne à partir du couple code_stif_res/ligne,
2. une table de correspondance vers les codes GTFS connus, à partir du
   « Référentiel des lignes » IDFM (recherche générique : n'importe quel
   champ du référentiel qui contient exactement un code déjà vu dans
   idfm-stops.json est retenu comme correspondance).

Les noms de jeux de données changent de trimestre en trimestre (le libellé
"4eme-trimestre" porte toujours les données les plus récentes disponibles,
IDFM les met à jour en place). Si un champ attendu disparaît ou si la
correspondance échoue, le script s'arrête avec un message clair plutôt que
d'écrire des données silencieusement fausses.
"""
import json, re, sys, urllib.parse, urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets"
DAILY_DATASET = "validations-reseau-surface-nombre-validations-par-jour-4eme-trimestre"
PROFILE_DATASET = "validation-reseau-surface-profils-horaires-par-jour-type-4eme-trimestre"
LINES_REFERENTIAL = "referentiel-des-lignes"


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
    for pattern in patterns:
        rx = re.compile(pattern)
        for key in sample_keys:
            if rx.search(key.lower()):
                return key
    return None


def detect_fields(dataset, need, sample=None):
    sample = sample if sample is not None else export_records(dataset, limit=5)
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
    return fields, keys, sample


def die(message):
    print("ERREUR build_idfm_surface :", message, file=sys.stderr)
    sys.exit(1)


def stif_key(row, res_field, ligne_field):
    res = str(row.get(res_field) or "").strip()
    ligne = str(row.get(ligne_field) or "").strip()
    if not res or not ligne:
        return None
    return (res, ligne)


def build_crosswalk(known_lines):
    """Associe chaque couple (code_stif_res, code_stif_ligne) du référentiel
    des lignes à un code GTFS déjà connu via idfm-stops.json, en cherchant
    ce code dans N'IMPORTE QUEL champ de la ligne du référentiel (le schéma
    exact des colonnes n'étant pas garanti stable)."""
    sample = export_records(LINES_REFERENTIAL, limit=5)
    if not sample:
        die(f"{LINES_REFERENTIAL} : aucune ligne retournée.")
    keys = list(sample[0].keys())
    res_field = find_field(keys, r"^code.?stif.?res")
    ligne_field = find_field(keys, r"^code.?stif.?ligne")
    if not res_field or not ligne_field:
        die(
            f"{LINES_REFERENTIAL} : impossible de trouver code_stif_res / code_stif_ligne.\n"
            f"Colonnes disponibles : {keys}"
        )
    print(f"{LINES_REFERENTIAL} : colonnes détectées res={res_field} ligne={ligne_field}")

    rows = export_records(LINES_REFERENTIAL)
    crosswalk, matched_codes = {}, set()
    for row in rows:
        key = stif_key(row, res_field, ligne_field)
        if not key:
            continue
        for value in row.values():
            v = str(value).strip() if value is not None else ""
            if v in known_lines:
                crosswalk[key] = v
                matched_codes.add(v)
                break
    if not crosswalk:
        die(
            f"{LINES_REFERENTIAL} : aucune correspondance trouvée avec les codes de "
            f"data/idfm-stops.json (ex. attendus : {sorted(known_lines)[:5]}).\n"
            f"Exemple de ligne du référentiel : {json.dumps(rows[0], ensure_ascii=False)}"
        )
    print(f"{len(crosswalk)} correspondance(s) trouvées, {len(matched_codes)} code(s) GTFS distincts couverts.")
    return crosswalk


def main():
    stops_path = ROOT / "data" / "idfm-stops.json"
    stops = json.loads(stops_path.read_text())["stops"]
    known_lines = {line for s in stops for line in s.get("lines", [])}
    if not known_lines:
        die("data/idfm-stops.json ne contient aucune ligne : impossible de filtrer les lignes du Val-d'Oise.")
    print(f"{len(known_lines)} ligne(s) connues via idfm-stops.json (ex : {sorted(known_lines)[:10]})")

    crosswalk = build_crosswalk(known_lines)

    stif_need = {
        "res": [r"^code.?stif.?res"],
        "ligne": [r"^code.?stif.?ligne"],
    }
    profile_fields, profile_keys, profile_sample = detect_fields(
        PROFILE_DATASET,
        {
            **stif_need,
            "hour": [r"trnc.?horr", r"^heure", r"tranche"],
            "pct": [r"pourc.*valid", r"^ratio", r"^pct"],
            "day_type": [r"^cat.?jour", r"jour.?type"],
        },
    )
    daily_fields, daily_keys, daily_sample = detect_fields(
        DAILY_DATASET,
        {
            **stif_need,
            "count": [r"nb.?vald", r"nombre.?valid", r"^nb"],
        },
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
            print(f"Aucune valeur de jour ouvré reconnue via « {day_type_field} », on garde tout le profil.")

    hour_pct = defaultdict(dict)
    for r in profile_rows:
        key = stif_key(r, profile_fields["res"], profile_fields["ligne"])
        code = crosswalk.get(key) if key else None
        if not code:
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
            "Aucune ligne du Val-d'Oise n'a été retrouvée dans le profil horaire malgré la "
            "correspondance du référentiel : vérifier le format de code_stif_res/code_stif_ligne "
            "dans ce jeu de données par rapport au référentiel des lignes."
        )
    print(f"{len(hour_pct)} ligne(s) du Val-d'Oise retrouvées dans le profil horaire.")

    print("Téléchargement des validations journalières…")
    daily_rows = export_records(DAILY_DATASET)
    totals, counts = defaultdict(float), defaultdict(int)
    for r in daily_rows:
        key = stif_key(r, daily_fields["res"], daily_fields["ligne"])
        code = crosswalk.get(key) if key else None
        if not code:
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
