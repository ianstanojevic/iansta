/**
 * The single source of truth for "what is happening at (carbon, temperature)".
 *
 * Everything in the UI - the shaded fields, the tooltip, the lever rule, the
 * cooling simulation and the micrograph - is derived from `isothermalSection`.
 * That is deliberate: there is exactly one place where the topology of the
 * diagram is encoded, so the picture can never disagree with the numbers.
 */

import {
  CEMENTITE_C,
  CEMENTITE_MELT_T,
  C_MAX,
  C_MIN,
  EUTECTIC,
  EUTECTOID,
  FE_MELTING_C,
  INVARIANT_T_TOL,
  PERITECTIC,
  A4_PURE_FE,
  A3_PURE_FE,
} from './constants';
import {
  a3,
  acm,
  alphaGammaSolvus,
  alphaSolvus,
  cementiteLiquidus,
  clamp,
  deltaLiquidus,
  deltaSolidus,
  deltaSolvus,
  gammaDeltaSolvus,
  gammaLiquidus,
  gammaSolidus,
} from './curves';
import { FIELD_PHASES, type FieldId, type Phase } from './phases';
import { leverRule, type LeverRuleResult } from './leverRule';

/** One horizontal slice of a phase field at a fixed temperature. */
export interface Segment {
  field: FieldId;
  /** Left edge, wt% C. In a two-phase field this is the left phase composition. */
  cLeft: number;
  /** Right edge, wt% C. In a two-phase field this is the right phase composition. */
  cRight: number;
}

export type InvariantId = 'peritectic' | 'eutectic' | 'eutectoid';

export interface PhaseAmount {
  phase: Phase;
  /** Carbon content of that phase, wt%. */
  composition: number;
  /** Weight fraction, 0..1. */
  fraction: number;
}

export interface PointState {
  /** Query point. */
  c: number;
  T: number;
  field: FieldId;
  phases: PhaseAmount[];
  /** Present only inside a two-phase field. */
  lever: LeverRuleResult | null;
  /** Set when the point sits on one of the three invariant reactions. */
  invariant: InvariantId | null;
  /** True when the query point is outside the plotted window. */
  outside: boolean;
}

/** Discard zero-width slivers produced at band boundaries. */
const MIN_SEGMENT_WIDTH = 1e-9;

function push(out: Segment[], field: FieldId, cLeft: number, cRight: number): void {
  if (cRight - cLeft > MIN_SEGMENT_WIDTH) out.push({ field, cLeft, cRight });
}

/**
 * Isothermal cut through the diagram: the ordered list of phase fields crossed
 * when walking from 0 wt% C to 6.67 wt% C at temperature `T`.
 *
 * The temperature bands below follow the topology of the Fe–Fe3C system:
 *
 *   T > 1538          all liquid
 *   1495 < T <= 1538  delta | delta+L | L
 *   1394 < T <= 1495  delta | delta+gamma | gamma | gamma+L | L
 *   1227 <= T <= 1394 gamma | gamma+L | L
 *   1147 < T < 1227   gamma | gamma+L | L | L+Fe3C
 *    912 < T <= 1147  gamma | gamma+Fe3C
 *    727 < T <= 912   alpha | alpha+gamma | gamma | gamma+Fe3C
 *   T <= 727          alpha | alpha+Fe3C
 */
export function isothermalSection(T: number): Segment[] {
  const out: Segment[] = [];

  if (T > FE_MELTING_C) {
    push(out, 'L', C_MIN, C_MAX);
    return out;
  }

  if (T > PERITECTIC.T) {
    push(out, 'delta', C_MIN, deltaSolidus.compositionAt(T));
    push(out, 'L+delta', deltaSolidus.compositionAt(T), deltaLiquidus.compositionAt(T));
    push(out, 'L', deltaLiquidus.compositionAt(T), C_MAX);
    return out;
  }

  if (T > A4_PURE_FE) {
    push(out, 'delta', C_MIN, deltaSolvus.compositionAt(T));
    push(out, 'delta+gamma', deltaSolvus.compositionAt(T), gammaDeltaSolvus.compositionAt(T));
    push(out, 'gamma', gammaDeltaSolvus.compositionAt(T), gammaSolidus.compositionAt(T));
    push(out, 'L+gamma', gammaSolidus.compositionAt(T), gammaLiquidus.compositionAt(T));
    push(out, 'L', gammaLiquidus.compositionAt(T), C_MAX);
    return out;
  }

  if (T > EUTECTIC.T) {
    push(out, 'gamma', C_MIN, gammaSolidus.compositionAt(T));
    push(out, 'L+gamma', gammaSolidus.compositionAt(T), gammaLiquidus.compositionAt(T));
    if (T >= CEMENTITE_MELT_T) {
      push(out, 'L', gammaLiquidus.compositionAt(T), C_MAX);
    } else {
      // Below the cementite melting point primary cementite can coexist with melt.
      push(out, 'L', gammaLiquidus.compositionAt(T), cementiteLiquidus.compositionAt(T));
      push(out, 'L+Fe3C', cementiteLiquidus.compositionAt(T), C_MAX);
    }
    return out;
  }

  if (T > A3_PURE_FE) {
    push(out, 'gamma', C_MIN, acm.compositionAt(T));
    push(out, 'gamma+Fe3C', acm.compositionAt(T), C_MAX);
    return out;
  }

  if (T > EUTECTOID.T) {
    push(out, 'alpha', C_MIN, alphaGammaSolvus.compositionAt(T));
    push(out, 'alpha+gamma', alphaGammaSolvus.compositionAt(T), a3.compositionAt(T));
    push(out, 'gamma', a3.compositionAt(T), acm.compositionAt(T));
    push(out, 'gamma+Fe3C', acm.compositionAt(T), C_MAX);
    return out;
  }

  push(out, 'alpha', C_MIN, alphaSolvus.compositionAt(T));
  push(out, 'alpha+Fe3C', alphaSolvus.compositionAt(T), C_MAX);
  return out;
}

