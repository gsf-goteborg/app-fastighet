# -*- coding: utf-8 -*-
"""
PROJEKTFIL → src/data/generated/projekt.json

Läser fastighets projektfil (data/projektfil_mall.csv — byts mot skarpt uttag
i samma format, se data/projektfil_README.md), validerar enligt reglerna i
README:n och skriver appens datalager. Nybyggnader utan enhet_id får
stadsområde/mellanområde från närmaste skola (proxy tills geokoppling finns).

Kör:  python scripts/build_projekt.py [sökväg-till-csv]
"""
from __future__ import annotations

import csv
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = ROOT / "data" / "projektfil_mall.csv"
DEST = ROOT / "src" / "data" / "generated" / "projekt.json"

ATGARDER = {"nybyggnad", "tillbyggnad", "renovering", "paviljong", "ersattning", "avveckling"}
STATUS = {"beslutad", "planerad", "utredning"}
KVARTAL = re.compile(r"^(\d{4})Q([1-4])$")


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def kvartal_till_ar(q):
    """'2028Q3' → 2028.5 (kvartalets mitt som decimalår, för jämförelser)."""
    m = KVARTAL.match(q)
    return int(m.group(1)) + (int(m.group(2)) - 0.5) / 4


def num(v, default=0):
    v = (v or "").strip().replace(",", ".")
    return float(v) if v else default


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    schools = json.loads((ROOT / "src" / "data" / "generated" / "schools.json").read_text(encoding="utf-8"))
    by_id = {s["id"]: s for s in schools}

    rows = list(csv.DictReader(src.read_text(encoding="utf-8-sig").splitlines(), delimiter=";"))
    problems, projekt = [], []
    seen_ids = set()

    for i, r in enumerate(rows, start=2):  # rad 2 = första dataraden i filen
        pid = (r.get("projekt_id") or "").strip()
        err = lambda msg: problems.append(f"rad {i} ({pid or 'utan id'}): {msg}")

        if not pid:
            err("saknar projekt_id")
        # samma projekt_id får förekomma flera gånger (etapper) — men varna för exakt dubblett
        key = (pid, (r.get("klart_kvartal") or "").strip())
        if key in seen_ids:
            err("dubblettrad (samma projekt_id + klart_kvartal)")
        seen_ids.add(key)

        atgard = (r.get("atgard") or "").strip().lower()
        status = (r.get("status") or "").strip().lower()
        if atgard not in ATGARDER:
            err(f"okänd atgard '{atgard}' (tillåtna: {', '.join(sorted(ATGARDER))})")
        if status not in STATUS:
            err(f"okänd status '{status}' (tillåtna: {', '.join(sorted(STATUS))})")

        klart = (r.get("klart_kvartal") or "").strip()
        slut = (r.get("slut_kvartal") or "").strip()
        if not KVARTAL.match(klart):
            err(f"klart_kvartal '{klart}' ska vara ÅÅÅÅQ1–4")
            continue
        if atgard == "paviljong" and not slut:
            err("paviljong kräver slut_kvartal")
        if slut and not KVARTAL.match(slut):
            err(f"slut_kvartal '{slut}' ska vara ÅÅÅÅQ1–4")

        delta = {st: int(num(r.get(f"delta_platser_{st}"))) for st in ("lag", "mellan", "hog")}
        if atgard == "avveckling" and any(v > 0 for v in delta.values()):
            err("avveckling ska ha delta ≤ 0")
        if atgard in ("nybyggnad", "tillbyggnad", "paviljong") and any(v < 0 for v in delta.values()):
            err(f"{atgard} ska ha delta ≥ 0")

        enhet = (r.get("enhet_id") or "").strip()
        lat, lng = num(r.get("lat"), None), num(r.get("lng"), None)
        skola = None
        if enhet:
            if not enhet.isdigit() or int(enhet) not in by_id:
                err(f"enhet_id '{enhet}' finns inte i skolregistret")
            else:
                skola = by_id[int(enhet)]
                lat, lng = skola["lat"], skola["lng"]
        elif lat is None or lng is None:
            err("nybyggnad utan enhet_id kräver lat/lng (byggnadscentroid, WGS84)")
            continue

        # område: från enheten, annars närmaste skola som proxy
        if skola is None:
            skola_naermast = min(schools, key=lambda s: haversine_km(lat, lng, s["lat"], s["lng"]))
            stadsomrade, mellanomrade = skola_naermast["stadsomrade"], skola_naermast["mellanomrade"]
        else:
            stadsomrade, mellanomrade = skola["stadsomrade"], skola["mellanomrade"]

        projekt.append({
            "projektId": pid,
            "objekt": (r.get("objekt") or "").strip(),
            "enhetId": int(enhet) if enhet and enhet.isdigit() else None,
            "skolform": (r.get("skolform") or "").strip(),
            "stadier": (r.get("stadier") or "").strip(),
            "atgard": atgard, "status": status,
            "klartAr": kvartal_till_ar(klart), "klartKvartal": klart,
            "slutAr": kvartal_till_ar(slut) if slut and KVARTAL.match(slut) else None,
            "slutKvartal": slut or None,
            "delta": delta,
            "deltaHyraTkr": int(num(r.get("delta_hyra_tkr_ar"))),
            "lat": lat, "lng": lng,
            "stadsomrade": stadsomrade, "mellanomrade": mellanomrade,
            "kommentar": (r.get("planeringsinriktning") or "").strip(),
            "uppdaterad": (r.get("uppdaterad") or "").strip(),
        })

        if all(v == 0 for v in delta.values()) and atgard not in ("renovering",):
            problems.append(f"rad {i} ({pid}): varning — inga delta_platser (avsiktligt?)")

    if problems:
        print(f"{len(problems)} problem i projektfilen:")
        for p in problems:
            print(" -", p)
        hard = [p for p in problems if "varning" not in p]
        if hard:
            print("Avbryter — rätta felen ovan.")
            return 1

    DEST.write_text(json.dumps({"kalla": src.name, "projekt": projekt}, ensure_ascii=False, indent=1), encoding="utf-8")
    besl = [p for p in projekt if p["status"] == "beslutad"]
    print(f"Skrev {DEST.relative_to(ROOT)} — {len(projekt)} projekt ({len(besl)} beslutade, "
          f"{sum(1 for p in projekt if p['status'] == 'planerad')} planerade, "
          f"{sum(1 for p in projekt if p['status'] == 'utredning')} utredning)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
