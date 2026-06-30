/* ===========================================================================
   FRAMSKRIVNING — indata för befolkningsbaserad elevprognos.

   Modellen skriver fram elevtal per skola i två steg:

     1. BEFOLKNINGSPROGNOS  — antal barn i skolåldern per primärområde och
        åldersstadie (lågstadiet F–3, mellanstadiet 4–6, högstadiet 7–9),
        med en områdesspecifik årlig förändringstakt. Det är HÄR den
        rumsliga variationen finns: nybyggnadsområden växer, etablerade
        områden krymper — till skillnad från en enda procentsats för hela
        staden.

     2. ELEVMÖNSTER (flödesmatris) — historiskt mönster för vilka skolor ett
        områdes elever faktiskt söker sig till. Hämtas från data/origins.js
        (observerad härkomst: antal elever per skola och primärområde) och
        omvandlas i framskrivning.js till andelar per område och stadie.

   ALLT ÄR EXEMPELDATA. Skarp användning kräver Göteborgs Stads verkliga
   befolkningsprognos per primärområde/åldersklass (denna fil) samt det
   verkliga elevmönstret (data/origins.js). Båda byts in på var sitt ställe.
=========================================================================== */

// Åldersstadier (knyts till årskurser). Ett barns stadie följer dess årskurs.
export const STAGES = [
  { key: 'lag', label: 'Lågstadiet (F–3)', short: 'F–3' },
  { key: 'mellan', label: 'Mellanstadiet (4–6)', short: '4–6' },
  { key: 'hog', label: 'Högstadiet (7–9)', short: '7–9' },
]
export const STAGE_KEYS = STAGES.map((s) => s.key)

const GRADES = ['F', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const STAGE_OF = {
  F: 'lag', 1: 'lag', 2: 'lag', 3: 'lag',
  4: 'mellan', 5: 'mellan', 6: 'mellan',
  7: 'hog', 8: 'hog', 9: 'hog',
}

// Årskurser i ett spann, t.ex. "F–6" → ['F','1',…,'6'] (en-dash som i skoldatan)
export function gradesOf(span) {
  const [lo, hi] = span.split('–')
  return GRADES.slice(GRADES.indexOf(lo), GRADES.indexOf(hi) + 1)
}

// Vilka stadier en skola tar emot, härlett ur dess årskursspann
export function schoolStages(span) {
  const set = new Set(gradesOf(span).map((g) => STAGE_OF[g]))
  return STAGE_KEYS.filter((k) => set.has(k))
}

// Antal årskurser per stadie i ett spann, t.ex. "F–6" → { lag:4, mellan:3, hog:0 }
export function stageGrades(span) {
  const out = { lag: 0, mellan: 0, hog: 0 }
  for (const g of gradesOf(span)) out[STAGE_OF[g]]++
  return out
}

// Deltagandegrad: andel av åldersgruppen som går i grundskola.
export const PARTICIPATION = 0.965

// Befolkning i skolålder per MELLANOMRÅDE och stadie (basår 2026) + årlig
// förändringstakt — härlett ur elevhistoriken 2024–2026 (riktig trend per
// område) av scripts/build_data.py. Nyckeln matchar skolornas `mellanomrade`
// och mellanområdes-geofilen (public/geo/mellanomraden.geojson).
import BEFOLKNING from './generated/befolkning.json'
export { BEFOLKNING }
