/* ===========================================================================
   ELEVMÖNSTER — observerad elevhärkomst per skola (var eleverna bor → skola).

   VIKTIGT (sekretess): individuella adresser visas eller lagras ALDRIG. Denna
   tabell är redan aggregerad till "antal elever på skola X från primärområde P"
   plus genomsnittlig resväg. Små celler (< MIN_CELL elever) redovisas inte per
   område utan slås ihop till "Övriga/spridda" — så att enskilda elever inte kan
   pekas ut.

   STATUS: EXEMPELDATA. Mönstret genereras här ur en avståndsbaserad
   gravitationsmodell över skolornas läge, kalibrerat så att varje skolas
   härkomst summerar till dess faktiska elevtal. På måndag ersätts hela denna
   fil med Göteborgs Stads verkliga uttag (folkbokföring × placering), med
   riktiga vägnätsavstånd. Konsumenterna — InfoPanel (visning) och
   framskrivning.js (flödesmatris) — är oförändrade vid bytet.

   Förväntad form på det riktiga uttaget, en rad per (skola, primärområde):
       skola, primärområde, antal_elever, medelavstånd_km   (små celler maskade)
=========================================================================== */
import { SCHOOLS } from './schools'
import { BEFOLKNING } from './prognos'
import { haversineKm } from '../lib/geo'

// Mock-parametrar för att generera ett rimligt elevmönster (byts mot riktig data)
const HOME_BOOST = 1.8     // närområdesskolans extra dragningskraft
const DECAY_KM = 1.5       // avståndsdämpning
const RADIUS_KM = 6        // elever söker sig sällan längre än så
const DETOUR = 1.35        // vägnät vs fågelväg (mock — ersätts av riktiga vägnätsavstånd)
const INTRA_AREA_KM = 0.6  // typisk spridning inom ett primärområde
export const MIN_CELL = 5  // sekretess: minsta redovisade cell per område

// Primärområdescentroid ≈ läget för områdets skola(or)
const AREAS = [...new Set(SCHOOLS.map((s) => s.primaromrade))]
const centroid = {}
for (const a of AREAS) {
  const inA = SCHOOLS.filter((s) => s.primaromrade === a)
  centroid[a] = {
    lng: inA.reduce((t, s) => t + s.lng, 0) / inA.length,
    lat: inA.reduce((t, s) => t + s.lat, 0) / inA.length,
  }
}

// Ungefärligt vägnätsavstånd från ett områdes elever till en skola (mock)
function netKm(area, school) {
  const d = haversineKm(centroid[area].lat, centroid[area].lng, school.lat, school.lng)
  return +((d + INTRA_AREA_KM) * DETOUR).toFixed(1)
}

// Fördela heltal så att summan blir exakt target (största-rest-metoden)
function roundToSum(cells, target) {
  const f = cells.map((c) => ({ ...c, n: Math.floor(c.antal), r: c.antal - Math.floor(c.antal) }))
  let rem = Math.round(target) - f.reduce((t, c) => t + c.n, 0)
  f.sort((a, b) => b.r - a.r)
  for (let i = 0; i < f.length && rem > 0; i++) { f[i].n++; rem-- }
  return f.map((c) => ({ area: c.area, antal: c.n, medelKm: c.medelKm }))
}

