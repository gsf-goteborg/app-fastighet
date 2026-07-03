/* Samlokaliserade skolenheter (grundskola + anpassad grundskola i samma hus)
   delar exakt koordinat och sprids i en liten ring så att båda syns och går
   att klicka — ENDAST presentation, skolornas koordinater i datan är
   oförändrade. Radien är PIXELKONSTANT (samma synliga avstånd på alla
   zoomnivåer): utzoomat en knapp prickbredd, inzoomat kryper enheterna ihop
   mot byggnadens verkliga läge i stället för att hamna hundratals meter fel. */
const SPREAD_PX = 14

// Markytans meter per skärmpixel vid given latitud och zoom (WebMercator, 256px-tiles)
function metersPerPixel(lat, zoom) {
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom + 8)
}

// Map skol-id → [lng, lat] med samlokaliserade enheter utspridda i ring
export function spreadPositions(schools, zoom, px = SPREAD_PX) {
  const groups = new Map()
  for (const s of schools) {
    const key = s.lat.toFixed(4) + ',' + s.lng.toFixed(4)
    ;(groups.get(key) || groups.set(key, []).get(key)).push(s)
  }
  const pos = new Map()
  for (const grp of groups.values()) {
    if (grp.length === 1) { pos.set(grp[0].id, [grp[0].lng, grp[0].lat]); continue }
    const lat = grp[0].lat
    const rDeg = (px * metersPerPixel(lat, zoom)) / 111320 // ringradie i latitudgrader
    const cosLat = Math.cos((lat * Math.PI) / 180) || 1
    grp.forEach((s, i) => {
      const ang = (2 * Math.PI * i) / grp.length
      pos.set(s.id, [s.lng + (rDeg * Math.cos(ang)) / cosLat, s.lat + rDeg * Math.sin(ang)])
    })
  }
  return pos
}

// Avstånd mellan två koordinater (fågelvägen), km. Haversine.
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
