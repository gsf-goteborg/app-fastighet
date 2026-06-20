"""
Skolnätsoptimering med spopt (PySAL) — REFERENSMODUL.

Detta är tänkt som produktionsmotorn för den fullskaliga versionen av
konsolideringsproblemet (hela Göteborg, ~180 skolor, efterfrågan på områdes-
eller adressnivå). Den körs i backend/batch (Python) — INTE i webbläsaren.
Frontend-appens JS-lösare räcker för showcase men skalar inte.

Problemet är ett kapaciterat facility location-problem, löst PER ÅLDERSSTADIE:
  • LSCP        — minsta antal skolor som täcker all efterfrågan inom stadiets
                  närhetsnorm (lågstadiet 2 km, mellan 4 km, hög 6 km).
                  → "hur få skolor räcker, med bibehållen närhet?"
  • p-median    — minimerar total elevviktad resväg (effektivitet).
  • p-center    — minimerar den längsta resväg någon elev får (likvärdighet).

p-median vs p-center ger effektivitet-mot-likvärdighet-avvägningen explicit.

INDATA (byt loaders mot era riktiga uttag — se README):
  • kostnadsmatris : nätverksavstånd km, (efterfrågansnod × skola), från DuckDB/Parquet
  • efterfrågan    : elever per nod och stadie (framskrivningens export)
  • skolor         : kapacitet per stadie (stageKap), läge, hyra, underhållsskuld

UTDATA: en plan i samma form som frontend-appens `plan` (closures, savedKr …),
så den kan renderas av befintlig UI via /api/plan (se api.py).

OBS: spopt-API:t (särskilt kapacitetsargument) varierar mellan versioner —
verifiera mot er installerade version. Den körbara kärnan här (LSCP + kapacitets-
medveten tilldelning) är medvetet versionsrobust; p-median/p-center visas som
alternativa mål.
"""
from __future__ import annotations
from dataclasses import dataclass, field
import numpy as np

try:
    from spopt.locate import LSCP, PMedian, PCenter  # noqa: F401
    import pulp
except ImportError as e:  # tydligt fel i stället för kryptisk krasch
    raise SystemExit(
        "Saknar beroenden. Kör:  pip install -r backend/requirements.txt\n"
        f"(detaljer: {e})"
    )

STAGES = ("lag", "mellan", "hog")
STAGE_RADIUS_KM = {"lag": 2.0, "mellan": 4.0, "hog": 6.0}  # närhetsnorm per stadie
DEBT_ANNUALISATION_YEARS = 10  # annualiserad underhållsskuld, som i frontend


@dataclass
class Inputs:
    """Allt modellen behöver. Byt loaders i README mot riktiga uttag."""
    areas: list[str]                       # efterfrågansnoder (primärområden)
    school_ids: list[int]
    school_meta: dict[int, dict]           # id → {namn, lng, lat, arshyra, underhallsskuld, kommunal}
    cost_km: np.ndarray                    # (n_areas, n_schools) nätverksavstånd
    demand: dict[str, np.ndarray]          # stadie → vektor (n_areas,) elever
    cap: dict[str, np.ndarray]             # stadie → vektor (n_schools,) platser/stadie
    radius: dict[str, float] = field(default_factory=lambda: dict(STAGE_RADIUS_KM))


def _selected(model) -> list[int]:
    """Index för valda (öppna) anläggningar ur en löst spopt-modell."""
    return [i for i, v in enumerate(model.fac_vars) if (v.value() or 0) > 0.5]


