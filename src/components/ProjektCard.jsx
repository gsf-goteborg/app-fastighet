import { PROJEKT, PROJEKT_KALLA, beslutadeDeltaTotalt, projektAktivt } from '../data/projekt'

/* Fastighets kommande projekt (projektfilen). Beslutade ingår i baslägets
   kapacitetsbild (gap-tabellen); planerade/utredningar kan prövas i what-if. */

const STATUS_META = {
  beslutad: ['Beslutad', '#16a34a'],
  planerad: ['Planerad', '#f47815'],
  utredning: ['Utredning', '#64748b'],
}
const delta3 = (d) => ['lag', 'mellan', 'hog']
  .map((st) => d[st]).map((v) => (v > 0 ? '+' + v : v || '·')).join(' / ')

export default function ProjektCard({ year, whatif, toggleProjekt }) {
  if (!PROJEKT.length) return null
  const tot = beslutadeDeltaTotalt(year)

  return (
    <div className="card">
      <h2>Kommande projekt (fastighet) — kapacitets- och kostnadsbild</h2>
      <p className="hint">
        Fastighets projektfil. <b>Beslutade</b> projekt ingår i baslägets kapacitet i
        gap-tabellen ovan (aktiva vid {year}, paviljonger räknas bort efter slutkvartal).
        <b> Planerade/utredningar</b> ingår inte — men kan prövas i what-if.
        Källa: <code>{PROJEKT_KALLA}</code> <span className="mockflag">exempeldata</span>
      </p>
      <div className="banner">
        <div>
          Beslutade projekt aktiva {year}: <b>{tot.n}</b> st →{' '}
          <b>{tot.total >= 0 ? '+' : ''}{tot.total.toLocaleString('sv')}</b> platser
          ({tot.lag >= 0 ? '+' : ''}{tot.lag} F–3 · {tot.mellan >= 0 ? '+' : ''}{tot.mellan} 4–6 · {tot.hog >= 0 ? '+' : ''}{tot.hog} 7–9),
          hyresförändring <b>{tot.hyraTkr >= 0 ? '+' : ''}{(tot.hyraTkr / 1000).toFixed(1)} Mkr/år</b>.
        </div>
      </div>
      <table className="gaptable">
        <thead>
          <tr><th>Objekt</th><th>Åtgärd</th><th>Status</th><th>Klart</th><th>Δ platser (F–3/4–6/7–9)</th><th>Δ hyra</th><th>Vid {year}</th><th></th></tr>
        </thead>
        <tbody>
          {PROJEKT.map((p) => {
            const [label, color] = STATUS_META[p.status]
            const aktiv = projektAktivt(p, year)
            const provas = whatif?.projektIds.has(p.projektId)
            return (
              <tr key={p.projektId + p.klartKvartal} title={p.kommentar}>
                <td><b>{p.objekt}</b> <span style={{ color: 'var(--muted)', fontSize: 11 }}>{p.projektId}</span></td>
                <td>{p.atgard}</td>
                <td><span className="pill" style={{ background: color }}>{label}</span></td>
                <td>{p.klartKvartal}{p.slutKvartal ? ` – ${p.slutKvartal}` : ''}</td>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{delta3(p.delta)}</td>
                <td>{p.deltaHyraTkr >= 0 ? '+' : ''}{(p.deltaHyraTkr / 1000).toFixed(1)} Mkr/år</td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {p.status === 'beslutad' ? (aktiv ? 'inräknat' : 'ej klart än') : 'ej i basläget'}
                </td>
                <td>
                  {p.status !== 'beslutad' && (
                    <button className={'btn' + (provas ? ' primary' : '')}
                      style={{ padding: '4px 10px', fontSize: 12 }}
                      onClick={() => toggleProjekt(p.projektId)}>
                      {provas ? 'I what-if ✓' : 'Pröva i what-if'}
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="hint" style={{ marginTop: 8, fontSize: 11 }}>
        Beslutade projekt ingår ännu bara i gap-tabellen — inte i lokalekonomikortet,
        konsolideringsoptimeringen eller spopt-nätdesignen (nästa steg). Hovra en rad
        för planeringsinriktningen.
      </p>
    </div>
  )
}
