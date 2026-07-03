import { useState, useMemo, lazy, Suspense } from 'react'
import { SCHOOLS, SCENARIOS, BASE_YEAR } from './data/schools'
import { emptyFilters, applyFilters } from './lib/filters'
import { planConsolidation, STAGE_RADIUS } from './lib/optimizer'
import { buildProjector } from './lib/framskrivning'
import { buildWhatIf, makeProjAdjust } from './lib/whatif'
import { BUILDING_MODELS } from './data/byggnad'
import Sidebar from './components/Sidebar'
import WhatIfBar from './components/WhatIfBar'

// three.js är stort — ladda 3D-vyn först när fliken öppnas
const BuildingView = lazy(() => import('./components/BuildingView'))
import MapView from './components/MapView'
import TableView from './components/TableView'
import DashboardView from './components/DashboardView'
import InfoPanel from './components/InfoPanel'
import ErrorBoundary from './components/ErrorBoundary'
import WelcomeOverlay from './components/WelcomeOverlay'

const TABS = [['map', 'Karta'], ['table', 'Tabell'], ['dash', 'Översikt'], ['bygg', 'Byggnad 3D']]

export default function App() {
  const [view, setView] = useState('map')
  const [filters, setFilters] = useState(emptyFilters)
  const [search, setSearch] = useState('')
  const [theme, setTheme] = useState('forandring') // led med prognosen — stadens signaturvy
  const [selectedId, setSelectedId] = useState(null)
  const [byggId, setByggId] = useState(+Object.keys(BUILDING_MODELS)[0]) // skola i 3D-byggnadsvyn
  const [sideOpen, setSideOpen] = useState(false) // filterlåda (mobil) — på desktop alltid synlig spalt

  // Planeringstillstånd lyfts hit så karta och översikt delar samma plan
  const [scenario, setScenario] = useState('Befolkningsprognos')
  const [horizon, setHorizon] = useState('kort') // kort/långsiktig — bevaras vid flikbyte
  const [customRate, setCustomRate] = useState(-1.5)
  const [year, setYear] = useState(2040)
  const [radii, setRadii] = useState(STAGE_RADIUS) // maxavstånd per åldersstadie (km)
  const [reserve, setReserve] = useState(10)

  const filtered = useMemo(() => applyFilters(SCHOOLS, filters, search), [filters, search])
  const selected = selectedId == null ? null : SCHOOLS[selectedId]

  const rate = scenario === 'Egen' ? customRate / 100 : SCENARIOS[scenario]
  const years = year - BASE_YEAR

  // WHAT-IF: användarens egna åtgärder (stäng/bygg/+barn) — se lib/whatif.js
  const [actions, setActions] = useState([])
  const [barnFormOpen, setBarnFormOpen] = useState(false)
  const whatif = useMemo(() => buildWhatIf(actions, radii), [actions, radii])
  const toggleClose = (schoolId) => setActions((a) =>
    a.some((x) => x.typ === 'stang' && x.schoolId === schoolId)
      ? a.filter((x) => !(x.typ === 'stang' && x.schoolId === schoolId))
      : [...a, { typ: 'stang', schoolId }])
  const toggleBuild = (siteId) => setActions((a) =>
    a.some((x) => x.typ === 'bygg' && x.siteId === siteId)
      ? a.filter((x) => !(x.typ === 'bygg' && x.siteId === siteId))
      : [...a, { typ: 'bygg', siteId }])

  // Befolkningsbaserad framskrivning byggs en gång över hela skolbeståndet
  // (demografin är oberoende av filtret). Scenariot "Befolkningsprognos"
  // använder kohortmodellen; övriga scenarier en uniform takt.
  const cohort = useMemo(() => buildProjector(SCHOOLS), [])
  const baseProjFn = useMemo(
    () => scenario === 'Befolkningsprognos'
      ? (s, y) => cohort.project(s, y)
      : (s, y) => Math.round(s.elever * Math.pow(1 + rate, y - BASE_YEAR)),
    [scenario, rate, cohort],
  )
  // What-if-åtgärden "+barn i område" läggs ovanpå prognosen — alla vyer
  // som läser projFn (karta, översikt, plan) reagerar automatiskt.
  const projFn = useMemo(() => {
    const adjust = makeProjAdjust(actions)
    return adjust ? (s, y) => baseProjFn(s, y) + adjust(s, y) : baseProjFn
  }, [baseProjFn, actions])

  // Omfördelningslager på kartan (flöden från stängda skolor) — kräver planen
  const [showFlows, setShowFlows] = useState(false)

  // Planering (optimering) behövs i Översikt, och i kartvyn bara när
  // omfördelningslagret är på — annars skulle den blockera huvudtråden
  // vid varje filter/horisont.
  const needsPlan = view === 'dash' || (view === 'map' && showFlows)
  const plan = useMemo(
    () => needsPlan
      ? planConsolidation(filtered, { rate, years, year, projFn, radii, reservePct: reserve })
      : { closures: [], savedKr: 0, seatsRemoved: 0, avoidedDebt: 0, maxKm: 0, stranded: [], openCount: filtered.length, optimal: false },
    [needsPlan, filtered, rate, years, year, projFn, radii, reserve],
  )

  // Robusthet: kör planen under varje demografiskt scenario vid vald horisont
  // (bara i Översikt — 4 extra optimeringar behövs inte för kartlagret)
  const needsRobust = view === 'dash'
  const robustness = useMemo(
    () => !needsRobust ? [] : Object.keys(SCENARIOS).map((sc) => {
      const f = sc === 'Befolkningsprognos'
        ? (s, y) => cohort.project(s, y)
        : (s, y) => Math.round(s.elever * Math.pow(1 + SCENARIOS[sc], y - BASE_YEAR))
      const pl = planConsolidation(filtered, { rate: SCENARIOS[sc], years, year, projFn: f, radii, reservePct: reserve })
      return { scenario: sc, names: pl.closures.map((c) => c.school.namn), n: pl.closures.length, seats: pl.seatsRemoved, savedKr: pl.savedKr }
    }),
    [needsRobust, filtered, years, year, radii, reserve, cohort],
  )

  const planState = {
    scenario, setScenario, customRate, setCustomRate, year, setYear,
    radii, setRadii, reserve, setReserve, rate, years, projFn, plan, robustness,
    horizon, setHorizon, whatif,
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
        <button className="filter-toggle" onClick={() => setSideOpen((o) => !o)}>
          ☰ Filter{filtered.length < SCHOOLS.length ? ` · ${filtered.length}` : ''}
        </button>
        <div className="tabs">
          {TABS.map(([v, label]) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => { setView(v); setSelectedId(null) }}>{label}</button>
          ))}
        </div>
        <span className="badge">⚠︎ Showcase · exempeldata</span>
      </header>

      <WhatIfBar
        actions={actions} whatif={whatif}
        onRemove={(i) => setActions((a) => a.filter((_, j) => j !== i))}
        onReset={() => setActions([])}
        onAddBarn={(a) => setActions((prev) => [...prev, a])}
        formOpen={barnFormOpen} setFormOpen={setBarnFormOpen}
      />

      {/* Mobil: mörk bakgrund bakom filterlådan, klick stänger */}
      <div className={'side-backdrop' + (sideOpen ? ' show' : '')} onClick={() => setSideOpen(false)} />

      <Sidebar
        filters={filters} setFilters={setFilters}
        search={search} setSearch={setSearch}
        shown={filtered.length} total={SCHOOLS.length}
        onSelect={(id) => { setSelectedId(id); setSideOpen(false) }}
        mobileOpen={sideOpen} onClose={() => setSideOpen(false)}
      />

      <main>
        {/* Kartan hålls alltid monterad (döljs vid behov) så zoom/läge bevaras */}
        <div style={{ position: 'absolute', inset: 0, display: view === 'map' ? 'block' : 'none' }}>
          <MapView
            schools={filtered} theme={theme} setTheme={setTheme}
            onSelect={setSelectedId} active={view === 'map'}
            projFn={projFn} year={year} scenario={scenario} rate={rate}
            plan={plan} showFlows={showFlows} setShowFlows={setShowFlows}
            whatif={whatif} onBuildToggle={toggleBuild}
          />
        </div>
        {view === 'table' && <ErrorBoundary><TableView schools={filtered} onSelect={setSelectedId} /></ErrorBoundary>}
        {view === 'dash' && <ErrorBoundary><DashboardView schools={filtered} onSelect={setSelectedId} {...planState} /></ErrorBoundary>}
        {view === 'bygg' && (
          <ErrorBoundary>
            <Suspense fallback={<div className="bygg-empty"><div>Laddar 3D-vyn …</div></div>}>
              <BuildingView schoolId={byggId} setSchoolId={setByggId} />
            </Suspense>
          </ErrorBoundary>
        )}

        <InfoPanel school={selected} onClose={() => setSelectedId(null)}
          onOpenBuilding={(id) => { setByggId(id); setView('bygg'); setSelectedId(null) }}
          whatifClosed={whatif.closedIds} onWhatIfClose={toggleClose} />
      </main>
    </div>
  )
}
