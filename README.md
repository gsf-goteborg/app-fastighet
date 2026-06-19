# Skolportfölj — Göteborg (showcase)

Internt planeringsverktyg för Göteborgs Stads fastighetsavdelning. Visar stadens
grundskolor på karta, i tabell och som portföljöversikt, för att stötta beslut om
**hur många skolor staden behöver** (kapacitet vs. elevprognos) och **vilka
byggnader som behöver åtgärdas** (skick/renoveringsbehov).

> ⚠️ **Showcase med exempeldata.** Byggnadsår, renoveringsbehov, BTA,
> underhållsskuld och elevprognoser är PLACEHOLDER. De måste kopplas mot
> fastighetsavdelningens underhålls-/FM-system samt stadens demografiprognoser
> innan skarp användning. Publicera **aldrig** verklig data på en publik host
> (t.ex. GitHub Pages) — verktyget är för internt bruk.

## Kör lokalt

```bash
npm install
npm run dev      # utvecklingsserver
npm run build    # produktionsbygge till dist/
npm run preview  # förhandsvisa bygget
```

## Stack

- **React + Vite** (statiskt bygge, inget backend-krav)
- **MapLibre GL JS** + **OpenFreeMap**-tiles (ingen API-nyckel)

## Struktur

```
src/
  data/schools.js          exempeldata + elevprognos per stadsområde
  lib/constants.js         färger, skalor, filter-fasetter, kart-uttryck
  lib/filters.js           filterlogik
  lib/exportCsv.js         CSV-export (UTF-8 + ; för svenskt Excel)
  components/
    Sidebar.jsx            fritextsök + fasettfilter (styr alla vyer)
    MapView.jsx            karta med tematisk färgläggning
    TableView.jsx          sorterbar tabell + CSV-export
    DashboardView.jsx      KPI:er + kapacitet-vs-behov + åtgärdsförslag
    InfoPanel.jsx          detaljpanel per skola
  App.jsx                  delat tillstånd, vy-växling
```

## Funktioner

- **Karta** — färglägg skolor efter renoveringsbehov / beläggning / byggnadsår / huvudman
- **Tabell** — sorterbar, exporterbar till CSV
- **Översikt** — kapacitet vs. elevprognos 2030 per stadsområde med åtgärdsförslag
  ("bygg ~N skolor" / "avveckla"), justerbart prognos-scenario (låg/medel/hög),
  skolstorlek och riskkapacitet (akut-skick)
- **Filter** delas av alla tre vyer samtidigt
