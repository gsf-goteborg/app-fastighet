/* ===========================================================================
   BYGGNADSMODELLER — rumsnivådata för 3D-byggnadsanalysen (BuildingView).

   ⚠ SYNTETISKT. Modellen nedan är en handritad EXEMPELMODELL som visar vad
   vyn kan göra. Den ersätts av verkliga uppmätningar (lasermätare/punktmoln →
   planritning) när lokalerna mäts upp. Registrets BTA och modellens yta
   förväntas AVVIKA tills dess — avvikelsen visas medvetet i vyn.

   SCHEMA (det som mätningen ska leverera, per skola):

   BUILDING_MODELS[skolId] = {
     skolId,                // = id i schools.js
     kalla,                 // proveniens: 'syntetisk' | 'lasermätning YYYY-MM-DD'
     hus: [{
       id, namn, byggnadsar,
       pos: [x, z],         // husets läge i lokalt koordinatsystem (meter)
       plan: [{             // nedersta planet först
         id, namn,
         hojd,              // våningshöjd (m)
         rum: [{
           id, namn,
           funktion,        // nyckel i FUNKTION_META nedan
           poly: [[x,y]],   // golvpolygon i husets lokala system (meter, medurs)
           yta,             // m² (från polygonen; mätningen ger den exakt)
           skick,           // 1–5 (samma skala som renovbehov) | null om obedömt
           nyttjande,       // 0–1 schemalagd användning av skoldagen | null om ej mätt
         }]
       }]
     }]
   }

   Rektanglar räcker för exemplet; polygonen får ha godtycklig form.
=========================================================================== */

// Funktionskategorier: nyckel → [etikett, färg]
export const FUNKTION_META = {
  klassrum: ['Klassrum', '#3b82f6'],
  grupprum: ['Grupprum', '#82bbdb'],
  specialsal: ['Specialsal (NO/slöjd/musik/bild)', '#7f3f98'],
  idrott: ['Idrott', '#0d9488'],
  matsal: ['Matsal & kök', '#f47815'],
  bibliotek: ['Bibliotek', '#ca8a04'],
  administration: ['Administration & elevhälsa', '#64748b'],
  personal: ['Personalutrymme', '#94a3b8'],
  teknik: ['Teknik & förråd', '#475569'],
  kommunikation: ['Korridor & trapphus', '#cbd5e1'],
  hygien: ['WC & kapprum', '#a8a29e'],
}

// Ytor utan meningsfullt "nyttjande" (mäts inte som bokningsbara)
export const EJ_BOKNINGSBAR = new Set(['kommunikation', 'teknik', 'hygien'])

// --- hjälpare för exempelmodellen (rektangulära rum) -----------------------
const rum = (id, namn, funktion, x, y, w, d, skick, nyttjande = null) => ({
  id, namn, funktion, yta: Math.round(w * d),
  poly: [[x, y], [x + w, y], [x + w, y + d], [x, y + d]],
  skick, nyttjande,
})

// En rad rum längs x-axeln med gemensamt djup
function rad(prefix, x0, y, d, specs) {
  let x = x0
  return specs.map((sp, i) => {
    const r = rum(`${prefix}-${i + 1}`, sp.n, sp.f, x, y, sp.w, d, sp.s ?? null, sp.u ?? null)
    x += sp.w
    return r
  })
}

// === EXEMPELMODELL: Lärjeskolan (id 73) — SYNTETISK ========================
// Huvudbyggnad i tre plan (1954), idrottshall, matsal/slöjd och en paviljong.
// Skick och nyttjande per rum är påhittade men typiska mönster: eftersatta
// NO-salar/kök/fläktrum, halvtom matsal utanför lunch, fullbokad paviljong.

