import { SCHOOLS } from '../data/schools'
import { AREA_INTAKE } from '../data/origins'
import { STAGE_KEYS } from '../data/prognos'
import { haversineKm } from './geo'
import { equityOfPlan } from './likvardighet'
import CANDIDATES from '../data/generated/candidates.json'

/* ===========================================================================
   WHAT-IF — användarens eget scenario, till skillnad från optimeringens förslag.

   Åtgärdslista (App-state), tre åtgärdstyper:
     { typ: 'stang', schoolId }              — stäng en skola
     { typ: 'bygg',  siteId }                — bygg en kandidatsite
     { typ: 'barn',  omrade, antal, franAr } — exploatering: fler barn i område

   buildWhatIf() räknar konsekvenserna med samma motorer som planen:
   dagens elever på stängda skolor omfördelas kapacitetsmedvetet per stadie
   till närmaste öppna skola (samma radievillkor som optimeraren; byggda
   siter kan ta emot), likvärdighetslinsen mäter resvägseffekten, och
   kartans flödeslager (tilldelning + IIA-skolval) återanvänds rakt av.

   'barn'-åtgärder blir en justering ovanpå prognosen (makeProjAdjust):
   extra elever fördelas på skolor via områdets observerade elevmönster
   (AREA_INTAKE) från och med valt år — alla vyer som läser projFn reagerar.
=========================================================================== */

export const CANDIDATES_BY_ID = new Map(CANDIDATES.map((c) => [c.id, c]))

// Kandidatsite → pseudo-skola (mottagare i omflyttningen). Kapaciteten delas
// grade-viktat över sitens stadier (F–3 = 4 årskurser, 4–6/7–9 = 3).
const CAND_STAGE = { 'F-3': 'lag', '4-6': 'mellan', '7-9': 'hog' }
const STAGE_W = { lag: 4, mellan: 3, hog: 3 }

export function candidateAsSchool(c) {
  const stages = c.supportedStages.split(',').map((p) => CAND_STAGE[p.trim()]).filter(Boolean)
  const totW = stages.reduce((t, st) => t + STAGE_W[st], 0) || 1
  const stageKap = { lag: 0, mellan: 0, hog: 0 }
  for (const st of stages) stageKap[st] = Math.round((c.proposedCapacity * STAGE_W[st]) / totW)
  return {
    id: c.id, namn: c.name, lat: c.lat, lng: c.lng,
    mellanomrade: c.mellanomrade || '', siteType: c.siteType,
    pedKapacitet: c.proposedCapacity, stageKap,
  }
}

// Kapacitetsmedveten omflyttning av stängda skolors DAGENS elever, per stadie.
// Mottagare = öppna ordinarie grundskolor (ledig plats = kapacitet − elever)
// + byggda siter (hela kapaciteten ledig). Närmast först, inom stadiets radie.
function reassignAll(closedSchools, receivers, radii) {
  const closures = []
  const extraLoad = new Map() // mottagar-id → antal tillflyttade
  let unplaced = 0
  for (const c of closedSchools) {
    const recv = {}
    let students = 0, maxKm = 0
    for (const st of STAGE_KEYS) {
      let need = c.stageElever[st]
      if (!need) continue
      students += need
      const cands = receivers
        .filter((r) => r.spare[st] > 0)
        .map((r) => ({ r, km: haversineKm(c.lat, c.lng, r.s.lat, r.s.lng) }))
        .filter((x) => x.km <= radii[st])
        .sort((a, b) => a.km - b.km)
      for (const x of cands) {
        const take = Math.min(x.r.spare[st], need)
        x.r.spare[st] -= take
        need -= take
        const e = recv[x.r.s.id] ||= { namn: x.r.s.namn, n: 0, km: +x.km.toFixed(1), lng: x.r.s.lng, lat: x.r.s.lat }
        e.n += take
        extraLoad.set(x.r.s.id, (extraLoad.get(x.r.s.id) || 0) + take)
        maxKm = Math.max(maxKm, x.km)
        if (need <= 0) break
      }
      unplaced += Math.max(0, need)
    }
    closures.push({
      school: c, students,
      reassign: Object.values(recv).sort((a, b) => a.km - b.km),
      maxKm: +maxKm.toFixed(1),
      savedKr: c.arshyra, avoidedDebt: c.underhallsskuld,
    })
  }
  return { closures, extraLoad, unplaced }
}

