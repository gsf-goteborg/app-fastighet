import { describe, it, expect } from 'vitest'
import { haversineKm, spreadPositions } from '../src/lib/geo'

/* Pixelkonstant spridning av samlokaliserade markörer (lib/geo.js):
   samma synliga avstånd på alla zoomnivåer ⇒ markavståndet halveras
   per zoomsteg, och ringen är centrerad på den sanna koordinaten. */

const HUS = [
  { id: 1, namn: 'A (grundskola)', lat: 57.719963, lng: 11.928194 },
  { id: 2, namn: 'A (anpassad)', lat: 57.719963, lng: 11.928194 },
]
const SOLO = [{ id: 3, namn: 'Ensam', lat: 57.75, lng: 12.0 }]

const gapKm = (pos) => {
  const [lng1, lat1] = pos.get(1)
  const [lng2, lat2] = pos.get(2)
  return haversineKm(lat1, lng1, lat2, lng2)
}

describe('spreadPositions (pixelkonstant markörspridning)', () => {
  it('flyttar inte ensamma skolor', () => {
    const pos = spreadPositions(SOLO, 12)
    expect(pos.get(3)).toEqual([12.0, 57.75])
  })

  it('separerar samlokaliserade enheter', () => {
    expect(gapKm(spreadPositions(HUS, 12))).toBeGreaterThan(0)
  })

  it('halverar markavståndet per zoomsteg (konstant pixelavstånd)', () => {
    const g12 = gapKm(spreadPositions(HUS, 12))
    const g13 = gapKm(spreadPositions(HUS, 13))
    const g16 = gapKm(spreadPositions(HUS, 16))
    expect(g13).toBeCloseTo(g12 / 2, 6)
    expect(g16).toBeCloseTo(g12 / 16, 6)
  })

  it('inzoomat (z16) ligger enheterna inom ~20 m från byggnadens sanna läge', () => {
    // 14 px × ~1,28 m/px vid z16 ≈ 18 m — mot tidigare fasta ~140 m
    const pos = spreadPositions(HUS, 16)
    for (const id of [1, 2]) {
      const [lng, lat] = pos.get(id)
      expect(haversineKm(lat, lng, HUS[0].lat, HUS[0].lng) * 1000).toBeLessThan(20)
    }
  })

  it('ringen är centrerad på den sanna koordinaten', () => {
    const pos = spreadPositions(HUS, 12)
    const midLng = (pos.get(1)[0] + pos.get(2)[0]) / 2
    const midLat = (pos.get(1)[1] + pos.get(2)[1]) / 2
    expect(midLng).toBeCloseTo(HUS[0].lng, 9)
    expect(midLat).toBeCloseTo(HUS[0].lat, 9)
  })
})
