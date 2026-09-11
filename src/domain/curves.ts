/**
 * Phase-boundary geometry.
 *
 * Every boundary in the diagram is stored as a short list of anchor points
 * (wt% C, degC) taken from the published diagram, and is evaluated by monotone
 * piecewise-linear interpolation. Each boundary is monotone in *both* axes,
 * which means it can be queried in two directions:
 *
 *   tempAt(c)          -> temperature of the boundary at a given carbon content
 *   compositionAt(T)   -> carbon content of the boundary at a given temperature
 *
 * The second form is what makes the rest of the app simple: an isothermal cut
 * through the diagram (see `diagram.ts`) is just the sorted list of boundary
 * compositions at that temperature, and the lever rule then falls straight out
 * of the segment edges.
 */

import {
  A3_PURE_FE,
  A4_PURE_FE,
  CEMENTITE_C,
  CEMENTITE_MELT_T,
  C_IN_ALPHA_AT_RT,
  EUTECTIC,
  EUTECTOID,
  FE_MELTING_C,
  PERITECTIC,
} from './constants';

export interface Anchor {
  /** Carbon content, wt%. */
  c: number;
  /** Temperature, degC. */
  T: number;
}

export type BoundaryId =
  | 'deltaSolidus'
  | 'deltaLiquidus'
  | 'deltaSolvus'
  | 'gammaDeltaSolvus'
  | 'gammaSolidus'
  | 'gammaLiquidus'
  | 'cementiteLiquidus'
  | 'acm'
  | 'a3'
  | 'alphaGammaSolvus'
  | 'alphaSolvus';

export interface Curve {
  readonly id: BoundaryId;
  readonly anchors: readonly Anchor[];
  /** [min, max] carbon content covered by the curve. */
  readonly cRange: readonly [number, number];
  /** [min, max] temperature covered by the curve. */
  readonly tRange: readonly [number, number];
  /** Temperature of the boundary at carbon content `c` (clamped to cRange). */
  tempAt(c: number): number;
  /** Carbon content of the boundary at temperature `T` (clamped to tRange). */
  compositionAt(T: number): number;
}

/** Clamp helper shared across the domain layer. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Linear interpolation over a list sorted ascending by `from`.
 * Values outside the list are clamped to the end points (phase boundaries do
 * not extrapolate - outside their range they simply do not exist).
 */
function interpolate(points: readonly Anchor[], from: 'c' | 'T', value: number): number {
  const to = from === 'c' ? 'T' : 'c';
  const first = points[0];
  const last = points[points.length - 1];
  if (value <= first[from]) return first[to];
  if (value >= last[from]) return last[to];

  // Binary search for the bracketing pair - boundaries are short lists, but
  // this is called tens of thousands of times per render pass.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid][from] <= value) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  const span = b[from] - a[from];
  if (span === 0) return a[to];
  const t = (value - a[from]) / span;
  return a[to] + t * (b[to] - a[to]);
}

function makeCurve(id: BoundaryId, anchors: Anchor[]): Curve {
  const byC = [...anchors].sort((p, q) => p.c - q.c);
  const byT = [...anchors].sort((p, q) => p.T - q.T);
  const cRange: [number, number] = [byC[0].c, byC[byC.length - 1].c];
  const tRange: [number, number] = [byT[0].T, byT[byT.length - 1].T];

  return {
    id,
    anchors: byC,
    cRange,
    tRange,
    tempAt: (c) => interpolate(byC, 'c', c),
    compositionAt: (T) => interpolate(byT, 'T', T),
  };
}

/* -------------------------------------------------------------------------- */
/* Boundary definitions                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Build a boundary between two fixed end points from a normalised *shape*
 * function `f: [0,1] -> [0,1]`, sampled densely.
 *
 * Why not store the published anchor points directly? Because a phase boundary
 * read off a printed diagram gives ~8 points, and a polyline through 8 points
 * has visible kinks at plot scale. Sampling a smooth monotone shape function
 * instead gives a curve that is smooth to the eye, still passes exactly through
 * the invariant points, and - crucially - is still piecewise linear internally,
 * so `compositionAt` stays an exact inverse of `tempAt`.
 */
function shapedCurve(
  id: BoundaryId,
  from: Anchor,
  to: Anchor,
  shape: (x: number) => number,
  samples = 48,
): Curve {
  const anchors: Anchor[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = i / samples;
    const y = i === 0 ? 0 : i === samples ? 1 : shape(x);
    anchors.push({
      c: from.c + (to.c - from.c) * x,
      T: from.T + (to.T - from.T) * y,
    });
  }
  return makeCurve(id, anchors);
}

