import { describe, it, expect } from 'vitest'
import { SCHOOLS } from '../src/data/schools'
import { STAGE_KEYS } from '../src/data/prognos'
import { SCHOOL_ORIGINS, MIN_CELL, validateOrigins } from '../src/data/origins'

describe('skoldata — stadieindelad kapacitet', () => {
  it('stadiekapacitet summerar till total pedagogisk kapacitet', () => {
    for (const s of SCHOOLS) {
      const sum = STAGE_KEYS.reduce((t, st) => t + s.stageKap[st], 0)
      expect(sum).toBe(s.pedKapacitet)
    }
  })

  it('elever per stadie summerar (nära) totala elevtalet', () => {
    for (const s of SCHOOLS) {
      const sum = STAGE_KEYS.reduce((t, st) => t + s.stageElever[st], 0)
      expect(Math.abs(sum - s.elever)).toBeLessThanOrEqual(1)
    }
  })
})

describe('elevhärkomst (origins) — sekretess och integritet', () => {
  it('mockdatan passerar importkontrollen utan anmärkning', () => {
    expect(validateOrigins()).toEqual([])
  })

  it('redovisade celler ligger på/över sekretessgränsen', () => {
    for (const s of SCHOOLS) {
      for (const a of SCHOOL_ORIGINS[s.id].areas) {
        expect(a.antal).toBeGreaterThanOrEqual(MIN_CELL)
      }
    }
  })

  it('härkomsten (inkl. övriga) summerar till skolans elevtal', () => {
    for (const s of SCHOOLS) {
      const o = SCHOOL_ORIGINS[s.id]
      const sum = o.areas.reduce((t, a) => t + a.antal, 0) + (o.ovriga ? o.ovriga.antal : 0)
      expect(sum).toBe(s.elever)
    }
  })

  it('fångar manipulerad data (regression på validatorn)', () => {
    const broken = { 0: { meanKm: 1, areas: [{ primaromrade: 'Påhittat', antal: 1, medelKm: 1 }], ovriga: null } }
    expect(validateOrigins(SCHOOLS, broken).length).toBeGreaterThan(0)
  })
})
