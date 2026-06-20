"""
Tunn FastAPI-yta runt spopt-motorn (optimize.py).

Matchar er befintliga stack (FastAPI/React). Frontend anropar /api/plan i
stället för att köra JS-lösaren — samma plan-struktur returneras, så UI:t är
oförändrat. Starta:  uvicorn backend.api:app --reload
"""
from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .optimize import Inputs, consolidation_plan, _synthetic
# from .loaders import load_inputs   # ← skarp data: implementera enligt README

app = FastAPI(title="Skolportfölj — optimeringsmotor (spopt)")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "engine": "spopt"}


@app.get("/api/plan")
def plan(scenario: str = "Befolkningsprognos", year: int = 2035,
         lag_km: float = 2.0, mellan_km: float = 4.0, hog_km: float = 6.0,
         reserve_pct: float = 10.0):
    """Returnerar en konsolideringsplan.

    SKARP VERSION: bygg `inp` ur era uttag för (scenario, year):
        inp = load_inputs(scenario=scenario, year=year)
    där kostnadsmatrisen kommer från DuckDB (vägnätsavstånd), efterfrågan från
    framskrivningen och kapacitet/läge från skolregistret. Här används syntetisk
    data så att endpointen går att testa direkt.
    """
    inp: Inputs = _synthetic()
    inp.radius.update(lag=lag_km, mellan=mellan_km, hog=hog_km)
    result = consolidation_plan(inp, reserve_pct=reserve_pct)
    result["scenario"] = scenario
    result["year"] = year
    return result
