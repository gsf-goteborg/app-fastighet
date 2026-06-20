import { SCHOOLS } from '../data/schools'
import { gradesOf } from '../data/prognos'
import { TRANSITIONS, CHOICE, COHORT } from '../data/choice'

/* ===========================================================================
   Monte Carlo-simulering av skolval (önska skola) inför nästa läsår.

   Varje elev i en övergångsårgång drar en skola enligt sin sannolikhetsfördelning
   (CHOICE). Vi upprepar X gånger och får, per skola, en fördelning av antalet
   nya elever — redovisat som väntevärde + osäkerhetsband (P10–P90).
=========================================================================== */

// Dra en skola ur en sannolikhetslista [{schoolId,p}] med slumptal r ∈ [0,1)
function pick(probs, r) {
  let acc = 0
  for (const x of probs) { acc += x.p; if (r < acc) return x.schoolId }
  return probs.length ? probs[probs.length - 1].schoolId : null
}

export function simulateIntake(nSims = 300) {
  const ids = SCHOOLS.map((s) => s.id)
  const areas = Object.keys(COHORT.fklass)
  // sims[k] = Map skolId → antal nya elever i simulering k
  const sims = Array.from({ length: nSims }, () => new Map(ids.map((id) => [id, 0])))

  for (const t of TRANSITIONS) {
    for (const a of areas) {
      const n = COHORT[t.key][a] || 0
      const probs = CHOICE[t.key][a] || []
      if (!n || !probs.length) continue
      for (let k = 0; k < nSims; k++) {
        const acc = sims[k]
        for (let i = 0; i < n; i++) {
          const id = pick(probs, Math.random())
          if (id != null) acc.set(id, acc.get(id) + 1)
        }
      }
    }
  }

  const out = new Map()
  for (const id of ids) {
    const arr = sims.map((m) => m.get(id)).sort((x, y) => x - y)
    const mean = arr.reduce((t, v) => t + v, 0) / nSims
    const q = (p) => arr[Math.min(nSims - 1, Math.floor(p * nSims))]
    out.set(id, { mean: Math.round(mean), p10: q(0.10), p90: q(0.90), min: arr[0], max: arr[nSims - 1] })
  }
  return out
}

// Vilka inträdesårskurser en skola tar emot nya elever till (F / 4 / 7)
export function entryGrades(school) {
  const g = gradesOf(school.arskurser)
  return TRANSITIONS.filter((t) => g.includes(t.entry)).map((t) => t.entry)
}

let _cache = null
export function getIntake(nSims = 300) {
  return _cache || (_cache = simulateIntake(nSims))
}
