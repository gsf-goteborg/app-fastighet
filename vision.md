# Vision — Skolportfölj Göteborg

Ett beslutsstöd för Göteborgs Stads fastighetsavdelning: att planera skolfastigheter
framåt med samma faktabild för alla — var elevunderlaget finns idag och imorgon,
vilka lokaler vi har och i vilket skick, och vad olika beslut faktiskt innebär för
elever, ekonomi och likvärdighet.

Målet är inte en snygg demo utan ett **försvarbart underlag**: varje siffra ska gå
att spåra till en källa, varje avstånd ska vara verkligt, och varje förslag ska tåla
frågan *"varför just den här skolan?"* från en förälder, en nämnd eller en
överklagandeprövning.

## Två planeringsprocesser — olika frågor, olika data

Verktyget är byggt kring att fastighets- och skolplanering egentligen är **två
processer** med olika tidshorisont, data och beslut. Att blanda dem gör båda sämre.

### Kortsiktig — placera nästa års elever
**Fråga:** Får alla elever plats nästa läsår, och hur många klasser ska vi öppna?

- **Skolvalssimuleringen är central.** Önska-skola-modellen ger förväntad intagning
  per skola och inträdesårskurs (F / åk 4 / åk 7) med osäkerhetsband.
- **Fristående-avhopp → överplacering.** En känd andel elever tackar ja till en
  kommunal plats men väljer en fristående skola vid terminsstart. Historiska mönster
  låter oss **överplacera** (som överbokning) så att nettot fyller kapaciteten.
- **Klass-beslut.** Per inträdesårskurs: räcker en klass mindre, eller behöver vi
  öppna en till? Signalen bygger på netto-intagning mot klasstorlek.
- **Horisont:** nästa läsår. Demografiscenarier och långa trender är irrelevanta här.

### Långsiktig — dimensionera lokalbeståndet (5–25 år)
**Fråga:** Hur ska skolbeståndet se ut när eleverna blir fler eller färre?

- **Befolkningsprognos och trender** per mellanområde driver var elevunderlaget växer
  och krymper.
- **Lokalbeståndet** — kapacitet, skick, underhållsskuld, internhyra — avgör vad som
  är dyrt att behålla och vad som bör rustas, byggas eller avvecklas.
- **Konsolidering och expansion** vägs mot närhet (yngre barn kräver kortare resväg),
  reservkapacitet och likvärdighet.
- **Horisont:** 2030–2050.

## Principer

- **Ärlighet före intryck.** Det ska alltid synas vad som är skarp data, testdata och
  syntetiskt. Ett förslag som vilar på påhittade tal presenteras som *diskussion*, inte
  *beslut*. (Idag: röda "syntetiskt"-flaggor och "Ej beslutsunderlag"-varningar.)
- **Rätt skolform, rätt regler.** Anpassad grundskola och specialverksamhet är egna
  processer — deras platser är inte utbytbara mot vanliga grundskoleplatser och ingår
  aldrig i den ordinarie konsolideringen.
- **Likvärdighet är ett beslutskriterium, inte en efterhandsvy.** Hur en förändring
  slår mot andelen elever med lång resväg — särskilt de yngsta och i redan utsatta
  områden — ska vägas in i själva förslaget.
- **Verkliga avstånd.** Närhetsprincipen prövas på vägnät, inte fågelväg. Göta älv och
  trafikleder gör fågelväg systematiskt fel.
- **Spårbarhet.** Varje planeringsomgång ska kunna säga "detta bygger på uttag av
  datum X" och visa vad som ändrats sedan sist.

## Vägen till beslutsgrad

Strukturen och modellerna är på plats; det som återstår är att byta ut exempeldata mot
skarpa källor (se `HANDOFF.md` för detaljerad checklista och status):

1. **Vägnätsavstånd** hemområde→skola — styr närhet/radie och likvärdighet.
2. **Skarpa fastighetsdata** (skick, underhållsskuld, BTA, internhyra) — driver
   ekonomin och rankningen av konsolideringskandidater.
3. **Riktig befolkningsprognos** per område × ålder — ersätter dagens dämpade trend.
4. **Verkligt elevmönster och skolval** — folkbokföring × placering, skarp valmodell.
5. **Bevisat optimal lösare** (backend) + likvärdighetslins kopplad till förslaget.

Tills dess: ett ärligt, användbart planeringsverktyg som visar rätt frågor och rätt
mekanik — redo att fyllas med skarp data, en källa i taget.
