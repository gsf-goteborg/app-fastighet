# Handoff — Skolportfölj Göteborg

Internt planeringsverktyg för fastighetsavdelningen: visar Göteborgs grundskolor
på karta, skriver fram elevtal demografiskt, simulerar skolval och föreslår
konsolidering.

**Datakälla (uppdaterat):** Appens datalager genereras numera ur
`data/student_data.xlsx` (172 kommunala skolenheter — grundskola + anpassad
grundskola) via `scripts/build_data.py`, som skriver `src/data/generated/*.json`.
Geografin följer **stadsområde ⊃ mellanområde** (matchar `public/geo/`-filerna).
Elevtal och förändringstakter kommer ur elevhistorik 2024–2026 (riktiga trender
per mellanområde). Fastighets-/FM-fält (byggnadsår, skick, BTA, internhyra/m²,
underhållsskuld, energiklass) syntetiseras deterministiskt tills de kopplas mot
underhålls-/hyressystem. Bygg om data: `python scripts/build_data.py`.

> Snabbstart: `npm install` → `npm run dev`. Allt ligger på `main`.

## Publicering (testgrupp)

`npm run build` → servera `dist/` på valfri statisk host (verifierad: index +
assets svarar 200 via `npm run preview`). Inget backend krävs. **Enda externa
runtime-beroendet är bakgrundskartan** (vektor-tiles från `openfreemap.org`) —
kontrollera att testgruppens nät/proxy når den, annars blir kartan tom. Vill man
vara oberoende kan en egen tile-källa/MapTiler-nyckel pekas in i `MapView.jsx`.

---

## Vad som är byggt

1. **Geografisk hierarki** — `stadsområde ⊃ mellanområde ⊃ primärområde` (Göteborgs
   statistiska indelning). Fält på varje skola, filterfasetter, infopanel, tabell, CSV.
2. **Befolkningsbaserad elevframskrivning** (kohortmodell) — skriver fram per
   primärområde och åldersstadie (F–3/4–6/7–9) och fördelar på skolor via observerat
   elevmönster. Basårskalibrerad.
3. **Elevhärkomst + resväg** — per skola: antal elever per primärområde och
   genomsnittlig resväg. Aggregerat och sekretessmaskat (inga individadresser).
   Driver visning (infopanel) och framskrivningens flödesmatris.
4. **Kartvy av prognosen** — tema "Elevförändring (prognos)" färglägger skolor efter
   projicerad förändring till vald horisont.
5. **Önska skola — skolvalssimulering** — sannolikhetsmodell för var elever väljer
   skola vid de tre övergångarna (förskoleklass 6 år, mellanstadium 10 år, högstadium
   13 år). Monte Carlo ger förväntad intagning per skola med osäkerhetsband (P10–P90).
6. **Stadieindelad konsolideringsoptimering** — stänger skolor till minsta lokalkostnad,
   men eleverna omfördelas per åldersstadie till skolor som har rätt stadie inom
   stadiets maxavstånd (2/4/6 km), med kapacitetstak per stadie.
7. **Importkontroll** — `validateOrigins()` granskar skarpt elevhärkomstuttag vid byte.

## Arkitektur — var datan kommer in

| Datakälla | Fil | Status |
|---|---|---|
| Generator (xlsx → JSON) | `scripts/build_data.py` | klar |
| Skolor (172 kommunala, läge, kapacitet, hyra, elevtal, skolform) | `src/data/generated/schools.json` → `src/data/schools.js` | testdata + syntetiska FM-fält |
| Befolkning i skolålder per **mellanområde** × stadie + trend | `src/data/generated/befolkning.json` → `prognos.js` (`BEFOLKNING`) | ur elevhistorik 2024–26 |
| Elevmönster (intake per mellanområde → skola) | `src/data/generated/intake.json` → `origins.js` | ur bostadszoner |
| Skolval: sannolikheter + övergångsårgångar | `src/data/choice.js` (`CHOICE`, `COHORT`) | exempel (mock) |
| Framskrivningsmotor (befolkning × elevmönster) | `src/lib/framskrivning.js` | klar |
| Skolvalssimulering (Monte Carlo) | `src/lib/simulate.js` | klar |
| Konsolideringsoptimering (stadieindelad MILP + girig) | `src/lib/optimizer.js` | klar — MILP > 40 skolor ⇒ girig heuristik |
| Områdesgeometri (stads-/mellan-/primär-/basområde) | `public/geo/*.geojson` | klar (officiell indelning, EPSG:4326) |

Motorerna och komponenterna är oförändrade vid databyte — bara datafilerna byts.

---

## Beslutsberedskap — vad som måste kopplas in INNAN skarpa fastighetsbeslut

