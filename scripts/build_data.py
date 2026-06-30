"""Bygg appens datalager ur data/student_data.xlsx.

Producerar normaliserade JSON-filer i src/data/generated/ som appens datamoduler
(schools.js, prognos.js, origins.js) läser:

  schools.json    – en post per skolenhet (172 kommunala), appens fält + skolform
  befolkning.json – befolkning i skolålder per MELLANOMRÅDE och stadie + trend
                    (härlett ur Elevhistorik 2024–2026 → riktig förändringstakt)
  intake.json     – AREA_INTAKE[mellanområde][school_id] = antal elever (ur Bostadszoner)

Geografin pivoteras till mellanområde (matchar public/geo/mellanomraden.geojson).
Saknade fastighets-/FM-fält (byggnadsår, skick, BTA, internhyra/m², underhållsskuld,
energiklass) syntetiseras deterministiskt per school_id så de är stabila mellan körningar.

Kör: python scripts/build_data.py
"""
import json
import hashlib
import os
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(ROOT, "data", "student_data.xlsx")
OUT = os.path.join(ROOT, "src", "data", "generated")
os.makedirs(OUT, exist_ok=True)

import openpyxl

BASE_YEAR = 2026  # samma som appens BASE_YEAR; senaste året i Elevhistorik

# stadsområdeskod (ur geofilen) → namn (samma som appens AREA_COLORS)
STADS = {1: "Nordost", 2: "Centrum", 3: "Sydväst", 4: "Hisingen"}

STAGE_OF = {0: "lag", 1: "lag", 2: "lag", 3: "lag",
            4: "mellan", 5: "mellan", 6: "mellan",
            7: "hog", 8: "hog", 9: "hog"}


def load():
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    out = {}
    for name in ("Skolor", "Elevhistorik", "Kapacitet", "Lokalkostnad", "Bemanning", "Bostadszoner", "Kandidatsiter"):
        ws = wb[name]
        rows = list(ws.iter_rows(values_only=True))
        hdr = rows[0]
        out[name] = [dict(zip(hdr, r)) for r in rows[1:]]
    return out


def seed(s):
    """Deterministiskt 0..1 ur en sträng."""
    h = hashlib.md5(s.encode("utf-8")).hexdigest()
    return int(h[:8], 16) / 0xFFFFFFFF


def to_dash(span):
    """'F-6' → 'F–6' (en-dash, som appens arskurser)."""
    return span.replace("-", "–")


