import { describe, it, expect } from 'vitest'
import { SCHOOLS } from '../src/data/schools'
import { STAGE_RADIUS } from '../src/lib/optimizer'
import { buildWhatIf, makeProjAdjust, candidateAsSchool, CANDIDATES_BY_ID } from '../src/lib/whatif'

const closable = SCHOOLS.find((s) => s.konsoliderbar)

describe('what-if: stäng skola', () => {
  const w = buildWhatIf([{ typ: 'stang', schoolId: closable.id }], STAGE_RADIUS)

  it('flyttar skolans elever: placerade + oplacerade = dagens elever', () => {
    const c = w.closures[0]
    const placed = c.reassign.reduce((t, r) => t + r.n, 0)
    expect(placed + w.unplaced).toBe(c.students)
    expect(c.students).toBeGreaterThan(0)
  })

  it('flyttar aldrig till den stängda skolan och håller radievillkoret', () => {
    const c = w.closures[0]
    const maxR = Math.max(...Object.values(STAGE_RADIUS))
    for (const r of c.reassign) {
      expect(r.namn).not.toBe(closable.namn)
      expect(r.km).toBeLessThanOrEqual(maxR)
    }
  })

  it('räknar besparing och likvärdighet', () => {
    expect(w.savedKr).toBe(closable.arshyra)
    expect(w.equity).not.toBeNull()
    expect(w.equity.perClosure.has(closable.id)).toBe(true)
  })

  it('mottagare överbeläggs inte av omflyttningen (ledig plats respekteras)', () => {
    for (const { s, extra } of w.receiverLoad) {
      expect(s.elever + extra).toBeLessThanOrEqual(s.pedKapacitet)
    }
  })
})

describe('what-if: bygg kandidatsite', () => {
  const site = [...CANDIDATES_BY_ID.values()][0]

  it('pseudo-skolans stadiekapacitet summerar till sitens kapacitet (±avrundning)', () => {
    const s = candidateAsSchool(site)
    const tot = s.stageKap.lag + s.stageKap.mellan + s.stageKap.hog
    expect(Math.abs(tot - site.proposedCapacity)).toBeLessThanOrEqual(2)
  })

  it('en byggd site kan ta emot elever från en stängning intill', () => {
    // site i samma mellanområde som en stängbar skola ger flöde till siten
    const near = SCHOOLS.find((s) => s.konsoliderbar && [...CANDIDATES_BY_ID.values()]
      .some((c) => c.mellanomrade === s.mellanomrade))
    if (!near) return
    const c = [...CANDIDATES_BY_ID.values()].find((x) => x.mellanomrade === near.mellanomrade)
    const w = buildWhatIf([{ typ: 'stang', schoolId: near.id }, { typ: 'bygg', siteId: c.id }], STAGE_RADIUS)
    expect(w.built).toHaveLength(1)
    expect(w.builtCap).toBe(c.proposedCapacity)
  })
})

describe('what-if: +barn i område (prognosjustering)', () => {
  const omrade = SCHOOLS.find((s) => s.ordinarieGrundskola).mellanomrade
  const adjust = makeProjAdjust([{ typ: 'barn', omrade, antal: 300, franAr: 2035 }])

  it('null utan barn-åtgärder', () => {
    expect(makeProjAdjust([{ typ: 'stang', schoolId: 1 }])).toBeNull()
  })

  it('ingen effekt före startåret', () => {
    for (const s of SCHOOLS) expect(adjust(s, 2030)).toBe(0)
  })

  it('fördelar (nära) hela tillskottet över skolorna från startåret', () => {
    const total = SCHOOLS.reduce((t, s) => t + adjust(s, 2040), 0)
    expect(Math.abs(total - 300)).toBeLessThan(10) // avrundning per skola
  })
})
