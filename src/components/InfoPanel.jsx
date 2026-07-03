import { RENOV, occColor } from '../lib/constants'
import { SCHOOL_ORIGINS } from '../data/origins'
import { BUILDING_MODELS } from '../data/byggnad'
import { getIntake } from '../lib/simulate'

// mock = testdata/modell (gul "exempel"); synth = helt påhittat fält som inte
// bör styra beslut (röd "syntetiskt").
function Field({ label, value, mock, synth }) {
  return (
    <div className="field">
      <div className="k">{label}</div>
      <div className="v">
        {value}
        {synth ? <span className="mockflag synth">syntetiskt</span> : mock && <span className="mockflag">exempel</span>}
      </div>
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
            <div className="origin-row" key={a.omrade}>
              <span>{a.omrade}</span>
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

// Konsekvensruta när skolan är stängd i what-if: det viktigaste, destillerat.
// Samma siffror som what-if-kortet i Översikt — se lib/whatif.js.
function WhatIfSummary({ school, whatif }) {
  const c = whatif?.closures.find((x) => x.school.id === school.id)
  if (!c) return null
  const eq = whatif.equity?.perClosure.get(school.id)
  const placed = c.reassign.reduce((t, r) => t + r.n, 0)
  const unplaced = c.students - placed
  const top = c.reassign.slice().sort((a, b) => b.n - a.n).slice(0, 3)
  return (
    <div className="p-wisum">
      <b>Om {school.namn} stängs</b>
      <ul>
        <li>
          <b>{c.students}</b> elever flyttas —{' '}
          {unplaced > 0
            ? <b style={{ color: '#dc2626' }}>{unplaced} får inte plats inom närhetsnormen</b>
            : <span style={{ color: '#15803d' }}>alla får plats inom närhetsnormen</span>}
        </li>
        {top.length > 0 && (
          <li>Främst till {top.map((r) => `${r.namn} (${r.n})`).join(', ')}
            {c.reassign.length > 3 ? ` + ${c.reassign.length - 3} skolor till` : ''}</li>
        )}
        {eq && (
          <li>Elevernas resväg i snitt {eq.kmBefore} →{' '}
            <b style={{ color: eq.kmAfter > eq.kmBefore ? '#dc2626' : '#15803d' }}>{eq.kmAfter} km</b>
            {' '}· längsta flytt mellan skolorna {c.maxKm} km</li>
        )}
        <li>Frigör <b>{(c.savedKr / 1e6).toFixed(1)} Mkr/år</b> hyra
          {c.avoidedDebt ? <> · undviker {Math.round(c.avoidedDebt)} Mkr underhållsskuld</> : null}</li>
      </ul>
      <div className="p-wisum-foot">
        Detaljer i Översikt → What-if · <span className="mockflag">exempeldata · fågelväg</span>
      </div>
    </div>
  )
}

export default function InfoPanel({ school, onClose, onOpenBuilding, whatifClosed, onWhatIfClose, whatif }) {
  const isClosed = school && whatifClosed?.has(school.id)
  const komm = school && school.huvudman === 'Kommunal'
  const origin = school ? SCHOOL_ORIGINS[school.id] : null
  const intake = school ? getIntake().get(school.id) : null
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
            {onOpenBuilding && BUILDING_MODELS[school.id] && (
              <button className="btn primary p-bygg" onClick={() => onOpenBuilding(school.id)}>
                Analysera byggnaden i 3D →
              </button>
            )}
            {onWhatIfClose && (school.konsoliderbar || isClosed) && (
              <button className={'btn p-bygg' + (isClosed ? '' : ' p-whatif')}
                onClick={() => onWhatIfClose(school.id)}>
                {isClosed ? 'Ångra what-if-stängning' : 'Stäng i what-if — vad händer?'}
              </button>
            )}
            {isClosed && <WhatIfSummary school={school} whatif={whatif} />}
            <Field label="Stadsområde" value={school.stadsomrade} />
            <Field label="Mellanområde" value={school.mellanomrade} />
            <Field label="Skolform" value={school.skolform} />
            <Field label="Skolhus" value={school.skolhus} />
            {origin && <Field label="Genomsnittlig resväg (fågelväg)" value={origin.meanKm + ' km'} mock />}
            {intake && intake.mean > 0 && (
              <Field label="Förväntad intagning nästa termin"
                value={intake.mean + ' elever (' + intake.p10 + '–' + intake.p90 + ')'} mock />
            )}
            <Origins school={school} />
            <Field label="Närmaste skola" value={school.nearestNamn + ' · ' + school.nearestKm + ' km'} />
            <Field label="Årskurser" value={school.arskurser} />
            <Field label="Skolhus" value={school.fastighet} mock />
            <Field label="Byggnadsår" value={school.byggnadsar} synth />
            <Field label="Senaste renovering" value={school.senasteRenov} synth />
            <Field label="BTA" value={school.bta.toLocaleString('sv') + ' m²'} synth />
            <Field label="Pedagogisk kapacitet"
              value={school.kapPerArskurs + '/årskurs · ' + school.pedKapacitet + ' totalt'} mock />
            <Field label="Elever (idag / per åk)" value={school.elever + ' / ' + school.eleverPerArskurs} mock />
            <Field label="Beläggningsgrad"
              value={<span style={{ color: occColor(school.belaggPct) }}>{school.belaggPct}%</span>} mock />
            <Field label="Internhyra" value={(school.arshyra / 1e6).toFixed(1) + ' Mkr/år'} mock />
            <Field label="Lokalkostnad/elev" value={school.kostnadPerElev.toLocaleString('sv') + ' kr/år'} mock />
            <Field label="Tomma platser"
              value={<span style={{ color: school.tommaPlatser ? '#dc2626' : 'var(--muted)' }}>
                {school.tommaPlatser} st {school.spilldHyra ? '· ' + (school.spilldHyra / 1e6).toFixed(2) + ' Mkr/år outnyttjat' : ''}
              </span>} mock />
            <Field label="Renoveringsbehov" synth
              value={<span className="pill" style={{ background: RENOV[school.renovbehov][1] }}>{RENOV[school.renovbehov][0]}</span>} />
            <Field label="Underhållsskuld" value={school.underhallsskuld ? school.underhallsskuld + ' Mkr' : '–'} synth />
            <Field label="Energiklass" value={school.energiklass} synth />
          </div>
        </>
      )}
    </aside>
  )
}