const husA = {
  id: 'A', namn: 'Hus A — huvudbyggnad', byggnadsar: 1954, pos: [0, 0],
  plan: [
    {
      id: 'A0', namn: 'Plan 0 · entréplan', hojd: 3.6,
      rum: [
        ...rad('A0N', 0, 0, 7, [
          { n: 'Expedition', f: 'administration', w: 10, s: 2, u: 0.7 },
          { n: 'Rektor', f: 'administration', w: 6, s: 2, u: 0.6 },
          { n: 'Konferensrum', f: 'administration', w: 8, s: 2, u: 0.45 },
          { n: 'Elevhälsa', f: 'administration', w: 10, s: 3, u: 0.65 },
          { n: 'Vilrum', f: 'administration', w: 5, s: 3, u: 0.3 },
          { n: 'Bibliotek', f: 'bibliotek', w: 15, s: 2, u: 0.45 },
          { n: 'Klassrum Fa', f: 'klassrum', w: 8, s: 2, u: 0.9 },
          { n: 'Klassrum Fb', f: 'klassrum', w: 8, s: 2, u: 0.9 },
          { n: 'WC & kapprum', f: 'hygien', w: 8, s: 3 },
        ]),
        rum('A0-T1', 'Trapphus väst', 'kommunikation', 0, 7, 4, 3, 2),
        rum('A0-K', 'Korridor', 'kommunikation', 4, 7, 70, 3, 3),
        rum('A0-T2', 'Trapphus öst', 'kommunikation', 74, 7, 4, 3, 2),
        ...rad('A0S', 0, 10, 7, [
          { n: 'Kapprum', f: 'hygien', w: 8, s: 3 },
          { n: 'Klassrum 1a', f: 'klassrum', w: 8, s: 2, u: 0.9 },
          { n: 'Klassrum 1b', f: 'klassrum', w: 8, s: 2, u: 0.9 },
          { n: 'Grupprum', f: 'grupprum', w: 5, s: 2, u: 0.5 },
          { n: 'Klassrum 2a', f: 'klassrum', w: 8, s: 3, u: 0.9 },
          { n: 'Klassrum 2b', f: 'klassrum', w: 8, s: 3, u: 0.9 },
          { n: 'Grupprum', f: 'grupprum', w: 5, s: 3, u: 0.45 },
          { n: 'Fritidshem', f: 'klassrum', w: 12, s: 2, u: 0.75 },
          { n: 'Personalrum', f: 'personal', w: 10, s: 2, u: 0.55 },
          { n: 'Städ & el', f: 'teknik', w: 6, s: 3 },
        ]),
      ],
    },
    {
      id: 'A1', namn: 'Plan 1 · mellanstadiet', hojd: 3.6,
      rum: [
        ...rad('A1N', 0, 0, 7, [
          { n: 'NO-sal biologi', f: 'specialsal', w: 12, s: 4, u: 0.6 },
          { n: 'NO-prep', f: 'teknik', w: 4, s: 4 },
          { n: 'NO-sal kemi/fysik', f: 'specialsal', w: 12, s: 4, u: 0.55 },
          { n: 'Klassrum 3a', f: 'klassrum', w: 8, s: 3, u: 0.9 },
          { n: 'Klassrum 3b', f: 'klassrum', w: 8, s: 3, u: 0.9 },
          { n: 'Grupprum', f: 'grupprum', w: 6, s: 3, u: 0.5 },
          { n: 'Klassrum 4a', f: 'klassrum', w: 8, s: 2, u: 0.85 },
          { n: 'Klassrum 4b', f: 'klassrum', w: 8, s: 2, u: 0.85 },
          { n: 'WC', f: 'hygien', w: 6, s: 3 },
          { n: 'Städ', f: 'teknik', w: 6, s: 3 },
        ]),
        rum('A1-T1', 'Trapphus väst', 'kommunikation', 0, 7, 4, 3, 2),
        rum('A1-K', 'Korridor', 'kommunikation', 4, 7, 70, 3, 3),
        rum('A1-T2', 'Trapphus öst', 'kommunikation', 74, 7, 4, 3, 2),
        ...rad('A1S', 0, 10, 7, [
          { n: 'Klassrum 5a', f: 'klassrum', w: 8, s: 3, u: 0.9 },
          { n: 'Klassrum 5b', f: 'klassrum', w: 8, s: 3, u: 0.9 },
          { n: 'Grupprum', f: 'grupprum', w: 6, s: 3, u: 0.55 },
          { n: 'Klassrum 6a', f: 'klassrum', w: 8, s: 3, u: 0.85 },
          { n: 'Klassrum 6b', f: 'klassrum', w: 8, s: 3, u: 0.85 },
          { n: 'Hemkunskap', f: 'specialsal', w: 12, s: 5, u: 0.5 },
          { n: 'Musiksal', f: 'specialsal', w: 12, s: 3, u: 0.6 },
          { n: 'Arbetsrum lärare', f: 'personal', w: 10, s: 2, u: 0.7 },
          { n: 'WC', f: 'hygien', w: 6, s: 3 },
        ]),
      ],
    },
    {
      id: 'A2', namn: 'Plan 2 · högstadiet', hojd: 3.6,
      rum: [
        ...rad('A2N', 0, 0, 7, [
          { n: 'Klassrum 7a', f: 'klassrum', w: 8, s: 3, u: 0.95 },
          { n: 'Klassrum 7b', f: 'klassrum', w: 8, s: 3, u: 0.95 },
          { n: 'Klassrum 7c', f: 'klassrum', w: 8, s: 3, u: 0.95 },
          { n: 'Grupprum', f: 'grupprum', w: 6, s: 3, u: 0.6 },
          { n: 'Klassrum 8a', f: 'klassrum', w: 8, s: 2, u: 0.95 },
          { n: 'Klassrum 8b', f: 'klassrum', w: 8, s: 2, u: 0.95 },
          { n: 'Klassrum 8c', f: 'klassrum', w: 8, s: 2, u: 0.95 },
          { n: 'Bildsal', f: 'specialsal', w: 12, s: 3, u: 0.55 },
          { n: 'WC', f: 'hygien', w: 6, s: 3 },
          { n: 'Städ', f: 'teknik', w: 6, s: 3 },
        ]),
        rum('A2-T1', 'Trapphus väst', 'kommunikation', 0, 7, 4, 3, 2),
        rum('A2-K', 'Korridor', 'kommunikation', 4, 7, 70, 3, 3),
        rum('A2-T2', 'Trapphus öst', 'kommunikation', 74, 7, 4, 3, 2),
        ...rad('A2S', 0, 10, 7, [
          { n: 'Klassrum 9a', f: 'klassrum', w: 8, s: 3, u: 0.95 },
          { n: 'Klassrum 9b', f: 'klassrum', w: 8, s: 3, u: 0.95 },
          { n: 'Klassrum 9c', f: 'klassrum', w: 8, s: 3, u: 0.95 },
          { n: 'Grupprum', f: 'grupprum', w: 6, s: 3, u: 0.6 },
          { n: 'Språksal', f: 'klassrum', w: 8, s: 3, u: 0.75 },
          { n: 'Datasal', f: 'specialsal', w: 10, s: 2, u: 0.65 },
          { n: 'Arbetsrum lärare', f: 'personal', w: 12, s: 2, u: 0.7 },
          { n: 'Fläktrum', f: 'teknik', w: 12, s: 5 },
          { n: 'WC', f: 'hygien', w: 6, s: 3 },
        ]),
      ],
    },
  ],
}

