import NATPLAN from '../data/generated/natplan.json'
import { STAGES } from '../data/prognos'

/* Framtida skolnät — normativ nätdesign (spopt, batch). Läser den
   förberäknade natplan.json (scripts/build_natplan.py). Fas 1-prototyp:
   schablonavstånd + exempelprognos + exempelkandidater. */

const HOR = Object.keys(NATPLAN.horisonter).map(Number)
export const nearestNatHorizon = (year) =>
  HOR.reduce((b, h) => (Math.abs(h - year) < Math.abs(b - year) ? h : b))

export default function NatplanCard({ year }) {
  const hy = nearestNatHorizon(year)
  const h = NATPLAN.horisonter[String(hy)]
  const nya = h.natverk.filter((n) => n.typ === 'kandidat')
  const totalBrist = STAGES.reduce((t, st) => t + (h.stadier[st.key]?.brist || 0), 0)

  return (
    <div className="card">
      <h2>Framtida skolnät — optimal design (spopt) · {hy}</h2>
      <p className="hint">
        Omvänd fråga mot konsolideringen: <b>var borde skolorna ligga</b> givet var eleverna finns {hy}?
        Per stadie: <b>teoretiskt golv</b> = minsta antal lägen som täcker alla elever inom närhetsnormen
        (LSCP); <b>minsta genomförbara nät</b> = som golvet men alla får också <i>plats</i> (kapacitet);
        <b> placeringen</b> väljs så att elevernas totala resväg minimeras (kapaciterad p-median) bland
        befintliga skolor <i>och</i> kandidatsiter. Beräknat i batch för scenariot Befolkningsprognos.
        <span className="mockflag">metodprototyp — schablonavstånd &amp; exempeldata</span>
      </p>

      <div className="banner">
        <div>
          Optimalt nät {hy}: <b>{h.natverk.length}</b> lägen, varav <b>{nya.length}</b> nya
          (kandidatsiter) — <b>{h.utanfor.length}</b> av dagens skolor behövs inte i nätet.
          {totalBrist > 0 && (
            <> Men: <b style={{ color: '#dc2626' }}>{totalBrist.toLocaleString('sv')} elever får inte plats inom
            närhetsnormen ens med alla lägen öppna</b> — där räcker inte kandidatbanken, nya lägen behövs.</>
          )}
          {' '}Visas på kartan: Karta → "Framtida nät (optimerat)".
        </div>
      </div>

      <table className="gaptable">
        <thead>
          <tr>
            <th>Stadie</th><th>Elever {hy}</th><th>Lägen idag</th>
            <th>Teoretiskt golv</th><th>Minsta genomförbara</th>
            <th>Brist inom norm</th><th>Snittresväg i nätet</th>
          </tr>
        </thead>
        <tbody>
          {STAGES.map((st) => {
            const r = h.stadier[st.key]
            if (!r) return null
            return (
              <tr key={st.key}>
                <td><b>{st.label}</b></td>
                <td>{r.elever.toLocaleString('sv')}</td>
                <td>{r.idag}</td>
                <td>{r.golv}</td>
                <td>{r.minsta ?? '–'}</td>
                <td className={r.brist > 0 ? 'gap-pos' : 'gap-neg'}>
                  {r.brist > 0 ? r.brist.toLocaleString('sv') + ' elever' : 'ingen'}
                </td>
                <td>{r.meanKm != null ? r.meanKm + ' km (max ' + r.maxKm + ')' : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {nya.length > 0 && (
        <p className="hint" style={{ marginTop: 10 }}>
          <b>Föreslagna nya lägen:</b> {nya.map((n) => n.namn).join(', ')}.
        </p>
      )}
      {h.utanfor.length > 0 && (
        <p className="hint" style={{ marginTop: 6 }}>
          <b>Utanför det optimala nätet</b> ({h.utanfor.length} st):{' '}
          {h.utanfor.slice(0, 10).map((s) => s.namn).join(', ')}
          {h.utanfor.length > 10 ? ` … +${h.utanfor.length - 10} till` : ''}.
          Obs: "behövs inte i nätet" är ett kapacitets-/närhetspåstående — inte en stängningsplan;
          ekonomi, skick och genomförbarhet vägs i konsolideringskortet ovan.
        </p>
      )}
      <p className="hint" style={{ marginTop: 6, fontSize: 11 }}>
        Metod: {NATPLAN.metod}. Antaganden: {NATPLAN.antagande} Kör om: <code>python scripts/build_natplan.py</code>.
      </p>
    </div>
  )
}
