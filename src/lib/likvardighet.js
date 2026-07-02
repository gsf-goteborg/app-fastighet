import { SCHOOL_ORIGINS, areaPointKm } from '../data/origins'
import { STAGES } from '../data/prognos'

/* ===========================================================================
   LIKVÄRDIGHETSLINS — vad gör konsolideringsplanen med elevernas resvägar?

   För varje åldersstadie jämförs andelen elever med resväg ÖVER stadiets
   närhetsnorm (= planens maxradie) FÖRE och EFTER planen. Eleverna på en
   stängd skola flyttas till mottagarna i planens tilldelning (proportionellt),
   och deras nya resväg skattas från hemområdet till mottagarskolan med samma
   schablon som härkomsttabellen.

   OBS: avstånden är fågelväg × omvägsfaktor tills vägnätsavstånden kopplas in
   (se HANDOFF, spår C) — nivåerna är osäkra men FÖRE/EFTER-jämförelsen mäter
   med samma måttstock på båda sidor.
=========================================================================== */

const DETOUR = 1.35 // samma skattning som origins.js

export function equityOfPlan(schools, plan, radii) {
  const closedById = new Map(plan.closures.map((c) => [c.school.id, c]))
  const stages = STAGES.map((st) => ({ ...st, norm: radii[st.key], n: 0, overBefore: 0, overAfter: 0 }))
  const perClosure = new Map()

  for (const s of schools) {
    if (!s.ordinarieGrundskola) continue // samma omfattning som planen
    const o = SCHOOL_ORIGINS[s.id]
    if (!o) continue
    const cells = [
      ...o.areas.map((a) => ({ area: a.omrade, antal: a.antal, km: a.medelKm })),
      ...(o.ovriga ? [{ area: null, antal: o.ovriga.antal, km: o.ovriga.medelKm }] : []),
    ]
    const closure = closedById.get(s.id)

    // Resväg per cell efter planen: oförändrad om skolan är öppen, annars
    // hemområde → mottagarskola (fördelat enligt planens tilldelning).
    let afterCells = cells
    if (closure) {
      const totN = closure.reassign.reduce((t, r) => t + r.n, 0) || 1
      afterCells = []
      for (const c of cells) {
        for (const r of closure.reassign) {
          const km = c.area != null
            ? areaPointKm(c.area, r.lat, r.lng) ?? c.km
            // "Övriga/spridda" saknar områdeskoppling — skatta med kateterna
            // (nuvarande resväg ⊥ flytten gamla→nya skolan)
            : +Math.sqrt(c.km ** 2 + (r.km * DETOUR) ** 2).toFixed(1)
          afterCells.push({ antal: c.antal * (r.n / totN), km })
        }
      }
    }

    const eTot = s.elever || 1
    for (const st of stages) {
      const w = s.stageElever[st.key] / eTot
      if (!w) continue
      for (const c of cells) { st.n += c.antal * w; if (c.km > st.norm) st.overBefore += c.antal * w }
      for (const c of afterCells) { if (c.km > st.norm) st.overAfter += c.antal * w }
    }

    if (closure) {
      const nB = cells.reduce((t, c) => t + c.antal, 0) || 1
      const nA = afterCells.reduce((t, c) => t + c.antal, 0) || 1
      perClosure.set(s.id, {
        kmBefore: +(cells.reduce((t, c) => t + c.antal * c.km, 0) / nB).toFixed(1),
        kmAfter: +(afterCells.reduce((t, c) => t + c.antal * c.km, 0) / nA).toFixed(1),
      })
    }
  }

  const byStage = stages.map((st) => ({
    key: st.key, label: st.label, norm: st.norm, n: Math.round(st.n),
    beforePct: st.n ? (st.overBefore / st.n) * 100 : 0,
    afterPct: st.n ? (st.overAfter / st.n) * 100 : 0,
  }))
  const totN = stages.reduce((t, s) => t + s.n, 0)
  return {
    byStage, perClosure,
    totalBeforePct: totN ? (stages.reduce((t, s) => t + s.overBefore, 0) / totN) * 100 : 0,
    totalAfterPct: totN ? (stages.reduce((t, s) => t + s.overAfter, 0) / totN) * 100 : 0,
  }
}
