/* ===========================================================================
   ÖNSKA SKOLA — skolvalsmodell (sannolikheter för var elever väljer skola).

   Skolval sker vid tre övergångar, alltid inför NÄSTA läsår:
     • fklass  — barnet fyller 6, väljer förskoleklass (alla väljer).
     • grade4  — barnet fyller 10, väljer mellanstadium ENBART om nuvarande
                 skola slutar efter åk 3 (F–3-skola).
     • grade7  — barnet fyller 13, väljer högstadium ENBART om nuvarande skola
                 slutar efter åk 6 (F–6-skola).

   Er Python-modell ger, per elev, en sannolikhet per skola (t.ex. 10 % skola A,
   5 % skola B …). Aggregerat per primärområde blir det CHOICE nedan:
       CHOICE[övergång][primärområde] = [{ skolId, p }]   (p summerar till 1)
   COHORT[övergång][primärområde] = antal elever som gör valet nästa år.

   simulate.js drar dessa val X gånger (Monte Carlo) → intagning per skola med
   osäkerhetsband (t.ex. "skola A: 50–80 elever").

   STATUS: EXEMPELDATA. Sannolikheterna genereras här ur en avståndsmodell.
   Ersätt CHOICE (och vid behov COHORT) med er modells utdata — formen är den
   som simulate.js och optimeraren läser, så inget annat behöver ändras.
=========================================================================== */
import { SCHOOLS } from './schools'
import { BEFOLKNING, gradesOf } from './prognos'
import { AREA_INTAKE } from './origins'
import { haversineKm } from '../lib/geo'

export const TRANSITIONS = [
  { key: 'fklass', label: 'Förskoleklass (6 år)', entry: 'F', stage: 'lag', age: 6 },
  { key: 'grade4', label: 'Mellanstadiet (10 år)', entry: '4', stage: 'mellan', age: 10 },
  { key: 'grade7', label: 'Högstadiet (13 år)', entry: '7', stage: 'hog', age: 13 },
]

const CHOICE_DECAY_KM = 2.0 // avståndsdämpning i mock-valmodellen

const AREAS = [...new Set(SCHOOLS.map((s) => s.primaromrade))]
const centroid = {}
for (const a of AREAS) {
  const inA = SCHOOLS.filter((s) => s.primaromrade === a)
  centroid[a] = {
    lng: inA.reduce((t, s) => t + s.lng, 0) / inA.length,
    lat: inA.reduce((t, s) => t + s.lat, 0) / inA.length,
  }
}

const hasGrade = (s, g) => gradesOf(s.arskurser).includes(g)
const maxGrade = (s) => { const g = gradesOf(s.arskurser); return g[g.length - 1] }

// Skolor man kan VÄLJA vid en övergång = de som har övergångens inträdesårskurs
export function eligibleSchools(transitionKey) {
  const t = TRANSITIONS.find((x) => x.key === transitionKey)
  return SCHOOLS.filter((s) => hasGrade(s, t.entry))
}

// Mock-sannolikheter: avståndsdämpad gravitationsmodell med skolstorlek som dragning
export const CHOICE = {}
for (const t of TRANSITIONS) {
  const elig = SCHOOLS.filter((s) => hasGrade(s, t.entry))
  CHOICE[t.key] = {}
  for (const a of AREAS) {
    const c = centroid[a]
    const w = elig.map((s) => ({
      schoolId: s.id,
      w: Math.sqrt(s.stageKap[t.stage] || 1) * Math.exp(-haversineKm(c.lat, c.lng, s.lat, s.lng) / CHOICE_DECAY_KM),
    }))
    const tot = w.reduce((x, y) => x + y.w, 0)
    CHOICE[t.key][a] = tot > 0 ? w.map((x) => ({ schoolId: x.schoolId, p: x.w / tot })) : []
  }
}

// Andel av områdets elever som lämnar sin skola efter åk maxG (måste välja om)
function transferShare(a, maxG) {
  const intake = AREA_INTAKE[a] || {}
  let leavers = 0, total = 0
  for (const s of SCHOOLS) {
    if (!(intake[s.id] > 0) || !hasGrade(s, maxG)) continue
    total += intake[s.id]
    if (maxGrade(s) === maxG) leavers += intake[s.id]
  }
  return total > 0 ? leavers / total : 0
}

// Antal elever per område som gör valet nästa år (en åldersårgång)
export const COHORT = { fklass: {}, grade4: {}, grade7: {} }
for (const a of AREAS) {
  const b = BEFOLKNING[a] || { lag: 0, mellan: 0, hog: 0 }
  COHORT.fklass[a] = Math.round(b.lag / 4)                              // alla 6-åringar
  COHORT.grade4[a] = Math.round((b.mellan / 3) * transferShare(a, '3')) // lämnar F–3-skola
  COHORT.grade7[a] = Math.round((b.hog / 3) * transferShare(a, '6'))    // lämnar F–6-skola
}
