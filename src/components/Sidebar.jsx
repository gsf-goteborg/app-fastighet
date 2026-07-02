import { useState } from 'react'
import { FACETS, FACET_LABELS, AREA_COLORS } from '../lib/constants'
import { toggleFacet, emptyFilters } from '../lib/filters'
import { SCHOOLS } from '../data/schools'
import FacetSelect from './FacetSelect'

// Fasetter med många värden visas som dropdown i stället för chips.
const DROPDOWN_FACETS = new Set(['mellanomrade'])

const MAX_SUGGESTIONS = 8

// Namnträffar först (börjar-med före innehåller), därefter skolhus-träffar
function suggestionsFor(q) {
  const query = q.trim().toLowerCase()
  if (!query) return []
  const starts = [], contains = []
  for (const s of SCHOOLS) {
    const n = s.namn.toLowerCase()
    if (n.startsWith(query)) starts.push(s)
    else if (n.includes(query) || s.adress.toLowerCase().includes(query)) contains.push(s)
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS)
}

export default function Sidebar({ filters, setFilters, search, setSearch, shown, total, onSelect }) {
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1) // markerat förslag (tangentbord)
  const reset = () => { setFilters(emptyFilters()); setSearch('') }

  const suggestions = open ? suggestionsFor(search) : []

  const pick = (s) => {
    setSearch(s.namn)
    setOpen(false)
    setHi(-1)
    onSelect?.(s.id)
  }
  const onKeyDown = (e) => {
    if (!suggestions.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h <= 0 ? suggestions.length - 1 : h - 1)) }
    else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(suggestions[hi]) }
    else if (e.key === 'Escape') { setOpen(false); setHi(-1) }
  }

  return (
    <aside className="filters">
      <div className="search-wrap">
        <input
          type="search"
          placeholder="Sök skola…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); setHi(-1) }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {suggestions.length > 0 && (
          <div className="search-pop">
            {suggestions.map((s, i) => (
              // onMouseDown (inte onClick) så valet hinner före inputens blur
              <div
                key={s.id}
                className={'search-opt' + (i === hi ? ' hi' : '')}
                onMouseDown={(e) => { e.preventDefault(); pick(s) }}
                onMouseEnter={() => setHi(i)}
              >
                <div>{s.namn}</div>
                <div className="sub">{s.mellanomrade} · {s.skolform}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {Object.keys(FACETS).map((facet) => (
        <div className="group" key={facet}>
          <h3>{FACET_LABELS[facet]}</h3>
          {DROPDOWN_FACETS.has(facet) ? (
            <FacetSelect
              label={FACET_LABELS[facet]}
              values={FACETS[facet]}
              selected={filters[facet]}
              onToggle={(val) => setFilters(toggleFacet(filters, facet, val))}
              onClear={() => setFilters({ ...filters, [facet]: [] })}
            />
          ) : (
            <div className="chips">
              {FACETS[facet].map((val) => {
                const on = filters[facet].includes(val)
                return (
                  <div
                    key={val}
                    className={'chip' + (on ? ' on' : '')}
                    onClick={() => setFilters(toggleFacet(filters, facet, val))}
                  >
                    {facet === 'stadsomrade' && (
                      <span className="sw" style={{ background: AREA_COLORS[val] }} />
                    )}
                    {val}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      <div className="count">{shown} av {total} skolor</div>
      <button className="reset" onClick={reset}>Återställ filter</button>
    </aside>
  )
}
