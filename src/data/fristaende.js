/* ===========================================================================
   FRISTÅENDE-AVHOPP — mönster för elever som får en KOMMUNAL plats men väljer
   en fristående skola vid terminsstart. Driver ÖVERPLACERING i den kortsiktiga
   placeringsprocessen: om a % historiskt hoppar av kan man erbjuda fler platser
   så att nettot ändå fyller kapaciteten (som överbokning).

   STATUS: EXEMPELDATA. Ersätt med Göteborgs Stads observerade avhoppsandelar
   per (mellanområde, stadie) — formen (andel 0–1) är den appen läser.
   Högstadiet har högst avhopp (mest aktivt skolval); centralt/attraktiva
   områden högre söktryck mot fristående.
=========================================================================== */

// Bas-avhopp per åldersstadie (andel av antagna som väljer fristående)
const BASE = { lag: 0.10, mellan: 0.07, hog: 0.13 }

// Deterministisk områdesvariation ~0.6–1.4× (stabil mellan körningar, ingen slump)
function areaMult(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return 0.6 + ((h % 1000) / 1000) * 0.8
}

// Andel (0–1) av kommunalt antagna som väljer fristående, per mellanområde × stadie
export function friAttrition(mellanomrade, stage) {
  const r = (BASE[stage] || 0) * areaMult(mellanomrade || '')
  return Math.min(0.25, Math.max(0.02, +r.toFixed(3)))
}
