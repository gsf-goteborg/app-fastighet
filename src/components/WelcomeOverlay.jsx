import { useState } from 'react'

const SEEN_KEY = 'skolportfolj_welcome_seen'

const TIPS = [
  ['🗺️', 'Kartan färglägger skolor efter prognostiserad elevförändring',
    'Grönt växer, rött krymper. Byt färgläggning och horisont uppe till höger.'],
  ['🏫', 'Klicka en skola',
    'Fastighet, kapacitet, beläggning, elevernas härkomst per primärområde och genomsnittlig resväg.'],
  ['📊', 'Fliken Översikt',
    'Elevframskrivning per område, önska skola-simulering, tillgänglighet, konsolideringsförslag och robusthet.'],
  ['🔧', 'Driv analysen',
    'Vill du se konsolideringsförslag? Välj ett scenario med minskande elevtal (t.ex. Snabb minskning) och en längre horisont (2045–2050) under Översikt.'],
]

export default function WelcomeOverlay() {
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(SEEN_KEY) } catch { return true }
  })
  if (!open) return null
  const close = () => {
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }
  return (
    <div className="welcome-backdrop" onClick={close}>
      <div className="welcome" onClick={(e) => e.stopPropagation()}>
        <h2>Skolportfölj Göteborg</h2>
        <p className="welcome-sub">
          Planeringsverktyg för fastighetsavdelningen — se var elevunderlaget växer och krymper,
          simulera skolval och pröva konsolidering med bibehållen närhet för de yngsta.
        </p>
        <div className="welcome-tips">
          {TIPS.map(([icon, title, body]) => (
            <div className="welcome-tip" key={title}>
              <span className="welcome-ico">{icon}</span>
              <div>
                <b>{title}</b>
                <div className="welcome-body">{body}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="welcome-note">
          Alla siffror är <b>exempeldata</b> tills skarpa register (elevprognos, härkomst,
          vägnätsavstånd) kopplas in — strukturen och modellerna är på plats.
        </p>
        <button className="btn primary" onClick={close}>Kom igång</button>
      </div>
    </div>
  )
}