const husB = {
  id: 'B', namn: 'Hus B — idrottshall', byggnadsar: 1962, pos: [0, 27],
  plan: [
    {
      id: 'B0', namn: 'Plan 0', hojd: 8,
      rum: [
        rum('B0-1', 'Idrottshall', 'idrott', 0, 0, 30, 24, 3, 0.85),
        rum('B0-2', 'Omklädning 1', 'hygien', 30, 0, 12, 8, 4),
        rum('B0-3', 'Omklädning 2', 'hygien', 30, 8, 12, 8, 4),
        rum('B0-4', 'Redskaps- & driftförråd', 'teknik', 30, 16, 12, 8, 3),
      ],
    },
  ],
}

const husC = {
  id: 'C', namn: 'Hus C — matsal & slöjd', byggnadsar: 1954, pos: [48, 27],
  plan: [
    {
      id: 'C0', namn: 'Plan 0', hojd: 4,
      rum: [
        rum('C0-1', 'Kök', 'matsal', 0, 0, 10, 16, 4, 0.9),
        rum('C0-2', 'Matsal', 'matsal', 10, 0, 16, 16, 3, 0.35),
        rum('C0-3', 'Trä- & metallslöjd', 'specialsal', 26, 0, 8, 8, 4, 0.55),
        rum('C0-4', 'Textilslöjd', 'specialsal', 26, 8, 8, 8, 3, 0.55),
      ],
    },
  ],
}

const husD = {
  id: 'D', namn: 'Hus D — paviljong (tillfällig modul)', byggnadsar: 2009, pos: [84, 0],
  plan: [
    {
      id: 'D0', namn: 'Plan 0', hojd: 3.1,
      rum: [
        rum('D0-1', 'Klassrum P1', 'klassrum', 0, 0, 8, 10, 4, 0.95),
        rum('D0-2', 'Klassrum P2', 'klassrum', 8, 0, 8, 10, 4, 0.95),
        rum('D0-3', 'Kapprum & WC', 'hygien', 16, 0, 8, 10, 4),
      ],
    },
  ],
}

export const BUILDING_MODELS = {
  73: {
    skolId: 73,
    kalla: 'syntetisk',
    hus: [husA, husB, husC, husD],
  },
}

// --- nyckeltal ur en modell -------------------------------------------------
export function buildingStats(model) {
  let total = 0, undervisning = 0, eftersatt = 0, outnyttjat = 0, rumN = 0, klassrum = 0
  const perFunktion = {}
  for (const hus of model.hus) {
    for (const plan of hus.plan) {
      for (const r of plan.rum) {
        total += r.yta
        rumN++
        perFunktion[r.funktion] = (perFunktion[r.funktion] || 0) + r.yta
        if (['klassrum', 'grupprum', 'specialsal', 'idrott'].includes(r.funktion)) undervisning += r.yta
        if (r.funktion === 'klassrum') klassrum++
        if (r.skick >= 4) eftersatt += r.yta
        if (!EJ_BOKNINGSBAR.has(r.funktion) && r.nyttjande != null && r.nyttjande < 0.5) outnyttjat += r.yta
      }
    }
  }
  return { total, undervisning, eftersatt, outnyttjat, rumN, klassrum, perFunktion }
}
