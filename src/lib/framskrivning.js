import { haversineKm } from './geo'
import { BASE_YEAR } from '../data/schools'
import {
  BEFOLKNING, STAGE_KEYS, schoolStages,
  PARTICIPATION, LEAKAGE, HOME_BOOST, DECAY_KM, RADIUS_KM,
} from '../data/prognos'

/* ===========================================================================
   Befolkningsbaserad elevframskrivning.

   buildProjector(schools) bygger en projektor som, för en given skola och ett
   givet år, skattar elevtalet underifrån:

     pop(område, stadie, år) = befolkning_basår × (1 + områdets takt)^(år−basår)
     elever som genereras     = pop × deltagandegrad (PARTICIPATION)
     fördelning på skola       = flödesmatris (historiskt elevmönster)
     skolans prognos           = Σ över område×stadie  ×  basårskalibrering

   Flödesmatrisen är en gravitationsmodell över skolornas koordinater: varje
   primärområde fördelar sina elever (per stadie) på skolor som tar emot det
   stadiet, viktat på avstånd med extra dragning till närområdesskolan; en
   andel (LEAKAGE) lämnar de modellerade skolorna.

   Basårskalibreringen skalar varje skola så att modellen i basåret återger
   skolans faktiska elevtal exakt — prognosen utgår alltså från dagens
   verklighet och rör sig därifrån enligt demografin.
=========================================================================== */
export function buildProjector(schools, baseYear = BASE_YEAR) {
  const areas = Object.keys(BEFOLKNING)

  // Områdescentroid ≈ medelläge för skolorna i primärområdet (fallback: stadens mitt)
  const cityLng = schools.reduce((t, s) => t + s.lng, 0) / schools.length
  const cityLat = schools.reduce((t, s) => t + s.lat, 0) / schools.length
  const centroid = {}
  for (const a of areas) {
    const inA = schools.filter((s) => s.primaromrade === a)
    centroid[a] = inA.length
      ? { lng: inA.reduce((t, s) => t + s.lng, 0) / inA.length, lat: inA.reduce((t, s) => t + s.lat, 0) / inA.length }
      : { lng: cityLng, lat: cityLat }
  }

  const stagesBySchool = new Map(schools.map((s) => [s.id, new Set(schoolStages(s.arskurser))]))

  // Flödesmatris M[område][stadie] = { skolId: andel }  (tidigare elevmönster)
  const M = {}
  for (const a of areas) {
    const c = centroid[a]
    M[a] = {}
    for (const st of STAGE_KEYS) {
      const elig = []
      for (const s of schools) {
        if (!stagesBySchool.get(s.id).has(st)) continue
        const km = haversineKm(c.lat, c.lng, s.lat, s.lng)
        if (km > RADIUS_KM) continue
        const w = (s.primaromrade === a ? HOME_BOOST : 1) * Math.exp(-km / DECAY_KM)
        elig.push([s.id, w])
      }
      const tot = elig.reduce((t, [, w]) => t + w, 0)
      M[a][st] = {}
      if (tot > 0) for (const [id, w] of elig) M[a][st][id] = (w / tot) * (1 - LEAKAGE)
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
    // Total befolkning i skolåldern i ett primärområde ett givet år (för metodikvisning)
    areaPopulation(a, year) {
      return STAGE_KEYS.reduce((t, st) => t + popAt(a, st, year), 0)
    },
  }
}
