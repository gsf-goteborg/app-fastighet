import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { THEME_EXPR, THEME_LABELS, LEGENDS } from '../lib/constants'
import { BEFOLKNING } from '../data/prognos'
import { BASE_YEAR } from '../data/schools'
import { planFlowsGeoJSON, planClosedGeoJSON } from '../lib/skolval'
import CANDIDATES from '../data/generated/candidates.json'
import NATPLAN from '../data/generated/natplan.json'

// Framtida skolnät (spopt-batch): närmaste beräknade horisont + geojson
const NAT_HOR = Object.keys(NATPLAN.horisonter).map(Number)
const natHorizon = (year) => NAT_HOR.reduce((b, h) => (Math.abs(h - year) < Math.abs(b - year) ? h : b))
const STADIE_SHORT = { lag: 'F–3', mellan: '4–6', hog: '7–9' }

function natplanGeoJSON(year) {
  const h = NATPLAN.horisonter[String(natHorizon(year))]
  const feat = (p, roll, stadier) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
    properties: { namn: p.namn, roll, stadier: stadier.map((s) => STADIE_SHORT[s]).join(', ') },
  })
  return {
    type: 'FeatureCollection',
    features: [
      ...h.natverk.map((n) => feat(n, n.typ === 'kandidat' ? 'nytt' : 'behall', n.stadier)),
      ...h.utanfor.map((s) => feat(s, 'utanfor', [])),
    ],
  }
}

const CAND_FC = {
  type: 'FeatureCollection',
  features: CANDIDATES.map((c) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    properties: c,
  })),
}

// Många skolenheter delar läge (grundskola + anpassad grundskola i samma hus).
// Sprid samlokaliserade markörer i en liten ring så båda syns och går att klicka
// — endast presentation, skolornas koordinater i datan är oförändrade.
const SPREAD_DEG = 0.0013 // ~140 m radie

function spreadGeometry(schools) {
  const groups = new Map()
  for (const s of schools) {
    const key = s.lat.toFixed(4) + ',' + s.lng.toFixed(4)
    ;(groups.get(key) || groups.set(key, []).get(key)).push(s)
  }
  const pos = new Map()
  for (const grp of groups.values()) {
    if (grp.length === 1) { pos.set(grp[0].id, [grp[0].lng, grp[0].lat]); continue }
    const cosLat = Math.cos((grp[0].lat * Math.PI) / 180) || 1
    grp.forEach((s, i) => {
      const ang = (2 * Math.PI * i) / grp.length
      pos.set(s.id, [s.lng + (SPREAD_DEG * Math.cos(ang)) / cosLat, s.lat + SPREAD_DEG * Math.sin(ang)])
    })
  }
  return pos
}

function toGeoJSON(schools, projFn, year) {
  const pos = spreadGeometry(schools)
  return {
    type: 'FeatureCollection',
    features: schools.map((s) => {
      const proj = projFn ? projFn(s, year) : s.elever
      const forandPct = s.elever ? Math.round((proj / s.elever - 1) * 100) : 0
      return {
        type: 'Feature',
        id: s.id,
        geometry: { type: 'Point', coordinates: pos.get(s.id) || [s.lng, s.lat] },
        properties: { ...s, projElever: proj, forandPct },
      }
    }),
  }
}

// Bakar in befolkningsprognosen (skolålder) per primärområde i polygonerna:
// forandPct = förändring från basåret till vald horisont. Följer valt scenario:
//   Befolkningsprognos → områdets egen demografiska trend (rumslig variation)
//   övriga scenarier   → den enhetliga takten (samma som skolframskrivningen)
// Områden utan prognosdata får ingen forandPct (visas grå).
function bakeAreas(fc, year, scenario, rate) {
  const yrs = year - BASE_YEAR
  return {
    type: 'FeatureCollection',
    features: fc.features.map((f) => {
      const namn = f.properties.NAMN || f.properties.namn
      const b = BEFOLKNING[namn]
      const props = { ...f.properties, namn }
      if (b) {
        const r = scenario === 'Befolkningsprognos' ? b.trend : rate
        props.forandPct = Math.round((Math.pow(1 + r, yrs) - 1) * 100)
        props.barnBas = b.lag + b.mellan + b.hog
      }
      return { type: 'Feature', geometry: f.geometry, properties: props }
    }),
  }
}

// Fyllnadsfärg: samma skala som temat "Elevförändring", grå när data saknas
const AREA_FILL = ['case', ['has', 'forandPct'], THEME_EXPR.forandring, '#e5e7eb']

