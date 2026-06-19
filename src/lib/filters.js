import { FACETS } from './constants'

// Tomt filter-tillstånd: en tom mängd per fasett (tom = inget filter)
export function emptyFilters() {
  const f = {}
  for (const key of Object.keys(FACETS)) f[key] = []
  return f
}

// Returnerar skolor som matchar valda fasetter + fritextsök.
export function applyFilters(schools, filters, search) {
  const q = search.trim().toLowerCase()
  return schools.filter((s) => {
    for (const key of Object.keys(filters)) {
      const sel = filters[key]
      if (sel.length && !sel.includes(s[key])) return false
    }
    if (q && !s.namn.toLowerCase().includes(q) && !s.adress.toLowerCase().includes(q)) return false
    return true
  })
}

// Lägg till/ta bort ett värde i en fasett (immutabelt)
export function toggleFacet(filters, facet, value) {
  const cur = filters[facet]
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]
  return { ...filters, [facet]: next }
}