def num(x, d=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return d


def grades_of(span):
    GR = ["F", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
    lo, hi = span.split("-")
    return GR[GR.index(lo):GR.index(hi) + 1]


def grade_to_int(g):
    return 0 if g in ("F", "0") else int(g)


# ---- STADSOMRÅDE per mellanområde ur geofilen --------------------------------
def stads_by_mellan():
    gj = json.load(open(os.path.join(ROOT, "public", "geo", "mellanomraden.geojson"), encoding="utf-8"))
    out = {}
    for f in gj["features"]:
        p = f["properties"]
        out[p["NAMN"]] = STADS.get(p.get("STADSOMRAD"))
    return out


# ---- Syntetiska FM-fält (deterministiska) ------------------------------------
def synth_fm(school_id, capacity, rent):
    by = 1900 + int(seed(school_id + "by") * 122)            # 1900–2021
    age = BASE_YEAR - by
    last = by + int(seed(school_id + "renov") * max(1, age))  # senaste renovering
    # Skick 1–5: äldre + längesedan renoverat → sämre skick
    wear = (age / 122) * 0.6 + ((BASE_YEAR - last) / 60) * 0.4
    renov = max(1, min(5, round(1 + wear * 4 + (seed(school_id + "w") - 0.5))))
    energi = "ABCDEFG"[max(0, min(6, renov + round(seed(school_id + "e") * 2) - 1))]
    bta = round(capacity * (11 + seed(school_id + "bta") * 5))  # ~11–16 m²/plats
    hyra_per_m2 = round(rent / bta) if bta else 0
    # Underhållsskuld (Mkr) ~ skick × storlek
    skuld = round((renov - 1) * (bta / 1000) * (0.6 + seed(school_id + "s") * 0.8), 1)
    return dict(byggnadsar=by, senasteRenov=last, renovbehov=renov,
                energiklass=energi, bta=bta, hyraPerM2=hyra_per_m2, underhallsskuld=skuld)


def build():
    d = load()
    smap = stads_by_mellan()

    # index per school_id (numeriskt id som motorerna förväntar sig)
    skolor = d["Skolor"]
    idx = {s["school_id"]: i for i, s in enumerate(skolor)}

    # capacity per skola: summa byggnadskapacitet (aktiva), fallback estimated
    cap = defaultdict(float)
    for r in d["Kapacitet"]:
        if str(r.get("status")) == "active":
            cap[r["school_id"]] += num(r["capacity"])

    # internhyra + driftkostnad per skola
    rent = defaultdict(float); facil = defaultdict(float)
    for r in d["Lokalkostnad"]:
        rent[r["school_id"]] += num(r["annual_rent_cost"])
        facil[r["school_id"]] += num(r["annual_facility_cost"])

    # bemanning per skola
    staff = {r["school_id"]: r for r in d["Bemanning"]}

    # elever per skola och år (summa över årskurser), samt per stadie senaste år
    enr = defaultdict(lambda: defaultdict(float))          # [school][year] = total
    enr_stage = defaultdict(lambda: defaultdict(float))    # [school][stage] = total (BASE_YEAR)
    for r in d["Elevhistorik"]:
        y = int(num(r["year"]))
        n = num(r["students"])
        enr[r["school_id"]][y] += n
        if y == BASE_YEAR:
            enr_stage[r["school_id"]][STAGE_OF[grade_to_int(r["grade"])]] += n

    # ---- schools.json --------------------------------------------------------
    schools = []
    for s in skolor:
        sid = s["school_id"]
        capacity = round(cap.get(sid) or num(s["estimated_capacity"]))
        annual_rent = round(rent.get(sid, 0))
        elever = round(enr[sid].get(BASE_YEAR, 0))
        fm = synth_fm(sid, capacity, annual_rent)
        st = staff.get(sid, {})
        schools.append({
            "id": idx[sid],
            "slug": sid,
            "namn": s["Enhetsnamn"],
            "huvudman": "Kommunal",
            "skolform": s["Skolform"],            # Grundskola | Anpassad grundskola
            "stadsomrade": smap.get(s["area_name"]),
            "mellanomrade": s["area_name"],
            "areaCode": int(num(s["area_code"])),
            "arskurser": to_dash(s["grade_span"]),
            "supportedStages": s["supported_stages"],
            "lat": round(num(s["Lat_WGS"]), 6),
            "lng": round(num(s["Long_WGS"]), 6),
            "skolhus": s["Skolhus"],
            "planningProfile": s["planning_profile"],
            "elever": elever,
            "pedKapacitet": capacity,
            "arshyra": annual_rent,
            "driftkostnad": round(facil.get(sid, 0)),
            "staffFte": round(num(st.get("staff_fte")), 1),
            "teachersFte": round(num(st.get("teachers_fte")), 1),
            "staffCost": round(num(st.get("staff_cost"))),
            **fm,
        })

    # ---- befolkning.json (per mellanområde) ----------------------------------
    # Aggregera elevhistoriken per skolans mellanområde och stadie, härled trend.
    area_year_stage = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
    area_by_school = {s["school_id"]: s["area_name"] for s in skolor}
    for r in d["Elevhistorik"]:
        area = area_by_school[r["school_id"]]
        y = int(num(r["year"]))
        stg = STAGE_OF[grade_to_int(r["grade"])]
        area_year_stage[area][y][stg] += num(r["students"])

    befolkning = {}
    years = sorted({int(num(r["year"])) for r in d["Elevhistorik"]})
    y0, y1 = years[0], years[-1]
    for area, ys in area_year_stage.items():
        base = ys.get(y1, {})
        first = ys.get(y0, {})
        tot1 = sum(base.values()); tot0 = sum(first.values())
        span = max(1, y1 - y0)
        trend = (tot1 / tot0) ** (1 / span) - 1 if tot0 > 0 else 0.0
        # Dämpa: en 3-årig elevtrend ska inte extrapoleras orimligt till 2050.
        # Begränsa till ett realistiskt demografiskt band (±2 %/år).
        trend = max(-0.02, min(0.02, trend))
        befolkning[area] = {
            "lag": round(base.get("lag", 0)),
            "mellan": round(base.get("mellan", 0)),
            "hog": round(base.get("hog", 0)),
            "trend": round(trend, 4),
        }

    # ---- intake.json (AREA_INTAKE[mellanområde][school_id-index]) -------------
    # Ur Bostadszoner: elever per (mellanområde, mottagande skola).
    intake = defaultdict(lambda: defaultdict(float))
    for r in d["Bostadszoner"]:
        area = r["area_name"]
        school = r["current_school_id"]
        if school in idx:
            intake[area][str(idx[school])] += num(r["student_count"])
    intake = {a: {sid: round(n) for sid, n in v.items()} for a, v in intake.items()}

    # ---- candidates.json (kandidatsiter för expansion / nybyggnad) ------------
    candidates = []
    for r in d["Kandidatsiter"]:
        candidates.append({
            "id": r["candidate_site_id"],
            "name": r["name"],
            "mellanomrade": r["Mellanområde"].split(" ", 1)[-1] if r.get("Mellanområde") else None,
            "lat": round(num(r["lat"]), 6),
            "lng": round(num(r["lon"]), 6),
            "proposedCapacity": round(num(r["proposed_capacity"])),
            "supportedStages": r["supported_stages"],
            "siteType": r["site_type"],   # expansion | new
        })

    # ---- skriv -----------------------------------------------------------------
    json.dump(schools, open(os.path.join(OUT, "schools.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    json.dump(candidates, open(os.path.join(OUT, "candidates.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    json.dump(befolkning, open(os.path.join(OUT, "befolkning.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    json.dump(intake, open(os.path.join(OUT, "intake.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)

    print(f"schools.json: {len(schools)} skolor")
    print(f"  skolformer: {set(s['skolform'] for s in schools)}")
    print(f"  stadsområden: {sorted(set(s['stadsomrade'] for s in schools))}")
    print(f"  utan stadsområde: {[s['namn'] for s in schools if not s['stadsomrade']]}")
    print(f"befolkning.json: {len(befolkning)} mellanområden (trend {y0}->{y1})")
    sample = list(befolkning.items())[0]
    print(f"  ex: {sample}")
    print(f"intake.json: {len(intake)} områden, {sum(len(v) for v in intake.values())} celler")
    print(f"candidates.json: {len(candidates)} kandidatsiter ({Counter(c['siteType'] for c in candidates)})")
    tot_elever = sum(s["elever"] for s in schools)
    print(f"totalt elever (BASE_YEAR {BASE_YEAR}): {tot_elever}")


if __name__ == "__main__":
    build()