/** Find the segment that contains `c` (the last segment wins on shared edges). */
export function segmentAt(T: number, c: number): Segment {
  const section = isothermalSection(T);
  for (let i = 0; i < section.length; i++) {
    const s = section[i];
    if (c <= s.cRight || i === section.length - 1) return s;
  }
  return section[section.length - 1];
}

/** True when (c, T) sits on one of the three invariant reaction lines. */
export function invariantAt(c: number, T: number): InvariantId | null {
  if (
    Math.abs(T - PERITECTIC.T) <= INVARIANT_T_TOL &&
    c >= PERITECTIC.cDelta &&
    c <= PERITECTIC.cLiquid
  ) {
    return 'peritectic';
  }
  if (
    Math.abs(T - EUTECTIC.T) <= INVARIANT_T_TOL &&
    c >= EUTECTIC.cGamma &&
    c <= EUTECTIC.cCementite
  ) {
    return 'eutectic';
  }
  if (
    Math.abs(T - EUTECTOID.T) <= INVARIANT_T_TOL &&
    c >= EUTECTOID.cAlpha &&
    c <= EUTECTOID.cCementite
  ) {
    return 'eutectoid';
  }
  return null;
}

/**
 * Full description of a point in the diagram: which field, which phases, their
 * compositions and their weight fractions (via the lever rule).
 */
export function classifyPoint(cInput: number, TInput: number): PointState {
  const outside = cInput < C_MIN || cInput > C_MAX || TInput < 0 || TInput > 1600;
  const c = clamp(cInput, C_MIN, C_MAX);
  const T = clamp(TInput, 0, 1600);

  // Cementite is a line compound: exactly at 6.67 wt% C the alloy is 100 % Fe3C
  // (as long as it is solid), not a two-phase mixture.
  if (c >= CEMENTITE_C - 1e-6 && T < cementiteLiquidus.tempAt(CEMENTITE_C)) {
    return {
      c,
      T,
      field: 'Fe3C',
      phases: [{ phase: 'Fe3C', composition: CEMENTITE_C, fraction: 1 }],
      lever: null,
      invariant: invariantAt(c, T),
      outside,
    };
  }

  const segment = segmentAt(T, c);
  const phases = FIELD_PHASES[segment.field];

  if (phases.length === 1) {
    return {
      c,
      T,
      field: segment.field,
      phases: [{ phase: phases[0], composition: c, fraction: 1 }],
      lever: null,
      invariant: invariantAt(c, T),
      outside,
    };
  }

  const lever = leverRule(c, segment.cLeft, segment.cRight);
  return {
    c,
    T,
    field: segment.field,
    phases: [
      { phase: phases[0], composition: segment.cLeft, fraction: lever.fractionLeft },
      { phase: phases[1], composition: segment.cRight, fraction: lever.fractionRight },
    ],
    lever,
    invariant: invariantAt(c, T),
    outside,
  };
}

/**
 * Temperature at which an alloy of composition `c` first starts to melt
 * (solidus) and is fully molten (liquidus). Returns null above 6.67 wt% C.
 */
export function meltingRange(c: number): { solidus: number; liquidus: number } {
  const solidus =
    c <= PERITECTIC.cDelta
      ? deltaSolidus.tempAt(c)
      : c <= EUTECTIC.cGamma
        ? Math.max(gammaSolidus.tempAt(c), c <= PERITECTIC.cGamma ? PERITECTIC.T : 0)
        : EUTECTIC.T;
  const liquidus =
    c <= PERITECTIC.cLiquid
      ? deltaLiquidus.tempAt(c)
      : c <= EUTECTIC.cLiquid
        ? gammaLiquidus.tempAt(c)
        : cementiteLiquidus.tempAt(c);
  return { solidus, liquidus };
}
