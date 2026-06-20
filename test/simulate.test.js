import { describe, it, expect } from 'vitest'
import { SCHOOLS } from '../src/data/schools'
import { COHORT, TRANSITIONS, CHOICE } from '../src/data/choice'
import { simulateIntake, entryGrades } from '../src/lib/simulate'
import { gradesOf } from '../src/data/prognos'

describe('skolvalssimulering (önska skola)', () => {
  const intake = simulateIntake(300)

  const totalCohort = ['fklass', 'grade4', 'grade7']
    .reduce((t, k) => t + Object.values(COHORT[k]).reduce((a, b) => a + b, 0), 0)

  it('bevarar elever: total intagning ≈ summa övergångsårgångar', () => {
    let totalIntake = 0
    for (const s of SCHOOLS) totalIntake += intake.get(s.id).mean
    // Monte Carlo + avrundning → liten avvikelse tillåts
    expect(Math.abs(totalIntake - totalCohort)).toBeLessThan(totalCohort * 0.05)
  })

  it('ger ordnade osäkerhetsband P10 ≤ medel ≤ P90', () => {
    for (const s of SCHOOLS) {
      const o = intake.get(s.id)
      expect(o.p10).toBeLessThanOrEqual(o.mean)
      expect(o.mean).toBeLessThanOrEqual(o.p90)
      expect(o.min).toBeLessThanOrEqual(o.p10)
      expect(o.p90).toBeLessThanOrEqual(o.max)
    }
  })

  it('härleder inträdesårskurser ur skolans spann', () => {
    for (const s of SCHOOLS) {
      const eg = entryGrades(s)
      const g = gradesOf(s.arskurser)
      for (const grade of eg) expect(g).toContain(grade)
    }
  })

  it('grade4-övergången är tom (inga F–3-skolor i datasetet)', () => {
    const tot = Object.values(COHORT.grade4).reduce((a, b) => a + b, 0)
    expect(tot).toBe(0)
  })

  it('sannolikheter summerar till 1 per övergång och område (eller 0 om tomt)', () => {
    for (const t of TRANSITIONS) {
      for (const probs of Object.values(CHOICE[t.key])) {
        const sum = probs.reduce((a, x) => a + x.p, 0)
        if (probs.length) expect(sum).toBeCloseTo(1, 6)
      }
    }
  })
})
