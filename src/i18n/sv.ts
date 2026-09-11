/**
 * Swedish copy (the default language).
 *
 * This object is also the *type* of the dictionary: `en.ts` has to implement
 * exactly these keys, so a missing translation is a compile error rather than
 * an "undefined" rendered into the UI.
 */
export const sv = {
  app: {
    title: 'Järn–kol-fasdiagrammet',
    subtitle: 'Fe–Fe₃C · metastabilt system',
  },
  ui: {
    tour: 'Guidad tur',
    tourExit: 'Avsluta turen',
    next: 'Nästa',
    previous: 'Föregående',
    done: 'Klart',
    step: 'Steg',
    theme: 'Tema',
    language: 'Språk',
    reset: 'Återställ',
    zoomEutectoid: 'Zooma eutektoiden',
    zoomHint: 'Skrolla för att zooma · dra för att panorera',
    close: 'Stäng',
    of: 'av',
  },
  axis: {
    carbon: 'Kolhalt (vikt-% C)',
    temperature: 'Temperatur (°C)',
  },
  controls: {
    carbon: 'Kolhalt',
    temperature: 'Temperatur',
    play: 'Simulera avkylning',
    pause: 'Pausa',
    resume: 'Fortsätt',
    stop: 'Avbryt',

    presets: 'Förinställningar',
    dragHint: 'Dra markören i diagrammet, eller använd reglagen',
  },
  panel: {
    state: 'Tillstånd',
    lever: 'Hävstångsregeln',
    micro: 'Mikrostruktur',
    timeline: 'Avkylningsförlopp',
    coolingCurve: 'Avkylningskurva',
    phase: 'Fas',
    noLever: 'Enfasområde — hela legeringen är en och samma fas, så hävstångsregeln behövs inte.',
  },
  phases: {
    L: {
      name: 'Smälta',
      desc: 'Flytande järn–kol-legering. Kol löser sig obegränsat i smältan inom diagrammets område.',
    },
    delta: {
      name: 'δ-ferrit',
      desc: 'Rymdcentrerad kubisk (BCC) högtemperaturfas, stabil över 1394 °C. Löser max 0,09 % C.',
    },
    gamma: {
      name: 'γ-austenit',
      desc: 'Ytcentrerad kubisk (FCC). Löser upp till 2,14 % C vid 1147 °C — den höga lösligheten är hela grunden för värmebehandling av stål.',
    },
    alpha: {
      name: 'α-ferrit',
      desc: 'Rymdcentrerad kubisk (BCC). Löser bara 0,022 % C vid 727 °C. Mjuk, seg och magnetisk under 770 °C.',
    },
    Fe3C: {
      name: 'Cementit',
      desc: 'Intermetallisk förening med exakt 6,67 % C. Mycket hård och spröd — det är cementiten som gör stål hårt.',
    },
  },
  fields: {
    L: 'Allt är smält.',
    delta: 'Enfasig δ-ferrit.',
    gamma: 'Enfasig austenit — utgångsläget för all värmebehandling.',
    alpha: 'Enfasig ferrit, praktiskt taget rent järn.',
    Fe3C: 'Ren cementit.',
    'L+delta': 'Stelning: δ-ferrit växer som dendriter i smältan.',
    'L+gamma': 'Stelning: austenitdendriter växer i smältan.',
    'L+Fe3C': 'Primär cementit växer i smältan.',
    'delta+gamma': 'δ-ferrit omvandlas till austenit.',
    'alpha+gamma': 'Proeutektoid ferrit skiljs ut ur austeniten.',
    'gamma+Fe3C': 'Sekundär cementit skiljs ut ur austeniten, ofta som nätverk i korngränserna.',
    'alpha+Fe3C': 'Slutstruktur för allt kolstål: ferrit och cementit.',
  },
  constituents: {
    liquid: { name: 'Smälta', desc: 'Flytande legering.' },
    delta: { name: 'δ-ferrit', desc: 'Högtemperaturferrit.' },
    austenite: { name: 'Austenit', desc: 'FCC-korn, ofta grovkorniga vid hög temperatur.' },
    ferrite: { name: 'Proeutektoid ferrit', desc: 'Ljusa, mjuka korn som skiljs ut före eutektoiden.' },
    pearlite: { name: 'Perlit', desc: 'Lamellär blandning av ferrit och cementit — 88,9 % α + 11,1 % Fe₃C.' },
    cementite: { name: 'Cementit', desc: 'Hård fas, ofta som nätverk i korngränserna eller som primära plattor.' },
    ledeburite: { name: 'Ledeburit', desc: 'Eutektisk struktur: austenit (senare perlit) inbäddad i cementit.' },
  },
  alloyClass: {
    'pure-iron': {
      name: 'Tekniskt rent järn',
      desc: 'Nästan kolfritt. Mjukt, magnetiskt och lätt att forma, men går inte att härda.',
    },
    'hypoeutectoid-steel': {
      name: 'Hypoeutektoid stål',
      desc: 'Under 0,76 % C. Proeutektoid ferrit skiljs ut först, resten blir perlit. Konstruktionsstål.',
    },
    'eutectoid-steel': {
      name: 'Eutektoid stål',
      desc: 'Exakt 0,76 % C. Hela strukturen omvandlas till perlit vid 727 °C — inga proeutektoida korn.',
    },
    'hypereutectoid-steel': {
      name: 'Hypereutektoid stål',
      desc: 'Över 0,76 % C. Cementit skiljs ut i korngränserna före perliten. Verktygsstål.',
    },
    'hypoeutectic-cast-iron': {
      name: 'Hypoeutektiskt gjutjärn',
      desc: 'Över 2,14 % C. Primär austenit stelnar först, resten blir ledeburit. Går inte att smida.',
    },
    'eutectic-cast-iron': {
      name: 'Eutektiskt gjutjärn',
      desc: 'Exakt 4,3 % C. Lägsta smältpunkten i systemet, 1147 °C — därför lättgjutet.',
    },
    'hypereutectic-cast-iron': {
      name: 'Hypereutektiskt gjutjärn',
      desc: 'Över 4,3 % C. Grova primära cementitplattor i ledeburit. Extremt hårt och sprött.',
    },
    cementite: {
      name: 'Cementit',
      desc: 'Ren Fe₃C, 6,67 % C. Diagrammets högra kant.',
    },
  },
  presets: {
    armco: { name: 'Rent järn', note: 'ARMCO-järn. Referenspunkt: nästan inget kol alls.' },
    '1020': { name: 'AISI 1020', note: 'Konstruktionsstål. Mjukt, svetsbart, ~25 % perlit.' },
    '1045': { name: 'AISI 1045', note: 'Maskinstål till axlar och kugghjul. Härdbart.' },
    eutectoid: { name: 'Eutektoid (0,76 %)', note: 'Ren perlit — pianotråd och skärverktyg.' },
    '1095': { name: 'AISI 1095', note: 'Verktygsstål: perlit plus cementitnätverk.' },
    castIron30: { name: 'Gjutjärn 3,0 %', note: 'Hypoeutektiskt: primär austenit i ledeburit.' },
    castIron43: { name: 'Gjutjärn 4,3 %', note: 'Eutektisk sammansättning — smälter lägst av alla.' },
    castIron55: { name: 'Gjutjärn 5,5 %', note: 'Hypereutektiskt: primär cementit, mycket sprött.' },
  },
  points: {
    eutectoid: {
      title: 'Eutektoid punkt',
      value: '727 °C · 0,76 % C',
      body: 'γ → α + Fe₃C. En fast fas omvandlas till två fasta faser vid konstant temperatur. Produkten är perlit, den lamellära strukturen som ger stål dess styrka.',
    },
    eutectic: {
      title: 'Eutektisk punkt',
      value: '1147 °C · 4,30 % C',
      body: 'L → γ + Fe₃C. Systemets lägsta smältpunkt. Produkten kallas ledeburit och är anledningen till att gjutjärn är så lättgjutet.',
    },
    peritectic: {
      title: 'Peritektisk reaktion',
      value: '1495 °C · 0,17 % C',
      body: 'L + δ → γ. Smälta och δ-ferrit reagerar med varandra och bildar austenit. Viktig vid stränggjutning, där reaktionen ger ytsprickor.',
    },
    a1: {
      title: 'A₁ — eutektoidlinjen',
      value: '727 °C',
      body: 'Den nedre kritiska temperaturen. Under A₁ finns ingen austenit kvar i något kolstål. All glödgning och härdning utgår från den här linjen.',
    },
    a3: {
      title: 'A₃ — övre kritiska linjen',
      value: '912 → 727 °C',
      body: 'Gränsen där proeutektoid ferrit börjar skiljas ut ur austeniten. Normalisering sker typiskt 30–50 °C över A₃.',
    },
    acm: {
      title: 'A_cm — cementitgränsen',
      value: '727 → 1147 °C',
      body: 'Kolets lösligheteter i austenit. Vid avkylning under A_cm fälls sekundär cementit ut, gärna som ett sprött nätverk i korngränserna.',
    },
    delta: {
      title: 'δ-området',
      value: '1394 – 1538 °C',
      body: 'Järn är BCC (δ) precis under smältpunkten, blir FCC (γ) vid 1394 °C och BCC igen (α) vid 912 °C. Få metaller byter struktur två gånger.',
    },
  },
  lever: {
    arm: 'Arm',
    note: 'Andelen av en fas är proportionell mot armen på motsatt sida — precis som på en balansvåg.',
  },
  micro: {
    schematic: 'Schematisk',
    grainNote: 'Kornen är genererade, inte uppmätta; andelarna följer diagrammet exakt.',
  },
  cooling: {
    subtitle: 'Från smälta till rumstemperatur',
    relativeTime: 'Relativ tid',
    events: {
      start: 'Legeringen är helt smält.',
      liquidus: 'Liquidus: de första kristallerna bildas.',
      solidus: 'Solidus: den sista smältan stelnar.',
      peritectic: 'Peritektisk reaktion: L + δ → γ.',
      eutectic: 'Eutektisk reaktion: L → γ + Fe₃C (ledeburit).',
      eutectoid: 'Eutektoid reaktion: γ → α + Fe₃C (perlit).',
      a3: 'A₃: proeutektoid ferrit börjar skiljas ut.',
      acm: 'A_cm: sekundär cementit börjar skiljas ut.',
      solvus: 'Solvus: tertiär cementit fälls ut ur ferriten.',
      end: 'Rumstemperatur — slutstrukturen är klar.',
      transition: 'Fasomvandling.',
    },
    transformed: 'omvandlas',
  },
  tour: {
    steps: [
      {
        title: 'Kartan över stål',
        body: 'Varje punkt i diagrammet är en legering vid en temperatur. Vågrätt: kolhalt, 0–6,67 %. Lodrätt: temperatur, 0–1600 °C.',
      },
      {
        title: 'Fasfälten',
        body: 'Färgade fält är enfasområden, blandfärgade fält är tvåfasområden. Blandfärgen är alltid en blandning av de två faser som finns där.',
      },
      {
        title: 'Eutektoiden vid 727 °C',
        body: 'Den viktigaste punkten i hela materialläran: γ → α + Fe₃C. Här föds perliten, och här går gränsen för all härdning.',
      },
      {
        title: 'Hävstångsregeln',
        body: 'I ett tvåfasområde visar panelen exakt hur mycket av varje fas som finns — beräknat med hävstångsregeln, inte uppslaget i en tabell.',
      },
      {
        title: 'Kyl ner en legering',
        body: 'Välj kolhalt och tryck på Simulera avkylning. Markören följer avkylningskurvan och tidslinjen visar varje reaktion på vägen ned.',
      },
    ],
  },
  footer: {
    source: 'Data enligt standarddiagrammet för Fe–Fe₃C (Callister; ASM Handbook vol. 3).',
    metastable: 'Metastabilt system: grafitutskiljning är försummad.',
  },
} as const;
