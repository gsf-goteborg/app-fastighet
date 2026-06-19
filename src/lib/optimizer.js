import solver from 'javascript-lp-solver'
import { haversineKm } from './geo'

/* ===========================================================================
   Skolnätsoptimering — klassiskt capacitated facility location-problem.

   MINIMERA lokalkostnad (årshyra + annualiserad underhållsskuld) för öppna
   skolor  =  maximera frigjorda medel till lärartjänster.
   VILLKOR:
     • Täckning   — alla elever får en plats (efterfrågan möts exakt)
     • Avstånd    — elever placeras bara på skola inom maxDistKm
     • Tak        — mottagande skola fylls ej över sin kapacitet
     • Resiliens  — varje område behåller kapacitet ≥ efterfrågan + reserv,
                    där reserven minst täcker största fristående skolan i
                    området (n-1-kontingens) eller en generell marginal.

   Löses som MILP (javascript-lp-solver, körs i webbläsaren) → bevisat optimal
   för givna villkor. Faller tillbaka på girig heuristik om lösaren fallerar.
=========================================================================== */

function emptyPlan(komm, optimal) {
  return { closures: [], savedKr: 0, seatsRemoved: 0, avoidedDebt: 0, maxKm: 0, stranded: [], openCount: komm.length, optimal }
}

function context(schools, { rate, years, reservePct, projFn, year }) {
  // projFn (skola, år) → projicerat elevtal används om det finns (befolknings-
  // baserad framskrivning); annars enkel uniform takt på dagens elevtal.
  const projOf = projFn
    ? (s) => projFn(s, year)
    : (s) => Math.round(s.elever * Math.pow(1 + rate, years))
  const komm = schools.filter((s) => s.hyraPerM2 > 0)   // kommunens egna lokaler
  const fri = schools.filter((s) => s.hyraPerM2 === 0)  // fristående → resiliensbehov
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
    // kan aldrig kräva mer kapacitet än som finns (annars olösbart)
    areaRequired[a] = Math.min(areaDemand[a] + reserve, areaCap[a])
  }
  return { projOf, komm, areaRequired }
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

// ---------- MILP ----------
function milpPlan(schools, params) {
  const { maxDistKm } = params
  const { projOf, komm, areaRequired } = context(schools, params)
  if (komm.length === 0) return emptyPlan(komm, true)

  const d = {}
  komm.forEach((s) => { d[s.id] = projOf(s) })

  const model = { optimize: 'cost', opType: 'min', constraints: {}, variables: {}, ints: {} }

  komm.forEach((j) => {
    const openCost = j.arshyra + (j.underhallsskuld * 1e6) / 10 // hyra + annualiserad skuld
    const ak = 'area_' + j.stadsomrade
    model.variables['y_' + j.id] = {
      cost: openCost,
      ['cap_' + j.id]: -j.pedKapacitet, // Σx_ij - cap·y ≤ 0
      ['ybnd_' + j.id]: 1,
      [ak]: j.pedKapacitet,             // områdets öppna kapacitet
    }
    model.constraints['cap_' + j.id] = { max: 0 }
    model.constraints['ybnd_' + j.id] = { max: 1 }
    model.ints['y_' + j.id] = 1
    if (!(ak in model.constraints)) model.constraints[ak] = { min: areaRequired[j.stadsomrade] }
  })

  komm.forEach((i) => { model.constraints['dem_' + i.id] = { equal: d[i.id] } })

  const dist = {}
  komm.forEach((i) => {
    komm.forEach((j) => {
      const km = i === j ? 0 : haversineKm(i.lat, i.lng, j.lat, j.lng)
      if (km <= maxDistKm) {
        dist[i.id + '_' + j.id] = km
        model.variables['x_' + i.id + '_' + j.id] = { ['dem_' + i.id]: 1, ['cap_' + j.id]: 1 }
      }
    })
  })

  let sol
  try { sol = solver.Solve(model) } catch { return null }
  if (!sol || !sol.feasible) return null

  const loadOf = (j) => komm.reduce((t, i) => t + (sol['x_' + i.id + '_' + j.id] || 0), 0)
  const closures = []
  komm.forEach((j) => {
    if ((sol['y_' + j.id] || 0) >= 0.5) return // öppen
    const reassign = komm
      .filter((k) => k.id !== j.id && (sol['x_' + j.id + '_' + k.id] || 0) > 0.5)
      .map((k) => ({ namn: k.namn, n: Math.round(sol['x_' + j.id + '_' + k.id]), km: +(dist[j.id + '_' + k.id] || 0).toFixed(1), lng: k.lng, lat: k.lat }))
      .sort((a, b) => a.km - b.km)
    closures.push({
      school: j, students: d[j.id], reassign,
      maxKm: reassign.reduce((m, r) => Math.max(m, r.km), 0),
      savedKr: j.arshyra, avoidedDebt: j.underhallsskuld,
    })
  })
  return finalize(closures, komm, loadOf, true)
}

// ---------- Girig fallback ----------
function greedyPlan(schools, params) {
  const { maxDistKm } = params
  const { projOf, komm, areaRequired } = context(schools, params)
  let open = komm.map((s) => ({ s, cap: s.pedKapacitet, load: projOf(s) }))
  const closures = []
  const score = (o) =>
    (1 - o.load / o.cap) * 100 + (o.s.renovbehov >= 4 ? o.s.renovbehov * 10 : 0) + o.s.kostnadPerPlats / 1000

  let changed = true
  while (changed) {
    changed = false
    for (const cand of [...open].sort((a, b) => score(b) - score(a))) {
      const areaCapAfter = open
        .filter((o) => o !== cand && o.s.stadsomrade === cand.s.stadsomrade)
        .reduce((t, o) => t + o.cap, 0)
      if (areaCapAfter < (areaRequired[cand.s.stadsomrade] || 0)) continue

      const others = open
        .filter((o) => o !== cand)
        .map((o) => ({ o, km: haversineKm(cand.s.lat, cand.s.lng, o.s.lat, o.s.lng) }))
        .filter((x) => x.km <= maxDistKm)
        .sort((a, b) => a.km - b.km)
      let need = cand.load
      const assign = []
      for (const x of others) {
        const spare = Math.max(0, x.o.cap - x.o.load)
        if (spare <= 0) continue
        const take = Math.min(spare, need)
        assign.push({ o: x.o, n: take, km: x.km })
        need -= take
        if (need <= 0) break
      }
      if (need > 0) continue

      assign.forEach((a) => { a.o.load += a.n })
      open = open.filter((o) => o !== cand)
      closures.push({
        school: cand.s, students: cand.load,
        reassign: assign.map((a) => ({ namn: a.o.s.namn, n: a.n, km: +a.km.toFixed(1), lng: a.o.s.lng, lat: a.o.s.lat })),
        maxKm: assign.reduce((m, a) => Math.max(m, a.km), 0),
        savedKr: cand.s.arshyra, avoidedDebt: cand.s.underhallsskuld,
      })
      changed = true
      break
    }
  }
  const loadById = {}
  open.forEach((o) => { loadById[o.s.id] = o.load })
  return finalize(closures, komm, (j) => loadById[j.id] ?? 0, false)
}

export function planConsolidation(schools, params) {
  return milpPlan(schools, params) || greedyPlan(schools, params)
}
