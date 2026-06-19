# Handoff — Skolportfölj Göteborg

Internt planeringsverktyg för fastighetsavdelningen: visar Göteborgs grundskolor
på karta, skriver fram elevtal demografiskt och föreslår konsolidering. **All
icke-geografisk data är exempeldata** tills den kopplas mot skarpa register.

> Snabbstart: `npm install` → `npm run dev`. Allt ligger på `main`.

---

## Vad som är byggt

1. **Geografisk hierarki** — `stadsområde ⊃ mellanområde ⊃ primärområde` (Göteborgs
   statistiska indelning). Fält på varje skola, filterfasetter, infopanel, tabell, CSV.
2. **Befolkningsbaserad elevframskrivning** (kohortmodell) — ersätter den uniforma
   procentframskrivningen. Skriver fram per primärområde och åldersstadie (F–3/4–6/7–9)
   och fördelar på skolor via observerat elevmönster. Basårskalibrerad.
3. **Elevhärkomst + resväg** — per skola: antal elever per primärområde och
   genomsnittlig resväg. Aggregerat och sekretessmaskat (inga individadresser).
   Driver både visning (infopanel) och framskrivningens flödesmatris.
4. **Kartvy av prognosen** — tema "Elevförändring (prognos)" färglägger skolor efter
   projicerad förändring till vald horisont.
5. **Importkontroll** — `validateOrigins()` granskar skarpt datauttag vid byte.

## Arkitektur — var datan kommer in

| Datakälla | Fil | Status |
|---|---|---|
| Skolor (namn, läge, BTA, hyra, skick, elevtal …) | `src/data/schools.js` | exempel |
| Befolkningsprognos per primärområde × stadie | `src/data/prognos.js` (`BEFOLKNING`) | exempel |
| Elevmönster: härkomst + resväg per skola | `src/data/origins.js` (`SCHOOL_ORIGINS`) | exempel (mock) |
| Framskrivningsmotor (kombinerar ovan) | `src/lib/framskrivning.js` | klar |
| Konsolideringsoptimering (MILP) | `src/lib/optimizer.js` | klar |

Motorn och komponenterna är oförändrade vid databyte — bara datafilerna byts.

---

## Nästa steg (måndag): koppla in riktig elevhärkomst

Det riktiga uttaget ersätter **hela** `src/data/origins.js`. Behåll formen:

```js
// SCHOOL_ORIGINS[skolId] = {
//   meanKm,                                    // genomsnittlig resväg (vägnät)
//   areas: [{ primaromrade, antal, medelKm }], // en rad per primärområde, sorterad
//   ovriga: { antal, medelKm } | null,         // hopslagna små celler (sekretess)
// }
// AREA_INTAKE byggs automatiskt ur SCHOOL_ORIGINS.
```

Förväntat råuttag, en rad per (skola, primärområde): `antal_elever`,
`medelavstånd_km` (riktigt vägnätsavstånd). **Maska celler < `MIN_CELL` elever**
(slå ihop till `ovriga`) — individer ska aldrig kunna pekas ut.

Checklista:
1. Mappa era skol-id mot appens `id` i `schools.js` (eller lägg in en mappning).
2. Använd era riktiga vägnätsavstånd (samma nät som önska-skola-processen) i `medelKm`.
3. Kör appen och **titta i webbläsarens dev-konsol** — `validateOrigins()` varnar för
   saknade/okända skolor, summor som inte stämmer, omaskade småceller och
   primärområden utan befolkningsprognos.
4. Lägg in befolkningsprognos i `prognos.js` (`BEFOLKNING`) för alla primärområden
   som förekommer i härkomsten, annars ignorerar framskrivningen dem.

## Därefter (kräver de riktiga vägnätsavstånden)

- **Riktiga avstånd in i konsolideringsplanen** — optimeraren flyttar idag elever på
  fågelvägsavstånd byggnad→byggnad. Med vägnätsavstånd blir "alla elever får plats
  inom X km" styrkbart, mätt per elev från hemområde.
- **Likvärdighetslins** — andel elever med > X km resväg, och hur varje nedläggning
  ändrar den. Avgörande för beslut: en nedläggning i ett bilberoende område slår
  helt annorlunda än i ett tätt.

---

## Att veta

- Ny Claude Code-session minns inte tidigare samtal. Peka den på den här filen +
  `src/data/origins.js` och `src/lib/framskrivning.js` för att komma igång.
- Inget hemligt i repot; all känslig elevdata hålls aggregerad och maskad redan i
  datakällan — råadresser ska aldrig in i frontend-bundeln.
