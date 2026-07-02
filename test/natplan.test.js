import { describe, it, expect } from 'vitest'
import NATPLAN from '../src/data/generated/natplan.json'
import { SCHOOLS } from '../src/data/schools'

/* Validerar den spopt-genererade nätdesignen (scripts/build_natplan.py) så att
   frontend inte renderar trasiga batchresultat efter en omkörning. */

const STAGES = ['lag', 'mellan', 'hog']

describe('framtida skolnät (natplan.json)', () => {
  const horisonter = Object.entries(NATPLAN.horisonter)

  it('har minst en beräknad horisont med alla stadier', () => {
    expect(horisonter.length).toBeGreaterThan(0)
    for (const [, h] of horisonter) {
      for (const st of STAGES) expect(h.stadier[st]).toBeDefined()
    }
  })

  it('golv ≤ minsta genomförbara (täckning är aldrig dyrare än täckning + plats)', () => {
    for (const [, h] of horisonter) {
      for (const st of STAGES) {
        const r = h.stadier[st]
        if (r.minsta != null) expect(r.minsta).toBeGreaterThanOrEqual(r.golv)
        expect(r.brist).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('nätverk och utanför är disjunkta och har giltiga koordinater', () => {
    for (const [, h] of horisonter) {
      expect(h.natverk.length).toBeGreaterThan(0)
      const inNet = new Set(h.natverk.filter((n) => n.typ === 'skola').map((n) => n.id))
      for (const s of h.utanfor) expect(inNet.has(s.id)).toBe(false)
      for (const p of [...h.natverk, ...h.utanfor]) {
        expect(p.lng).toBeGreaterThan(11); expect(p.lng).toBeLessThan(13)
        expect(p.lat).toBeGreaterThan(57); expect(p.lat).toBeLessThan(58.5)
      }
    }
  })

  it('skol-id i nätverket finns i skolregistret', () => {
    for (const [, h] of horisonter) {
      for (const n of h.natverk) {
        if (n.typ === 'skola') expect(SCHOOLS[n.id]).toBeDefined()
      }
    }
  })

  it('snittresväg ligger inom stadiets norm (tilldelning sker aldrig utanför radien)', () => {
    for (const [, h] of horisonter) {
      for (const st of STAGES) {
        const r = h.stadier[st]
        if (r.meanKm != null) {
          expect(r.meanKm).toBeGreaterThan(0)
          expect(r.maxKm).toBeLessThanOrEqual(NATPLAN.radier[st] + 0.01)
        }
      }
    }
  })
})