// SCHOOL_ORIGINS[skolId] = { meanKm, areas: [{primaromrade, antal, medelKm}], ovriga }
export const SCHOOL_ORIGINS = {}
for (const s of SCHOOLS) {
  const weights = AREAS.map((a) => {
    const km = haversineKm(centroid[a].lat, centroid[a].lng, s.lat, s.lng)
    const w = km > RADIUS_KM ? 0 : (s.primaromrade === a ? HOME_BOOST : 1) * Math.exp(-km / DECAY_KM)
    return { area: a, w }
  })
  const tot = weights.reduce((t, x) => t + x.w, 0)
  const cells = roundToSum(
    weights.filter((x) => x.w > 0).map((x) => ({ area: x.area, antal: (x.w / tot) * s.elever, medelKm: netKm(x.area, s) })),
    s.elever,
  )

  // genomsnittlig resväg för skolan (innan sekretessmaskning, för korrekt vikt)
  const allN = cells.reduce((t, c) => t + c.antal, 0)
  const meanKm = allN ? +(cells.reduce((t, c) => t + c.antal * c.medelKm, 0) / allN).toFixed(1) : 0

  const shown = cells.filter((c) => c.antal >= MIN_CELL).sort((a, b) => b.antal - a.antal)
  const supp = cells.filter((c) => c.antal > 0 && c.antal < MIN_CELL)
  const ovrigaN = supp.reduce((t, c) => t + c.antal, 0)

  SCHOOL_ORIGINS[s.id] = {
    meanKm,
    areas: shown.map((c) => ({ primaromrade: c.area, antal: c.antal, medelKm: c.medelKm })),
    ovriga: ovrigaN
      ? { antal: ovrigaN, medelKm: +(supp.reduce((t, c) => t + c.antal * c.medelKm, 0) / ovrigaN).toFixed(1) }
      : null,
  }
}

// Invers vy för modellen: AREA_INTAKE[primärområde] = { skolId: antal }
// Bygger bara på redovisade (icke-maskade) celler.
export const AREA_INTAKE = {}
for (const s of SCHOOLS) {
  for (const { primaromrade, antal } of SCHOOL_ORIGINS[s.id].areas) {
    (AREA_INTAKE[primaromrade] ||= {})[s.id] = antal
  }
}

/* ---------------------------------------------------------------------------
   Importkontroll — körs när det riktiga uttaget läggs in (måndag).
   Fångar de vanliga felen vid databyte: skolor utan härkomst, okända skol-id,
   summa som inte stämmer mot elevtalet, celler under sekretessgränsen, samt
   primärområden som saknar befolkningsprognos (då ignoreras de av modellen).
   Loggar en samlad varning i utvecklingsläge; stoppar inte appen.
--------------------------------------------------------------------------- */
export function validateOrigins(schools = SCHOOLS, table = SCHOOL_ORIGINS, minCell = MIN_CELL) {
  const problems = []
  const ids = new Set(schools.map((s) => s.id))
  const prognosAreas = new Set(Object.keys(BEFOLKNING))
  const utanPrognos = new Set()

  for (const s of schools) {
    const o = table[s.id]
    if (!o) { problems.push(`Saknar elevhärkomst för "${s.namn}" (id ${s.id})`); continue }
    const shown = o.areas.reduce((t, a) => t + a.antal, 0)
    const tot = shown + (o.ovriga ? o.ovriga.antal : 0)
    if (Math.abs(tot - s.elever) > Math.max(3, s.elever * 0.02))
      problems.push(`"${s.namn}": härkomst summerar ${tot}, elevtal ${s.elever} (stämmer inte)`)
    for (const a of o.areas) {
      if (a.antal < minCell)
        problems.push(`"${s.namn}": cell ${a.primaromrade}=${a.antal} under sekretessgräns ${minCell}`)
      if (!(a.medelKm >= 0))
        problems.push(`"${s.namn}": ogiltigt medelavstånd för ${a.primaromrade}`)
      if (!prognosAreas.has(a.primaromrade)) utanPrognos.add(a.primaromrade)
    }
  }
  for (const key of Object.keys(table)) {
    if (!ids.has(+key)) problems.push(`Elevhärkomst för okänd skola-id ${key}`)
  }
  if (utanPrognos.size)
    problems.push(`${utanPrognos.size} primärområden saknar befolkningsprognos och ignoreras av framskrivningen: ${[...utanPrognos].join(', ')}`)
  return problems
}

if (import.meta.env && import.meta.env.DEV) {
  const problems = validateOrigins()
  if (problems.length) console.warn(`[origins] ${problems.length} problem i elevhärkomstdata:\n- ${problems.join('\n- ')}`)
}