const FLOW_WIDTH = ['interpolate', ['linear'], ['get', 'n'], 1, 1, 40, 3.5, 150, 7]

export default function MapView({
  schools, theme, setTheme, onSelect, active, projFn, year, scenario, rate,
  plan, showFlows, setShowFlows,
}) {
  const [showAreas, setShowAreas] = useState(false)
  const [showCand, setShowCand] = useState(false)
  const [showNat, setShowNat] = useState(false)

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const projRef = useRef({ projFn, year, scenario, rate })
  projRef.current = { projFn, year, scenario, rate }
  const areasRaw = useRef(null) // oförändrad geojson, bakas om per år

  // Initiera kartan en gång
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [11.97, 57.71],
      zoom: 10.6,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    mapRef.current = map

    map.on('load', () => {
      // Områdeslager (koroplet) — under skolpunkterna
      map.addSource('areas', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'areas-fill', type: 'fill', source: 'areas',
        layout: { visibility: 'none' },
        paint: { 'fill-color': AREA_FILL, 'fill-opacity': 0.5 },
      })
      map.addLayer({
        id: 'areas-line', type: 'line', source: 'areas',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#fff', 'line-width': 1, 'line-opacity': 0.8 },
      })

      // Omfördelningsflöden (under skolpunkterna): tilldelning + skolval
      map.addSource('flows', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'flows-assign', type: 'line', source: 'flows',
        filter: ['==', ['get', 'typ'], 'tilldelning'],
        layout: { visibility: 'none', 'line-cap': 'round' },
        paint: { 'line-color': '#005293', 'line-width': FLOW_WIDTH, 'line-opacity': 0.75 },
      })
      map.addLayer({
        id: 'flows-choice', type: 'line', source: 'flows',
        filter: ['==', ['get', 'typ'], 'skolval'],
        layout: { visibility: 'none' },
        paint: { 'line-color': '#f47815', 'line-width': FLOW_WIDTH, 'line-opacity': 0.85, 'line-dasharray': [1.5, 1.5] },
      })
      map.addSource('closed', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'closed', type: 'circle', source: 'closed',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 9, 14, 15],
          'circle-color': '#fff', 'circle-opacity': 0.9,
          'circle-stroke-width': 3, 'circle-stroke-color': '#dc2626',
        },
      })
      // Framtida skolnät (spopt): behåll / nytt läge / utanför nätet
      map.addSource('natplan', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'natplan', type: 'circle', source: 'natplan',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['match', ['get', 'roll'],
            'nytt', ['interpolate', ['linear'], ['zoom'], 10, 8, 14, 14],
            ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 11]],
          'circle-color': ['match', ['get', 'roll'],
            'behall', '#16a34a', 'nytt', '#4f6f18', '#cbd5e1'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#fff',
        },
      })
      const natPopup = new maplibregl.Popup({ closeButton: false, offset: 12 })
      map.on('mouseenter', 'natplan', (e) => {
        const p = e.features[0].properties
        const roll = p.roll === 'behall' ? 'I optimala nätet' : p.roll === 'nytt' ? 'Föreslaget nytt läge' : 'Behövs ej i nätet'
        natPopup.setLngLat(e.lngLat)
          .setHTML(`<b>${p.namn}</b><br>${roll}${p.stadier ? '<br>Stadier: ' + p.stadier : ''}`)
          .addTo(map)
      })
      map.on('mouseleave', 'natplan', () => natPopup.remove())

      const closedPopup = new maplibregl.Popup({ closeButton: false, offset: 12 })
      map.on('mouseenter', 'closed', (e) => {
        const p = e.features[0].properties
        closedPopup.setLngLat(e.lngLat)
          .setHTML(`<b>${p.namn}</b><br>Föreslås stängas · ${p.students} elever flyttas`)
          .addTo(map)
      })
      map.on('mouseleave', 'closed', () => closedPopup.remove())

      map.addSource('schools', { type: 'geojson', data: toGeoJSON(schools, projRef.current.projFn, projRef.current.year) })
      map.addLayer({
        id: 'pt', type: 'circle', source: 'schools',
        paint: {
          'circle-color': THEME_EXPR[theme],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 11],
          // Anpassad grundskola markeras med lila ring (Göteborgspaletten)
          'circle-stroke-width': ['case', ['==', ['get', 'skolform'], 'Anpassad grundskola'], 3, 2.5],
          'circle-stroke-color': ['case', ['==', ['get', 'skolform'], 'Anpassad grundskola'], '#7f3f98', '#fff'],
        },
      })

      map.on('click', 'pt', (e) => selectRef.current(e.features[0].properties.id))
      map.on('mouseenter', 'pt', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'pt', () => { map.getCanvas().style.cursor = '' })

      // Kandidatsiter (expansion / nybyggnad) — egen symbol, av som standard
      map.addSource('cand', { type: 'geojson', data: CAND_FC })
      map.addLayer({
        id: 'cand', type: 'circle', source: 'cand',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 13],
          'circle-color': ['match', ['get', 'siteType'], 'new', '#4f6f18', '#cf5e00'], // ny=mörkgrön, expansion=mörkorange
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.9,
        },
      })
      const popup = new maplibregl.Popup({ closeButton: false, offset: 12 })
      map.on('mouseenter', 'cand', (e) => {
        map.getCanvas().style.cursor = 'pointer'
        const c = e.features[0].properties
        popup.setLngLat(e.lngLat).setHTML(
          `<b>${c.name}</b><br>${c.siteType === 'new' ? 'Nybyggnad' : 'Expansion'} · ${c.proposedCapacity} platser`
          + `<br>Stadier: ${c.supportedStages}<br><span style="color:#64748b">${c.mellanomrade || ''}</span>`,
        ).addTo(map)
      })
      map.on('mouseleave', 'cand', () => { map.getCanvas().style.cursor = ''; popup.remove() })
      readyRef.current = true
      map.getSource('schools').setData(toGeoJSON(schools, projRef.current.projFn, projRef.current.year))

      // Ladda områdespolygoner (primärområde) en gång
      fetch(`${import.meta.env.BASE_URL}geo/mellanomraden.geojson`)
        .then((r) => r.json())
        .then((fc) => {
          areasRaw.current = fc
          const p = projRef.current
          map.getSource('areas')?.setData(bakeAreas(fc, p.year, p.scenario, p.rate))
        })
        .catch((err) => console.warn('Kunde inte ladda områdespolygoner:', err))
    })

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Uppdatera punkter när filter, scenario eller horisont ändras
  useEffect(() => {
    if (readyRef.current && mapRef.current.getSource('schools')) {
      mapRef.current.getSource('schools').setData(toGeoJSON(schools, projFn, year))
    }
  }, [schools, projFn, year])

  // Bak om områdesfärgen när horisont eller scenario ändras
  useEffect(() => {
    if (readyRef.current && areasRaw.current && mapRef.current.getSource('areas')) {
      mapRef.current.getSource('areas').setData(bakeAreas(areasRaw.current, year, scenario, rate))
    }
  }, [year, scenario, rate])

  // Slå på/av områdeslagret
  useEffect(() => {
    if (!readyRef.current) return
    const vis = showAreas ? 'visible' : 'none'
    mapRef.current.getLayer('areas-fill') && mapRef.current.setLayoutProperty('areas-fill', 'visibility', vis)
    mapRef.current.getLayer('areas-line') && mapRef.current.setLayoutProperty('areas-line', 'visibility', vis)
  }, [showAreas])

  // Slå på/av kandidatlagret
  useEffect(() => {
    if (!readyRef.current) return
    mapRef.current.getLayer('cand') &&
      mapRef.current.setLayoutProperty('cand', 'visibility', showCand ? 'visible' : 'none')
  }, [showCand])

  // Framtida nät-lagret: ersätter skolpunkterna medan det är på (annars dubbla prickar)
  useEffect(() => {
    if (!readyRef.current) return
    const map = mapRef.current
    if (!map.getLayer('natplan')) return
    if (showNat) map.getSource('natplan').setData(natplanGeoJSON(year))
    map.setLayoutProperty('natplan', 'visibility', showNat ? 'visible' : 'none')
    map.getLayer('pt') && map.setLayoutProperty('pt', 'visibility', showNat ? 'none' : 'visible')
  }, [showNat, year])

  // Omfördelningslagret: data + synlighet (skolvalsomvalet räknas bara när lagret är på)
  const flowData = useMemo(
    () => (showFlows ? planFlowsGeoJSON(plan) : null),
    [showFlows, plan],
  )
  useEffect(() => {
    if (!readyRef.current) return
    const map = mapRef.current
    if (flowData && map.getSource('flows')) {
      map.getSource('flows').setData(flowData)
      map.getSource('closed').setData(planClosedGeoJSON(plan))
    }
    const vis = showFlows ? 'visible' : 'none'
    for (const id of ['flows-assign', 'flows-choice', 'closed']) {
      map.getLayer(id) && map.setLayoutProperty(id, 'visibility', vis)
    }
  }, [flowData, showFlows, plan])

  // Byt tematisk färgläggning (skolpunkter)
  useEffect(() => {
    if (readyRef.current && mapRef.current.getLayer('pt')) {
      mapRef.current.setPaintProperty('pt', 'circle-color', THEME_EXPR[theme])
    }
  }, [theme])

  // Justera storlek när kartvyn åter blir synlig
  useEffect(() => {
    if (active && mapRef.current) setTimeout(() => mapRef.current.resize(), 0)
  }, [active])

  return (
    <div className="mapwrap">
      <div className="maproot" ref={containerRef} />
      <div className="mapctl">
        <label>Färglägg efter</label>
        <select value={theme} onChange={(e) => setTheme(e.target.value)}>
          {Object.entries(THEME_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <div className="legend">
          {LEGENDS[theme].map(([label, color]) => (
            <div className="row" key={label}>
              <span className="dot" style={{ background: color }} />{label}
            </div>
          ))}
          <div className="row">
            <span className="dot" style={{ background: '#94a3b8', boxShadow: '0 0 0 2px #7f3f98' }} />
            Anpassad grundskola (lila ring)
          </div>
        </div>
        {theme === 'forandring' && (
          <div className="legend-note">Prognos till {year} · år och scenario väljs under Översikt</div>
        )}

        <label className="mapctl-check">
          <input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} />
          Områdesprognos (mellanområde)
        </label>
        {showAreas && (
          <div className="legend-note">Befolkning i skolålder per mellanområde, förändring till {year} ({scenario.toLowerCase()}). Grå = ingen prognosdata.</div>
        )}

        <label className="mapctl-check">
          <input type="checkbox" checked={showNat} onChange={(e) => setShowNat(e.target.checked)} />
          Framtida nät (optimerat)
        </label>
        {showNat && (
          <div className="legend">
            <div className="row"><span className="dot" style={{ background: '#16a34a' }} />I optimala nätet {natHorizon(year)}</div>
            <div className="row"><span className="dot" style={{ background: '#4f6f18' }} />Föreslaget nytt läge</div>
            <div className="row"><span className="dot" style={{ background: '#cbd5e1' }} />Behövs ej i nätet</div>
            <div className="legend-note">
              Minsta nät som ger alla plats inom närhetsnormen, resvägsoptimerad placering
              (spopt, batch — se Översikt → Framtida skolnät). Ersätter skolpunkterna medan lagret är på.
              {' '}<span className="mockflag">metodprototyp</span>
            </div>
          </div>
        )}

        <label className="mapctl-check">
          <input type="checkbox" checked={showFlows} onChange={(e) => setShowFlows(e.target.checked)} />
          Omfördelning vid stängning
        </label>
        {showFlows && (
          <div className="legend">
            <div className="row"><span className="flowline" style={{ background: '#005293' }} />Tilldelning (optimering)</div>
            <div className="row"><span className="flowline dashed" />Skolval (elevernas omval)</div>
            <div className="row"><span className="dot" style={{ background: '#fff', boxShadow: '0 0 0 2px #dc2626' }} />Föreslås stängas</div>
            <div className="legend-note">
              {plan?.closures?.length
                ? `Konsolideringsplanens ${plan.closures.length} stängning${plan.closures.length > 1 ? 'ar' : ''} till ${year} (${scenario.toLowerCase()}). Heldragen = var eleverna tilldelas plats; streckad = var de själva skulle välja (IIA-omval). Linjebredd = antal elever.`
                : 'Inga stängningar i planen vid vald horisont/scenario — justera under Översikt (t.ex. längre horisont eller minskande elevtal).'}
              {' '}<span className="mockflag">exempelmodell</span>
            </div>
          </div>
        )}

        <label className="mapctl-check">
          <input type="checkbox" checked={showCand} onChange={(e) => setShowCand(e.target.checked)} />
          Kandidatsiter ({CANDIDATES.length})
        </label>
        {showCand && (
          <div className="legend">
            <div className="row"><span className="dot" style={{ background: '#cf5e00' }} />Expansion (befintligt läge)</div>
            <div className="row"><span className="dot" style={{ background: '#4f6f18' }} />Nybyggnad</div>
            <div className="legend-note">Hovra för kapacitet och stadier. <span className="mockflag">exempel</span></div>
          </div>
        )}
      </div>
    </div>
  )
}
