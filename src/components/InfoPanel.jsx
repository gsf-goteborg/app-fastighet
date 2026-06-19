import { RENOV, occColor } from '../lib/constants'

function Field({ label, value, mock }) {
  return (
    <div className="field">
      <div className="k">{label}</div>
      <div className="v">{value}{mock && <span className="mockflag">exempel</span>}</div>
    </div>
  )
}

export default function InfoPanel({ school, onClose }) {
  const komm = school && school.huvudman === 'Kommunal'
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
            <Field label="Adress" value={school.adress} />
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
