import { describe, it, expect } from 'vitest'
import { SCHOOLS } from '../src/data/schools'
import { CHOICE, COHORT, TRANSITIONS } from '../src/data/choice'
import { choiceRedistribution, planFlowsGeoJSON, planClosedGeoJSON } from '../src/lib/skolval'
import { planConsolidation, STAGE_RADIUS } from '../src/lib/optimizer'
import { BASE_YEAR } from '../src/data/schools'

// En skola som faktiskt attraherar elever i valmodellen (finns i någon fördelning)
const attracts = (id) => TRANSITIONS.some((t) =>
  Object.values(CHOICE[t.key]).some((probs) => probs.some((x) => x.schoolId === id && x.p > 0.001)))
const closedSchool = SCHOOLS.find((s) => s.ordinarieGrundskola && attracts(s.id))

describe('skolvalsdriven omfördelning vid stängning (IIA)', () => {
  const result = choiceRedistribution([closedSchool.id])
  const entry = result.get(closedSchool.id)

  it('ger flöden för den stängda skolan', () => {
    expect(entry).toBeDefined()
    expect(entry.flows.length).toBeGreaterThan(0)
  })

  it('flödar aldrig till en stängd skola', () => {
    for (const f of entry.flows) expect(f.schoolId).not.toBe(closedSchool.id)
  })

  it('flödar bara till ordinarie grundskola (ej anpassad/specialverksamhet)', () => {
    for (const f of entry.flows) expect(SCHOOLS[f.schoolId].ordinarieGrundskola).toBe(true)
  })

  it('bevarar (nära) massan: omfördelat ≈ skolans förväntade intagning', () => {
    // förväntad intagning = Σ över övergångar/områden av kohort × valsannolikhet
    let expected = 0
    for (const t of TRANSITIONS) {
      for (const a of Object.keys(CHOICE[t.key])) {
        const n = COHORT[t.key][a] || 0
        if (!n) continue
        const p = CHOICE[t.key][a].find((x) => x.schoolId === closedSchool.id)?.p || 0
        expected += n * p
      }
    }
    // små flöden (< 0,5 elev) filtreras bort i redovisningen → liten tolerans
    expect(Math.abs(entry.total - expected)).toBeLessThan(Math.max(2, expected * 0.05))
  })

  it('sorterar flödena fallande', () => {
    for (let i = 1; i < entry.flows.length; i++) {
      expect(entry.flows[i].n).toBeLessThanOrEqual(entry.flows[i - 1].n)
    }
  })

  it('flera samtidiga stängningar: ingen mottagare är stängd', () => {
    const two = SCHOOLS.filter((s) => s.ordinarieGrundskola && attracts(s.id)).slice(0, 2).map((s) => s.id)
    const res = choiceRedistribution(two)
    for (const [, e] of res) {
      for (const f of e.flows) expect(two).not.toContain(f.schoolId)
    }
  })
})

describe('kartlager: omfördelningsflöden som GeoJSON', () => {
  const grund = SCHOOLS.filter((s) => s.ordinarieGrundskola)
  const year = 2050, rate = -0.022
  const plan = planConsolidation(grund, {
    rate, years: year - BASE_YEAR, year,
    projFn: (s, y) => Math.round(s.elever * Math.pow(1 + rate, y - BASE_YEAR)),
    radii: STAGE_RADIUS, reservePct: 0,
  })

  it('tom plan ger tomma lager', () => {
    expect(planFlowsGeoJSON({ closures: [] }).features).toHaveLength(0)
    expect(planClosedGeoJSON({ closures: [] }).features).toHaveLength(0)
  })

  it('bygger linjer av båda typerna med giltiga koordinater', () => {
    if (plan.closures.length === 0) return
    const fc = planFlowsGeoJSON(plan)
    expect(fc.features.length).toBeGreaterThan(0)
    const typer = new Set(fc.features.map((f) => f.properties.typ))
    expect(typer.has('tilldelning')).toBe(true)
    expect(typer.has('skolval')).toBe(true)
    for (const f of fc.features) {
      expect(f.geometry.type).toBe('LineString')
      for (const [lng, lat] of f.geometry.coordinates) {
        expect(lng).toBeGreaterThan(11); expect(lng).toBeLessThan(13)
        expect(lat).toBeGreaterThan(57); expect(lat).toBeLessThan(58.5)
      }
      expect(f.properties.n).toBeGreaterThan(0)
    }
  })

  it('markerar exakt de stängda skolorna', () => {
    const fc = planClosedGeoJSON(plan)
    expect(fc.features).toHaveLength(plan.closures.length)
  })
})
