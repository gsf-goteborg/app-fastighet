import { describe, it, expect } from 'vitest'
import { SCHOOLS, BASE_YEAR } from '../src/data/schools'
import { planConsolidation, STAGE_RADIUS } from '../src/lib/optimizer'
import { equityOfPlan } from '../src/lib/likvardighet'

describe('likvärdighetslins (resvägseffekt av konsolideringsplan)', () => {
  const grund = SCHOOLS.filter((s) => s.ordinarieGrundskola)

  it('utan stängningar är före = efter', () => {
    const plan = { closures: [] }
    const eq = equityOfPlan(grund, plan, STAGE_RADIUS)
    for (const st of eq.byStage) {
      expect(st.afterPct).toBeCloseTo(st.beforePct, 6)
    }
    expect(eq.totalAfterPct).toBeCloseTo(eq.totalBeforePct, 6)
  })

  it('procentandelar ligger i [0, 100] och elevantal per stadie > 0', () => {
    const plan = { closures: [] }
    const eq = equityOfPlan(grund, plan, STAGE_RADIUS)
    for (const st of eq.byStage) {
      expect(st.beforePct).toBeGreaterThanOrEqual(0)
      expect(st.beforePct).toBeLessThanOrEqual(100)
      expect(st.n).toBeGreaterThan(0)
    }
  })

  it('med en riktig plan finns per-stängning-resvägar och de är rimliga', () => {
    // krympande scenario vid lång horisont brukar ge stängningar
    const year = 2050
    const rate = -0.022
    const plan = planConsolidation(grund, {
      rate, years: year - BASE_YEAR, year,
      projFn: (s, y) => Math.round(s.elever * Math.pow(1 + rate, y - BASE_YEAR)),
      radii: STAGE_RADIUS, reservePct: 0,
    })
    if (plan.closures.length === 0) return // inget att mäta i denna datavariant
    const eq = equityOfPlan(grund, plan, STAGE_RADIUS)
    for (const c of plan.closures) {
      const p = eq.perClosure.get(c.school.id)
      expect(p).toBeDefined()
      expect(p.kmBefore).toBeGreaterThan(0)
      expect(p.kmAfter).toBeGreaterThan(0)
      expect(p.kmAfter).toBeLessThan(30) // sanity: inom stadsregionen
    }
    // öppna skolors elever påverkas inte → andelen kan inte sjunka under den
    // del som kommer från oförändrade skolor; grov sanity: inom [0,100]
    expect(eq.totalAfterPct).toBeGreaterThanOrEqual(0)
    expect(eq.totalAfterPct).toBeLessThanOrEqual(100)
  })
})
