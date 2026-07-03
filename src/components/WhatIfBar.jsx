import { useState } from 'react'
import { actionLabel } from '../lib/whatif'
import { FACETS } from '../lib/constants'
import { BASE_YEAR, HORIZONS } from '../data/schools'

/* Scenariorad för what-if: syns bara när åtgärder finns (eller barn-formuläret
   är öppet). Chips per åtgärd, diff-sammanfattning mot basläget, återställ. */

const mkr = (kr) => (kr / 1e6).toFixed(1)

export default function WhatIfBar({ actions, whatif, onRemove, onReset, onAddBarn, formOpen, setFormOpen }) {
  const [omrade, setOmrade] = useState(FACETS.mellanomrade[0])
  const [antal, setAntal] = useState(200)
  const [franAr, setFranAr] = useState(HORIZONS[0])

  if (!actions.length && !formOpen) return null
  const eq = whatif?.equity
  const dEq = eq ? eq.totalAfterPct - eq.totalBeforePct : 0

  return (
    <div className="whatif-bar">
      <span className="whatif-title">What-if</span>

      {actions.map((a, i) => (
        <span key={i} className={'whatif-chip ' + a.typ}>
          {actionLabel(a)}
          <button onClick={() => onRemove(i)} aria-label="Ta bort åtgärd">×</button>
        </span>
      ))}

      <button className="whatif-add" onClick={() => setFormOpen(!formOpen)}>+ barn i område</button>

      {formOpen && (
        <span className="whatif-form">
          <select value={omrade} onChange={(e) => setOmrade(e.target.value)}>
            {FACETS.mellanomrade.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input type="number" min="10" step="10" value={antal}
            onChange={(e) => setAntal(Math.max(10, +e.target.value || 0))} />
          <span className="whatif-formlabel">elever från</span>
          <select value={franAr} onChange={(e) => setFranAr(+e.target.value)}>
            {[BASE_YEAR + 1, ...HORIZONS].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn primary" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => { onAddBarn({ typ: 'barn', omrade, antal, franAr }); setFormOpen(false) }}>
            Lägg till
          </button>
        </span>
      )}

      {actions.length > 0 && whatif && (
        <span className="whatif-diff">
          {whatif.savedKr > 0 && <b className="pos">−{mkr(whatif.savedKr)} Mkr/år hyra</b>}
          {whatif.movedStudents > 0 && <span>{whatif.movedStudents} elever flyttas</span>}
          {eq && <span>likvärdighet <b className={dEq > 0.05 ? 'neg' : 'pos'}>{dEq >= 0 ? '+' : ''}{dEq.toFixed(1)} p.e.</b></span>}
          {whatif.builtCap > 0 && <span>+{whatif.builtCap} platser</span>}
          {whatif.projektHyraTkr !== 0 && (
            <span>Δhyra <b className={whatif.projektHyraTkr > 0 ? 'neg' : 'pos'}>
              {whatif.projektHyraTkr > 0 ? '+' : ''}{(whatif.projektHyraTkr / 1000).toFixed(1)} Mkr/år
            </b></span>
          )}
          {whatif.barnTotal > 0 && <span>+{whatif.barnTotal} elever (prognos)</span>}
          {whatif.unplaced > 0 && <b className="neg">⚠ {whatif.unplaced} elever får inte plats inom normen</b>}
        </span>
      )}

      <span className="mockflag">exempeldata</span>
      {actions.length > 0 && <button className="whatif-reset" onClick={onReset}>Återställ</button>}
    </div>
  )
}
