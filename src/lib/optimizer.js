import solver from 'javascript-lp-solver'
import { haversineKm } from './geo'
import { STAGE_KEYS } from '../data/prognos'

/* ===========================================================================
   Skolnätsoptimering — capacitated facility location, STADIEINDELAD.

   MINIMERA lokalkostnad (årshyra + annualiserad underhållsskuld) för öppna
   skolor  =  maximera frigjorda medel till lärartjänster.
   VILLKOR:
     • Täckning   — alla elever får en plats, uppdelat per åldersstadie.
     • Avstånd    — elever placeras bara på skola inom stadiets radie. Yngre
                    barn kräver närmare skola:
                       lågstadiet (6–9 år)   ≤ 2 km
                       mellanstadiet (10–12) ≤ 4 km
                       högstadiet (13–15)    ≤ 6 km
     • Stadie     — en elev kan bara tas emot av skola som har det stadiet
                    (en 7–9-skola tar inte emot lågstadieelever) och bara upp
                    till skolans kapacitet i det stadiet.
     • Resiliens  — varje stadsområde behåller kapacitet ≥ efterfrågan + reserv
                    (minst största fristående skolan, n-1-kontingens).

   Elever från en stängd skola kan delas på FLERA närliggande skolor.
   Löses som MILP (bevisat optimal); faller tillbaka på girig heuristik.
=========================================================================== */

// Radie per åldersstadie (km). Byts mot riktiga vägnätsavstånd när de finns.
export const STAGE_RADIUS = { lag: 2, mellan: 4, hog: 6 }

function emptyPlan(komm, optimal) {
  return { closures: [], savedKr: 0, seatsRemoved: 0, avoidedDebt: 0, maxKm: 0, stranded: [], openCount: komm.length, optimal }
}

// Projicerad efterfrågan per stadie för en skola (delar totalen på stadieandelar)
function stageDemand(school, projTotal) {
  const e = school.elever || 1
  const out = {}
  for (const st of STAGE_KEYS) out[st] = Math.round(projTotal * (school.stageElever[st] / e))
  return out
}

function context(schools, { rate, years, projFn, year, reservePct, radii }) {
  const R = radii || STAGE_RADIUS
  const projOf = projFn
    ? (s) => projFn(s, year)
    : (s) => Math.round(s.elever * Math.pow(1 + rate, years))
  const komm = schools.filter((s) => s.hyraPerM2 > 0)   // kommunens egna lokaler
  const fri = schools.filter((s) => s.hyraPerM2 === 0)  // fristående → resiliensbehov

  const dem = {}                                        // dem[id][stadie] = efterfrågan
  for (const s of komm) dem[s.id] = stageDemand(s, projOf(s))

  const friContingency = {}
  for (const f of fri) {
    const v = projOf(f)
    if (v > (friContingency[f.stadsomrade] || 0)) friContingency[f.stadsomrade] = v
  }
  const areaDemand = {}, areaCap = {}
  for (const s of komm) {
    areaDemand[s.stadsomrade] = (areaDemand[s.stadsomrade] || 0) + projOf(s)
    areaCap[s.stadsomrade] = (areaCap[s.stadsomrade] || 0) + s.pedKapacitet
  }
  const areaRequired = {}
  for (const a in areaDemand) {
    const reserve = Math.max((areaDemand[a] * reservePct) / 100, friContingency[a] || 0)
    areaRequired[a] = Math.min(areaDemand[a] + reserve, areaCap[a])
  }
  return { projOf, komm, dem, areaRequired, R }
}

function finalize(closures, komm, loadOf, optimal) {
  const closedIds = new Set(closures.map((c) => c.school.id))
  const stranded = komm
    .filter((j) => !closedIds.has(j.id) && loadOf(j) / j.pedKapacitet < 0.6)
    .map((j) => j.namn)
  return {
    closures,
    savedKr: closures.reduce((t, c) => t + c.savedKr, 0),
    seatsRemoved: closures.reduce((t, c) => t + c.school.pedKapacitet, 0),
    avoidedDebt: closures.reduce((t, c) => t + c.avoidedDebt, 0),
    maxKm: closures.reduce((m, c) => Math.max(m, c.maxKm), 0),
    stranded,
    openCount: komm.length - closures.length,
    optimal,
  }
}

