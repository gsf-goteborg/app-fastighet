import { createPortal } from 'react-dom'
import { RENOV } from '../lib/constants'
import { MILP_MAX_SCHOOLS } from '../lib/optimizer'
import { actionLabel } from '../lib/whatif'
import { beslutadeDeltaTotalt } from '../data/projekt'
import { SCHOOLS, BASE_YEAR } from '../data/schools'

/* Utskriftsvänligt "underlag för diskussion" — spårbarhet enligt vision.md:
   varje omgång ska kunna säga vad den bygger på (datum, antaganden, datastatus).
   Skrivs ut / sparas som PDF via webbläsarens utskrift. */

const mkr = (kr) => (kr / 1e6).toFixed(1)

// Datastatus — speglar checklistan i HANDOFF.md. Uppdateras när källor byts in.
const DATA_STATUS = [
  ['Skolenheter, läge, elevtal, kapacitet, internhyra', 'Testdata (skarpt uttag, 172 kommunala enheter)', 'test'],
  ['Befolkningsunderlag per mellanområde × stadie', 'Härledd trend ur elevhistorik 2024–2026 (ej stadens prognos)', 'test'],
  ['Elevhärkomst & resvägar', 'Exempelmodell (gravitationsmodell, fågelväg × schablon)', 'test'],
  ['Skolval & fristående-avhopp', 'Exempelmodell (avståndsmock)', 'test'],
  ['Byggnadsår, skick, BTA, underhållsskuld, energiklass', 'SYNTETISKT — driver stäng-rankningen', 'synth'],
  ['Kommande projekt (kapacitet/hyra)', 'Exempeldata (projektfil-mall) — byts mot fastighets skarpa fil', 'test'],
  ['Avstånd i radievillkoret', 'Fågelväg byggnad→byggnad (ej vägnät — fel över Göta älv)', 'synth'],
]

