#!/usr/bin/env python3
"""Simplifie le flux SIRI Lite GeneralMessage de PRIM (IDFM) en perturbations lisibles.

Entrée : réponse brute JSON de https://prim.iledefrance-mobilites.fr/marketplace/general-message
Sortie : data/idfm-disruptions.json, une liste plate de messages dédupliqués.

Le flux ne porte pas de géométrie (seulement des références de ligne) : il ne
peut donc pas être localisé sur la carte au clic. Il alimente uniquement le
tableau de bord départemental, comme indicateur de contexte.
"""
import json, sys
from datetime import datetime, timezone
from pathlib import Path

def dig(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d

def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]

def main():
    raw_path, out_path = sys.argv[1], sys.argv[2]
    try:
        raw = json.loads(Path(raw_path).read_text())
    except Exception as e:
        Path(out_path).write_text(json.dumps({"generatedAt": None, "count": 0, "messages": [], "error": str(e)}) + "\n")
        print("PRIM : réponse illisible, fichier vide écrit")
        return

    deliveries = as_list(dig(raw, "Siri", "ServiceDelivery", "GeneralMessageDelivery"))
    messages, seen = [], set()
    for delivery in deliveries:
        for info in as_list(delivery.get("InfoMessage")):
            try:
                content_msgs = as_list(dig(info, "Content", "Message"))
                text = " ".join(
                    (m.get("MessageText") or {}).get("value", "").strip()
                    for m in content_msgs if isinstance(m, dict)
                ).strip()
                if not text:
                    continue
                line_refs = sorted({
                    l.get("value") for l in as_list(dig(info, "Content", "LineRef"))
                    if isinstance(l, dict) and l.get("value")
                })
                key = (text, tuple(line_refs))
                if key in seen:
                    continue
                seen.add(key)
                messages.append({
                    "id": dig(info, "InfoMessageIdentifier", "value") or dig(info, "ItemIdentifier", "value"),
                    "recordedAt": info.get("RecordedAtTime"),
                    "lines": line_refs,
                    "text": text,
                })
            except Exception:
                continue

    messages.sort(key=lambda m: m.get("recordedAt") or "", reverse=True)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "count": len(messages),
        "messages": messages[:80],
    }
    Path(out_path).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"{len(messages)} message(s) PRIM/IDFM")

if __name__ == "__main__":
    main()