// ---------- MILP (stadieindelad) ----------
function milpPlan(schools, params) {
  const { komm, dem, areaRequired, R } = context(schools, params)
  if (komm.length === 0) return emptyPlan(komm, true)

  const model = { optimize: 'cost', opType: 'min', constraints: {}, variables: {}, ints: {} }

  komm.forEach((j) => {
    const openCost = j.arshyra + (j.underhallsskuld * 1e6) / 10 // hyra + annualiserad skuld
    const ak = 'area_' + j.stadsomrade
    const v = { cost: openCost, ['ybnd_' + j.id]: 1, [ak]: j.pedKapacitet }
    for (const st of STAGE_KEYS) {
      if (j.stageKap[st] > 0) v['cap_' + j.id + '_' + st] = -j.stageKap[st] // Σx − cap·y ≤ 0
    }
    model.variables['y_' + j.id] = v
    model.constraints['ybnd_' + j.id] = { max: 1 }
    model.ints['y_' + j.id] = 1
    for (const st of STAGE_KEYS) {
      if (j.stageKap[st] > 0) model.constraints['cap_' + j.id + '_' + st] = { max: 0 }
    }
    if (!(ak in model.constraints)) model.constraints[ak] = { min: areaRequired[j.stadsomrade] }
  })

  komm.forEach((i) => {
    for (const st of STAGE_KEYS) {
      if (i.stageKap[st] > 0) model.constraints['dem_' + i.id + '_' + st] = { equal: dem[i.id][st] }
    }
  })

  const dist = {}
  komm.forEach((i) => {
    komm.forEach((j) => {
      const km = i === j ? 0 : haversineKm(i.lat, i.lng, j.lat, j.lng)
      for (const st of STAGE_KEYS) {
        if (i.stageKap[st] > 0 && j.stageKap[st] > 0 && km <= R[st]) {
          dist[i.id + '_' + j.id] = km
          model.variables['x_' + i.id + '_' + j.id + '_' + st] = {
            ['dem_' + i.id + '_' + st]: 1, ['cap_' + j.id + '_' + st]: 1,
          }
        }
      }
    })
  })

  let sol
  try { sol = solver.Solve(model) } catch { return null }
  if (!sol || !sol.feasible) return null

  const flow = (i, j) => STAGE_KEYS.reduce((t, st) => t + (sol['x_' + i.id + '_' + j.id + '_' + st] || 0), 0)
  const closures = []
  komm.forEach((j) => {
    if ((sol['y_' + j.id] || 0) >= 0.5) return // öppen
    const reassign = komm
      .filter((k) => k.id !== j.id && flow(j, k) > 0.5)
      .map((k) => ({ namn: k.namn, n: Math.round(flow(j, k)), km: +(dist[j.id + '_' + k.id] || 0).toFixed(1), lng: k.lng, lat: k.lat }))
      .sort((a, b) => a.km - b.km)
    closures.push({
      school: j,
      students: STAGE_KEYS.reduce((t, st) => t + (dem[j.id][st] || 0), 0),
      reassign,
      maxKm: reassign.reduce((m, r) => Math.max(m, r.km), 0),
      savedKr: j.arshyra, avoidedDebt: j.underhallsskuld,
    })
  })
  const loadOf = (k) => komm.reduce((t, i) => t + flow(i, k), 0)
  return finalize(closures, komm, loadOf, true)
}

// ---------- Girig fallback (stadieindelad) ----------
function greedyPlan(schools, params) {
  const { komm, dem, areaRequired, R } = context(schools, params)
  let open = komm.map((s) => ({ s, capStage: { ...s.stageKap }, loadStage: { ...dem[s.id] } }))
  const closures = []
  const totLoad = (o) => STAGE_KEYS.reduce((t, st) => t + o.loadStage[st], 0)
  const score = (o) =>
    (1 - totLoad(o) / (o.s.pedKapacitet || 1)) * 100 + (o.s.renovbehov >= 4 ? o.s.renovbehov * 10 : 0) + o.s.kostnadPerPlats / 1000

  let changed = true
  while (changed) {
    changed = false
    for (const cand of [...open].sort((a, b) => score(b) - score(a))) {
      const areaCapAfter = open
        .filter((o) => o !== cand && o.s.stadsomrade === cand.s.stadsomrade)
        .reduce((t, o) => t + o.s.pedKapacitet, 0)
      if (areaCapAfter < (areaRequired[cand.s.stadsomrade] || 0)) continue

      const others = open
        .filter((o) => o !== cand)
        .map((o) => ({ o, km: haversineKm(cand.s.lat, cand.s.lng, o.s.lat, o.s.lng) }))

      const placements = []
      let ok = true
      for (const st of STAGE_KEYS) {
        let need = cand.loadStage[st]
        if (need <= 0) continue
        const recv = others.filter((x) => x.o.s.stageKap[st] > 0 && x.km <= R[st]).sort((a, b) => a.km - b.km)
        for (const x of recv) {
          const spare = Math.max(0, x.o.capStage[st] - x.o.loadStage[st])
          if (spare <= 0) continue
          const take = Math.min(spare, need)
          placements.push({ o: x.o, st, n: take, km: x.km })
          need -= take
          if (need <= 0) break
        }
        if (need > 0) { ok = false; break }
      }
      if (!ok) continue

      placements.forEach((p) => { p.o.loadStage[p.st] += p.n })
      open = open.filter((o) => o !== cand)
      const recv = {}
      placements.forEach((p) => {
        const k = p.o.s.id
        if (!recv[k]) recv[k] = { namn: p.o.s.namn, n: 0, km: +p.km.toFixed(1), lng: p.o.s.lng, lat: p.o.s.lat }
        recv[k].n += p.n
      })
      closures.push({
        school: cand.s, students: totLoad(cand),
        reassign: Object.values(recv).sort((a, b) => a.km - b.km),
        maxKm: placements.reduce((m, p) => Math.max(m, p.km), 0),
        savedKr: cand.s.arshyra, avoidedDebt: cand.s.underhallsskuld,
      })
      changed = true
      break
    }
  }
  const loadById = {}
  open.forEach((o) => { loadById[o.s.id] = totLoad(o) })
  return finalize(closures, komm, (j) => loadById[j.id] ?? 0, false)
}

// Över denna storlek blir MILP:en (binär per skola + flödesvariabler per par×stadie)
// för tung för webbläsarlösaren — använd den polynomiska giriga heuristiken direkt.
// Den fullskaliga, bevisat optimala lösningen körs i backend (spopt), se HANDOFF.
export const MILP_MAX_SCHOOLS = 40

export function planConsolidation(schools, params) {
  const kommCount = schools.reduce((n, s) => n + (s.hyraPerM2 > 0 ? 1 : 0), 0)
  if (kommCount > MILP_MAX_SCHOOLS) return greedyPlan(schools, params)
  return milpPlan(schools, params) || greedyPlan(schools, params)
}