export default function ReportView({ onClose, ctx }) {
  const { scenario, year, radii, reserve, schools, plan, robustness, equity, skolval, whatif } = ctx
  const now = new Date()
  const stamp = now.toLocaleDateString('sv-SE') + ' ' + now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

  return createPortal(
    <div className="report-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="report">
        <div className="report-actions">
          <button className="btn primary" onClick={() => window.print()}>Skriv ut / spara som PDF</button>
          <button className="btn" onClick={onClose}>Stäng</button>
        </div>

        <header className="report-head">
          <div>
            <h1>Skolportfölj Göteborg — planeringsomgång</h1>
            <div className="report-sub">Fastighetsavdelningen · genererad {stamp}</div>
          </div>
          <div className="report-stamp">UNDERLAG FÖR DISKUSSION<br /><small>ej beslutsunderlag</small></div>
        </header>

        <section>
          <h2>Antaganden</h2>
          <table className="gaptable">
            <tbody>
              <tr><td>Demografiskt scenario</td><td><b>{scenario}</b></td></tr>
              <tr><td>Planeringshorisont</td><td><b>{year}</b> (basår {BASE_YEAR})</td></tr>
              <tr><td>Närhetsnorm per stadie (max resväg)</td><td>lågstadiet <b>{radii.lag} km</b> · mellanstadiet <b>{radii.mellan} km</b> · högstadiet <b>{radii.hog} km</b></td></tr>
              <tr><td>Reservmarginal per stadsområde × stadie</td><td><b>{reserve} %</b></td></tr>
              <tr><td>Urval</td><td><b>{schools.length}</b> av {SCHOOLS.length} skolenheter (aktiva filter i verktyget)</td></tr>
              <tr><td>Lösare</td><td>{plan.optimal ? 'MILP — optimal för valt urval' : `girig heuristik (urval > ${MILP_MAX_SCHOOLS} skolor) — ej bevisat optimal`}</td></tr>
              {(() => {
                const t = beslutadeDeltaTotalt(year)
                return (
                  <tr><td>Beslutade projekt inräknade (gap-analysen)</td>
                    <td><b>{t.n}</b> st · {t.total >= 0 ? '+' : ''}{t.total.toLocaleString('sv')} platser ·
                      hyresförändring {t.hyraTkr >= 0 ? '+' : ''}{(t.hyraTkr / 1000).toFixed(1)} Mkr/år vid {year}</td></tr>
                )
              })()}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Föreslagen konsolidering — {year}</h2>
          {plan.closures.length === 0 ? (
            <p>Ingen konsolidering ryms inom villkoren i detta urval/scenario.</p>
          ) : (
            <>
              <p>
                <b>{plan.closures.length}</b> enheter föreslås stängas/omvandlas: −{plan.seatsRemoved.toLocaleString('sv')} platser,
                frigör <b>{mkr(plan.savedKr)} Mkr/år</b>, undviker <b>{Math.round(plan.avoidedDebt)} Mkr</b> underhållsskuld.
                Alla berörda elever får plats inom {plan.maxKm.toFixed(1)} km (fågelväg).
              </p>
              <table className="gaptable">
                <thead>
                  <tr><th>Stäng/omvandla</th><th>Elever</th><th>Tilldelas (optimering)</th><th>Dit väljer eleverna (skolval)</th><th>Resväg snitt</th><th>Frigjord hyra</th><th>Skick*</th></tr>
                </thead>
                <tbody>
                  {plan.closures.map((c) => {
                    const eq = equity?.perClosure.get(c.school.id)
                    const val = skolval?.get(c.school.id)
                    return (
                      <tr key={c.school.id}>
                        <td><b>{c.school.namn}</b></td>
                        <td>{c.students}</td>
                        <td>{c.reassign.map((r) => `${r.namn} (${r.n})`).join(', ')}</td>
                        <td>{val ? val.flows.slice(0, 3).map((f) => `${f.namn} (${Math.round(f.n)}/år)`).join(', ') : '–'}</td>
                        <td>{eq ? `${eq.kmBefore} → ${eq.kmAfter} km` : '–'}</td>
                        <td>{mkr(c.savedKr)} Mkr/år</td>
                        <td>{RENOV[c.school.renovbehov][0]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="report-fine">* Skick och frigjord underhållsskuld bygger på syntetiska fält — se datastatus nedan.
                Skolvalskolumnen visar var eleverna själva skulle välja (per övergångsårgång och år, IIA-omval i valmodellen) —
                avvikelser mot tilldelningen markerar var planen går emot faktiska sökmönster.</p>
            </>
          )}
        </section>

        {equity && plan.closures.length > 0 && (
          <section>
            <h2>Likvärdighet — resvägar per stadie</h2>
            <table className="gaptable">
              <thead>
                <tr><th>Stadie</th><th>Norm</th><th>Elever</th><th>Över normen idag</th><th>Efter planen</th><th>Förändring</th></tr>
              </thead>
              <tbody>
                {equity.byStage.map((st) => {
                  const d = st.afterPct - st.beforePct
                  return (
                    <tr key={st.key}>
                      <td><b>{st.label}</b></td>
                      <td>{st.norm} km</td>
                      <td>{st.n.toLocaleString('sv')}</td>
                      <td>{st.beforePct.toFixed(1)} %</td>
                      <td>{st.afterPct.toFixed(1)} %</td>
                      <td style={{ color: d > 0.05 ? '#b91c1c' : '#15803d' }}>{d >= 0 ? '+' : ''}{d.toFixed(1)} p.e.</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="report-fine">Avstånd = fågelväg × omvägsfaktor (schablon) tills vägnätsavstånd kopplas in;
              före/efter mäts med samma måttstock.</p>
          </section>
        )}

        {whatif?.actions.length > 0 && (
          <section>
            <h2>What-if — användarens scenario ({whatif.actions.length} åtgärder)</h2>
            <p>Åtgärder prövade utöver optimeringens förslag: {whatif.actions.map(actionLabel).join(' · ')}.</p>
            {whatif.closures.length > 0 && (
              <table className="gaptable">
                <thead><tr><th>Stängs</th><th>Elever</th><th>Tas emot av</th><th>Resväg snitt</th><th>Frigjord hyra</th></tr></thead>
                <tbody>
                  {whatif.closures.map((c) => {
                    const eq = whatif.equity?.perClosure.get(c.school.id)
                    return (
                      <tr key={c.school.id}>
                        <td><b>{c.school.namn}</b></td>
                        <td>{c.students}</td>
                        <td>{c.reassign.map((r) => `${r.namn} (${r.n})`).join(', ') || '–'}</td>
                        <td>{eq ? `${eq.kmBefore} → ${eq.kmAfter} km` : '–'}</td>
                        <td>{mkr(c.savedKr)} Mkr/år</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            <p className="report-fine">
              Sammantaget: {whatif.savedKr > 0 ? `−${mkr(whatif.savedKr)} Mkr/år hyra · ` : ''}
              {whatif.movedStudents > 0 ? `${whatif.movedStudents} elever flyttas · ` : ''}
              {whatif.builtCap > 0 ? `+${whatif.builtCap} platser byggs · ` : ''}
              {whatif.barnTotal > 0 ? `+${whatif.barnTotal} elever i prognosen · ` : ''}
              {whatif.equity ? `andel över närhetsnormen ${whatif.equity.totalBeforePct.toFixed(1)} % → ${whatif.equity.totalAfterPct.toFixed(1)} %` : ''}
              {whatif.unplaced > 0 ? ` · OBS: ${whatif.unplaced} elever får inte plats inom normen` : ''}.
              Omflyttning per stadie inom närhetsnormen; skolval/ekonomi enligt samma exempeldata som ovan.
            </p>
          </section>
        )}

        <section>
          <h2>Robusthet — planen under alla scenarier</h2>
          <table className="gaptable">
            <thead><tr><th>Scenario</th><th>Stängningar</th><th>Platser bort</th><th>Frigör</th><th>Enheter</th></tr></thead>
            <tbody>
              {(robustness || []).map((r) => (
                <tr key={r.scenario}>
                  <td><b>{r.scenario}</b></td><td>{r.n}</td><td>{r.seats.toLocaleString('sv')}</td>
                  <td>{mkr(r.savedKr)} Mkr/år</td>
                  <td className="report-fine-cell">{r.names.join(', ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Datastatus & spårbarhet</h2>
          <table className="gaptable">
            <thead><tr><th>Datakälla</th><th>Status i denna omgång</th></tr></thead>
            <tbody>
              {DATA_STATUS.map(([k, v, cls]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className={cls === 'synth' ? 'report-synth' : ''}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="report-fine">
            Genererad ur verktygets aktuella datalager {stamp}. Siffror med status "syntetiskt" får inte
            ligga till grund för beslut; se HANDOFF.md för ordningen källorna byts in.
          </p>
        </section>
      </div>
    </div>,
    document.body,
  )
}
