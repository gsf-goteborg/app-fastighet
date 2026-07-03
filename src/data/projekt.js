import DATA from './generated/projekt.json'
import { STAGE_KEYS } from './prognos'

/* ===========================================================================
   FASTIGHETS PROJEKTFIL — kommande projekt som ändrar kapacitet och kostnad.
   Genereras av scripts/build_projekt.py ur data/projektfil_mall.csv
   (byts mot skarpt uttag i samma format — se data/projektfil_README.md).

   Hantering per status:
     beslutad            → ingår i BASLÄGET: kapacitets-/kostnadsbilden vid
                           en horisont justeras i gap-analysen (Översikt).
     planerad/utredning  → visas, och kan lyftas in som what-if-åtgärd
                           ("pröva i what-if") — hypoteser, inte basläge.

   Ett projekt är aktivt vid år Y om klartAr ≤ Y och (slutAr saknas eller > Y)
   — paviljonger försvinner alltså ur bilden vid slutkvartalet.
=========================================================================== */

export const PROJEKT = DATA.projekt
export const PROJEKT_KALLA = DATA.kalla

export const projektAktivt = (p, year) =>
  p.klartAr <= year && (p.slutAr == null || p.slutAr > year)

// Beslutade projekts kapacitetseffekt vid en horisont, per stadsområde × stadie.
// (Nybyggnader räknas på sitt områdes rad — område satt av pipelinen.)
export function beslutadeDeltaPerOmrade(year) {
  const out = {}
  for (const p of PROJEKT) {
    if (p.status !== 'beslutad' || !projektAktivt(p, year)) continue
    const o = (out[p.stadsomrade] ||= { lag: 0, mellan: 0, hog: 0, total: 0, hyraTkr: 0, n: 0 })
    for (const st of STAGE_KEYS) { o[st] += p.delta[st]; o.total += p.delta[st] }
    o.hyraTkr += p.deltaHyraTkr
    o.n += 1
  }
  return out
}

// Summering över alla områden (KPI:er, rapport)
export function beslutadeDeltaTotalt(year) {
  const per = beslutadeDeltaPerOmrade(year)
  const tot = { lag: 0, mellan: 0, hog: 0, total: 0, hyraTkr: 0, n: 0 }
  for (const o of Object.values(per)) {
    for (const k of Object.keys(tot)) tot[k] += o[k]
  }
  return tot
}
