# -*- coding: utf-8 -*-
"""
FRAMTIDA SKOLNÄT — normativ nätdesign med spopt (PySAL). FAS 1-PROTOTYP.

Svarar på "var BORDE skolorna ligga?" i stället för konsolideringens "vilka av
dagens skolor kan stängas?". Körs som batch (som build_data.py) och skriver
`src/data/generated/natplan.json` som frontend läser statiskt — ingen backend
i drift, GitHub Pages/intern statisk hosting fungerar oförändrat.

Per horisont (2030/2040/2050) och åldersstadie (lag/mellan/hog):

  1. LSCP (okapaciterad)   → TEORETISKT GOLV: minsta antal lägen som täcker
                             all efterfrågan inom stadiets närhetsnorm.
  2. Minsta genomförbara nät (PuLP) → som ovan men varje elev får också PLATS
                             (kapacitet per läge). När kapaciteten inte räcker
                             inom normen redovisas BRISTEN (elever utan plats
                             inom normen även med alla lägen öppna) i stället
                             för att modellen blir ogenomförbar — bristen är
                             ett resultat i sig ("här behövs nya lägen").
  3. Kapaciterad p-median  → BÄSTA PLACERING: givet det antalet, vilka lägen
                             (befintliga skolor + kandidatsiter) minimerar
                             elevviktad total resväg. Formuleras direkt i PuLP
                             med DELBAR tilldelning (ett områdes elever får
                             spridas på flera skolor) — spopts PMedian kräver
                             odelbar tilldelning, vilket inte fungerar när ett
                             mellanområde har fler elever än en enskild skola.

Kandidatlägen = ordinarie grundskolor med kapacitet i stadiet + kandidatsiter
(`candidates.json`). Efterfrågansnoder = dagens skollägen med skolans elever
per stadie, framskrivna med mellanområdets trend (scenariot "Befolknings-
prognos") — elevernas nuvarande skolor är Fas 1-proxyn för var de bor.
(Mellanområdescentroider prövades men är för grova för 2 km-normen: hela
områdets lågstadieelever i en punkt gör kapaciterad täckning ogenomförbar.
Basområdesnivå + vägnätsavstånd är Fas 2-lösningen.)

ÄRLIGHET (Fas 1): avstånd är FÅGELVÄG (samma måttstock som webbappens
optimerare) — byts mot DuckDB-vägnätsmatrisen i Fas 2. Prognos och
kandidatsiter är exempeldata. Resultatet är en metodprototyp, inte ett underlag.

Kör:  pip install -r backend/requirements.txt
      python scripts/build_natplan.py
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

import numpy as np
import pulp
from spopt.locate import LSCP

ROOT = Path(__file__).resolve().parent.parent
GEN = ROOT / "src" / "data" / "generated"

BASE_YEAR = 2026
HORIZONS = [2030, 2040, 2050]
STAGES = ["lag", "mellan", "hog"]
STAGE_RADIUS = {"lag": 2.0, "mellan": 4.0, "hog": 6.0}  # närhetsnorm, km (fågelväg)
STAGE_GRADES = {"lag": ["F", "1", "2", "3"], "mellan": ["4", "5", "6"], "hog": ["7", "8", "9"]}
SPECIAL = re.compile(r"anpassad|resursskola|döv|hörsel", re.IGNORECASE)
CAND_STAGE = {"F-3": "lag", "4-6": "mellan", "7-9": "hog"}

SOLVER = pulp.PULP_CBC_CMD(msg=False)


def haversine_km(lat1, lng1, lat2, lng2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def grades_of(span: str) -> list[str]:
    """Årskurser i ett spann, t.ex. 'F–6' → F,1,…,6 (en-dash som i datan)."""
    order = ["F", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
    lo, hi = span.split("–")
    return order[order.index(lo): order.index(hi) + 1]


def stage_kap(school: dict) -> dict[str, int]:
    """Kapacitet per stadie — samma logik som src/data/schools.js."""
    grades = grades_of(school["arskurser"])
    per_grade = max(1, round(school["pedKapacitet"] / len(grades)))
    return {st: per_grade * sum(g in grades for g in STAGE_GRADES[st]) for st in STAGES}


def load_facilities():
    """Alla möjliga lägen: ordinarie grundskolor + kandidatsiter, med kapacitet per stadie."""
    schools = json.loads((GEN / "schools.json").read_text(encoding="utf-8"))
    cands = json.loads((GEN / "candidates.json").read_text(encoding="utf-8"))

    facilities = []
    for s in schools:
        if s["skolform"] != "Grundskola" or s["hyraPerM2"] <= 0 or SPECIAL.search(s["namn"]):
            continue
        facilities.append({
            "typ": "skola", "id": s["id"], "namn": s["namn"],
            "lat": s["lat"], "lng": s["lng"], "mellanomrade": s["mellanomrade"],
            "kap": stage_kap(s),
        })
    n_schools = len(facilities)

    for c in cands:
        stages = [CAND_STAGE[p] for p in c["supportedStages"].split(",") if p in CAND_STAGE]
        if not stages:
            continue
        weights = {st: len(STAGE_GRADES[st]) for st in stages}
        tot_w = sum(weights.values())
        facilities.append({
            "typ": "kandidat", "id": c["id"], "namn": c["name"],
            "lat": c["lat"], "lng": c["lng"], "mellanomrade": c.get("mellanomrade", ""),
            "siteType": c["siteType"],
            "kap": {st: round(c["proposedCapacity"] * weights.get(st, 0) / tot_w) for st in STAGES},
        })
    return facilities, schools, n_schools


def load_demand(schools):
    """Efterfrågansnoder = dagens ordinarie grundskolors lägen, med skolans
    elever per stadie framskrivna med mellanområdets trend. Fas 1-proxy för
    var eleverna bor — byts mot basområdesbefolkning i Fas 2."""
    bef = json.loads((GEN / "befolkning.json").read_text(encoding="utf-8"))
    nodes = []
    for s in schools:
        if s["skolform"] != "Grundskola" or s["hyraPerM2"] <= 0 or SPECIAL.search(s["namn"]):
            continue
        grades = grades_of(s["arskurser"])
        elever = {st: s["elever"] * sum(g in grades for g in STAGE_GRADES[st]) / len(grades)
                  for st in STAGES}
        nodes.append({
            "area": f"{s['namn']} ({s['mellanomrade']})",
            "lat": s["lat"], "lng": s["lng"],
            "elever": elever,
            "trend": bef.get(s["mellanomrade"], {}).get("trend", 0.0),
        })
    return nodes


def demand_at(node, stage, year):
    return node["elever"][stage] * (1 + node["trend"]) ** (year - BASE_YEAR)


def selected(model) -> list[int]:
    return [i for i, v in enumerate(model.fac_vars) if (v.value() or 0) > 0.5]


def _base_model(sub, dem, cap, radius, with_y):
    """Gemensam kärna: delbar tilldelning x (bara inom normen), slack u för
    elever som inte får plats inom normen, ev. öppna/stäng-variabler y."""
    n_i, n_j = sub.shape
    prob = pulp.LpProblem("natplan", pulp.LpMinimize)
    y = [pulp.LpVariable(f"y{j}", cat="Binary") for j in range(n_j)] if with_y else None
    x = {(i, j): pulp.LpVariable(f"x{i}_{j}", lowBound=0)
         for i in range(n_i) for j in range(n_j) if sub[i, j] <= radius}
    u = [pulp.LpVariable(f"u{i}", lowBound=0) for i in range(n_i)]
    for i in range(n_i):
        prob += pulp.lpSum(v for (ii, _), v in x.items() if ii == i) + u[i] == int(dem[i])
    for j in range(n_j):
        served = pulp.lpSum(v for (_, jj), v in x.items() if jj == j)
        prob += served <= int(cap[j]) * (y[j] if with_y else 1)
    return prob, x, u, y


def min_shortfall(sub, dem, cap, radius):
    """Brist: elever som inte får plats inom normen ens med ALLA lägen öppna."""
    prob, _, u, _ = _base_model(sub, dem, cap, radius, with_y=False)
    prob += pulp.lpSum(u)
    prob.solve(SOLVER)
    return int(round(pulp.value(prob.objective) or 0))


def min_network(sub, dem, cap, radius, brist):
    """Minsta antal öppna lägen som klarar bästa möjliga platstäckning."""
    prob, _, u, y = _base_model(sub, dem, cap, radius, with_y=True)
    prob += pulp.lpSum(u) <= brist + 0.5
    prob += pulp.lpSum(y)
    prob.solve(SOLVER)
    if pulp.LpStatus[prob.status] != "Optimal":
        return None
    return int(round(pulp.value(prob.objective)))


def capacitated_pmedian(sub, dem, cap, p, radius, brist):
    """Bästa placering: välj p lägen, minimera elevviktad total resväg.
    Slack straffas strax över normen så den bara används vid verklig brist.
    Returnerar (valda, meanKm, maxKm)."""
    prob, x, u, y = _base_model(sub, dem, cap, radius, with_y=True)
    prob += pulp.lpSum(u) <= brist + 0.5
    prob += pulp.lpSum(y) <= p
    prob += pulp.lpSum(sub[i, j] * v for (i, j), v in x.items()) \
        + pulp.lpSum(u) * (radius + 0.1)
    prob.solve(SOLVER)
    if pulp.LpStatus[prob.status] != "Optimal":
        return None, None, None
    n_j = sub.shape[1]
    chosen = [j for j in range(n_j) if (y[j].value() or 0) > 0.5]
    tot = w = max_km = 0.0
    for (i, j), v in x.items():
        n = v.value() or 0
        if n > 0.5:
            tot += n * sub[i, j]
            w += n
            max_km = max(max_km, sub[i, j])
    return chosen, (round(tot / w, 2) if w else None), round(max_km, 1)


def solve_stage(nodes, facilities, cost, stage, year):
    """LSCP-golv + kapaciterad LSCP + kapaciterad p-median för ett stadie."""
    radius = STAGE_RADIUS[stage]
    fac_idx = [j for j, f in enumerate(facilities) if f["kap"][stage] > 0]
    dem_all = np.array([demand_at(n, stage, year) for n in nodes])
    node_idx = [i for i in range(len(nodes)) if dem_all[i] >= 0.5]
    if not fac_idx or not node_idx:
        return None

    sub = cost[np.ix_(node_idx, fac_idx)]
    dem = np.rint(dem_all[node_idx]).astype(int)
    cap = np.array([facilities[j]["kap"][stage] for j in fac_idx])

    # Noder som inget läge når inom normen kan aldrig täckas — redovisas, ingår ej
    coverable = (sub <= radius).any(axis=1)
    otackbara = [nodes[node_idx[i]]["area"] for i in range(len(node_idx)) if not coverable[i]]
    keep = np.where(coverable)[0]
    if keep.size == 0:
        return {"idag": len(fac_idx), "golv": None, "minsta": None, "otackbara": otackbara}
    sub, dem = sub[keep], dem[keep]

    # 1) Teoretiskt golv (spopt LSCP): minsta antal lägen som täcker allt inom normen
    golv_model = LSCP.from_cost_matrix(sub, radius).solve(SOLVER)
    golv = len(selected(golv_model))

    # 2) Brist + minsta genomförbara nät (kapacitet, delbar tilldelning)
    brist = min_shortfall(sub, dem, cap, radius)
    minsta = min_network(sub, dem, cap, radius, brist)

    # 3) Bästa placering: kapaciterad p-median med p = minsta
    valda, mean_km, max_km = [], None, None
    if minsta:
        chosen_local, mean_km, max_km = capacitated_pmedian(sub, dem, cap, minsta, radius, brist)
        if chosen_local is not None:
            valda = [fac_idx[j] for j in chosen_local]

    return {
        "idag": sum(1 for j in fac_idx if facilities[j]["typ"] == "skola"),
        "golv": golv, "minsta": minsta, "brist": brist,
        "meanKm": mean_km, "maxKm": max_km,
        "otackbara": otackbara,
        "elever": int(dem.sum()),
        "_valda": valda,
    }


def main():
    facilities, schools, n_schools = load_facilities()
    nodes = load_demand(schools)
    cost = np.array([
        [haversine_km(n["lat"], n["lng"], f["lat"], f["lng"]) for f in facilities]
        for n in nodes
    ])
    print(f"{len(facilities)} lägen ({n_schools} skolor + {len(facilities) - n_schools} kandidatsiter), "
          f"{len(nodes)} efterfrågansnoder (skolvisa elevkluster)")

    out = {
        "scenario": "Befolkningsprognos",
        "metod": "spopt 0.7: LSCP (golv) + kapaciterad LSCP (minsta nät) + kapaciterad p-median (placering), CBC",
        "radier": STAGE_RADIUS,
        "antagande": ("Fågelvägsavstånd (schablon, byts mot vägnät i Fas 2). Efterfrågansnoder = "
                      "dagens skollägen med elever framskrivna per områdestrend (exempelprognos). "
                      "Kandidatsiter är exempeldata."),
        "horisonter": {},
    }

    for year in HORIZONS:
        stadier = {}
        chosen_by_fac: dict[int, list[str]] = {}
        for st in STAGES:
            res = solve_stage(nodes, facilities, cost, st, year)
            if res is None:
                continue
            for j in res.pop("_valda", []):
                chosen_by_fac.setdefault(j, []).append(st)
            stadier[st] = res

        natverk = [
            {"typ": facilities[j]["typ"], "id": facilities[j]["id"], "namn": facilities[j]["namn"],
             "lat": facilities[j]["lat"], "lng": facilities[j]["lng"], "stadier": sts}
            for j, sts in sorted(chosen_by_fac.items())
        ]
        utanfor = [
            {"id": f["id"], "namn": f["namn"], "lat": f["lat"], "lng": f["lng"]}
            for j, f in enumerate(facilities)
            if f["typ"] == "skola" and j not in chosen_by_fac
        ]
        out["horisonter"][str(year)] = {"stadier": stadier, "natverk": natverk, "utanfor": utanfor}
        nya = [n for n in natverk if n["typ"] == "kandidat"]
        print(f"  {year}: nät {len(natverk)} lägen (varav {len(nya)} nya), "
              f"{len(utanfor)} skolor utanför · " +
              " · ".join(f"{st}: golv {stadier[st]['golv']}, minsta {stadier[st]['minsta']}, brist {stadier[st]['brist']}"
                         for st in STAGES if st in stadier))

    dest = GEN / "natplan.json"
    dest.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Skrev {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
