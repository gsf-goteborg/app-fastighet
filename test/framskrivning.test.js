import { describe, it, expect } from 'vitest'
import { SCHOOLS, BASE_YEAR, HORIZONS } from '../src/data/schools'
import { buildProjector } from '../src/lib/framskrivning'

describe('framskrivning (elevprognos)', () => {
  const proj = buildProjector(SCHOOLS)

  it('reproducerar varje skolas faktiska elevtal exakt i basåret (kalibrering)', () => {
    for (const s of SCHOOLS) {
      expect(proj.project(s, BASE_YEAR)).toBe(s.elever)
    }
  })

  it('ger icke-negativa, rimliga elevtal vid alla horisonter', () => {
    for (const y of HORIZONS) {
      for (const s of SCHOOLS) {
        const v = proj.project(s, y)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThan(s.elever * 3)
      }
    }
  })

  it('låter olika områden divergera (växande vs krympande)', () => {
    const by = (namn) => SCHOOLS.find((s) => s.namn === namn)
    const change = (s) => proj.project(s, 2050) / s.elever
    // nybyggnadsområden växer, miljonprogram krymper
    expect(change(by('Ryaskolan'))).toBeGreaterThan(1)
    expect(change(by('Askimsskolan'))).toBeGreaterThan(1)
    expect(change(by('Lövgärdesskolan'))).toBeLessThan(1)
    expect(change(by('Bergsjöskolan'))).toBeLessThan(1)
  })
})
