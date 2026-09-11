/**
 * From phases to *microconstituents*.
 *
 * The phase diagram answers "which phases, how much" - but a micrograph shows
 * constituents, which is a different question. A 0.4 % C steel at room
 * temperature is 94 % ferrite + 6 % cementite by phase, yet what you see under
 * the microscope is pale proeutectoid ferrite grains next to dark lamellar
 * pearlite colonies. This module does that translation for slow (equilibrium)
 * cooling, which is what the diagram describes.
 *
 * Simplifications, stated up front:
 *  - equilibrium cooling only: no bainite, no martensite, no TTT kinetics;
 *  - secondary/tertiary cementite is reported but drawn as grain-boundary film;
 *  - ledeburite below 727 degC is "transformed ledeburite" (pearlite + cementite).
 */

import { acm } from './curves';
import {
  CEMENTITE_C,
  C_IN_ALPHA_AT_RT,
  EUTECTIC,
  EUTECTOID,
  MAX_C_IN_ALPHA,
} from './constants';
import { classifyPoint, meltingRange } from './diagram';
import type { Phase } from './phases';

export type ConstituentId =
  | 'liquid'
  | 'delta'
  | 'austenite'
  | 'ferrite'
  | 'pearlite'
  | 'cementite'
  | 'ledeburite';

export interface Constituent {
  id: ConstituentId;
  /** Area/weight fraction, 0..1. */
  fraction: number;
  /** Phase make-up of the constituent, for the side panel. */
  phases: { phase: Phase; fraction: number }[];
}

export type AlloyClass =
  | 'pure-iron'
  | 'hypoeutectoid-steel'
  | 'eutectoid-steel'
  | 'hypereutectoid-steel'
  | 'hypoeutectic-cast-iron'
  | 'eutectic-cast-iron'
  | 'hypereutectic-cast-iron'
  | 'cementite';

export type MicrographMode = 'melt' | 'mushy' | 'solid';

export interface Microstructure {
  alloyClass: AlloyClass;
  mode: MicrographMode;
  /** Weight fraction of solid (1 below the solidus). */
  solidFraction: number;
  constituents: Constituent[];
}

const PEARLITE_PHASES = [
  { phase: 'alpha' as Phase, fraction: (CEMENTITE_C - EUTECTOID.cGamma) / (CEMENTITE_C - MAX_C_IN_ALPHA) },
  { phase: 'Fe3C' as Phase, fraction: (EUTECTOID.cGamma - MAX_C_IN_ALPHA) / (CEMENTITE_C - MAX_C_IN_ALPHA) },
];

/** Ledeburite is the eutectic mixture: austenite (later pearlite) + cementite. */
const LEDEBURITE_PHASES_HOT = [
  { phase: 'gamma' as Phase, fraction: (CEMENTITE_C - EUTECTIC.cLiquid) / (CEMENTITE_C - EUTECTIC.cGamma) },
  { phase: 'Fe3C' as Phase, fraction: (EUTECTIC.cLiquid - EUTECTIC.cGamma) / (CEMENTITE_C - EUTECTIC.cGamma) },
];
const LEDEBURITE_PHASES_COLD = [
  { phase: 'alpha' as Phase, fraction: (CEMENTITE_C - EUTECTIC.cLiquid) / (CEMENTITE_C - MAX_C_IN_ALPHA) },
  {
    phase: 'Fe3C' as Phase,
    fraction: 1 - (CEMENTITE_C - EUTECTIC.cLiquid) / (CEMENTITE_C - MAX_C_IN_ALPHA),
  },
];

const single = (phase: Phase) => [{ phase, fraction: 1 }];

export function classifyAlloy(c: number): AlloyClass {
  if (c <= C_IN_ALPHA_AT_RT) return 'pure-iron';
  if (c < EUTECTOID.cGamma - 0.005) return 'hypoeutectoid-steel';
  if (c <= EUTECTOID.cGamma + 0.005) return 'eutectoid-steel';
  if (c <= EUTECTIC.cGamma) return 'hypereutectoid-steel';
  if (c < EUTECTIC.cLiquid - 0.02) return 'hypoeutectic-cast-iron';
  if (c <= EUTECTIC.cLiquid + 0.02) return 'eutectic-cast-iron';
  if (c < CEMENTITE_C - 1e-6) return 'hypereutectic-cast-iron';
  return 'cementite';
}

/** Drop empty constituents and renormalise so the fractions sum to exactly 1. */
function finalise(
  alloyClass: AlloyClass,
  mode: MicrographMode,
  solidFraction: number,
  constituents: Constituent[],
): Microstructure {
  const kept = constituents.filter((k) => k.fraction > 1e-6);
  const total = kept.reduce((sum, k) => sum + k.fraction, 0);
  const normalised = total > 0 ? kept.map((k) => ({ ...k, fraction: k.fraction / total })) : kept;
  normalised.sort((a, b) => b.fraction - a.fraction);
  return { alloyClass, mode, solidFraction, constituents: normalised };
}

/**
 * Constituents present in an alloy of composition `c` held at temperature `T`
 * after slow cooling from the melt.
 */