const linear = (x: number) => x;
/** Mildly convex: slow at first, steeper later. */
const convex = (k: number) => (x: number) => (1 - k) * x + k * x * x;
/** Power shape; p > 1 is convex, p < 1 concave. */
const power = (p: number) => (x: number) => Math.pow(x, p);

/** delta + L / delta  — solidus of the delta-ferrite field (1538 degC -> peritectic). */
export const deltaSolidus = shapedCurve(
  'deltaSolidus',
  { c: 0, T: FE_MELTING_C },
  { c: PERITECTIC.cDelta, T: PERITECTIC.T },
  linear,
  4,
);

/** L / delta + L  — liquidus above the delta field. */
export const deltaLiquidus = shapedCurve(
  'deltaLiquidus',
  { c: 0, T: FE_MELTING_C },
  { c: PERITECTIC.cLiquid, T: PERITECTIC.T },
  linear,
  4,
);

/** delta / delta + gamma  — solvus on the delta side of the two-phase field. */
export const deltaSolvus = shapedCurve(
  'deltaSolvus',
  { c: 0, T: A4_PURE_FE },
  { c: PERITECTIC.cDelta, T: PERITECTIC.T },
  linear,
  4,
);

/** delta + gamma / gamma  — solvus on the austenite side. */
export const gammaDeltaSolvus = shapedCurve(
  'gammaDeltaSolvus',
  { c: 0, T: A4_PURE_FE },
  { c: PERITECTIC.cGamma, T: PERITECTIC.T },
  linear,
  4,
);

/** gamma / gamma + L  — austenite solidus, peritectic point -> eutectic point. */
export const gammaSolidus = shapedCurve(
  'gammaSolidus',
  { c: PERITECTIC.cGamma, T: PERITECTIC.T },
  { c: EUTECTIC.cGamma, T: EUTECTIC.T },
  convex(0.55),
);

/** gamma + L / L  — austenite liquidus, peritectic point -> eutectic point. */
export const gammaLiquidus = shapedCurve(
  'gammaLiquidus',
  { c: PERITECTIC.cLiquid, T: PERITECTIC.T },
  { c: EUTECTIC.cLiquid, T: EUTECTIC.T },
  power(1.15),
);

/** L / L + Fe3C  — cementite liquidus, eutectic point -> cementite melting. */
export const cementiteLiquidus = shapedCurve(
  'cementiteLiquidus',
  { c: EUTECTIC.cLiquid, T: EUTECTIC.T },
  { c: CEMENTITE_C, T: CEMENTITE_MELT_T },
  power(0.8),
);

/** A_cm: gamma / gamma + Fe3C  — carbon solubility limit in austenite. */
export const acm = shapedCurve(
  'acm',
  { c: EUTECTOID.cGamma, T: EUTECTOID.T },
  { c: EUTECTIC.cGamma, T: EUTECTIC.T },
  convex(0.2),
);

/** A3: alpha + gamma / gamma  — upper critical line of hypoeutectoid steel. */
export const a3 = shapedCurve(
  'a3',
  { c: 0, T: A3_PURE_FE },
  { c: EUTECTOID.cGamma, T: EUTECTOID.T },
  (x) => 1.06 * x - 0.06 * x * x,
);

/** alpha / alpha + gamma  — solubility limit of carbon in ferrite above A1. */
export const alphaGammaSolvus = shapedCurve(
  'alphaGammaSolvus',
  { c: 0, T: A3_PURE_FE },
  { c: EUTECTOID.cAlpha, T: EUTECTOID.T },
  // Parametrised along temperature: c grows as (dT)^0.85 below 912 degC.
  (x) => Math.pow(x, 1 / 0.85),
);

/**
 * alpha / alpha + Fe3C  — solvus below A1.
 *
 * Carbon solubility in ferrite collapses immediately below the eutectoid (the
 * excess leaves as tertiary cementite) and then tails off towards the ~0.008 %
 * usually quoted at room temperature.
 */
export const alphaSolvus = makeCurve(
  'alphaSolvus',
  Array.from({ length: 49 }, (_, i) => {
    const x = i / 48; // 0 at 727 degC, 1 at 0 degC
    const T = EUTECTOID.T * (1 - x);
    const drop = Math.pow(x, 0.55);
    return { c: EUTECTOID.cAlpha - (EUTECTOID.cAlpha - C_IN_ALPHA_AT_RT) * drop, T };
  }),
);

export const ALL_CURVES: readonly Curve[] = [
  deltaSolidus,
  deltaLiquidus,
  deltaSolvus,
  gammaDeltaSolvus,
  gammaSolidus,
  gammaLiquidus,
  cementiteLiquidus,
  acm,
  a3,
  alphaGammaSolvus,
  alphaSolvus,
];
