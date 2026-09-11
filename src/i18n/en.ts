import type { Dictionary } from './index';

/** English copy. Typed against the Swedish dictionary so it cannot drift. */
export const en: Dictionary = {
  app: {
    title: 'The Iron–Carbon Phase Diagram',
    subtitle: 'Fe–Fe₃C · metastable system',
  },
  ui: {
    tour: 'Guided tour',
    tourExit: 'Exit tour',
    next: 'Next',
    previous: 'Back',
    done: 'Done',
    step: 'Step',
    theme: 'Theme',
    language: 'Language',
    reset: 'Reset',
    zoomEutectoid: 'Zoom eutectoid',
    zoomHint: 'Scroll to zoom · drag to pan',
    close: 'Close',
    of: 'of',
  },
  axis: {
    carbon: 'Carbon content (wt% C)',
    temperature: 'Temperature (°C)',
  },
  controls: {
    carbon: 'Carbon',
    temperature: 'Temperature',
    play: 'Simulate cooling',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop',

    presets: 'Presets',
    dragHint: 'Drag the marker in the diagram, or use the sliders',
  },
  panel: {
    state: 'State',
    lever: 'Lever rule',
    micro: 'Microstructure',
    timeline: 'Cooling sequence',
    coolingCurve: 'Cooling curve',
    phase: 'Phase',
    noLever: 'Single-phase region — the whole alloy is one phase, so there is nothing for the lever rule to split.',
  },
  phases: {
    L: {
      name: 'Melt',
      desc: 'Liquid iron–carbon alloy. Carbon dissolves freely in the melt across the whole diagram.',
    },
    delta: {
      name: 'δ-ferrite',
      desc: 'Body-centred cubic (BCC) high-temperature phase, stable above 1394 °C. Dissolves at most 0.09 % C.',
    },
    gamma: {
      name: 'γ-austenite',
      desc: 'Face-centred cubic (FCC). Dissolves up to 2.14 % C at 1147 °C — that high solubility is the whole basis of heat treating steel.',
    },
    alpha: {
      name: 'α-ferrite',
      desc: 'Body-centred cubic (BCC). Dissolves only 0.022 % C at 727 °C. Soft, ductile and magnetic below 770 °C.',
    },
    Fe3C: {
      name: 'Cementite',
      desc: 'Intermetallic compound at exactly 6.67 % C. Very hard and brittle — cementite is what makes steel hard.',
    },
  },
  fields: {
    L: 'Everything is molten.',
    delta: 'Single-phase δ-ferrite.',
    gamma: 'Single-phase austenite — the starting point for every heat treatment.',
    alpha: 'Single-phase ferrite, essentially pure iron.',
    Fe3C: 'Pure cementite.',
    'L+delta': 'Solidification: δ-ferrite grows as dendrites in the melt.',
    'L+gamma': 'Solidification: austenite dendrites grow in the melt.',
    'L+Fe3C': 'Primary cementite grows in the melt.',
    'delta+gamma': 'δ-ferrite is transforming into austenite.',
    'alpha+gamma': 'Proeutectoid ferrite is separating out of the austenite.',
    'gamma+Fe3C': 'Secondary cementite precipitates from austenite, often as a grain-boundary network.',
    'alpha+Fe3C': 'The end state of every plain carbon steel: ferrite plus cementite.',
  },
  constituents: {
    liquid: { name: 'Melt', desc: 'Liquid alloy.' },
    delta: { name: 'δ-ferrite', desc: 'High-temperature ferrite.' },
    austenite: { name: 'Austenite', desc: 'FCC grains, typically coarse at high temperature.' },
    ferrite: { name: 'Proeutectoid ferrite', desc: 'Pale, soft grains formed before the eutectoid reaction.' },
    pearlite: { name: 'Pearlite', desc: 'Lamellar ferrite/cementite mixture — 88.9 % α + 11.1 % Fe₃C.' },
    cementite: { name: 'Cementite', desc: 'Hard phase, usually a grain-boundary network or primary plates.' },
    ledeburite: { name: 'Ledeburite', desc: 'The eutectic structure: austenite (later pearlite) embedded in cementite.' },
  },
  alloyClass: {
    'pure-iron': {
      name: 'Commercially pure iron',
      desc: 'Almost carbon free. Soft, magnetic and easy to form, but it cannot be hardened.',
    },
    'hypoeutectoid-steel': {
      name: 'Hypoeutectoid steel',
      desc: 'Below 0.76 % C. Proeutectoid ferrite forms first, the rest becomes pearlite. Structural steel.',
    },
    'eutectoid-steel': {
      name: 'Eutectoid steel',
      desc: 'Exactly 0.76 % C. The entire structure converts to pearlite at 727 °C — no proeutectoid grains at all.',
    },
    'hypereutectoid-steel': {
      name: 'Hypereutectoid steel',
      desc: 'Above 0.76 % C. Cementite forms in the grain boundaries before the pearlite. Tool steel.',
    },
    'hypoeutectic-cast-iron': {
      name: 'Hypoeutectic cast iron',
      desc: 'Above 2.14 % C. Primary austenite solidifies first, the rest becomes ledeburite. Cannot be forged.',
    },
    'eutectic-cast-iron': {
      name: 'Eutectic cast iron',
      desc: 'Exactly 4.3 % C. The lowest melting point in the system, 1147 °C — which is why it casts so well.',
    },
    'hypereutectic-cast-iron': {
      name: 'Hypereutectic cast iron',
      desc: 'Above 4.3 % C. Coarse primary cementite plates in ledeburite. Extremely hard and brittle.',
    },
    cementite: {
      name: 'Cementite',
      desc: 'Pure Fe₃C at 6.67 % C. The right-hand edge of the diagram.',
    },
  },
  presets: {
    armco: { name: 'Pure iron', note: 'ARMCO iron. The reference point: almost no carbon at all.' },
    '1020': { name: 'AISI 1020', note: 'Structural steel. Soft, weldable, ~25 % pearlite.' },
    '1045': { name: 'AISI 1045', note: 'Machinery steel for shafts and gears. Hardenable.' },
    eutectoid: { name: 'Eutectoid (0.76 %)', note: 'Pure pearlite — piano wire and cutting tools.' },
    '1095': { name: 'AISI 1095', note: 'Tool steel: pearlite plus a cementite network.' },
    castIron30: { name: 'Cast iron 3.0 %', note: 'Hypoeutectic: primary austenite in ledeburite.' },
    castIron43: { name: 'Cast iron 4.3 %', note: 'The eutectic composition — melts lower than anything else here.' },
    castIron55: { name: 'Cast iron 5.5 %', note: 'Hypereutectic: primary cementite, very brittle.' },
  },
  points: {
    eutectoid: {
      title: 'Eutectoid point',
      value: '727 °C · 0.76 % C',
      body: 'γ → α + Fe₃C. One solid phase becomes two solid phases at constant temperature. The product is pearlite, the lamellar structure that gives steel its strength.',
    },
    eutectic: {
      title: 'Eutectic point',
      value: '1147 °C · 4.30 % C',
      body: 'L → γ + Fe₃C. The lowest melting point in the system. The product is called ledeburite, and it is why cast iron pours so easily.',
    },
    peritectic: {
      title: 'Peritectic reaction',
      value: '1495 °C · 0.17 % C',
      body: 'L + δ → γ. Melt and δ-ferrite react to form austenite. It matters in continuous casting, where the reaction causes surface cracking.',
    },
    a1: {
      title: 'A₁ — the eutectoid line',
      value: '727 °C',
      body: 'The lower critical temperature. Below A₁ no carbon steel contains any austenite. Every annealing and hardening cycle is defined from this line.',
    },
    a3: {
      title: 'A₃ — upper critical line',
      value: '912 → 727 °C',
      body: 'Where proeutectoid ferrite starts to separate from austenite. Normalising is typically done 30–50 °C above A₃.',
    },
    acm: {
      title: 'A_cm — the cementite limit',
      value: '727 → 1147 °C',
      body: 'The solubility limit of carbon in austenite. Cooling below A_cm precipitates secondary cementite, often as a brittle grain-boundary network.',
    },
    delta: {
      title: 'The δ region',
      value: '1394 – 1538 °C',
      body: 'Iron is BCC (δ) just below melting, turns FCC (γ) at 1394 °C and BCC again (α) at 912 °C. Very few metals change structure twice.',
    },
  },
  lever: {
    arm: 'Arm',
    note: 'The amount of a phase is proportional to the arm on the opposite side — exactly like a balance beam.',
  },
  micro: {
    schematic: 'Schematic',
    grainNote: 'The grains are generated, not measured; the fractions follow the diagram exactly.',
  },
  cooling: {
    subtitle: 'From melt to room temperature',
    relativeTime: 'Relative time',
    events: {
      start: 'The alloy is completely molten.',
      liquidus: 'Liquidus: the first crystals form.',
      solidus: 'Solidus: the last of the melt freezes.',
      peritectic: 'Peritectic reaction: L + δ → γ.',
      eutectic: 'Eutectic reaction: L → γ + Fe₃C (ledeburite).',
      eutectoid: 'Eutectoid reaction: γ → α + Fe₃C (pearlite).',
      a3: 'A₃: proeutectoid ferrite starts to separate.',
      acm: 'A_cm: secondary cementite starts to precipitate.',
      solvus: 'Solvus: tertiary cementite precipitates from the ferrite.',
      end: 'Room temperature — the final structure is set.',
      transition: 'Phase transformation.',
    },
    transformed: 'transforms',
  },
  tour: {
    steps: [
      {
        title: 'A map of steel',
        body: 'Every point in the diagram is an alloy at a temperature. Horizontal: carbon content, 0–6.67 %. Vertical: temperature, 0–1600 °C.',
      },
      {
        title: 'The phase fields',
        body: 'Solid colours are single-phase regions, blended colours are two-phase regions. The blend is always a mix of the two phases actually present.',
      },
      {
        title: 'The eutectoid at 727 °C',
        body: 'The single most important point in physical metallurgy: γ → α + Fe₃C. Pearlite is born here, and so is the limit of every hardening cycle.',
      },
      {
        title: 'The lever rule',
        body: 'In a two-phase field the panel shows exactly how much of each phase is present — computed from the lever rule, not looked up in a table.',
      },
      {
        title: 'Cool an alloy down',
        body: 'Pick a carbon content and press Simulate cooling. The marker follows the cooling curve while the timeline calls out every reaction on the way down.',
      },
    ],
  },
  footer: {
    source: 'Data follows the standard Fe–Fe₃C diagram (Callister; ASM Handbook vol. 3).',
    metastable: 'Metastable system: graphite precipitation is neglected.',
  },
};
