/* ===========================================================================
   SKOLBESTÅND — genereras ur data/student_data.xlsx via scripts/build_data.py
   (172 kommunala skolenheter: grundskola + anpassad grundskola).

   Geografin följer Göteborgs indelning: stadsområde ⊃ mellanområde. Läge,
   skolform, årskursspann, elevtal (basår 2026, ur elevhistoriken), kapacitet,
   internhyra och bemanning kommer ur testdatan. Fastighets-/FM-fält
   (byggnadsår, skick, BTA, internhyra/m², underhållsskuld, energiklass) är
   syntetiserade deterministiskt tills de kopplas mot underhålls-/hyressystem.

   Härledda fält (beläggning, spilld hyra, kapacitet/elever per stadie m.m.)
   beräknas här så att motorer och komponenter är oförändrade.
=========================================================================== */
import RECORDS from './generated/schools.json'
import { haversineKm } from '../lib/geo'
import { stageGrades } from './prognos'

// Antal årskurser ur spann ("F–6" = 7, "F–9" = 10, "7–9" = 3, "4–9" = 6)
export function gradeCount(span) {
  const [lo, hi] = span.split('–')
  return lo === 'F' ? +hi + 1 : +hi - +lo + 1
}

function ageGroup(yr) {
  return yr < 1960 ? '–1959' : yr < 1980 ? '1960–79' : yr < 2010 ? '1980–2009' : '2010–'
}
function renovGroup(n) {
  return n <= 2 ? 'OK' : n === 3 ? 'Acceptabelt' : n === 4 ? 'Eftersatt' : 'Akut'
}
function occGroup(b) {
  return b < 0.85 ? 'Underbelagd' : b <= 1.0 ? 'Balanserad' : 'Överbelagd'
}

export const SCHOOLS = RECORDS.map((r) => {
  const arskurserCount = gradeCount(r.arskurser)
  // Kapacitet per årskurs är primär (heltal) så att stadiekapaciteten summerar
  // exakt till totalen — den pedagogiska totalkapaciteten avrundas därför till
  // närmaste hela klassuppsättning ur datans kapacitet.
  const kapPerArskurs = Math.max(1, Math.round(r.pedKapacitet / arskurserCount))
  const pedKapacitet = kapPerArskurs * arskurserCount
  const elever = r.elever
  const belagg = pedKapacitet ? elever / pedKapacitet : 0
  const arshyra = r.arshyra
  const kostnadPerPlats = pedKapacitet ? arshyra / pedKapacitet : 0
  const tommaPlatser = Math.max(0, pedKapacitet - elever)
  const spilldHyra = Math.round(tommaPlatser * kostnadPerPlats)
  const kostnadPerElev = elever ? Math.round(arshyra / elever) : 0
  // Kapacitet och elever per åldersstadie (lag/mellan/hog) ur årskursspannet
  const sg = stageGrades(r.arskurser)
  const stageKap = { lag: kapPerArskurs * sg.lag, mellan: kapPerArskurs * sg.mellan, hog: kapPerArskurs * sg.hog }
  const stageElever = {
    lag: Math.round(elever * sg.lag / arskurserCount),
    mellan: Math.round(elever * sg.mellan / arskurserCount),
    hog: Math.round(elever * sg.hog / arskurserCount),
  }
  return {
    ...r,
    adress: r.skolhus,            // sökbart fält (ingen gatuadress i testdatan)
    fastighet: r.skolhus,
    arskurserCount, pedKapacitet, kapPerArskurs, stageKap, stageElever,
    eleverPerArskurs: Math.round(elever / arskurserCount),
    arshyra, kostnadPerPlats: Math.round(kostnadPerPlats),
    tommaPlatser, spilldHyra, kostnadPerElev,
    belagg: +belagg.toFixed(3), belaggPct: Math.round(belagg * 100),
    aldersgrupp: ageGroup(r.byggnadsar), renovgrupp: renovGroup(r.renovbehov), belaggrupp: occGroup(belagg),
  }
})

// Avstånd till närmaste andra skola (fågelvägen) — tillgänglighetssignal
SCHOOLS.forEach((s) => {
  let best = Infinity, bestNamn = null
  for (const o of SCHOOLS) {
    if (o === s) continue
    const d = haversineKm(s.lat, s.lng, o.lat, o.lng)
    if (d < best) { best = d; bestNamn = o.namn }
  }
  s.nearestKm = +best.toFixed(1)
  s.nearestNamn = bestNamn
})

// Basår för projektion (dagens elevtal som utgångspunkt)
export const BASE_YEAR = 2026
export const HORIZONS = [2030, 2035, 2040, 2045, 2050]

// Scenarier = årlig demografisk förändring utöver befolkningsprognosen.
export const SCENARIOS = {
  Stabilt: 0.000,
  Befolkningsprognos: -0.010,
  'Snabb minskning': -0.022,
  'Svag ökning': 0.006,
}

// minsta bärkraftiga elevantal per årskurs (under detta blir klasser för små)
export const MIN_VIABLE_PER_GRADE = 15

// Schablon: helårskostnad för en lärartjänst (lön + overhead), kr.
export const LARARKOSTNAD = 650000
