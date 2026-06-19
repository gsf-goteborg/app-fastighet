import { useState, useMemo } from 'react'
import { RENOV, occColor } from '../lib/constants'
import { exportCsv } from '../lib/exportCsv'

const COLS = [
  ['namn', 'Skola'],
  ['stadsomrade', 'Område'],
  ['primaromrade', 'Primärområde'],
  ['byggnadsar', 'Byggår'],
  ['renovbehov', 'Renov.behov'],
  ['pedKapacitet', 'Ped. kap.'],
  ['elever', 'Elever'],
  ['belaggPct', 'Beläggn.'],
  ['tommaPlatser', 'Tomma'],
  ['spilldHyra', 'Outnyttjad kostn.'],
  ['underhallsskuld', 'Underh.skuld'],
]

export default function TableView({ schools, onSelect }) {
  const [sortKey, setSortKey] = useState('namn')
  const [sortDir, setSortDir] = useState(1)

  const sorted = useMemo(() => {
    return [...schools].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey]
      return (x > y ? 1 : x < y ? -1 : 0) * sortDir
    })
  }, [schools, sortKey, sortDir])

  const sort = (k) => {
    if (k === sortKey) setSortDir((d) => -d)
    else { setSortKey(k); setSortDir(1) }
  }

  return (
    <div className="tablewrap">
      <div className="tabletools">
        <div className="grow"><b>{schools.length}</b> skolor i urvalet</div>
        <button className="btn primary" onClick={() => exportCsv(sorted)}>⭳ Exportera CSV</button>
      </div>
      <table>
        <thead>
          <tr>
            {COLS.map(([k, label]) => (
              <th key={k} onClick={() => sort(k)}>
                {label} <span className="ar">{sortKey === k ? (sortDir > 0 ? '▲' : '▼') : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.id} onClick={() => onSelect(s.id)}>
              <td>{s.namn}</td>
              <td>{s.stadsomrade}</td>
              <td>{s.primaromrade}</td>
              <td className="num">{s.byggnadsar}</td>
              <td><span className="pill" style={{ background: RENOV[s.renovbehov][1] }}>{RENOV[s.renovbehov][0]}</span></td>
              <td className="num">{s.pedKapacitet}</td>
              <td className="num">{s.elever}</td>
              <td className="num" style={{ color: occColor(s.belaggPct) }}>{s.belaggPct}%</td>
              <td className="num">{s.tommaPlatser || '–'}</td>
              <td className="num">{s.spilldHyra ? (s.spilldHyra / 1e6).toFixed(2) + ' Mkr' : '–'}</td>
              <td className="num">{s.underhallsskuld ? s.underhallsskuld + ' Mkr' : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
