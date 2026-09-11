/**
 * What gets *drawn on top of* the shaded fields: the boundary lines themselves,
 * the three invariant reaction lines, and the labelled points that open an
 * explanation card.
 */

import {
  CEMENTITE_C,
  EUTECTIC,
  EUTECTOID,
  MAX_C_IN_ALPHA,
  PERITECTIC,
} from './constants';
import {
  a3,
  acm,
  alphaGammaSolvus,
  alphaSolvus,
  cementiteLiquidus,
  deltaLiquidus,
  deltaSolidus,
  deltaSolvus,
  gammaDeltaSolvus,
  gammaLiquidus,
  gammaSolidus,
  type Curve,
} from './curves';

/** Key of an explanation card. */
export type InfoKey = 'eutectoid' | 'eutectic' | 'peritectic' | 'a1' | 'a3' | 'acm' | 'delta';

export interface DrawnBoundary {
  id: string;
  points: [number, number][];
  /** Phase boundaries are solid; the invariant reaction lines are emphasised. */
  weight: 'normal' | 'strong';
  /** Opens this explanation card when clicked. */
  info?: InfoKey;
  /** Short label drawn along the line, e.g. "A₃". */
  label?: string;
  labelAt?: [number, number];
}

/** Sample a curve into a polyline dense enough to look smooth at any zoom. */
function polyline(curve: Curve, samples = 90): [number, number][] {
  const [c0, c1] = curve.cRange;
  return Array.from({ length: samples + 1 }, (_, i) => {
    const c = c0 + ((c1 - c0) * i) / samples;
    return [c, curve.tempAt(c)] as [number, number];
  });
}

export const DRAWN_BOUNDARIES: DrawnBoundary[] = [
  { id: 'deltaLiquidus', points: polyline(deltaLiquidus, 2), weight: 'normal' },
  { id: 'deltaSolidus', points: polyline(deltaSolidus, 2), weight: 'normal' },
  { id: 'deltaSolvus', points: polyline(deltaSolvus, 2), weight: 'normal', info: 'delta' },
  { id: 'gammaDeltaSolvus', points: polyline(gammaDeltaSolvus, 2), weight: 'normal', info: 'delta' },
  { id: 'gammaLiquidus', points: polyline(gammaLiquidus), weight: 'normal' },
  { id: 'gammaSolidus', points: polyline(gammaSolidus), weight: 'normal' },
  { id: 'cementiteLiquidus', points: polyline(cementiteLiquidus), weight: 'normal' },
  {
    id: 'acm',
    points: polyline(acm),
    weight: 'normal',
    info: 'acm',
    label: 'Aᴄᴍ',
    labelAt: [1.62, acm.tempAt(1.62)],
  },
  {
    id: 'a3',
    points: polyline(a3),
    weight: 'normal',
    info: 'a3',
    label: 'A₃',
    labelAt: [0.58, a3.tempAt(0.58)],
  },
  { id: 'alphaGammaSolvus', points: polyline(alphaGammaSolvus), weight: 'normal' },
  { id: 'alphaSolvus', points: polyline(alphaSolvus), weight: 'normal' },
  // The three invariant reactions.
  {
    id: 'peritectic',
    points: [
      [PERITECTIC.cDelta, PERITECTIC.T],
      [PERITECTIC.cLiquid, PERITECTIC.T],
    ],
    weight: 'strong',
    info: 'peritectic',
  },
  {
    id: 'eutectic',
    points: [
      [EUTECTIC.cGamma, EUTECTIC.T],
      [CEMENTITE_C, EUTECTIC.T],
    ],
    weight: 'strong',
    info: 'eutectic',
    label: '1147 °C',
    labelAt: [3.1, EUTECTIC.T],
  },
  {
    id: 'eutectoid',
    points: [
      [MAX_C_IN_ALPHA, EUTECTOID.T],
      [CEMENTITE_C, EUTECTOID.T],
    ],
    weight: 'strong',
    info: 'a1',
    label: 'A₁ · 727 °C',
    labelAt: [4.4, EUTECTOID.T],
  },
];

export interface InvariantPoint {
  id: InfoKey;
  c: number;
  T: number;
  label: string;
  /** Direction to offset the label so it clears the lines. */
  anchor: 'start' | 'middle' | 'end';
  dx: number;
  dy: number;
}

export const INVARIANT_POINTS: InvariantPoint[] = [
  {
    id: 'eutectoid',
    c: EUTECTOID.cGamma,
    T: EUTECTOID.T,
    label: '0,76 · 727',
    anchor: 'end',
    dx: -9,
    dy: 17,
  },
  {
    id: 'eutectic',
    c: EUTECTIC.cLiquid,
    T: EUTECTIC.T,
    label: '4,30 · 1147',
    anchor: 'start',
    dx: 12,
    dy: -10,
  },
  {
    id: 'peritectic',
    c: PERITECTIC.cGamma,
    T: PERITECTIC.T,
    label: '',
    anchor: 'start',
    dx: 10,
    dy: 15,
  },
];
