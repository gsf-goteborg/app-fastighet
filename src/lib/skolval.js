import { SCHOOLS } from '../data/schools'
import { CHOICE, COHORT, TRANSITIONS } from '../data/choice'

/* ===========================================================================
   SKOLVALSDRIVEN OMFÖRDELNING VID STÄNGNING (IIA).

   Optimeringens tilldelning säger var eleverna FÅR PLATS — skolvalsmodellen
   säger var de skulle VÄLJA. När en skola tas bort ur varje områdes
   valfördelning omfördelas dess valsannolikhet proportionellt på de skolor
   som är kvar (IIA-antagandet i en logit-/nyttomodell). Massan som flyttas är
   skolans förväntade intagning per övergångsårgång (F / åk 4 / åk 7).

   Jämförelsen tilldelning ↔ skolval visar var planen går emot elevernas
   faktiska sökmönster — de skolor som får ta emot fler än de brukar attrahera.

   OBS: bygger på CHOICE/COHORT som idag är en avståndsmock (data/choice.js);
   byts mot er skarpa valmodell utan att den här beräkningen ändras.
=========================================================================== */

// closedIds → Map stängdId → { total, flows: [{schoolId, namn, lng, lat, n}] }
export function choiceRedistribution(closedIds) {
  const closed = new Set(closedIds)
  const flows = new Map([...closed].map((id) => [id, new Map()]))
  // Rätt skolform, rätt regler: omval sker bara till ordinarie grundskola —
  // anpassad grundskola/specialverksamhet är inte utbytbara alternativ, även
  // om mock-valmodellen råkar ge dem sannolikhet.
  const eligible = (id) => SCHOOLS[id]?.ordinarieGrundskola && !closed.has(id)

  for (const t of TRANSITIONS) {
    for (const a of Object.keys(CHOICE[t.key])) {
      const n = COHORT[t.key][a] || 0
      const probs = CHOICE[t.key][a]
      if (!n || !probs?.length) continue
      let pClosed = 0, pElig = 0
      for (const x of probs) {
        if (closed.has(x.schoolId)) pClosed += x.p
        else if (eligible(x.schoolId)) pElig += x.p
      }
      // ingen stängd skola i området, eller inga giltiga alternativ kvar → inget omval
      if (pClosed <= 0 || pElig <= 0.001) continue
      for (const c of probs) {
        if (!closed.has(c.schoolId) || c.p <= 0) continue
        const acc = flows.get(c.schoolId)
        for (const x of probs) {
          if (!eligible(x.schoolId)) continue
          // n·p_c elever ville till den stängda skolan; de väljer om ∝ p_x/pGiltiga
          acc.set(x.schoolId, (acc.get(x.schoolId) || 0) + n * c.p * (x.p / pElig))
        }
      }
    }
  }

  const out = new Map()
  for (const [closedId, acc] of flows) {
    // total = hela den omfördelade massan; flows visar bara flöden ≥ 0,5 elev/år
    const total = [...acc.values()].reduce((t, n) => t + n, 0)
    const list = [...acc.entries()]
      .map(([schoolId, n]) => ({ schoolId, namn: SCHOOLS[schoolId].namn, lng: SCHOOLS[schoolId].lng, lat: SCHOOLS[schoolId].lat, n }))
      .filter((x) => x.n >= 0.5)
      .sort((a, b) => b.n - a.n)
    out.set(closedId, { total, flows: list })
  }
  return out
}

/* --- kartlager: omfördelning vid stängning som GeoJSON ---------------------
   Linjer stängd skola → mottagare. typ 'tilldelning' = optimeringens
   placering; 'skolval' = elevernas omval (IIA, topp 6 per stängning). */
export function planFlowsGeoJSON(plan) {
  const features = []
  if (plan?.closures?.length) {
    const skolval = choiceRedistribution(plan.closures.map((c) => c.school.id))
    for (const c of plan.closures) {
      const from = [c.school.lng, c.school.lat]
      for (const r of c.reassign) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [from, [r.lng, r.lat]] },
          properties: { typ: 'tilldelning', n: r.n },
        })
      }
      for (const f of (skolval.get(c.school.id)?.flows || []).slice(0, 6)) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [from, [f.lng, f.lat]] },
          properties: { typ: 'skolval', n: Math.round(f.n) },
        })
      }
    }
  }
  return { type: 'FeatureCollection', features }
}

export function planClosedGeoJSON(plan) {
  return {
    type: 'FeatureCollection',
    features: (plan?.closures || []).map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.school.lng, c.school.lat] },
      properties: { namn: c.school.namn, students: c.students },
    })),
  }
}
