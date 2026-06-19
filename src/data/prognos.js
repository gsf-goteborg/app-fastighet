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

// Deltagandegrad: andel av åldersgruppen som går i grundskola.
export const PARTICIPATION = 0.965

// Befolkningsprognos per primärområde: barn i skolåldern per stadie (basår 2026)
// + årlig förändringstakt. Nyckeln matchar skolornas `primaromrade`.
export const BEFOLKNING = {
  // Centrum — etablerade områden, mild minskning; Krokslätt förtätas
  'Vasastaden':        { lag: 240, mellan: 220, hog: 210, trend: -0.006 },
  'Gårda':             { lag: 150, mellan: 140, hog: 135, trend: -0.004 },
  'Annedal':           { lag: 210, mellan: 200, hog: 190, trend: -0.005 },
  'Masthugget':        { lag: 300, mellan: 285, hog: 270, trend: -0.007 },
  'Johanneberg':       { lag: 270, mellan: 255, hog: 250, trend: -0.003 },
  'Krokslätt':         { lag: 330, mellan: 320, hog: 360, trend: +0.002 },
  'Södra Guldheden':   { lag: 175, mellan: 165, hog: 160, trend: -0.008 },
  'Bö':                { lag: 300, mellan: 290, hog: 300, trend: -0.005 },
  'Lunden':            { lag: 250, mellan: 240, hog: 235, trend: -0.006 },
  // Nordost — minskande elevkullar
  'Östra Bergsjön':    { lag: 300, mellan: 280, hog: 250, trend: -0.018 },
  'Kortedala':         { lag: 330, mellan: 310, hog: 290, trend: -0.015 },
  'Gärdsås':           { lag: 200, mellan: 185, hog: 175, trend: -0.016 },
  'Rannebergen':       { lag: 270, mellan: 255, hog: 245, trend: -0.012 },
  'Lövgärdet':         { lag: 310, mellan: 285, hog: 260, trend: -0.020 },
  // Hisingen — blandat; Backa förtätas, Rya (Älvstaden) nybyggnad
  'Tolered':           { lag: 195, mellan: 180, hog: 170, trend: -0.005 },
  'Brunnsbo':          { lag: 300, mellan: 285, hog: 270, trend: +0.006 },
  'Rya':               { lag: 260, mellan: 235, hog: 210, trend: +0.016 },
  'Södra Biskopsgården': { lag: 290, mellan: 270, hog: 250, trend: -0.010 },
  // Sydväst — stabilt; Askim nybyggnad
  'Järnbrott':         { lag: 330, mellan: 320, hog: 330, trend: -0.004 },
  'Älvsborg':          { lag: 250, mellan: 240, hog: 235, trend: -0.003 },
  'Önnered':           { lag: 230, mellan: 220, hog: 210, trend: +0.002 },
  'Askim':             { lag: 300, mellan: 285, hog: 280, trend: +0.012 },
}
