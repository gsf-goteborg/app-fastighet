// Exporterar en lista skolor till CSV som öppnas korrekt i svenskt Excel:
// semikolon-separator + UTF-8 BOM så att åäö och kolumner hamnar rätt.
const COLUMNS = [
  ['namn', 'Skola'],
  ['stadsomrade', 'Stadsområde'],
  ['mellanomrade', 'Mellanområde'],
  ['primaromrade', 'Primärområde'],
  ['huvudman', 'Huvudman'],
  ['arskurser', 'Årskurser'],
  ['adress', 'Adress'],
  ['fastighet', 'Fastighetsbeteckning'],
  ['byggnadsar', 'Byggnadsår'],
  ['senasteRenov', 'Senaste renovering'],
  ['bta', 'BTA (m²)'],
  ['platser', 'Byggnadens platser'],
  ['kapPerArskurs', 'Ped. kapacitet/årskurs'],
  ['pedKapacitet', 'Ped. kapacitet totalt'],
  ['elever', 'Elever'],
  ['eleverPerArskurs', 'Elever/årskurs'],
  ['belaggPct', 'Beläggning (%)'],
  ['tommaPlatser', 'Tomma platser'],
  ['hyraPerM2', 'Internhyra (kr/m²/år)'],
  ['arshyra', 'Årshyra (kr)'],
  ['spilldHyra', 'Outnyttjad lokalkostnad (kr/år)'],
  ['kostnadPerElev', 'Lokalkostnad/elev (kr/år)'],
  ['renovbehov', 'Renoveringsbehov (1-5)'],
  ['underhallsskuld', 'Underhållsskuld (Mkr)'],
  ['energiklass', 'Energiklass'],
]

function cell(v) {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function exportCsv(schools, filename = 'skolportfolj.csv') {
  const header = COLUMNS.map(([, label]) => cell(label)).join(';')
  const rows = schools.map((s) => COLUMNS.map(([key]) => cell(s[key])).join(';'))
  const csv = '﻿' + [header, ...rows].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
