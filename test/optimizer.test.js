import { describe, it, expect } from 'vitest'
import { SCHOOLS } from '../src/data/schools'
import { STAGE_KEYS } from '../src/data/prognos'
import { planConsolidation, STAGE_RADIUS } from '../src/lib/optimizer'

// kraftigt minskande scenario → konsolidering blir möjlig
const decline = (s, y) => Math.round(s.elever * Math.pow(1 - 0.022, y - 2026))

describe('konsolideringsoptimering (stadieindelad)', () => {
  it('returnerar en giltig planstruktur', () => {
    const plan = planConsolidation(SCHOOLS, { year: 2035, projFn: decline, radii: STAGE_RADIUS, reservePct: 10 })
    expect(plan).toHaveProperty('closures')
    expect(Array.isArray(plan.closures)).toBe(true)
    expect(plan.openCount).toBeGreaterThan(0)
  })

  it('hittar konsolidering vid kraftig minskning och lång horisont', () => {
    const plan = planConsolidation(SCHOOLS, { year: 2050, projFn: decline, radii: STAGE_RADIUS, reservePct: 10 })
    expect(plan.closures.length).toBeGreaterThan(0)
  })

  it('respekterar stadiets maxavstånd — ingen mottagare bortom största stadie-radien', () => {
    const plan = planConsolidation(SCHOOLS, { year: 2050, projFn: decline, radii: STAGE_RADIUS, reservePct: 10 })
    for (const c of plan.closures) {
      const served = STAGE_KEYS.filter((st) => c.school.stageKap[st] > 0)
      const maxR = Math.max(...served.map((st) => STAGE_RADIUS[st]))
      for (const r of c.reassign) expect(r.km).toBeLessThanOrEqual(maxR + 0.05)
    }
  })

  it('bevarar elever: omfördelade ≈ stängd skolas elever', () => {
    const plan = planConsolidation(SCHOOLS, { year: 2050, projFn: decline, radii: STAGE_RADIUS, reservePct: 10 })
    for (const c of plan.closures) {
      const moved = c.reassign.reduce((t, r) => t + r.n, 0)
      // avrundning per mottagare → liten tolerans
      expect(Math.abs(moved - c.students)).toBeLessThanOrEqual(c.reassign.length + 1)
    }
  })

  it('hårdare närhetskrav för yngre barn ger inte FLER stängningar', () => {
    const base = { year: 2050, projFn: decline, reservePct: 10 }
    const tight = planConsolidation(SCHOOLS, { ...base, radii: { lag: 1, mellan: 4, hog: 6 } })
    const loose = planConsolidation(SCHOOLS, { ...base, radii: { lag: 10, mellan: 10, hog: 10 } })
    expect(tight.closures.length).toBeLessThanOrEqual(loose.closures.length)
  })

  it('aldrig negativ besparing eller fler stängningar än kommunala skolor', () => {
    const komm = SCHOOLS.filter((s) => s.hyraPerM2 > 0).length
    const plan = planConsolidation(SCHOOLS, { year: 2050, projFn: decline, radii: STAGE_RADIUS, reservePct: 0 })
    expect(plan.savedKr).toBeGreaterThanOrEqual(0)
    expect(plan.closures.length).toBeLessThanOrEqual(komm)
  })

  it('föreslår ALDRIG anpassad grundskola eller specialverksamhet för stängning', () => {
    const plan = planConsolidation(SCHOOLS, { year: 2050, projFn: decline, radii: { lag: 10, mellan: 10, hog: 10 }, reservePct: 0 })
    expect(plan.closures.length).toBeGreaterThan(0)
    for (const c of plan.closures) {
      expect(c.school.skolform).toBe('Grundskola')
      expect(c.school.ordinarieGrundskola).toBe(true)
      expect(/anpassad|resursskola|döv|hörsel/i.test(c.school.namn)).toBe(false)
    }
  })

  it('föreslår bara konsoliderbara enheter (ej samlokaliserade delade hus)', () => {
    const plan = planConsolidation(SCHOOLS, { year: 2050, projFn: decline, radii: { lag: 10, mellan: 10, hog: 10 }, reservePct: 0 })
    for (const c of plan.closures) expect(c.school.konsoliderbar).toBe(true)
  })

  it('MILP körs för litet urval och ger giltig struktur (endast grundskola)', () => {
    const subset = SCHOOLS.filter((s) => s.stadsomrade === 'Centrum').slice(0, 30)
    const plan = planConsolidation(subset, { year: 2050, projFn: decline, radii: { lag: 4, mellan: 6, hog: 8 }, reservePct: 0 })
    expect(plan).toHaveProperty('closures')
    expect(plan.openCount).toBeGreaterThanOrEqual(0)
    for (const c of plan.closures) {
      expect(c.school.skolform).toBe('Grundskola')
      expect(c.school.konsoliderbar).toBe(true)
    }
  })
})
