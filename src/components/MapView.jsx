import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { THEME_EXPR, THEME_LABELS, LEGENDS } from '../lib/constants'

function toGeoJSON(schools, projFn, year) {
  return {
    type: 'FeatureCollection',
    features: schools.map((s) => {
      const proj = projFn ? projFn(s, year) : s.elever
      const forandPct = s.elever ? Math.round((proj / s.elever - 1) * 100) : 0
      return {
        type: 'Feature',
        id: s.id,
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: { ...s, projElever: proj, forandPct },
      }
    }),
  }
}

function planFeatures(plan) {
  const lines = [], closed = []
  for (const c of plan.closures) {
    closed.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [c.school.lng, c.school.lat] }, properties: {} })
    for (const r of c.reassign) {
      lines.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[c.school.lng, c.school.lat], [r.lng, r.lat]] }, properties: {} })
    }
  }
  return { lines: { type: 'FeatureCollection', features: lines }, closed: { type: 'FeatureCollection', features: closed } }
}

export default function MapView({ schools, theme, setTheme, onSelect, active, plan, projFn, year, setYear }) {
  const [playing, setPlaying] = useState(false)
  // Spela upp tidslinjen: stega prognosåret 2026 → 2050 och se staden förändras
  useEffect(() => {
    if (!playing) return
    if (year >= 2050) { setPlaying(false); return }
    const t = setTimeout(() => setYear((y) => Math.min(2050, y + 1)), 650)
    return () => clearTimeout(t)
  }, [playing, year, setYear])

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const selectRef = useRef(onSelect)
  selectRef.current = onSelect
  const planRef = useRef(plan)
  planRef.current = plan
  const projRef = useRef({ projFn, year })
  projRef.current = { projFn, year }

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
      map.addSource('schools', { type: 'geojson', data: toGeoJSON(schools, projRef.current.projFn, projRef.current.year) })
      map.addLayer({
        id: 'pt', type: 'circle', source: 'schools',
        paint: {
          'circle-color': THEME_EXPR[theme],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 11],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#fff',
        },
      })
      // Planlager (elevomflyttning) — under skolpunkterna
      const empty = { type: 'FeatureCollection', features: [] }
      map.addSource('plan-closed', { type: 'geojson', data: empty })
      map.addLayer({
        id: 'plan-closed', type: 'circle', source: 'plan-closed',
        paint: { 'circle-radius': 15, 'circle-color': 'rgba(220,38,38,0.10)', 'circle-stroke-color': '#dc2626', 'circle-stroke-width': 2.5 },
      }, 'pt')
      map.addSource('plan-lines', { type: 'geojson', data: empty })
      map.addLayer({
        id: 'plan-lines', type: 'line', source: 'plan-lines',
        paint: { 'line-color': '#dc2626', 'line-width': 2, 'line-dasharray': [2, 1.5], 'line-opacity': 0.85 },
      }, 'pt')

      map.on('click', 'pt', (e) => selectRef.current(e.features[0].properties.id))
      map.on('mouseenter', 'pt', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'pt', () => { map.getCanvas().style.cursor = '' })
      readyRef.current = true
      map.getSource('schools').setData(toGeoJSON(schools, projRef.current.projFn, projRef.current.year))
      const f = planFeatures(planRef.current)
      map.getSource('plan-lines').setData(f.lines)
      map.getSource('plan-closed').setData(f.closed)
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

  // Byt tematisk färgläggning
  useEffect(() => {
    if (readyRef.current && mapRef.current.getLayer('pt')) {
      mapRef.current.setPaintProperty('pt', 'circle-color', THEME_EXPR[theme])
    }
  }, [theme])

  // Uppdatera planlager (elevomflyttning) när planen ändras
  useEffect(() => {
    if (!readyRef.current) return
    const f = planFeatures(plan)
    mapRef.current.getSource('plan-lines')?.setData(f.lines)
    mapRef.current.getSource('plan-closed')?.setData(f.closed)
  }, [plan])

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
        </div>
        {theme === 'forandring' && (
          <div className="legend-note">Prognos till {year} · scenario väljs under Översikt</div>
        )}
      </div>

      <div className="timebar">
        <button className="time-play" onClick={() => setPlaying((p) => !p)} title={playing ? 'Pausa' : 'Spela upp prognosen'}>
          {playing ? '⏸' : '▶'}
        </button>
        <input
          type="range" min="2026" max="2050" step="1" value={year}
          onChange={(e) => { setPlaying(false); setYear(+e.target.value) }}
        />
        <div className="time-year">{year}<small>{year <= 2026 ? ' (idag)' : ' prognos'}</small></div>
      </div>

      {plan.closures.length > 0 && (
        <div className="planbox">
          <b>Konsolideringsplan{plan.optimal ? ' (MILP-optimal)' : ''}</b>
          <div>{plan.closures.length} skolor föreslås stänga · streckade linjer = elevomflyttning till mottagande skola</div>
          <div className="planbox-sub">Justera scenario och villkor under fliken Översikt.</div>
        </div>
      )}
    </div>
  )
}
