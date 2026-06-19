# Spec: Grundskolekarta — Göteborgs Stad Fastighetsavdelning

## 1. Syfte

Ett internt webbverktyg för fastighetsavdelningen som visar samtliga grundskolor
(kommunala och fristående) i Göteborg på en karta. Användaren ska kunna:

- Se var skolorna ligger geografiskt
- Zooma in och se byggnaden/byggnaderna (2D-fotavtryck)
- Klicka på en skola för att se detaljerad information

Detta är inte ett publikt verktyg och innehåller ingen poängsättning, inga
profiler eller prisöverlägg — bara lokalisering + information.

## 2. Målgrupp

Fastighetsavdelningen på Göteborgs Stad. Internt bruk, ej extern publicering
(åtminstone inte i v1).

## 3. Tech stack

| Lager | Val | Motivering |
|---|---|---|
| Kartbibliotek | **MapLibre GL JS** | Open source-fork av Mapbox GL JS, samma API, ingen kostnad/API-nyckel, WebGL-baserad vektor­rendering, branschstandard idag |
| Bakgrundskarta | **OpenFreeMap** eller **MapTiler** (OSM-baserat) | Gratis vektor-tiles byggda på OpenStreetMap-data; byggnadsfotavtryck (2D-polygoner) renderas automatiskt vid hög zoom utan extra arbete |
| Frontend-ramverk | **React** (matchar befintlig stack) | Konsekvent med övriga interna verktyg (FastAPI/React) |
| Karta i React | `react-map-gl` (MapLibre-variant) eller vanilla `maplibre-gl` | Lättviktigt, väl dokumenterat |
| Backend (om dynamisk data behövs) | **FastAPI** | Matchar befintlig stack, enkelt att exponera skoldata som GeoJSON |
| Datalagring | **Supabase** (Postgres + PostGIS) eller statisk GeoJSON-fil | PostGIS om data ska uppdateras ofta/redigeras av fler; statisk GeoJSON räcker om listan är stabil |
| Geokodning (vid behov) | **Nominatim** (OSM-baserat, gratis) | För adresser utan koordinater |

**Tre.js används inte** — det är ett 3D-rendering-bibliotek för scener, inte
lämpligt för kartdata. 2D-byggnadsfotavtryck från vektor-tiles räcker helt för
detta syfte och kräver ingen extrudering.

## 4. Datakällor

- **Skolverkets API** — register över grundskolor (kommunal/fristående,
  årskurser, huvudman)
- **Göteborgs Stads öppna data** — eventuell skol-specifik datamängd med
  adresser/koordinater
- **Fastighetsavdelningens egna register** — kopplar specifik skola till
  specifik fastighet/byggnad (viktigt, eftersom OSM:s byggnadspolygoner inte
  vet vilken byggnad som hör till vilken skola — denna koppling måste göras
  manuellt eller via internt register)
- **OpenStreetMap** (via vektor-tiles) — byggnadsfotavtryck, vägnät, kontext

## 5. Funktionalitet (v1)

### 5.1 Kartvy
- Visa Göteborg med alla grundskolor som markörer/punkter
- Zooma/panorera fritt
- Vid hög zoom: byggnadsfotavtryck synliga (kommer automatiskt från
  vektor-tiles, ingen extra implementation)
- Ev. kluster av markörer vid låg zoom om skolor ligger tätt (MapLibre har
  inbyggt clustering-stöd)

### 5.2 Skolmarkörer
- En markör per skola (alt. polygon om exakt byggnadsyta är känd och kopplad)
- Visuell skillnad kommunal vs. fristående (färg/ikon)

### 5.3 Klick → Infopanel
Vid klick på en skola visas en panel/popup med:
- Namn
- Adress
- Huvudman (kommunal/fristående)
- Årskurser (t.ex. F-6, F-9)
- Fastighetsbeteckning (om tillgänglig från internt register)
- Kontaktuppgifter (om relevant för fastighetsavdelningen)
- Ev. yta/kapacitet om sådan data finns

### 5.4 Sök/filter (nice-to-have, ej kritiskt för v1)
- Fritextsök på skolnamn/adress
- Filter: kommunal/fristående, årskursspann

## 6. Ej i scope (v1)

- Poängsättning / "vibe score" / profiler
- Bostadspriser eller bostadsdata
- 3D-byggnader/extrudering
- Upptagningsområden (kan läggas till senare som polygonlager om data finns)
- Publik åtkomst utanför Göteborgs Stad

## 7. Arkitekturöversikt

```
[Skolverket API] ─┐
[Göteborg öppna data] ─┼─→ [Datapipeline / ETL] ─→ [GeoJSON eller Supabase/PostGIS]
[Internt fastighetsregister] ─┘                              │
                                                               ▼
                                              [FastAPI: /api/schools (GeoJSON)]
                                                               │
                                                               ▼
                                        [React + MapLibre GL JS, OpenFreeMap tiles]
                                                               │
                                                               ▼
                                                    [Fastighetsavdelningen i browser]
```

Om skoldatan är stabil (uppdateras sällan) kan steget med FastAPI/Supabase
skippas helt i v1 — en statisk GeoJSON-fil som laddas direkt i frontend räcker.

## 8. Öppna frågor

- Hur ofta ändras skoldatan? Avgör om statisk GeoJSON räcker eller om vi
  behöver en databas + uppdateringsflöde.
- Finns redan en koppling skola → fastighetsbeteckning i fastighets­
  avdelningens system, eller måste den byggas/matchas manuellt?
- Ska verktyget även visa andra fastighetstyper (förskolor, gymnasier) i
  senare version?
- Behövs inloggning/åtkomstkontroll, eller räcker intern nätverksåtkomst?

## 9. Nästa steg

1. Bygg prototyp: React + MapLibre + några verkliga Göteborgsskolor i statisk
   GeoJSON
2. Visa för fastighetsavdelningen, samla feedback på infopanelens innehåll
3. Klargör datakoppling skola ↔ fastighetsbeteckning
4. Besluta statisk vs. databasdriven datalösning baserat på uppdateringsfrekvens
