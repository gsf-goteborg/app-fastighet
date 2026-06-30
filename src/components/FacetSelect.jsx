import { useEffect, useRef, useState } from 'react'

// Multi-select dropdown för fasetter med många värden (mellan-/primärområde).
// Trigger visar antal valda; popover listar kryssbara värden med sök.
export default function FacetSelect({ label, values, selected, onToggle, onClear }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onEsc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onEsc) }
  }, [open])

  const shown = q ? values.filter((v) => v.toLowerCase().includes(q.toLowerCase())) : values
  const n = selected.length

  return (
    <div className="facet-select" ref={ref}>
      <button
        type="button"
        className={'facet-trigger' + (n ? ' has' : '')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="facet-trigger-label">
          {n === 0 ? 'Alla' : n === 1 ? selected[0] : `${n} valda`}
        </span>
        <span className="facet-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="facet-pop" role="listbox">
          <input
            className="facet-search"
            type="search"
            placeholder={`Sök ${label.toLowerCase()}…`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <div className="facet-options">
            {shown.length === 0 && <div className="facet-empty">Inga träffar</div>}
            {shown.map((val) => {
              const on = selected.includes(val)
              return (
                <label key={val} className={'facet-opt' + (on ? ' on' : '')}>
                  <input type="checkbox" checked={on} onChange={() => onToggle(val)} />
                  <span>{val}</span>
                </label>
              )
            })}
          </div>
          {n > 0 && (
            <button type="button" className="facet-clear" onClick={onClear}>
              Rensa ({n})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
