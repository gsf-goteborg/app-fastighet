import { RENOV, occColor } from '../lib/constants'
import { SCHOOL_ORIGINS } from '../data/origins'

function Field({ label, value, mock }) {
  return (
    <div className="field">
      <div className="k">{label}</div>
      <div className="v">{value}{mock && <span className="mockflag">exempel</span>}</div>
    </div>
  )
}

// Elevhärkomst per primärområde + genomsnittlig resväg (aggregerat, ej individdata)
function Origins({ school }) {
  const o = SCHOOL_ORIGINS[school.id]
  if (!o) return null
  const total = o.areas.reduce((t, a) => t + a.antal, 0) + (o.ovriga ? o.ovriga.antal : 0)
  return (
    <div className="field">
      <div className="k">Elevernas härkomst <span className="mockflag">exempel</span></div>
      <div className="v">
        <div className="origins">
          {o.areas.map((a) => (
            <div className="origin-row" key={a.primaromrade}>
              <span>{a.primaromrade}</span>
              <span className="origin-meta">{a.antal} st · {Math.round((a.antal / total) * 100)}% · {a.medelKm} km</span>
            </div>
          ))}
          {o.ovriga && (
            <div className="origin-row muted">
              <span>Övriga/spridda</span>
              <span className="origin-meta">{o.ovriga.antal} st · {o.ovriga.medelKm} km</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function InfoPanel({ school, onClose }) {
  const komm = school && school.huvudman === 'Kommunal'
  const origin = school ? SCHOOL_ORIGINS[school.id] : null
  return (
    <aside className={'panel' + (school ? ' open' : '')}>
      {school && (
        <>
          <div className="p-head">
            <button className="p-close" onClick={onClose}>×</button>
            <span className="p-tag" style={{
              background: komm ? '#dbeafe' : '#ffedd5',
              color: komm ? '#1e40af' : '#9a3412',
            }}>{school.huvudman}</span>
            <h2>{school.namn}</h2>
          </div>
          <div className="p-body">
            <Field label="Stadsområde" value={school.stadsomrade} />
            <Field label="Mellanområde" value={school.mellanomrade} />
            <Field label="Primärområde" value={school.primaromrade} />
            <Field label="Adress" value={school.adress} />
            {origin && <Field label="Genomsnittlig resväg (vägnät)" value={origin.meanKm + ' km'} mock />}
            <Origins school={school} />
            <Field label="Närmaste skola" value={school.nearestNamn + ' · ' + school.nearestKm + ' km'} />
            <Field label="Årskurser" value={school.arskurser} />
            <Field label="Fastighetsbeteckning" value={'GÖTEBORG ' + school.fastighet} mock />
            <Field label="Byggnadsår" value={school.byggnadsar} mock />
            <Field label="Senaste renovering" value={school.senasteRenov} mock />
            <Field label="BTA" value={school.bta.toLocaleString('sv') + ' m²'} mock />
            <Field label="Pedagogisk kapacitet"
              value={school.kapPerArskurs + '/årskurs · ' + school.pedKapacitet + ' totalt'} mock />
            <Field label="Elever (idag / per åk)" value={school.elever + ' / ' + school.eleverPerArskurs} />
            <Field label="Byggnadens platser (BTA)" value={school.platser} mock />
            <Field label="Beläggningsgrad"
              value={<span style={{ color: occColor(school.belaggPct) }}>{school.belaggPct}%</span>} />
            {school.hyraPerM2 > 0 ? (
              <>
                <Field label="Internhyra" value={school.hyraPerM2.toLocaleString('sv') + ' kr/m² · ' + (school.arshyra / 1e6).toFixed(1) + ' Mkr/år'} mock />
                <Field label="Lokalkostnad/elev" value={school.kostnadPerElev.toLocaleString('sv') + ' kr/år'} mock />
                <Field label="Tomma platser"
                  value={<span style={{ color: school.tommaPlatser ? '#dc2626' : 'var(--muted)' }}>
                    {school.tommaPlatser} st {school.spilldHyra ? '· ' + (school.spilldHyra / 1e6).toFixed(2) + ' Mkr/år outnyttjat' : ''}
                  </span>} mock />
              </>
            ) : (
              <Field label="Internhyra" value="– (fristående, ej kommunal lokal)" />
            )}
            <Field label="Renoveringsbehov" mock
              value={<span className="pill" style={{ background: RENOV[school.renovbehov][1] }}>{RENOV[school.renovbehov][0]}</span>} />
            <Field label="Underhållsskuld" value={school.underhallsskuld ? school.underhallsskuld + ' Mkr' : '–'} mock />
            <Field label="Energiklass" value={school.energiklass} mock />
          </div>
        </>
      )}
    </aside>
  )
}