export function buildWhatIf(actions, radii) {
  const closedIds = actions.filter((a) => a.typ === 'stang').map((a) => a.schoolId)
  const builtIds = actions.filter((a) => a.typ === 'bygg').map((a) => a.siteId)
  const barn = actions.filter((a) => a.typ === 'barn')
  const closedSet = new Set(closedIds)

  const built = builtIds.map((id) => candidateAsSchool(CANDIDATES_BY_ID.get(id))).filter(Boolean)
  const receivers = [
    ...SCHOOLS
      .filter((s) => s.ordinarieGrundskola && !closedSet.has(s.id))
      .map((s) => ({
        s,
        spare: Object.fromEntries(STAGE_KEYS.map((st) => [st, Math.max(0, s.stageKap[st] - s.stageElever[st])])),
      })),
    ...built.map((s) => ({ s, spare: { ...s.stageKap } })),
  ]

  const { closures, extraLoad, unplaced } = reassignAll(closedIds.map((id) => SCHOOLS[id]), receivers, radii)
  const equity = closures.length ? equityOfPlan(SCHOOLS, { closures }, radii) : null

  // Mottagarnas nya beläggning (bara befintliga skolor — byggda siter startar tomma)
  const receiverLoad = [...extraLoad.entries()]
    .filter(([id]) => typeof id === 'number')
    .map(([id, extra]) => {
      const s = SCHOOLS[id]
      return { s, extra, belaggAfter: Math.round(((s.elever + extra) / s.pedKapacitet) * 100) }
    })
    .sort((a, b) => b.belaggAfter - a.belaggAfter)

  return {
    actions, closures, built, barn, unplaced, equity, receiverLoad,
    closedIds: closedSet,
    builtIds: new Set(builtIds),
    savedKr: closures.reduce((t, c) => t + c.savedKr, 0),
    avoidedDebt: closures.reduce((t, c) => t + c.avoidedDebt, 0),
    movedStudents: closures.reduce((t, c) => t + c.students, 0),
    builtCap: built.reduce((t, s) => t + s.pedKapacitet, 0),
    barnTotal: barn.reduce((t, a) => t + a.antal, 0),
  }
}

// 'barn'-åtgärder → prognosjustering: extra elever per skola och år, fördelade
// via områdets observerade elevmönster. null om inga barn-åtgärder (ingen wrap).
export function makeProjAdjust(actions) {
  const barn = actions.filter((a) => a.typ === 'barn')
  if (!barn.length) return null
  // andel av områdets elever som går på respektive skola
  const shares = new Map() // omrade → [{schoolId, share}]
  for (const a of barn) {
    if (shares.has(a.omrade)) continue
    const intake = AREA_INTAKE[a.omrade] || {}
    const tot = Object.values(intake).reduce((t, n) => t + n, 0)
    shares.set(a.omrade, tot
      ? Object.entries(intake).map(([id, n]) => ({ schoolId: +id, share: n / tot }))
      : [])
  }
  return (school, year) => {
    let extra = 0
    for (const a of barn) {
      if (year < a.franAr) continue
      const sh = shares.get(a.omrade).find((x) => x.schoolId === school.id)
      if (sh) extra += a.antal * sh.share
    }
    return Math.round(extra)
  }
}

// Kort etikett för en åtgärd (chips i scenarioraden + rapporten)
export function actionLabel(a) {
  if (a.typ === 'stang') return `Stäng ${SCHOOLS[a.schoolId].namn}`
  if (a.typ === 'bygg') {
    const c = CANDIDATES_BY_ID.get(a.siteId)
    return `Bygg ${c.name} (${c.proposedCapacity} pl)`
  }
  return `+${a.antal} barn ${a.omrade} från ${a.franAr}`
}