Verktyget duger nu för **testgruppens utvärdering** (arbetssätt, vyer, nytta). Det
duger **inte** för att fatta nedläggnings-/fastighetsbeslut ännu — flera av de
fält som *avgör* optimeringen är syntetiska eller svaga. I appen är dessa märkta
med röd **"syntetiskt"**-flagga (infopanelen) och en varning i konsolideringskortet.

Checklista, i fallande prioritet (störst påverkan på besluten först):

- [ ] **Vägnätsavstånd** hemområde→skola (ersätt fågelvägen). *Enskilt viktigast* —
      styr hela radievillkoret (2/4/6 km) och därmed vilka skolor som kan ta emot
      varandra. Fågelväg är fel särskilt över Göta älv. Pipeline finns: DuckDB-precompute
      (avsnitt C nedan) → `src/data/distances.js`, byt `haversineKm` i `optimizer.js`.
- [ ] **Skarpa fastighets-/FM-data** (skick, underhållsskuld, BTA, internhyra) från
      underhålls-/hyressystemet. Dessa är idag **syntetiska** men driver
      `optimizer.js` (`savedKr`, `avoidedDebt`, stäng-rankning). Utan dem är
      besparingssiffrorna meningslösa. Lägg in i `scripts/build_data.py`.
- [ ] **Riktig befolkningsprognos** per mellanområde × stadie (stadens egen) i stället
      för den dämpade 3-årstrenden ur elevhistoriken. Ersätt `befolkning.json`.
- [ ] **Verkligt elevmönster/skolval** (folkbokföring × placering, resp. skarp
      valmodell) → `origins.js` / `choice.js`. Idag gravitations-/avståndsmock.
- [ ] **Bevisat optimal lösare** för beslutsstöd: spopt-backend (avsnitt nedan) över
      riktig kostnadsmatris. Webbläsar-MILP:en stängs av > 40 skolor (girig heuristik).
- [ ] **Samlokalisering**: 35 lägen delar hus (grundskola + anpassad grundskola) men
      bär var sin (syntetisk) hyra → dubbelräknad byggnadskostnad. Modellera delad lokal.
- [ ] **Likvärdighetslins**: visa resväg per stadie och hur varje nedläggning ändrar
      andelen elever med lång resväg, bredvid besparingen.

Tills ovan är klart: presentera resultat som *underlag för diskussion*, inte beslut.

---

## Nästa steg (måndag)

### A. Koppla in riktig elevhärkomst — ersätt hela `src/data/origins.js`

```js
// SCHOOL_ORIGINS[skolId] = {
//   meanKm,                                    // genomsnittlig resväg (vägnät)
//   areas: [{ primaromrade, antal, medelKm }], // en rad per primärområde, sorterad
//   ovriga: { antal, medelKm } | null,         // hopslagna små celler (sekretess)
// }
// AREA_INTAKE byggs automatiskt ur SCHOOL_ORIGINS.
```

Råuttag, en rad per (skola, primärområde): `antal_elever`, `medelavstånd_km`
(riktigt vägnätsavstånd). **Maska celler < `MIN_CELL` elever** (slå ihop till
`ovriga`) — individer ska aldrig kunna pekas ut.

1. Mappa era skol-id mot appens `id` i `schools.js`.
2. Använd riktiga vägnätsavstånd (samma nät som önska-skola-processen).
3. Kör appen och **titta i dev-konsolen** — `validateOrigins()` varnar för
   saknade/okända skolor, fel summor, omaskade småceller och primärområden utan
   befolkningsprognos.
4. Komplettera `BEFOLKNING` i `prognos.js` för alla primärområden som förekommer.

### B. Koppla in er skolvalsmodell — ersätt `CHOICE` (ev. `COHORT`) i `src/data/choice.js`

Er Python-modell ger per elev en sannolikhet per skola. Aggregera per primärområde:

```js
// CHOICE[övergång][primärområde] = [{ schoolId, p }]   // p summerar till 1
// övergångar: 'fklass' (6 år, → skolor med åk F)
//             'grade4' (10 år, → skolor med åk 4, bara de som lämnar F–3-skola)
//             'grade7' (13 år, → skolor med åk 7, bara de som lämnar F–6-skola)
// COHORT[övergång][primärområde] = antal elever som gör valet nästa år
```

`simulate.js` drar dessa val X gånger → intagning per skola med P10–P90. Inget
annat behöver ändras. Är modellen en logit-/nyttomodell kan en skolnedläggning
simuleras genom att ta bort skolan och normera om resten (IIA) — då kan
omfördelningen vid stängning drivas av faktiskt skolval i stället för tilldelning.

### C. Riktiga vägnätsavstånd via DuckDB (precompute, inte runtime-DB)

Den stora adress×skola-tabellen (tiotals miljoner rader) ska **inte** in i
frontend-bundeln — för stor och adressnivå är känslig. Använd DuckDB som
ETL-steg: aggregera offline till en liten härledd tabell som appen läser, på
samma sätt som `origins.js`.

