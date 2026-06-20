import { useState, useMemo } from 'react'
import { RENOV, occColor } from '../lib/constants'
import { SCENARIOS, HORIZONS, MIN_VIABLE_PER_GRADE, LARARKOSTNAD, BASE_YEAR } from '../data/schools'
import { getIntake, entryGrades } from '../lib/simulate'
import { SCHOOL_ORIGINS } from '../data/origins'

// Restidsklasser (km) för tillgänglighetsfördelning
const TRAVEL_BINS = [[0, 1], [1, 2], [2, 4], [4, 6], [6, Infinity]]
const TRAVEL_LABELS = ['< 1 km', '1–2 km', '2–4 km', '4–6 km', '> 6 km']
const TRAVEL_COLORS = ['#16a34a', '#65a30d', '#ca8a04', '#ea580c', '#dc2626']

const AREAS = ['Centrum', 'Nordost', 'Hisingen', 'Sydväst']
const sum = (a, k) => a.reduce((t, s) => t + s[k], 0)
const mkr = (kr) => (kr / 1e6).toFixed(1) // kr → Mkr-sträng
const teachers = (kr) => Math.round(kr / LARARKOSTNAD)

export default function DashboardView({
  schools, onSelect,
  scenario, setScenario, customRate, setCustomRate, year, setYear,
  radii, setRadii, reserve, setReserve, rate, years, projFn, plan,
}) {
  const setRadius = (st, v) => setRadii({ ...radii, [st]: Math.max(0.5, +v || radii[st]) })
  const [refSize, setRefSize] = useState(450)         // pedagogisk kapacitet per skola
  const [atRisk, setAtRisk] = useState(false)         // akut-skick = riskkapacitet
  const [target, setTarget] = useState(95)            // målbeläggning %

  const isCohort = scenario === 'Befolkningsprognos'
  // Projicerat elevtal för en skola vid vald horisont (kohort- eller uniform takt)
  const pe = (s) => projFn(s, year)

  const { kpis, rows, totGap, totUnits, candidates, econ } = useMemo(() => {
    const cap = sum(schools, 'pedKapacitet')
    const elever = sum(schools, 'elever')
    const bel = cap ? Math.round((elever / cap) * 100) : 0
    const projTot = schools.reduce((t, s) => t + pe(s), 0)

    // --- Lokalekonomi: bara kommunala lokaler (kommunens egen hyreskostnad) ---
    const komm = schools.filter((s) => s.hyraPerM2 > 0)
    const kommCap = sum(komm, 'pedKapacitet')
    const totalHyra = sum(komm, 'arshyra')
    const avgPerPlats = kommCap ? totalHyra / kommCap : 0
    const tommaNow = sum(komm, 'tommaPlatser')
    const spilldNow = sum(komm, 'spilldHyra')
    // projicerat per skola (uniform takt)
    let projElevKomm = 0, spilldProj = 0, tommaProj = 0
    for (const s of komm) {
      const projE = pe(s)
      projElevKomm += projE
      const tomma = Math.max(0, s.pedKapacitet - projE)
      tommaProj += tomma
      spilldProj += tomma * s.kostnadPerPlats
    }
    // Rätt-storlek till målbeläggning: hur mycket kapacitet kan tas bort?
    const neededCap = projElevKomm / (target / 100)
    const overflod = Math.max(0, kommCap - neededCap)   // överflödiga platser
    const savedKr = overflod * avgPerPlats              // frigjord hyra kr/år
    const econ = {
      tommaNow, spilldNow, tommaProj, spilldProj,
      savedSeats: Math.round(overflod), savedKr,
      schoolsRemovable: Math.round(overflod / refSize),
    }

    const kpis = [
      ['Skolor', schools.length],
      ['Elever idag', elever.toLocaleString('sv')],
      [`Elever ${year}`, projTot.toLocaleString('sv')],
      ['Beläggning idag', bel + '%'],
      [`Tomma platser ${year}`, Math.round(tommaProj).toLocaleString('sv')],
      [`Outnyttjad lokalkostnad ${year}`, mkr(spilldProj) + '  Mkr/år'],
      ['≈ lärartjänster', teachers(spilldProj) + '  st'],
    ]

    const rows = AREAS.map((a) => {
      const g = schools.filter((s) => s.stadsomrade === a)
      const c = sum(g, 'pedKapacitet')
      const risk = atRisk ? sum(g.filter((s) => s.renovbehov === 5), 'pedKapacitet') : 0
      const cEff = c - risk
      const e = sum(g, 'elever')
      const proj = g.reduce((t, s) => t + pe(s), 0)
      const gap = proj - cEff // positiv = brist, negativ = överskott
      const units = Math.round(gap / refSize)
      return { a, n: g.length, c, cEff, risk, e, proj, gap, units, belProj: cEff ? Math.round((proj / cEff) * 100) : 0 }
    })
    const totGap = rows.reduce((t, r) => t + r.gap, 0)
    const totUnits = rows.reduce((t, r) => t + r.units, 0)

    // Konsolideringskandidater: skolor som blir små/under-belagda eller är i dåligt skick
    const candidates = schools
      .map((s) => {
        const proj = pe(s)
        const belProj = proj / s.pedKapacitet
        const perGrade = Math.round(proj / s.arskurserCount)
        const reasons = []
        if (belProj < 0.70) reasons.push(`låg beläggning ${Math.round(belProj * 100)}%`)
        if (perGrade < MIN_VIABLE_PER_GRADE) reasons.push(`${perGrade} elever/åk`)
        if (s.renovbehov >= 4) reasons.push(RENOV[s.renovbehov][0].toLowerCase() + ' skick')
        const score = (0.70 - belProj) * 120 + (s.renovbehov >= 4 ? s.renovbehov * 8 : 0)
          + s.underhallsskuld * 0.35 + (perGrade < MIN_VIABLE_PER_GRADE ? (MIN_VIABLE_PER_GRADE - perGrade) * 2 : 0)
        return { s, proj, belProj, perGrade, reasons, score }
      })
      .filter((c) => c.reasons.length)
      .sort((a, b) => b.score - a.score)

    return { kpis, rows, totGap, totUnits, candidates, econ }
  }, [schools, projFn, year, refSize, atRisk, target])

  // Framskrivning aggregerad per mellanområde (befolkningsprognos × elevmönster)
  const omr = useMemo(() => {
    const m = new Map()
    for (const s of schools) {
      let o = m.get(s.mellanomrade)
      if (!o) { o = { k: s.mellanomrade, stad: s.stadsomrade, n: 0, now: 0, proj: 0 }; m.set(s.mellanomrade, o) }
      o.n++; o.now += s.elever; o.proj += pe(s)
    }
    return [...m.values()].sort((a, b) =>
      a.stad.localeCompare(b.stad, 'sv') || a.k.localeCompare(b.k, 'sv'))
  }, [schools, projFn, year])

  // Vägd implicit förändringstakt för urvalet (kohortmodellen har ingen enskild takt)
  const totNow = sum(schools, 'elever')
  const implRate = years > 0 && totNow > 0
    ? Math.pow(schools.reduce((t, s) => t + pe(s), 0) / totNow, 1 / years) - 1 : 0

  // Önska skola — simulerad intagning nästa termin (Monte Carlo, globalt; filtrerat till urvalet)
  const intake = getIntake()
  const intakeRows = useMemo(() =>
    schools
      .map((s) => ({ s, o: intake.get(s.id), entry: entryGrades(s) }))
      .filter((x) => x.o && x.o.mean > 0)
      .sort((a, b) => b.o.mean - a.o.mean),
    [schools, intake])

  // Tillgänglighet — elevviktad restidsfördelning ur elevhärkomsten
  const access = useMemo(() => {
    const counts = TRAVEL_BINS.map(() => 0)
    let total = 0, weighted = 0
    const perSchool = []
    for (const s of schools) {
      const o = SCHOOL_ORIGINS[s.id]
      if (!o) continue
      const cells = [...o.areas, ...(o.ovriga ? [{ medelKm: o.ovriga.medelKm, antal: o.ovriga.antal }] : [])]
      let sn = 0, sw = 0
      for (const c of cells) {
        total += c.antal; weighted += c.antal * c.medelKm; sn += c.antal; sw += c.antal * c.medelKm
        const bi = TRAVEL_BINS.findIndex(([lo, hi]) => c.medelKm >= lo && c.medelKm < hi)
        counts[bi < 0 ? TRAVEL_BINS.length - 1 : bi] += c.antal
      }
      if (sn) perSchool.push({ s, mean: +(sw / sn).toFixed(1), n: sn })
    }
    const over2 = counts.slice(2).reduce((t, n) => t + n, 0)
    return {
      counts, total,
      mean: total ? +(weighted / total).toFixed(1) : 0,
      over2Pct: total ? Math.round((over2 / total) * 100) : 0,
      worst: perSchool.sort((a, b) => b.mean - a.mean).slice(0, 5),
    }
  }, [schools])

  const action = (units) => {
    if (units >= 1) return <span className="gap-pos">Bygg ~{units} ny skola{units > 1 ? 'r' : ''}</span>
    if (units <= -1) return <span className="gap-neg">Avveckla/omvandla ~{-units} skola{units < -1 ? 'r' : ''}</span>
    return <span style={{ color: 'var(--muted)' }}>Balanserad</span>
  }

  const surplus = totGap < 0
  const remSchools = econ.savedSeats / refSize
  const remSchoolsTxt = remSchools < 2 ? remSchools.toFixed(1).replace('.', ',') : Math.round(remSchools)
  const dist = [1, 2, 3, 4, 5].map((lvl) => ({ lvl, n: schools.filter((s) => s.renovbehov === lvl).length }))
  const distTot = schools.length || 1

  return (
    <div className="dash">
      <div className="kpis">
        {kpis.map(([k, v]) => (
          <div className="kpi" key={k}>
            <div className="k">{k}</div>
            <div className="v" dangerouslySetInnerHTML={{ __html: String(v).replace(/ (\D+)$/, ' <small>$1</small>') }} />
          </div>
        ))}
      </div>

      <div className="card econ">
        <h2>Lokalekonomi — tomma platser kostar lärare</h2>
        <p className="hint">
          Internhyran betalas för hela byggnaden oavsett hur många platser som fylls. Tomma platser =
          hyra utan elever — pengar som annars kan gå till undervisning. Avser kommunala lokaler.
          <span className="mockflag">exempelhyra</span>
        </p>

        <div className="econ-grid">
          <div className="econ-cell">
            <div className="k">Idag</div>
            <div className="big">{econ.spilldNow >= 0 ? mkr(econ.spilldNow) : 0} <small>Mkr/år outnyttjat</small></div>
            <div className="sub">{econ.tommaNow.toLocaleString('sv')} tomma platser · ≈ {teachers(econ.spilldNow)} lärartjänster</div>
          </div>
          <div className="econ-arrow">→</div>
          <div className="econ-cell warn">
            <div className="k">{scenario}, {year}</div>
            <div className="big">{mkr(econ.spilldProj)} <small>Mkr/år outnyttjat</small></div>
            <div className="sub">{Math.round(econ.tommaProj).toLocaleString('sv')} tomma platser · ≈ {teachers(econ.spilldProj)} lärartjänster</div>
          </div>
          <div className="econ-arrow">⇒</div>
          <div className="econ-cell good">
            <div className="k">Vid rätt-storlek till {target}%</div>
            <div className="big">{mkr(econ.savedKr)} <small>Mkr/år frigörs</small></div>
            <div className="sub">≈ {teachers(econ.savedKr)} lärartjänster · ta bort ~{econ.savedSeats.toLocaleString('sv')} platser (~{remSchoolsTxt} skolor)</div>
          </div>
        </div>

        <div className="controls-inline" style={{ marginTop: 14, marginBottom: 0 }}>
          <label className="inlabel" style={{ flex: 1 }}>
            Målbeläggning {target}%
            <input type="range" min="80" max="100" step="1" value={target} style={{ flex: 1 }}
              onChange={(e) => setTarget(+e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card">
        <h2>Scenario — elevutveckling och kapacitet</h2>
        <p className="hint">
          Välj demografiskt scenario och planeringshorisont. {isCohort
            ? 'Befolkningsprognos skrivs fram per primärområde och åldersstadie (F–3 / 4–6 / 7–9) och fördelas på skolor via historiskt elevmönster.'
            : 'Dagens elevtal projiceras med vald årlig förändring.'} <span className="mockflag">exempelscenario</span>
        </p>

        <div className="controls-inline">
          <span className="inlabel">Scenario</span>
          <div className="seg">
            {[...Object.keys(SCENARIOS), 'Egen'].map((s) => (
              <button key={s} className={scenario === s ? 'on' : ''} onClick={() => setScenario(s)}>{s}</button>
            ))}
          </div>
          {scenario === 'Egen' && (
            <label className="inlabel">
              %/år
              <input type="number" min="-5" max="5" step="0.1" value={customRate}
                onChange={(e) => setCustomRate(+e.target.value)} />
            </label>
          )}
          <span className="inlabel" style={{ marginLeft: 'auto' }}>
            {isCohort
              ? `≈ ${implRate >= 0 ? '+' : ''}${(implRate * 100).toFixed(1)} %/år (vägt)`
              : `${rate >= 0 ? '+' : ''}${(rate * 100).toFixed(1)} %/år`}
          </span>
        </div>

        <div className="controls-inline">
          <span className="inlabel">Horisont</span>
          <div className="seg">
            {HORIZONS.map((y) => (
              <button key={y} className={year === y ? 'on' : ''} onClick={() => setYear(y)}>{y}</button>
            ))}
          </div>
          <label className="inlabel">
            Kapacitet per skola
            <input type="number" min="100" max="1200" step="20" value={refSize}
              onChange={(e) => setRefSize(Math.max(100, +e.target.value || 450))} />
          </label>
          <label className="inlabel">
            <input type="checkbox" checked={atRisk} onChange={(e) => setAtRisk(e.target.checked)} />
            Räkna akut-skick som riskkapacitet
          </label>
        </div>

        <div className="banner">
          <div>
            <b>{Math.abs(totGap).toLocaleString('sv')}</b> platser i {surplus ? 'överskott' : 'underskott'} {year} ({scenario.toLowerCase()})
            {' '}— motsvarar <b>~{Math.abs(totUnits)}</b> skolor som {surplus ? 'kan avvecklas/omvandlas' : 'behöver tillkomma'}.
          </div>
        </div>

        <table className="gaptable">
          <thead>
            <tr>
              <th>Område</th><th>Skolor</th><th>Ped. kap.</th><th>Elever idag</th>
              <th>Elever {year}</th><th>Beläggn. {year}</th><th>Gap {year}</th><th>Åtgärd</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.a}>
                <td><b>{r.a}</b></td>
                <td>{r.n}</td>
                <td>{r.c.toLocaleString('sv')}{r.risk ? <span style={{ color: '#dc2626' }}> (−{r.risk} risk)</span> : null}</td>
                <td>{r.e.toLocaleString('sv')}</td>
                <td>{r.proj.toLocaleString('sv')}</td>
                <td style={{ color: occColor(r.belProj) }}>{r.belProj}%</td>
                <td className={r.gap > 0 ? 'gap-pos' : 'gap-neg'}>
                  {r.gap > 0 ? '+' + r.gap + ' brist' : r.gap + ' överskott'}
                </td>
                <td>{action(r.units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Framskrivning per område — {year}</h2>
        <p className="hint">
          Befolkningsprognos per primärområde och åldersstadie × historiskt elevmönster (vilka
          skolor områdets elever söker sig till), aggregerat per mellanområde. Visar var
          elevunderlaget växer respektive krymper — inte bara en gemensam takt för hela staden.
          <span className="mockflag">exempelprognos</span>
        </p>
        <table className="gaptable">
          <thead>
            <tr>
              <th>Mellanområde</th><th>Stadsområde</th><th>Skolor</th>
              <th>Elever idag</th><th>Elever {year}</th><th>Förändring</th>
            </tr>
          </thead>
          <tbody>
            {omr.map((o) => {
              const diff = o.proj - o.now
              const pct = o.now ? Math.round((diff / o.now) * 100) : 0
              return (
                <tr key={o.k}>
                  <td><b>{o.k}</b></td>
                  <td>{o.stad}</td>
                  <td>{o.n}</td>
                  <td>{o.now.toLocaleString('sv')}</td>
                  <td>{o.proj.toLocaleString('sv')}</td>
                  <td style={{ color: diff < 0 ? '#dc2626' : diff > 0 ? '#16a34a' : 'var(--muted)' }}>
                    {diff >= 0 ? '+' : ''}{diff.toLocaleString('sv')} ({pct >= 0 ? '+' : ''}{pct}%)
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Önska skola — simulerad intagning {BASE_YEAR + 1}</h2>
        <p className="hint">
          Skolvalsmodellen ger varje elev en sannolikhet per skola vid de tre övergångarna
          (förskoleklass 6 år, mellanstadium 10 år, högstadium 13 år). Här simuleras valen och
          visar förväntad intagning av nya elever per skola med osäkerhetsband (P10–P90).
          <span className="mockflag">exempelmodell</span>
        </p>
        <table className="gaptable">
          <thead>
            <tr><th>Skola</th><th>Område</th><th>Inträde</th><th>Förväntad intagning</th><th>Osäkerhet (P10–P90)</th></tr>
          </thead>
          <tbody>
            {intakeRows.map(({ s, o, entry }) => (
              <tr key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
                <td><b>{s.namn}</b></td>
                <td>{s.primaromrade}</td>
                <td>{entry.join(', ')}</td>
                <td><b>{o.mean}</b> elever</td>
                <td style={{ color: 'var(--muted)' }}>{o.p10}–{o.p90}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Tillgänglighet — elevernas resväg</h2>
        <p className="hint">
          Elevviktad restidsfördelning ur elevhärkomsten. Närhetsnorm per stadie: lågstadiet 2 km,
          mellanstadiet 4 km, högstadiet 6 km — yngre barn ska ha nära till skolan. Avgörande för
          likvärdighet: en nedläggning slår hårdare där eleverna redan reser långt.
          <span className="mockflag">exempelavstånd</span>
        </p>
        <div className="kpis" style={{ marginBottom: 12 }}>
          <div className="kpi"><div className="k">Genomsnittlig resväg</div><div className="v">{access.mean} <small>km</small></div></div>
          <div className="kpi"><div className="k">Andel elever &gt; 2 km</div><div className="v">{access.over2Pct} <small>%</small></div></div>
          <div className="kpi"><div className="k">Elever i urvalet</div><div className="v">{access.total.toLocaleString('sv')}</div></div>
        </div>
        <div className="distbar" style={{ marginBottom: 10 }}>
          {access.counts.map((n, i) => n > 0 && (
            <span key={i} title={TRAVEL_LABELS[i] + ': ' + n + ' elever'}
              style={{ background: TRAVEL_COLORS[i], width: (n / (access.total || 1) * 100) + '%' }}>
              {Math.round(n / (access.total || 1) * 100)}%
            </span>
          ))}
        </div>
        <div className="legend" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
          {TRAVEL_LABELS.map((l, i) => (
            <span key={l} className="row" style={{ fontSize: 12 }}>
              <span className="dot" style={{ background: TRAVEL_COLORS[i] }} />{l}
            </span>
          ))}
        </div>
        {access.worst.length > 0 && (
          <table className="gaptable">
            <thead><tr><th>Längst resväg (minst tillgängliga)</th><th>Primärområde</th><th>Elever</th><th>Snittresväg</th></tr></thead>
            <tbody>
              {access.worst.map(({ s, mean, n }) => (
                <tr key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
                  <td><b>{s.namn}</b></td>
                  <td>{s.primaromrade}</td>
                  <td>{n}</td>
                  <td style={{ color: mean > 2 ? '#dc2626' : 'var(--muted)' }}>{mean} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Konsolideringskandidater — {year}</h2>
        <p className="hint">
          Skolor att se över för avveckling, omvandling eller sammanslagning, rankade på projicerad
          beläggning, klasstorlek (under {MIN_VIABLE_PER_GRADE} elever/åk) och byggnadens skick.
          Klicka för detaljer.
        </p>
        {candidates.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Inga kandidater i nuvarande urval/scenario.</p>
        ) : (
          <table className="gaptable">
            <thead>
              <tr><th>Skola</th><th>Område</th><th>Beläggn. {year}</th><th>Elever/åk {year}</th><th>Skick</th><th>Underh.skuld</th><th>Varför</th></tr>
            </thead>
            <tbody>
              {candidates.map(({ s, belProj, perGrade, reasons }) => (
                <tr key={s.id} onClick={() => onSelect(s.id)} style={{ cursor: 'pointer' }}>
                  <td><b>{s.namn}</b></td>
                  <td>{s.stadsomrade}</td>
                  <td style={{ color: occColor(Math.round(belProj * 100)) }}>{Math.round(belProj * 100)}%</td>
                  <td className={perGrade < MIN_VIABLE_PER_GRADE ? 'gap-pos' : ''}>{perGrade}</td>
                  <td><span className="pill" style={{ background: RENOV[s.renovbehov][1] }}>{RENOV[s.renovbehov][0]}</span></td>
                  <td>{s.underhallsskuld ? s.underhallsskuld + ' Mkr' : '–'}</td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>{reasons.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Föreslagen konsolideringsplan — {year}</h2>
        <p className="hint">
          {plan.optimal
            ? 'MILP-optimering (bevisat optimal): minimerar lokalkostnad'
            : 'Girig heuristik (lösaren föll tillbaka): minskar lokalkostnad'}
          {' '}— men <b>bara</b> om eleverna får plats på en skola med rätt stadie inom stadiets
          maxavstånd, och området behåller reservkapacitet (för t.ex. friskolenedläggning).
          Yngre barn kräver närmare skola. <span className="mockflag">exempeldata</span>
        </p>

        <div className="controls-inline">
          <span className="inlabel">Max avstånd per stadie</span>
          <label className="inlabel">
            Lågstadiet
            <input type="number" min="0.5" max="10" step="0.5" value={radii.lag}
              onChange={(e) => setRadius('lag', e.target.value)} /> km
          </label>
          <label className="inlabel">
            Mellan
            <input type="number" min="0.5" max="10" step="0.5" value={radii.mellan}
              onChange={(e) => setRadius('mellan', e.target.value)} /> km
          </label>
          <label className="inlabel">
            Högstadiet
            <input type="number" min="0.5" max="10" step="0.5" value={radii.hog}
              onChange={(e) => setRadius('hog', e.target.value)} /> km
          </label>
          <label className="inlabel">
            Reservmarginal
            <input type="number" min="0" max="40" step="5" value={reserve}
              onChange={(e) => setReserve(Math.max(0, +e.target.value || 0))} /> %
          </label>
        </div>

        <div className="banner">
          {plan.closures.length === 0 ? (
            <div>Inga skolor kan konsolideras inom villkoren ({radii.lag}/{radii.mellan}/{radii.hog} km per stadie, {reserve}% reserv) i detta urval/scenario. Skolorna ligger nära full kapacitet — prova en längre horisont eller ett scenario med minskande elevtal för att frigöra platser, eller justera radie/reserv.</div>
          ) : (
            <div>
              Förslag: <b>{plan.closures.length}</b> skolor stängs/omvandlas → <b>−{plan.seatsRemoved.toLocaleString('sv')}</b> platser,
              frigör <b>{mkr(plan.savedKr)} Mkr/år</b> ≈ <b>{teachers(plan.savedKr)} lärartjänster</b>,
              undviker <b>{plan.avoidedDebt} Mkr</b> underhållsskuld. Alla berörda elever får plats inom <b>{plan.maxKm.toFixed(1)} km</b>.
            </div>
          )}
        </div>

        {plan.closures.length > 0 && (
          <table className="gaptable">
            <thead>
              <tr><th>Stäng/omvandla</th><th>Område</th><th>Elever att flytta</th><th>Tas emot av</th><th>Längsta avstånd</th><th>Frigjord hyra</th><th>Skick</th></tr>
            </thead>
            <tbody>
              {plan.closures.map((c) => (
                <tr key={c.school.id} onClick={() => onSelect(c.school.id)} style={{ cursor: 'pointer' }}>
                  <td><b>{c.school.namn}</b></td>
                  <td>{c.school.stadsomrade}</td>
                  <td>{c.students}</td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.reassign.map((r) => `${r.namn} (${r.n})`).join(', ')}</td>
                  <td>{c.maxKm.toFixed(1)} km</td>
                  <td>{mkr(c.savedKr)} Mkr/år</td>
                  <td><span className="pill" style={{ background: RENOV[c.school.renovbehov][1] }}>{RENOV[c.school.renovbehov][0]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {plan.stranded.length > 0 && (
          <p className="hint" style={{ marginTop: 10 }}>
            Lågt nyttjade men kan ej konsolideras (avstånd/reserv): {plan.stranded.join(', ')}.
          </p>
        )}
      </div>

      <div className="card">
        <h2>Renoveringsbehov i portföljen</h2>
        <p className="hint">Fördelning av filtrerade skolor efter skick.</p>
        <div className="distbar">
          {dist.filter((d) => d.n).map((d) => (
            <span key={d.lvl} title={RENOV[d.lvl][0]}
              style={{ background: RENOV[d.lvl][1], width: (d.n / distTot * 100) + '%' }}>{d.n}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