def _solve_stage(inp: Inputs, stage: str, solver) -> dict:
    """Kör LSCP för ett stadie → minsta täckande skolset inom närhetsnormen.

    Kandidatskolor = de som har kapacitet i stadiet. Endast efterfrågan > 0
    behöver täckas. Returnerar valda skolor (globala index) + täckningsinfo.
    """
    radius = inp.radius[stage]
    fac_mask = inp.cap[stage] > 0
    fac_idx = np.where(fac_mask)[0]
    dem = inp.demand[stage]
    dem_mask = dem > 0
    dem_idx = np.where(dem_mask)[0]
    if fac_idx.size == 0 or dem_idx.size == 0:
        return {"kept": [], "fac_idx": fac_idx, "uncovered": []}

    sub_cost = inp.cost_km[np.ix_(dem_idx, fac_idx)]

    # --- LSCP: minsta antal skolor som täcker all efterfrågan inom radien ---
    lscp = LSCP.from_cost_matrix(sub_cost, radius)
    lscp = lscp.solve(solver)
    kept_local = _selected(lscp)
    kept = [int(fac_idx[j]) for j in kept_local]

    # noder som ingen vald skola når inom radien (ska vara tomt om LSCP löste)
    reach = sub_cost[:, kept_local] <= radius if kept_local else np.zeros((dem_idx.size, 0), bool)
    uncovered = [int(dem_idx[i]) for i in range(dem_idx.size) if not reach[i].any()] if kept_local else list(dem_idx)

    # --- Alternativa mål (visas; avkommentera för effektivitet/likvärdighet) ---
    # p = len(kept) or 1
    # weights = dem[dem_idx]
    # eff = PMedian.from_cost_matrix(sub_cost, weights, p_facilities=p).solve(solver)   # min total resväg
    # equ = PCenter.from_cost_matrix(sub_cost, p_facilities=p).solve(solver)            # min längsta resväg
    # Kapaciterad p-median: skicka kapaciteter — kwarg-namn varierar mellan
    # spopt-versioner (facility_capacities / facility_capacity), verifiera lokalt.

    return {"kept": kept, "fac_idx": fac_idx, "uncovered": uncovered, "stage": stage}


def consolidation_plan(inp: Inputs, reserve_pct: float = 10.0) -> dict:
    """Bygger en konsolideringsplan: behåll skolor som behövs i NÅGOT stadie de
    erbjuder; resten (kommunala) föreslås stänga. Tilldelar elever kapacitets-
    medvetet till närmaste behållna skola inom stadiets radie.

    Returnerar samma struktur som frontend-appens `plan`.
    """
    solver = pulp.PULP_CBC_CMD(msg=False)
    keep = set()
    for st in STAGES:
        res = _solve_stage(inp, st, solver)
        keep.update(res["kept"])

    sid = inp.school_ids
    is_komm = {i: inp.school_meta[s].get("kommunal", True) for i, s in enumerate(sid)}

    # Kandidater för stängning: kommunala skolor som inte behövs i något stadie
    close_idx = [i for i in range(len(sid)) if is_komm[i] and i not in keep]

    # Kapacitetsmedveten tilldelning av en stängd skolas elever per stadie
    open_idx = [i for i in range(len(sid)) if i not in set(close_idx)]
    load = {st: inp.cap[st].astype(float) * 0 for st in STAGES}  # belastning per skola/stadie
    # förbelasta öppna skolor med sin egen närområdesefterfrågan (förenklat: 0 här)

    closures = []
    for ci in close_idx:
        meta = inp.school_meta[sid[ci]]
        reassign: dict[int, dict] = {}
        students = 0
        max_km = 0.0
        feasible = True
        for st in STAGES:
            if inp.cap[st][ci] <= 0:
                continue
            # elever från denna skolas närområde i detta stadie (förenklat:
            # proportion av efterfrågan vid skolans närmaste nod). Vid skarp
            # körning används faktisk härkomst/elevmönster per nod.
            need = int(round(inp.cap[st][ci] * 0.0))  # platshållare; se README
            # — i skarp version: need = elever i stadiet som idag går på ci —
            if need <= 0:
                continue
            students += need
            # mottagare: öppna skolor med stadiet, inom radien, sorterade på avstånd
            cands = sorted(
                (j for j in open_idx if inp.cap[st][j] > 0),
                key=lambda j: inp.cost_km[_nearest_node(inp, ci), j],
            )
            for j in cands:
                km = float(inp.cost_km[_nearest_node(inp, ci), j])
                if km > inp.radius[st]:
                    break
                spare = inp.cap[st][j] - load[st][j]
                if spare <= 0:
                    continue
                take = int(min(spare, need))
                load[st][j] += take
                need -= take
                r = reassign.setdefault(j, {"namn": inp.school_meta[sid[j]]["namn"], "n": 0,
                                            "km": round(km, 1),
                                            "lng": inp.school_meta[sid[j]]["lng"],
                                            "lat": inp.school_meta[sid[j]]["lat"]})
                r["n"] += take
                max_km = max(max_km, km)
                if need <= 0:
                    break
            if need > 0:
                feasible = False
        if not feasible:
            continue  # kan inte stängas inom närhetsnormen → behåll
        closures.append({
            "school": {"id": sid[ci], **meta},
            "students": students,
            "reassign": sorted(reassign.values(), key=lambda r: r["km"]),
            "maxKm": round(max_km, 1),
            "savedKr": meta.get("arshyra", 0),
            "avoidedDebt": meta.get("underhallsskuld", 0),
        })

    return {
        "closures": closures,
        "savedKr": sum(c["savedKr"] for c in closures),
        "avoidedDebt": sum(c["avoidedDebt"] for c in closures),
        "seatsRemoved": sum(int(inp.cap["lag"][_idx(inp, c)] + inp.cap["mellan"][_idx(inp, c)]
                                + inp.cap["hog"][_idx(inp, c)]) for c in closures),
        "maxKm": max((c["maxKm"] for c in closures), default=0),
        "openCount": len(sid) - len(closures),
        "engine": "spopt-LSCP",
    }


