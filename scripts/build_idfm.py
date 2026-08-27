#!/usr/bin/env python3
"""Construit le jeu Pulse 95 à partir des API publiques IDFM (T4 2025)."""
import csv, io, json, subprocess, urllib.parse, urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets"

def get(dataset, params):
    url = f"{API}/{dataset}/records?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent":"DDT95-Pulse/2.0"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.load(response)

zones = get("zones-d-arrets", {
    "select":"zdcid,zdaname,zdatown,zdaxepsg2154,zdayepsg2154",
    "where":"startswith(zdapostalregion, '95') and zdatype='railStation'",
    "limit":100,
})["results"]
ids = sorted({str(z["zdcid"]) for z in zones})
where_ids = "id_zdc in (" + ",".join(ids) + ")"

def export_records(dataset, where):
    url=f"{API}/{dataset}/exports/json?"+urllib.parse.urlencode({"where":where})
    req=urllib.request.Request(url,headers={"User-Agent":"DDT95-Pulse/2.0"})
    with urllib.request.urlopen(req,timeout=180) as response: return json.load(response)

daily = export_records(
    "validations-reseau-ferre-nombre-validations-par-jour-4eme-trimestre",
    where_ids,
)
profiles = export_records(
    "validations-reseau-ferre-profils-horaires-par-jour-type-4eme-trimestre",
    where_ids + " and cat_jour='JOVS'",
)

by_day=defaultdict(lambda:defaultdict(int))
names={}
for r in daily:
    d=date.fromisoformat(r["jour"][:10])
    if d.weekday()<5:
        sid=str(int(r["id_zdc"])); by_day[sid][d.isoformat()]+=int(r.get("nb_vald") or 0); names[sid]=r["libelle_arret"]
averages={sid:round(sum(days.values())/len(days)) for sid,days in by_day.items() if days}
hour_pct=defaultdict(dict)
for r in profiles:
    sid=str(int(r["id_zdc"])); hour=int(r["trnc_horr_60"].split("H")[0]); hour_pct[sid][hour]=float(r["pourcentage_validations"])

xy="\n".join(f'{z["zdaxepsg2154"]} {z["zdayepsg2154"]}' for z in zones)+"\n"
converted=subprocess.run(["cs2cs","EPSG:2154","EPSG:4326","-f","%.7f"],input=xy,text=True,capture_output=True,check=True).stdout.splitlines()
stations=[]
for z,line in zip(zones,converted):
    sid=str(z["zdcid"])
    if sid not in averages: continue
    lon,lat,*_=line.split()
    values={str(h):round(averages[sid]*hour_pct[sid].get(h,0)/100) for h in range(6,24)}
    stations.append({"id":sid,"name":names.get(sid,z["zdaname"]),"town":z["zdatown"],"lat":float(lat),"lon":float(lon),"weekdayAverage":averages[sid],"hourly":values})

payload={"source":"Île-de-France Mobilités · PRIM","period":"4e trimestre 2025","dayType":"Jour ouvré hors vacances scolaires","stations":sorted(stations,key=lambda x:x["weekdayAverage"],reverse=True)}
(ROOT/"data").mkdir(exist_ok=True)
(ROOT/"data"/"idfm-validations.json").write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":"))+"\n")
print(f"{len(stations)} gares · {sum(s['weekdayAverage'] for s in stations):,} validations/jour ouvré moyen")
