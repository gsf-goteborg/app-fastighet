import { BASE_YEAR } from '../data/schools'
import { BEFOLKNING, STAGE_KEYS, schoolStages, PARTICIPATION } from '../data/prognos'
import { AREA_INTAKE } from '../data/origins'

/* ===========================================================================
   Befolkningsbaserad elevframskrivning.

   buildProjector(schools) bygger en projektor som, för en given skola och ett
   givet år, skattar elevtalet underifrån:

     pop(område, stadie, år) = befolkning_basår × (1 + områdets takt)^(år−basår)
     elever som genereras     = pop × deltagandegrad (PARTICIPATION)
     fördelning på skola       = flödesmatris ur observerat elevmönster
     skolans prognos           = Σ över område×stadie  ×  basårskalibrering

   Flödesmatrisen byggs ur den OBSERVERADE elevhärkomsten (data/origins.js):
   för varje primärområde och stadie fördelas områdets elever på de skolor som
   tar emot stadiet, i proportion till hur många elever skolan faktiskt drar
   från området idag. Det är alltså uppmätt mönster, inte en modellgissning.

   Basårskalibreringen skalar varje skola så att modellen i basåret återger
   skolans faktiska elevtal exakt — prognosen utgår från dagens verklighet och
   rör sig därifrån enligt demografin.
=========================================================================== */
export function buildProjector(schools, baseYear = BASE_YEAR) {
  const areas = Object.keys(BEFOLKNING)
  const stagesBySchool = new Map(schools.map((s) => [s.id, new Set(schoolStages(s.arskurser))]))

  // Flödesmatris M[område][stadie] = { skolId: andel } ur observerad härkomst
  const M = {}
  for (const a of areas) {
    const intake = AREA_INTAKE[a] || {}   // { skolId: antal elever från området }
    M[a] = {}
    for (const st of STAGE_KEYS) {
      const elig = schools.filter((s) => stagesBySchool.get(s.id).has(st) && intake[s.id] > 0)
      const tot = elig.reduce((t, s) => t + intake[s.id], 0)
      M[a][st] = {}
      if (tot > 0) for (const s of elig) M[a][st][s.id] = intake[s.id] / tot
    }
  }

  // Per skola: lista av bidrag (område, stadie, andel) — för snabb projektion
  const contrib = new Map(schools.map((s) => [s.id, []]))
  for (const a of areas) {
    for (const st of STAGE_KEYS) {
      for (const [id, share] of Object.entries(M[a][st])) {
        contrib.get(+id).push({ a, st, share })
      }
    }
  }

  const popAt = (a, st, year) => BEFOLKNING[a][st] * Math.pow(1 + BEFOLKNING[a].trend, year - baseYear)
  const raw = (school, year) => {
    let sum = 0
    for (const { a, st, share } of contrib.get(school.id) || []) {
      sum += popAt(a, st, year) * PARTICIPATION * share
    }
    return sum
  }

  // Basårskalibrering: modellen ska i basåret reproducera dagens elevtal
  const calib = new Map()
  for (const s of schools) {
    const base = raw(s, baseYear)
    calib.set(s.id, base > 0 ? s.elever / base : 1)
  }

  return {
    // Projicerat elevtal för en skola ett givet år
    project(school, year) {
      return Math.round(raw(school, year) * (calib.get(school.id) ?? 1))
    },
  }
}