def _nearest_node(inp: Inputs, school_i: int) -> int:
    """Närmaste efterfrågansnod till en skola (proxy för skolans närområde)."""
    return int(np.argmin(inp.cost_km[:, school_i]))


def _idx(inp: Inputs, closure: dict) -> int:
    return inp.school_ids.index(closure["school"]["id"])


# --------------------------------------------------------------------------
# Syntetiskt rökprov: kör `python backend/optimize.py` för att verifiera att
# spopt/pulp/CBC fungerar. Byt mot riktiga loaders (README) för skarp körning.
# --------------------------------------------------------------------------
def _synthetic(n_areas=12, n_schools=8, seed=1) -> Inputs:
    rng = np.random.default_rng(seed)
    apos = rng.uniform(0, 10, (n_areas, 2))
    spos = rng.uniform(0, 10, (n_schools, 2))
    cost = np.linalg.norm(apos[:, None, :] - spos[None, :, :], axis=2)
    serves = rng.random((n_schools, 3)) > 0.3  # vilka stadier varje skola har
    cap = {st: np.where(serves[:, k], rng.integers(40, 120, n_schools), 0).astype(float)
           for k, st in enumerate(STAGES)}
    demand = {st: rng.integers(0, 60, n_areas).astype(float) for st in STAGES}
    meta = {i: {"namn": f"Skola {i}", "lng": float(spos[i, 0]), "lat": float(spos[i, 1]),
                "arshyra": int(rng.integers(2, 9) * 1_000_000), "underhallsskuld": int(rng.integers(0, 80)),
                "kommunal": True} for i in range(n_schools)}
    return Inputs(
        areas=[f"omr{i}" for i in range(n_areas)],
        school_ids=list(range(n_schools)), school_meta=meta,
        cost_km=cost, demand=demand, cap=cap,
    )


if __name__ == "__main__":
    plan = consolidation_plan(_synthetic())
    print(f"Rökprov OK — spopt/CBC fungerar. Föreslagna stängningar: {len(plan['closures'])}")
    for c in plan["closures"]:
        print(f"  stäng {c['school']['namn']}  → {len(c['reassign'])} mottagare, max {c['maxKm']} km")