export function microstructureAt(c: number, T: number): Microstructure {
  const alloyClass = classifyAlloy(c);
  const state = classifyPoint(c, T);
  const liquid = state.phases.find((p) => p.phase === 'L')?.fraction ?? 0;
  const solidFraction = 1 - liquid;
  const { liquidus } = meltingRange(c);

  /* ---- fully molten ---------------------------------------------------- */
  if (T >= liquidus || solidFraction <= 1e-9) {
    return finalise(alloyClass, 'melt', 0, [
      { id: 'liquid', fraction: 1, phases: single('L') },
    ]);
  }

  /* ---- partially molten ------------------------------------------------ */
  if (liquid > 1e-9) {
    const solids: Constituent[] = [];
    for (const p of state.phases) {
      if (p.phase === 'L') continue;
      const id: ConstituentId =
        p.phase === 'delta' ? 'delta' : p.phase === 'gamma' ? 'austenite' : 'cementite';
      solids.push({ id, fraction: p.fraction, phases: single(p.phase) });
    }
    return finalise(alloyClass, 'mushy', solidFraction, [
      { id: 'liquid', fraction: liquid, phases: single('L') },
      ...solids,
    ]);
  }

  /* ---- fully solid ----------------------------------------------------- */
  const aboveEutectoid = T > EUTECTOID.T;
  const belowEutectic = T <= EUTECTIC.T;

  // Cast irons: the eutectic liquid has frozen into ledeburite, and whatever
  // solidified before it (primary austenite or primary cementite) sits in it.
  if (c > EUTECTIC.cGamma && belowEutectic) {
    const ledeburite =
      c <= EUTECTIC.cLiquid
        ? (c - EUTECTIC.cGamma) / (EUTECTIC.cLiquid - EUTECTIC.cGamma)
        : (CEMENTITE_C - c) / (CEMENTITE_C - EUTECTIC.cLiquid);
    const primaryGamma = c <= EUTECTIC.cLiquid ? 1 - ledeburite : 0;
    const primaryCementite = c > EUTECTIC.cLiquid ? 1 - ledeburite : 0;

    // Austenite sheds carbon as secondary cementite between 1147 and 727 degC.
    const gammaCarbon = aboveEutectoid ? acm.compositionAt(T) : EUTECTOID.cGamma;
    const secondary =
      primaryGamma > 0
        ? primaryGamma * ((EUTECTIC.cGamma - gammaCarbon) / (CEMENTITE_C - gammaCarbon))
        : 0;
    const primaryRest = primaryGamma - secondary;

    return finalise(alloyClass, 'solid', 1, [
      {
        id: 'ledeburite',
        fraction: ledeburite,
        phases: aboveEutectoid ? LEDEBURITE_PHASES_HOT : LEDEBURITE_PHASES_COLD,
      },
      aboveEutectoid
        ? { id: 'austenite', fraction: primaryRest, phases: single('gamma') }
        : { id: 'pearlite', fraction: primaryRest, phases: PEARLITE_PHASES },
      { id: 'cementite', fraction: secondary + primaryCementite, phases: single('Fe3C') },
    ]);
  }

  // Steels (and the austenite field of the cast irons) above the eutectoid.
  if (aboveEutectoid) {
    const out: Constituent[] = [];
    for (const p of state.phases) {
      const id: ConstituentId =
        p.phase === 'gamma'
          ? 'austenite'
          : p.phase === 'alpha'
            ? 'ferrite'
            : p.phase === 'delta'
              ? 'delta'
              : 'cementite';
      out.push({ id, fraction: p.fraction, phases: single(p.phase) });
    }
    return finalise(alloyClass, 'solid', 1, out);
  }

  // Below the eutectoid: every austenite grain has become pearlite, and what
  // was proeutectoid ferrite/cementite is still there.
  if (c <= MAX_C_IN_ALPHA) {
    const state2 = classifyPoint(c, T);
    const cementite = state2.phases.find((p) => p.phase === 'Fe3C')?.fraction ?? 0;
    return finalise(alloyClass, 'solid', 1, [
      { id: 'ferrite', fraction: 1 - cementite, phases: single('alpha') },
      { id: 'cementite', fraction: cementite, phases: single('Fe3C') },
    ]);
  }

  if (c < EUTECTOID.cGamma) {
    const pearlite = (c - MAX_C_IN_ALPHA) / (EUTECTOID.cGamma - MAX_C_IN_ALPHA);
    return finalise(alloyClass, 'solid', 1, [
      { id: 'pearlite', fraction: pearlite, phases: PEARLITE_PHASES },
      { id: 'ferrite', fraction: 1 - pearlite, phases: single('alpha') },
    ]);
  }

  const pearlite = (CEMENTITE_C - c) / (CEMENTITE_C - EUTECTOID.cGamma);
  return finalise(alloyClass, 'solid', 1, [
    { id: 'pearlite', fraction: pearlite, phases: PEARLITE_PHASES },
    { id: 'cementite', fraction: 1 - pearlite, phases: single('Fe3C') },
  ]);
}
