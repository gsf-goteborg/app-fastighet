/* ===========================================================================
   EXEMPELDATA — verkliga Göteborgsskolor (namn/huvudman). Byggnadsår,
   renoveringsbehov, BTA, kapacitet, internhyra, underhållsskuld m.m. är
   PLACEHOLDER och måste kopplas mot fastighetsavdelningens underhålls-/FM-
   och hyressystem samt elevprognoser innan skarp användning. Koordinater
   är ungefärliga.

   Fält: namn, huvudman, stadsomrade, arskurser, adress, lng, lat,
         byggnadsar, senasteRenov, bta, platser, elever, renovbehov(1-5),
         underhallsskuld(Mkr), energiklass, fastighet, kapPerArskurs, hyraPerM2,
         primaromrade, mellanomrade
   kapPerArskurs = pedagogisk kapacitet: max antal elever per årskurs.
   hyraPerM2     = internhyra kr/m²/år (0 för fristående — ej kommunens lokalkostnad).
   primaromrade/mellanomrade = Göteborgs statistiska indelning under stadsområdet
         (primärområde = minsta enhet, mellanområde = grupp av primärområden).
=========================================================================== */
const RAW = [
  ['Annedalsskolan', 'Kommunal', 'Centrum', 'F–6', 'Skansberget 1', 11.9533, 57.6886, 1908, 1998, 4200, 360, 332, 4, 38, 'E', 'ANNEDAL 12:3', 50, 1500, 'Annedal', 'Haga-Linné'],
  ['Nordhemsskolan', 'Kommunal', 'Centrum', 'F–9', 'Stigbergsliden 7', 11.9510, 57.6975, 1886, 2005, 6800, 560, 548, 5, 72, 'F', 'MASTHUGG 8:1', 55, 1450, 'Masthugget', 'Haga-Linné'],
  ['Johannebergsskolan', 'Kommunal', 'Centrum', 'F–9', 'V. Rydbergsg. 11', 11.9865, 57.6855, 1924, 2012, 5400, 500, 470, 3, 21, 'D', 'JOHANNEBERG 4:2', 50, 1750, 'Johanneberg', 'Guldheden-Johanneberg'],
  ['Guldhedsskolan', 'Kommunal', 'Centrum', 'F–6', 'Doktor Bex gata 5', 11.9720, 57.6840, 1955, 1990, 3900, 300, 288, 4, 29, 'E', 'GULDHEDEN 1:9', 45, 1500, 'Södra Guldheden', 'Guldheden-Johanneberg'],
  ['Kärralundsskolan', 'Kommunal', 'Centrum', 'F–9', 'Solhemsgatan 1', 12.0150, 57.7010, 1969, 2018, 7100, 600, 612, 3, 18, 'C', 'BÖ 32:5', 60, 2100, 'Bö', 'Örgryte-Härlanda'],
  ['Lundenskolan', 'Kommunal', 'Centrum', 'F–9', 'Örnehufvudsg. 1', 12.0080, 57.7090, 1948, 2001, 5900, 480, 455, 4, 34, 'E', 'LUNDEN 14:1', 50, 1600, 'Lunden', 'Örgryte-Härlanda'],
  ['Göteborgs Högre Samskola', 'Fristående', 'Centrum', 'F–9', 'Recogatan 14', 11.9760, 57.6960, 1901, 2010, 6400, 520, 510, 2, 0, 'D', 'VASASTADEN 5:7', 50, 0, 'Vasastaden', 'Centrum-Vasastaden'],
  ['Montessoriskolan Elyseum', 'Fristående', 'Centrum', 'F–9', 'Stampgatan 26', 11.9600, 57.7000, 1962, 2015, 2800, 240, 212, 2, 0, 'C', 'GÅRDA 18:3', 25, 0, 'Gårda', 'Centrum-Vasastaden'],
  ['IES Göteborg', 'Fristående', 'Centrum', '4–9', 'Mölndalsvägen 93', 11.9920, 57.6800, 1972, 2016, 7800, 760, 742, 2, 0, 'C', 'KROKSLÄTT 109:2', 125, 0, 'Krokslätt', 'Guldheden-Johanneberg'],

  ['Bergsjöskolan', 'Kommunal', 'Nordost', 'F–9', 'Rymdtorget 5', 12.0480, 57.7280, 1968, 1994, 8300, 560, 498, 5, 86, 'F', 'BERGSJÖN 25:1', 55, 1550, 'Östra Bergsjön', 'Bergsjön'],
  ['Sandeklevsskolan', 'Kommunal', 'Nordost', 'F–9', 'Sandeklevsg. 80', 12.0420, 57.7450, 1965, 1989, 6200, 520, 540, 5, 68, 'F', 'KORTEDALA 41:8', 55, 1500, 'Kortedala', 'Kortedala'],
  ['Gärdsåsskolan', 'Kommunal', 'Nordost', 'F–6', 'Tellbacken 6', 12.0360, 57.7400, 1961, 1996, 4100, 320, 346, 4, 41, 'E', 'KORTEDALA 28:2', 50, 1550, 'Gärdsås', 'Kortedala'],
  ['Rannebergsskolan', 'Kommunal', 'Nordost', 'F–9', 'Ranneberg C', 12.0500, 57.8100, 1972, 1998, 5600, 440, 468, 4, 52, 'E', 'RANNEBERGEN 7:1', 50, 1650, 'Rannebergen', 'Angered'],
  ['Lövgärdesskolan', 'Kommunal', 'Nordost', 'F–9', 'Lövgärdets C', 12.0250, 57.8200, 1970, 1991, 6100, 480, 512, 5, 77, 'F', 'GÅRDSTEN 33:4', 50, 1550, 'Lövgärdet', 'Angered'],

  ['Toleredsskolan', 'Kommunal', 'Hisingen', 'F–6', 'Toleredsgatan 8', 11.9180, 57.7390, 1957, 2003, 4600, 360, 300, 3, 24, 'D', 'TOLERED 73:2', 45, 1700, 'Tolered', 'Backa'],
  ['Brunnsboskolan', 'Kommunal', 'Hisingen', 'F–9', 'Tuvevägen 35', 11.9300, 57.7480, 1966, 2009, 6700, 540, 520, 3, 27, 'D', 'BRUNNSBO 1:5', 55, 1900, 'Brunnsbo', 'Backa'],
  ['Ryaskolan', 'Kommunal', 'Hisingen', 'F–6', 'Ryavägen 4', 11.8900, 57.6950, 2014, 2014, 5200, 420, 398, 1, 4, 'A', 'RYA 4:7', 60, 2500, 'Rya', 'Lundby'],
  ['Taubeskolan', 'Kommunal', 'Hisingen', 'F–9', 'Vårväderstorget 1', 11.9100, 57.7100, 1959, 1993, 5800, 460, 476, 4, 49, 'E', 'BISKOPSGÅRDEN 830:9', 50, 1600, 'Södra Biskopsgården', 'Biskopsgården'],

  ['Frölundaskolan', 'Kommunal', 'Sydväst', '7–9', 'Nymilsgatan 2', 11.9120, 57.6510, 1963, 1997, 9200, 650, 602, 4, 58, 'E', 'JÄRNBROTT 164:1', 200, 1650, 'Järnbrott', 'Frölunda'],
  ['Önneredsskolan', 'Kommunal', 'Sydväst', 'F–6', 'Önneredsv. 30', 11.8850, 57.6350, 1971, 2008, 4400, 340, 366, 3, 22, 'D', 'ÖNNERED 60:3', 55, 1850, 'Önnered', 'Älvsborg-Önnered'],
  ['Påvelundsskolan', 'Kommunal', 'Sydväst', 'F–9', 'Vidkärrsg. 5', 11.8750, 57.6650, 1958, 2002, 5500, 440, 418, 4, 36, 'E', 'ÄLVSBORG 178:1', 45, 1600, 'Älvsborg', 'Älvsborg-Önnered'],
  ['Askimsskolan', 'Kommunal', 'Sydväst', 'F–9', 'Skintebov. 12', 11.9000, 57.6100, 2019, 2019, 6300, 520, 488, 1, 2, 'A', 'ASKIM 24:5', 50, 2600, 'Askim', 'Askim-Hovås'],
]

