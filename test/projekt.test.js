import { describe, it, expect } from 'vitest'
import { PROJEKT, beslutadeDeltaTotalt, beslutadeDeltaPerOmrade, projektAktivt } from '../src/data/projekt'
import { buildWhatIf, PROJEKT_BY_ID } from '../src/lib/whatif'
import { STAGE_RADIUS } from '../src/lib/optimizer'
import { SCHOOLS } from '../src/data/schools'

describe('projektfilen (projekt.json)', () => {
  it('har giltiga statusar, åtgärder och kvartal', () => {
    for (const p of PROJEKT) {
      expect(['beslutad', 'planerad', 'utredning']).toContain(p.status)
      expect(['nybyggnad', 'tillbyggnad', 'renovering', 'paviljong', 'ersattning', 'avveckling']).toContain(p.atgard)
      expect(p.klartAr).toBeGreaterThan(2020)
      expect(p.stadsomrade).toBeTruthy() // även nybyggnad får område (närmaste skola)
      if (p.atgard === 'paviljong') expect(p.slutAr).not.toBeNull()
      if (p.enhetId != null) expect(SCHOOLS[p.enhetId]).toBeDefined()
    }
  })

  it('beslutade delta växer med horisonten och paviljonger räknas bort efter slut', () => {
    const t27 = beslutadeDeltaTotalt(2027)
    const t30 = beslutadeDeltaTotalt(2030)
    const t35 = beslutadeDeltaTotalt(2035)
    expect(t30.total).toBeGreaterThanOrEqual(t27.total)
    expect(t35.total).toBeGreaterThanOrEqual(t30.total)
    // paviljongen (P-2026-003, slut 2029Q2) ingår 2027 men inte 2030
    const pav = PROJEKT.find((p) => p.atgard === 'paviljong' && p.status === 'beslutad')
    if (pav) {
      expect(projektAktivt(pav, 2027)).toBe(true)
      expect(projektAktivt(pav, 2030)).toBe(false)
    }
  })

  it('per-område-delta summerar till totalen', () => {
    const per = beslutadeDeltaPerOmrade(2040)
    const sum = Object.values(per).reduce((t, o) => t + o.total, 0)
    expect(sum).toBe(beslutadeDeltaTotalt(2040).total)
  })
})

describe('what-if: pröva projekt ur projektfilen', () => {
  it('avvecklingsprojekt blir stängning av enheten', () => {
    const avv = PROJEKT.find((p) => p.atgard === 'avveckling' && p.enhetId != null)
    if (!avv) return
    const w = buildWhatIf([{ typ: 'projekt', projektId: avv.projektId }], STAGE_RADIUS)
    expect(w.closedIds.has(avv.enhetId)).toBe(true)
    expect(w.closures.some((c) => c.school.id === avv.enhetId)).toBe(true)
    // avvecklingens deltaHyra ska INTE dubbelräknas (stängningen tar årshyran)
    expect(w.projektHyraTkr).toBe(0)
  })

  it('kapacitetsprojekt blir mottagarkapacitet + hyresdelta i diffen', () => {
    const till = PROJEKT.find((p) => p.atgard === 'tillbyggnad' && p.status !== 'beslutad')
    if (!till) return
    const w = buildWhatIf([{ typ: 'projekt', projektId: till.projektId }], STAGE_RADIUS)
    const totDelta = till.delta.lag + till.delta.mellan + till.delta.hog
    expect(w.builtCap).toBe(totDelta)
    expect(w.projektHyraTkr).toBe(till.deltaHyraTkr)
    expect(w.projektIds.has(till.projektId)).toBe(true)
  })

  it('PROJEKT_BY_ID slår upp alla projekt', () => {
    for (const p of PROJEKT) expect(PROJEKT_BY_ID.get(p.projektId)).toBeDefined()
  })
})
