import { FACETS, FACET_LABELS, AREA_COLORS } from '../lib/constants'
import { toggleFacet, emptyFilters } from '../lib/filters'

export default function Sidebar({ filters, setFilters, search, setSearch, shown, total }) {
  const reset = () => { setFilters(emptyFilters()); setSearch('') }

  return (
    <aside className="filters">
      <input
        type="search"
        placeholder="Sök skola…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {Object.keys(FACETS).map((facet) => (
        <div className="group" key={facet}>
          <h3>{FACET_LABELS[facet]}</h3>
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
        </div>
      ))}

      <div className="count">{shown} av {total} skolor</div>
      <button className="reset" onClick={reset}>Återställ filter</button>
    </aside>
  )
}
