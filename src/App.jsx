import { useState, useMemo } from 'react'
import { SCHOOLS, SCENARIOS, BASE_YEAR } from './data/schools'
import { emptyFilters, applyFilters } from './lib/filters'
import { planConsolidation } from './lib/optimizer'
import { buildProjector } from './lib/framskrivning'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import TableView from './components/TableView'
import DashboardView from './components/DashboardView'
import InfoPanel from './components/InfoPanel'

const TABS = [['map', 'Karta'], ['table', 'Tabell'], ['dash', 'Översikt']]

export default function App() {
  const [view, setView] = useState('map')
  const [filters, setFilters] = useState(emptyFilters)
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState('renovbehov')
  const [selectedId, setSelectedId] = useState(null)

  // Planeringstillstånd lyfts hit så karta och översikt delar samma plan
  const [scenario, setScenario] = useState('Befolkningsprognos')
  const [customRate, setCustomRate] = useState(-1.5)
  const [year, setYear] = useState(2035)
  const [maxDist, setMaxDist] = useState(2.5)
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

  const plan = useMemo(
    () => planConsolidation(filtered, { rate, years, year, projFn, maxDistKm: maxDist, reservePct: reserve }),
    [filtered, rate, years, year, projFn, maxDist, reserve],
  )

  const planState = {
    scenario, setScenario, customRate, setCustomRate, year, setYear,
    maxDist, setMaxDist, reserve, setReserve, rate, years, projFn, plan,
  }

  return (
    <div id="app">
      <header>
        <div>
          <h1>Skolportfölj — Göteborg</h1>
          <div className="sub">Fastighetsavdelningen · planeringsverktyg</div>
        </div>
        <div className="tabs">
          {TABS.map(([v, label]) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>{label}</button>
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
            onSelect={setSelectedId} active={view === 'map'} plan={plan}
          />
        </div>
        {view === 'table' && <TableView schools={filtered} onSelect={setSelectedId} />}
        {view === 'dash' && <DashboardView schools={filtered} onSelect={setSelectedId} {...planState} />}

        <InfoPanel school={selected} onClose={() => setSelectedId(null)} />
      </main>
    </div>
  )
}
