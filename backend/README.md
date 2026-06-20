# Backend — optimeringsmotor (spopt)

Produktionsmotor för det fullskaliga konsolideringsproblemet (hela Göteborg,
~180 skolor, efterfrågan på områdes-/adressnivå). Python + **spopt** (PySAL),
löst med PuLP/CBC. Körs i backend/batch — **inte** i webbläsaren. Frontend-appens
JS-lösare räcker för showcase men skalar inte och saknar p-center/LSCP.

> Detta är en **referensscaffold**. Den kör på syntetisk data direkt; byt
> loaders mot era riktiga uttag för skarp drift. Inget i `src/` påverkas.

## Snabbstart (rökprov)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/optimize.py          # syntetiskt rökprov — verifierar spopt/CBC
uvicorn backend.api:app --reload    # API på http://127.0.0.1:8000/api/plan
```

## Modellerna (per åldersstadie, med närhetsnorm 2/4/6 km)

| Modell | Optimerar | Svarar på |
|---|---|---|
| **LSCP** | minsta antal skolor som täcker all efterfrågan inom radien | "hur få skolor räcker, med bibehållen närhet?" |
| **kap. p-median** | total elevviktad resväg, givet p skolor + kapacitet | effektivitet |
| **p-center** | längsta resväg någon elev får (minimax) | likvärdighet |

Kör p-median och p-center bredvid varandra → effektivitet-mot-likvärdighet
explicit. `optimize.py` använder LSCP som kärna; p-median/p-center finns
förberedda (avkommentera i `_solve_stage`).

## Data som ska kopplas in (byt loaders)

Bygg en `Inputs` (se `optimize.py`) ur era uttag — en `load_inputs(scenario, year)`:

| Fält | Källa | Form |
|---|---|---|
| `cost_km` | **DuckDB** vägnätsavstånd | matris (nod × skola), km |
| `demand[stadie]` | **framskrivningen** | elever per nod och stadie vid `year`/`scenario` |
| `cap[stadie]` | skolregister (`stageKap`) | platser per skola och stadie |
| `school_meta` | skolregister | namn, läge, årshyra, underhållsskuld, kommunal |

Efterfrågansnoder = primärområden (eller finare adresskluster om ni har dem).
Kostnadsmatrisen är samma som DuckDB-precomputen i appens HANDOFF (avsnitt C) —
en `COPY ... TO parquet`, läs in med `duckdb.sql("SELECT ... FROM 'distances.parquet'")`.

I skarp version ersätts platshållaren i `consolidation_plan` (elever per stängd
skola och stadie) med faktisk härkomst/elevmönster per nod, så omfördelningen
blir verklig — gärna driven av skolvalsmodellen (`choice.js`-motsvarigheten).

## Koppling till frontend

`/api/plan` returnerar **samma struktur** som appens `plan` (`closures` med
`reassign`, `savedKr`, `maxKm` …). I `src/App.jsx` kan `planConsolidation(...)`
bytas mot ett `fetch('/api/plan?...')` när backend finns — UI:t är oförändrat.
Behåll JS-lösaren som offline-/showcase-fallback.
