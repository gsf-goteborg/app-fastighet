# Projektfil — format för fastighets kommande projekt

Mall: [`projektfil_mall.csv`](projektfil_mall.csv) (semikolonseparerad — sparas
direkt ur svensk Excel med "Spara som → CSV").

Ersätter dagens arbetsfil (skolform, stadie, objekt, enhet, planeringsinriktning,
i hyresprognos, kvartalsmatris 2026/Q1 …) som datakälla till appen. Dagens fil
kan behållas som arbetsvy — den här är **utbytesformatet** som `build_data.py`
läser och validerar.

## En rad per projekt

| Kolumn | Betydelse |
|---|---|
| `projekt_id` | Stabilt id (t.ex. P-2026-001). Ändras aldrig — gör filen diffbar mellan uttag. |
| `objekt` | Skolhus/fastighet i klartext (nybyggnad: arbetsnamn). |
| `enhet_id` | Appens skolenhets-id (`schools.js`). **Tomt för nybyggnad** — då krävs `lat`/`lng`. |
| `skolform` | Grundskola \| Anpassad grundskola. |
| `stadier` | Berörda stadier: `F-3,4-6,7-9` (kommaseparerat). |
| `atgard` | `nybyggnad` \| `tillbyggnad` \| `renovering` \| `paviljong` \| `ersattning` \| `avveckling`. |
| `status` | `beslutad` \| `planerad` \| `utredning`. **Styr hanteringen:** beslutad → ingår i baslägets kapacitet/kostnad; planerad/utredning → visas, kan lyftas in som what-if. |
| `klart_kvartal` | Driftstart, `2028Q3`. |
| `slut_kvartal` | Endast temporära (paviljong): när kapaciteten försvinner igen. |
| `delta_platser_lag/mellan/hog` | Kapacitetsförändring **per stadie** (± heltal). Explicit i stället för härledd — appen är stadieindelad. |
| `delta_hyra_tkr_ar` | Hyresförändring, tkr/år (±). Ersätter ja/nej-kolumnen "i hyresprognos" med beloppet. |
| `lat`, `lng` | WGS84 **byggnadscentroid** — bara för nya objekt utan `enhet_id`. |
| `planeringsinriktning` | Fri kommentar (behålls från dagens fil). |
| `uppdaterad` | Datum för senaste ändring av raden — spårbarhet per uttag. |

## Varför inte kvartalsmatrisen?

1. **Semantiken är implicit** — vad betyder cellvärdet i `2027/Q2`? Platser?
   Ackumulerat eller förändring? En matris kan inte valideras maskinellt.
2. **Den växer i sidled varje år** och gamla kolumner måste ligga kvar.
3. **Kvartalsprofilen är härledbar**: kapacitet över tid = steg vid
   `klart_kvartal` (och −steg vid `slut_kvartal`). Behöver ett projekt en
   etappvis upptrappning: lägg flera rader med samma `projekt_id` och olika
   `klart_kvartal` (etapp 1, etapp 2 …).
4. **Status var gömd i fritexten** (planeringsinriktning). Beslutsläget är den
   viktigaste uppgiften i hela filen — beslutade projekt hör till baslägets
   kapacitets-/kostnadsbild, utredningar gör det inte. Nu är den ett eget fält
   med tre tillåtna värden.

## Valideringsregler (byggs in i `build_data.py`-steget)

- `enhet_id` finns i skolregistret, ELLER `lat`/`lng` angivna (nybyggnad)
- `status`/`atgard` inom tillåtna värden; `klart_kvartal` på formen ÅÅÅÅ"Q"1–4
- `avveckling` → alla delta ≤ 0; `nybyggnad`/`tillbyggnad`/`paviljong` → ≥ 0
- `paviljong` → `slut_kvartal` krävs
- varning om `delta_platser` saknas helt (projekt utan kapacitetseffekt är ok
  för t.ex. renovering, men ska vara avsiktligt)
