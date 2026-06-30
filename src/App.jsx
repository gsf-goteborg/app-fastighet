import { useState, useMemo } from 'react'
import { SCHOOLS, SCENARIOS, BASE_YEAR } from './data/schools'
import { emptyFilters, applyFilters } from './lib/filters'
import { planConsolidation, STAGE_RADIUS } from './lib/optimizer'
import { buildProjector } from './lib/framskrivning'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import TableView from './components/TableView'
import DashboardView from './components/DashboardView'
import InfoPanel from './components/InfoPanel'
import ErrorBoundary from './components/ErrorBoundary'
import WelcomeOverlay from './components/WelcomeOverlay'

const TABS = [['map', 'Karta'], ['table', 'Tabell'], ['dash', 'Översikt']]

export default function App() {
  const [view, setView] = useState('map')
  const [filters, setFilters] = useState(emptyFilters)
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState('forandring') // led med prognosen — stadens signaturvy
  const [selectedId, setSelectedId] = useState(null)

  // Planeringstillstånd lyfts hit så karta och översikt delar samma plan
  const [scenario, setScenario] = useState('Befolkningsprognos')
  const [customRate, setCustomRate] = useState(-1.5)
  const [year, setYear] = useState(2040)
  const [radii, setRadii] = useState(STAGE_RADIUS) // maxavstånd per åldersstadie (km)
  const [reserve, setReserve] = useState(10)

  const filtered = useMemo(() => applyFilters(SCHOOLS, filters, search), [filters, search])
  const selected = selectedId == null ? null : SCHOOLS[selectedId]

  const rate = scenario === 'Egen' ? customRate / 100 : SCENARIOS[scenario]
  const years = year - BASE_YEAR

  // Befolkningsbaserad framskrivning byggs en gång över hela skolbeståndet
  // (demografin är oberoende av filtret). Scenariot "Befolkningsprognos"
  // använder kohortmodellen; övriga scenarier en uniform takt.
  const cohort = useMemo(() => buildProjector(SCHOOLS), [])
  const projFn = useMemo(
    () => scenario === 'Befolkningsprognos'
      ? (s, y) => cohort.project(s, y)
      : (s, y) => Math.round(s.elever * Math.pow(1 + rate, y - BASE_YEAR)),
    [scenario, rate, cohort],
  )

  // Planering (optimering) behövs bara i Översikt — beräkna inte i kartvyn,
  // där den annars skulle blockera huvudtråden vid varje filter/horisont.
  const needsPlan = view === 'dash'
  const plan = useMemo(
    () => needsPlan
      ? planConsolidation(filtered, { rate, years, year, projFn, radii, reservePct: reserve })
      : { closures: [], savedKr: 0, seatsRemoved: 0, avoidedDebt: 0, maxKm: 0, stranded: [], openCount: filtered.length, optimal: false },
    [needsPlan, filtered, rate, years, year, projFn, radii, reserve],
  )

  // Robusthet: kör planen under varje demografiskt scenario vid vald horisont
  const robustness = useMemo(
    () => !needsPlan ? [] : Object.keys(SCENARIOS).map((sc) => {
      const f = sc === 'Befolkningsprognos'
        ? (s, y) => cohort.project(s, y)
        : (s, y) => Math.round(s.elever * Math.pow(1 + SCENARIOS[sc], y - BASE_YEAR))
      const pl = planConsolidation(filtered, { rate: SCENARIOS[sc], years, year, projFn: f, radii, reservePct: reserve })
      return { scenario: sc, names: pl.closures.map((c) => c.school.namn), n: pl.closures.length, seats: pl.seatsRemoved, savedKr: pl.savedKr }
    }),
    [needsPlan, filtered, years, year, radii, reserve, cohort],
  )

  const planState = {
    scenario, setScenario, customRate, setCustomRate, year, setYear,
    radii, setRadii, reserve, setReserve, rate, years, projFn, plan, robustness,
  }

  return (
    <div id="app">
      <WelcomeOverlay />
      <header>
        <div className="brand">
          <span className="mark" aria-hidden>G</span>
          <div>
            <h1>Skolportfölj — Göteborg</h1>
            <div className="sub">Fastighetsavdelningen · planeringsverktyg</div>
          </div>
        </div>
        <div className="tabs">
          {TABS.map(([v, label]) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => { setView(v); setSelectedId(null) }}>{label}</button>
          ))}
        </div>
        <span className="badge">⚠︎ Showcase · exempeldata</span>
      </header>

      <Sidebar
        filters={filters} setFilters={setFilters}
        search={search} setSearch={setSearch}
        shown={filtered.length} total={SCHOOLS.length}
      />

      <main>
        {/* Kartan hålls alltid monterad (döljs vid behov) så zoom/läge bevaras */}
        <div style={{ position: 'absolute', inset: 0, display: view === 'map' ? 'block' : 'none' }}>
          <MapView
            schools={filtered} theme={theme} setTheme={setTheme}
            onSelect={setSelectedId} active={view === 'map'}
            projFn={projFn} year={year} scenario={scenario} rate={rate}
          />
        </div>
        {view === 'table' && <ErrorBoundary><TableView schools={filtered} onSelect={setSelectedId} /></ErrorBoundary>}
        {view === 'dash' && <ErrorBoundary><DashboardView schools={filtered} onSelect={setSelectedId} {...planState} /></ErrorBoundary>}

        <InfoPanel school={selected} onClose={() => setSelectedId(null)} />
      </main>
    </div>
  )
}
