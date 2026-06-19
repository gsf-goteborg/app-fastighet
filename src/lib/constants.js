// Färger, skalor och filter-fasetter — delas av karta, tabell och översikt.

export const AREA_COLORS = {
  Centrum: '#2563eb', Nordost: '#dc2626', Hisingen: '#ca8a04', Sydväst: '#16a34a',
}

// Renoveringsbehov: skick-skala 1–5. [etikett, färg]
export const RENOV = {
  1: ['Nyskick', '#16a34a'],
  2: ['Gott', '#65a30d'],
  3: ['Acceptabelt', '#ca8a04'],
  4: ['Eftersatt', '#ea580c'],
  5: ['Akut', '#dc2626'],
}

// Filter-fasetter (fältnamn → valbara värden, i visningsordning)
// Geografin följer Göteborgs indelning: stadsområde ⊃ mellanområde ⊃ primärområde.
export const FACETS = {
  stadsomrade: ['Centrum', 'Nordost', 'Hisingen', 'Sydväst'],
  mellanomrade: [
    'Centrum-Vasastaden', 'Haga-Linné', 'Guldheden-Johanneberg', 'Örgryte-Härlanda',
    'Bergsjön', 'Kortedala', 'Angered',
    'Backa', 'Biskopsgården', 'Lundby',
    'Frölunda', 'Älvsborg-Önnered', 'Askim-Hovås',
  ],
  primaromrade: [
    'Vasastaden', 'Gårda', 'Annedal', 'Masthugget', 'Johanneberg', 'Krokslätt',
    'Södra Guldheden', 'Bö', 'Lunden',
    'Östra Bergsjön', 'Kortedala', 'Gärdsås', 'Rannebergen', 'Lövgärdet',
    'Tolered', 'Brunnsbo', 'Rya', 'Södra Biskopsgården',
    'Järnbrott', 'Älvsborg', 'Önnered', 'Askim',
  ],
  huvudman: ['Kommunal', 'Fristående'],
  aldersgrupp: ['–1959', '1960–79', '1980–2009', '2010–'],
  renovgrupp: ['OK', 'Acceptabelt', 'Eftersatt', 'Akut'],
  belaggrupp: ['Underbelagd', 'Balanserad', 'Överbelagd'],
}

export const FACET_LABELS = {
  stadsomrade: 'Stadsområde',
  mellanomrade: 'Mellanområde',
  primaromrade: 'Primärområde',
  huvudman: 'Huvudman',
  aldersgrupp: 'Byggnadsår',
  renovgrupp: 'Renoveringsbehov',
  belaggrupp: 'Beläggning',
}

// MapLibre paint-uttryck per tematisk färgläggning
export const THEME_EXPR = {
  renovbehov: ['match', ['get', 'renovbehov'], 1, RENOV[1][1], 2, RENOV[2][1], 3, RENOV[3][1], 4, RENOV[4][1], 5, RENOV[5][1], '#999'],
  belagg: ['case', ['<', ['get', 'belagg'], 0.85], '#2563eb', ['<=', ['get', 'belagg'], 1.0], '#16a34a', '#dc2626'],
  byggnadsar: ['interpolate', ['linear'], ['get', 'byggnadsar'], 1900, '#dc2626', 1975, '#ca8a04', 2010, '#16a34a', 2020, '#15803d'],
  huvudman: ['match', ['get', 'huvudman'], 'Kommunal', '#2563eb', 'Fristående', '#ea7317', '#999'],
  // tomma platser × hyra/plats = spilld hyra (kr/år). Grå = fristående (ej kommunens kostnad).
  spilldHyra: ['case', ['==', ['get', 'hyraPerM2'], 0], '#cbd5e1',
    ['interpolate', ['linear'], ['get', 'spilldHyra'], 0, '#16a34a', 500000, '#ca8a04', 1500000, '#dc2626']],
}

export const THEME_LABELS = {
  renovbehov: 'Renoveringsbehov',
  belagg: 'Beläggningsgrad',
  spilldHyra: 'Outnyttjad lokalkostnad (tomma platser)',
  byggnadsar: 'Byggnadsår',
  huvudman: 'Huvudman',
}

export const LEGENDS = {
  renovbehov: [['Akut', RENOV[5][1]], ['Eftersatt', RENOV[4][1]], ['Acceptabelt', RENOV[3][1]], ['Gott', RENOV[2][1]], ['Nyskick', RENOV[1][1]]],
  belagg: [['Överbelagd >100%', '#dc2626'], ['Balanserad 85–100%', '#16a34a'], ['Underbelagd <85%', '#2563eb']],
  spilldHyra: [['> 1,5 Mkr/år outnyttjat', '#dc2626'], ['~0,5 Mkr/år outnyttjat', '#ca8a04'], ['Fullt nyttjad', '#16a34a'], ['Fristående (ej kommunal)', '#cbd5e1']],
  byggnadsar: [['Före 1960', '#dc2626'], ['1960–1990', '#ca8a04'], ['Efter 2010', '#16a34a']],
  huvudman: [['Kommunal', '#2563eb'], ['Fristående', '#ea7317']],
}

// Hjälpare: färg för beläggningsgrad (procenttal)
export function occColor(pct) {
  return pct > 100 ? '#dc2626' : pct < 85 ? '#2563eb' : '#16a34a'
}