Appen behöver bara aggregat:
- **Per skola**: genomsnittlig (och ev. P90) resväg → `meanKm` i `origins.js`.
- **Per (primärområde → skola)**: representativt vägnätsavstånd → ny `distances.js`
  som optimeraren (radie 2/4/6 km) och valmodellen läser i stället för `haversineKm`.

Förslag på arbetsflöde:

1. Spara er matris som **Parquet** (kolumnär, komprimerad; DuckDB läser den direkt
   och det är även rätt lagring för önska-skola-processen i Python).
2. Kör en DuckDB-SQL som joinar adress→primärområde (väg gärna med var eleverna
   faktiskt bor), grupperar och skriver ut den lilla tabellen. Skiss:

```sql
-- indata: avstand(adress_id, skol_id, km), adress(adress_id, primaromrade),
--         elev(adress_id) eller folkbokföring för viktning
-- Per (primärområde, skola): elevviktat medelavstånd, beskuret till rimlig radie
COPY (
  SELECT a.primaromrade, d.skol_id,
         round(avg(d.km), 2)                         AS medel_km,
         round(quantile_cont(d.km, 0.9), 2)          AS p90_km,
         count(*)                                    AS n
  FROM avstand d
  JOIN adress  a USING (adress_id)
  -- JOIN elev e USING (adress_id)   -- valfritt: vikta på faktiska elever
  WHERE d.km <= 6                                    -- max stadieradie
  GROUP BY a.primaromrade, d.skol_id
) TO 'distances.parquet' (FORMAT parquet);

-- Per skola: genomsnittlig resväg för eleverna (driver origins.meanKm)
COPY (
  SELECT d.skol_id, round(avg(d.km), 2) AS mean_km
  FROM avstand d JOIN placering p ON p.adress_id = d.adress_id AND p.skol_id = d.skol_id
  GROUP BY d.skol_id
) TO 'school_meankm.parquet' (FORMAT parquet);
```

3. Exportera den lilla tabellen till JSON/JS och lägg som `src/data/distances.js`.
   Mappa `skol_id`/`primaromrade` mot appens `id`/`primaromrade`. Byt sedan
   `haversineKm` i `optimizer.js` (och avståndsmodellen i `choice.js`) mot
   uppslag i tabellen, och `meanKm` i `origins.js` mot de riktiga värdena.

Vill ni ha live-uppslag per adress i verktyget (t.ex. "vilka skolor inom X km
för denna adress") går det utan backend via **DuckDB-WASM** mot en hostad
Parquet (range-requests), eller en liten **FastAPI + DuckDB**. Behövs inte för
nuvarande områdesnivå.

## Därefter (kräver de riktiga vägnätsavstånden)

- **Riktiga avstånd in i konsolideringsplanen** (se C ovan). Stadieindelningen och
  radierna (2/4/6 km) finns redan i `optimizer.js` (`STAGE_RADIUS`), men avstånden
  mäts ännu fågelvägen byggnad→byggnad. Byt `haversineKm` mot uppslag i den
  DuckDB-härledda `distances.js` (hemområde→skola) så blir radievillkoret styrkbart
  per elev.
- **Likvärdighetslins** — andel elever med > X km resväg per stadie, och hur varje
  nedläggning ändrar den.
- **Skolvalsdriven omfördelning vid stängning** — använd `CHOICE` (IIA) för att visa
  var eleverna faktiskt hamnar när en skola stängs, inte bara en tilldelning.
- **Skarp optimeringsmotor (spopt)** — se `backend/` (referensscaffold). Python +
  spopt/PuLP för det fullskaliga facility location-problemet (LSCP, kap. p-median,
  p-center) med DuckDB-avstånd som kostnadsmatris. Körs i backend/batch; frontend
  anropar `/api/plan` och behåller JS-lösaren som offline-fallback. Se `backend/README.md`.

---

## Att veta

- **Stadieradien styr resultatet.** Yngre barns 2 km-krav gör att spridda
  förortsskolor inte kan slås ihop (inget lågstadium inom 2 km) medan tätt liggande
  skolor kan. Eftersom exempelskolorna ligger nära full kapacitet syns konsolidering
  först vid längre horisont (2045/2050) eller minskande-elev-scenario — det är
  korrekt, inte en bugg. Justera radie/reserv/scenario i fliken Översikt.
- Ny Claude Code-session minns inte tidigare samtal. Peka den på den här filen +
  `src/data/origins.js`, `src/data/choice.js` och `src/lib/framskrivning.js`.
- Inget hemligt i repot; känslig elevdata hålls aggregerad och maskad redan i
  datakällan — råadresser ska aldrig in i frontend-bundeln.