// Antal årskurser ur spann ("F–6" = 7, "F–9" = 10, "7–9" = 3, "4–9" = 6)
export function gradeCount(span) {
  const [lo, hi] = span.split('–')
  return lo === 'F' ? +hi + 1 : +hi - +lo + 1
}

import { haversineKm } from '../lib/geo'
import { stageGrades } from './prognos'

function ageGroup(yr) {
  return yr < 1960 ? '–1959' : yr < 1980 ? '1960–79' : yr < 2010 ? '1980–2009' : '2010–'
}
function renovGroup(n) {
  return n <= 2 ? 'OK' : n === 3 ? 'Acceptabelt' : n === 4 ? 'Eftersatt' : 'Akut'
}
function occGroup(b) {
  return b < 0.85 ? 'Underbelagd' : b <= 1.0 ? 'Balanserad' : 'Överbelagd'
}

export const SCHOOLS = RAW.map((r, i) => {
  const kapPerArskurs = r[16]
  const hyraPerM2 = r[17]
  const bta = r[9]
  const arskurserCount = gradeCount(r[3])
  const pedKapacitet = kapPerArskurs * arskurserCount // pedagogisk kapacitet, totalt
  const elever = r[11]
  const belagg = elever / pedKapacitet
  const arshyra = bta * hyraPerM2                       // internhyra kr/år (fast kostnad)
  const kostnadPerPlats = pedKapacitet ? arshyra / pedKapacitet : 0
  const tommaPlatser = Math.max(0, pedKapacitet - elever)
  const spilldHyra = Math.round(tommaPlatser * kostnadPerPlats) // hyra för tomma platser, kr/år
  const kostnadPerElev = elever ? Math.round(arshyra / elever) : 0
  // Kapacitet och elever fördelade per åldersstadie (lag/mellan/hog)
  const sg = stageGrades(r[3])
  const stageKap = { lag: kapPerArskurs * sg.lag, mellan: kapPerArskurs * sg.mellan, hog: kapPerArskurs * sg.hog }
  const stageElever = {
    lag: Math.round(elever * sg.lag / arskurserCount),
    mellan: Math.round(elever * sg.mellan / arskurserCount),
    hog: Math.round(elever * sg.hog / arskurserCount),
  }
  return {
    id: i,
    namn: r[0], huvudman: r[1], stadsomrade: r[2], arskurser: r[3], adress: r[4],
    lng: r[5], lat: r[6], byggnadsar: r[7], senasteRenov: r[8], bta,
    platser: r[10], elever, renovbehov: r[12], underhallsskuld: r[13],
    energiklass: r[14], fastighet: r[15],
    primaromrade: r[18], mellanomrade: r[19],
    kapPerArskurs, arskurserCount, pedKapacitet, stageKap, stageElever,
    eleverPerArskurs: Math.round(elever / arskurserCount),
    hyraPerM2, arshyra, kostnadPerPlats: Math.round(kostnadPerPlats),
    tommaPlatser, spilldHyra, kostnadPerElev,
    belagg: +belagg.toFixed(3), belaggPct: Math.round(belagg * 100),
    aldersgrupp: ageGroup(r[7]), renovgrupp: renovGroup(r[12]), belaggrupp: occGroup(belagg),
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
export const HORIZONS = [2030, 2035, 2040]

// Scenarier = årlig demografisk förändring. Göteborg väntar minskande
// elevkullar — därför är huvudscenariot negativt. (mock-värden)
export const SCENARIOS = {
  Stabilt: 0.000,
  Befolkningsprognos: -0.010,
  'Snabb minskning': -0.022,
  'Svag ökning': 0.006,
}

// minsta bärkraftiga elevantal per årskurs (under detta blir klasser för små)
export const MIN_VIABLE_PER_GRADE = 15

// Schablon: helårskostnad för en lärartjänst (lön + overhead), kr. Används för
// att översätta spilld lokalhyra till "lärartjänster". (mock — justerbar)
export const LARARKOSTNAD = 650000
