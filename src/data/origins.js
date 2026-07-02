/* ===========================================================================
   ELEVMÖNSTER — elevhärkomst per skola (var eleverna bor → skola), per
   MELLANOMRÅDE. Individuella adresser visas eller lagras ALDRIG. Små celler
   (< MIN_CELL elever) slås ihop till "Övriga/spridda" så att enskilda elever
   inte kan pekas ut.

   STATUS: EXEMPELMÖNSTER. En avståndsdämpad gravitationsmodell sprider varje
   skolas elever över närliggande mellanområden, förankrad i skolans riktiga
   hemområde (ur testdatan) med extra dragningskraft. Ersätts av Göteborgs
   Stads verkliga uttag (folkbokföring × placering) med riktiga vägnätsavstånd —
   konsumenterna (InfoPanel, framskrivning.js) är oförändrade vid bytet.
   Resväg (medelKm) är fågelväg × omvägsfaktor tills vägnätsavstånd kopplas in.
=========================================================================== */
import { SCHOOLS } from './schools'
import { BEFOLKNING } from './prognos'
import { haversineKm } from '../lib/geo'

const HOME_BOOST = 1.8     // hemområdets extra dragningskraft
const DECAY_KM = 2.0       // avståndsdämpning
const RADIUS_KM = 5        // elever söker sig sällan längre än så
const DETOUR = 1.35        // vägnät vs fågelväg (skattning tills riktiga avstånd kopplas in)
const INTRA_AREA_KM = 0.6  // typisk spridning inom ett mellanområde
export const MIN_CELL = 5  // sekretess: minsta redovisade cell per område

const byId = new Map(SCHOOLS.map((s) => [s.id, s]))

// Mellanområdescentroid ≈ medelläget för områdets skolor (för resvägsskattning)
const centroid = {}
for (const s of SCHOOLS) {
  (centroid[s.mellanomrade] ||= { lng: 0, lat: 0, n: 0 })
  centroid[s.mellanomrade].lng += s.lng
  centroid[s.mellanomrade].lat += s.lat
  centroid[s.mellanomrade].n += 1
}
for (const a of Object.keys(centroid)) {
  centroid[a].lng /= centroid[a].n
  centroid[a].lat /= centroid[a].n
}

// Skattad resväg (km) från ett mellanområde till en godtycklig punkt — samma
// schablon (fågelväg × omvägsfaktor) som härkomsttabellen, så att t.ex.
// likvärdighetsberäkningen mäter före/efter med samma måttstock.
export function areaPointKm(area, lat, lng) {
  const c = centroid[area]
  if (!c) return null
  return +((haversineKm(c.lat, c.lng, lat, lng) + INTRA_AREA_KM) * DETOUR).toFixed(1)
}

function netKm(area, school) {
  return areaPointKm(area, school.lat, school.lng) ?? 0
}

// Fördela heltal så att summan blir exakt target (största-rest-metoden)
function roundToSum(cells, target) {
  const f = cells.map((c) => ({ ...c, n: Math.floor(c.antal), r: c.antal - Math.floor(c.antal) }))
  let rem = Math.round(target) - f.reduce((t, c) => t + c.n, 0)
  f.sort((a, b) => b.r - a.r)
  for (let i = 0; i < f.length && rem > 0; i++) { f[i].n++; rem-- }
  return f.map((c) => ({ omrade: c.omrade, antal: c.n, medelKm: c.medelKm }))
}

// SCHOOL_ORIGINS[skolId] = { meanKm, areas: [{omrade, antal, medelKm}], ovriga }
const AREAS = Object.keys(centroid)
export const SCHOOL_ORIGINS = {}
for (const s of SCHOOLS) {
  // Gravitationsvikter: hemområdet boostas, närliggande områden dämpas med
  // avståndet, områden bortom radien faller bort.
  const weights = AREAS.map((a) => {
    const km = haversineKm(centroid[a].lat, centroid[a].lng, s.lat, s.lng)
    const w = km > RADIUS_KM ? 0 : (a === s.mellanomrade ? HOME_BOOST : 1) * Math.exp(-km / DECAY_KM)
    return { omrade: a, w }
  }).filter((x) => x.w > 0)
  const tot = weights.reduce((t, x) => t + x.w, 0) || 1
  // Skala till skolans faktiska elevtal och fördela exakt
  const cells = roundToSum(
    weights.map((x) => ({ omrade: x.omrade, antal: (x.w / tot) * s.elever, medelKm: netKm(x.omrade, s) })),
    s.elever,
  )
  const allN = cells.reduce((t, c) => t + c.antal, 0)
  const meanKm = allN ? +(cells.reduce((t, c) => t + c.antal * c.medelKm, 0) / allN).toFixed(1) : 0

  const shown = cells.filter((c) => c.antal >= MIN_CELL).sort((a, b) => b.antal - a.antal)
  const supp = cells.filter((c) => c.antal > 0 && c.antal < MIN_CELL)
  const ovrigaN = supp.reduce((t, c) => t + c.antal, 0)

  SCHOOL_ORIGINS[s.id] = {
    meanKm,
    areas: shown,
    ovriga: ovrigaN
      ? { antal: ovrigaN, medelKm: +(supp.reduce((t, c) => t + c.antal * c.medelKm, 0) / ovrigaN).toFixed(1) }
      : null,
  }
}

// Invers vy för modellen: AREA_INTAKE[mellanområde] = { skolId: antal }
// Bygger bara på redovisade (icke-maskade) celler.
export const AREA_INTAKE = {}
for (const s of SCHOOLS) {
  for (const { omrade, antal } of SCHOOL_ORIGINS[s.id].areas) {
    (AREA_INTAKE[omrade] ||= {})[s.id] = antal
  }
}

/* ---------------------------------------------------------------------------
   Importkontroll — fångar vanliga fel vid databyte: skolor utan härkomst,
   okända skol-id, summa som inte stämmer mot elevtalet, omaskade småceller,
   samt mellanområden som saknar befolkningsprognos (ignoreras av modellen).
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
        problems.push(`"${s.namn}": cell ${a.omrade}=${a.antal} under sekretessgräns ${minCell}`)
      if (!(a.medelKm >= 0))
        problems.push(`"${s.namn}": ogiltigt medelavstånd för ${a.omrade}`)
      if (!prognosAreas.has(a.omrade)) utanPrognos.add(a.omrade)
    }
  }
  for (const key of Object.keys(table)) {
    if (!ids.has(+key)) problems.push(`Elevhärkomst för okänd skola-id ${key}`)
  }
  if (utanPrognos.size)
    problems.push(`${utanPrognos.size} mellanområden saknar befolkningsprognos och ignoreras av framskrivningen: ${[...utanPrognos].join(', ')}`)
  return problems
}

if (import.meta.env && import.meta.env.DEV) {
  const problems = validateOrigins()
  if (problems.length) console.warn(`[origins] ${problems.length} problem i elevhärkomstdata:\n- ${problems.join('\n- ')}`)
}
