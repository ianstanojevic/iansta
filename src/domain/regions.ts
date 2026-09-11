/**
 * Filled phase-field polygons, derived from `isothermalSection`.
 *
 * Rather than hand-drawing eleven SVG paths (which would drift out of sync with
 * the maths the moment a boundary is tweaked), each shaded field is *sampled*
 * out of the same isothermal-cut function the tooltip uses: walk up the
 * temperature axis, record the left and right edge of the field at every
 * sample, then close the loop by coming back down the right edge.
 *
 * The result is simplified by dropping collinear points, so straight boundaries
 * such as the eutectic line end up as two points rather than four hundred.
 */

import { T_MAX } from './constants';
import { isothermalSection } from './diagram';
import type { FieldId } from './phases';

export interface FieldPolygon {
  field: FieldId;
  /** Closed ring in data space: [wt% C, degC]. */
  points: [number, number][];
}

/** Temperature samples, refined around the invariant reactions. */
function sampleTemperatures(): number[] {
  const eps = 1e-4;
  const samples = new Set<number>();
  for (let T = 0; T <= T_MAX; T += 4) samples.add(T);
  samples.add(T_MAX);
  for (const critical of [727, 912, 1147, 1227, 1394, 1495, 1538]) {
    samples.add(critical - eps);
    samples.add(critical);
    samples.add(critical + eps);
  }
  return [...samples].sort((a, b) => a - b);
}

/** Perpendicular distance of `p` from the segment `a`–`b`, in data units. */
function deviation(a: [number, number], b: [number, number], p: [number, number]): number {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - ax, p[1] - ay);
  return Math.abs(dy * (p[0] - ax) - dx * (p[1] - ay)) / len;
}

/**
 * Drop points that lie (within tolerance) on the line between their neighbours.
 * Temperature and composition have wildly different magnitudes, so the chain is
 * normalised to the plot box before measuring deviation.
 */
function simplify(points: [number, number][], tolerance = 0.0015): [number, number][] {
  if (points.length < 3) return points;
  const norm = (p: [number, number]): [number, number] => [p[0] / 6.67, p[1] / T_MAX];
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = out[out.length - 1];
    const next = points[i + 1];
    if (deviation(norm(prev), norm(next), norm(points[i])) > tolerance) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Build one closed ring per phase field. */
export function buildFieldPolygons(): FieldPolygon[] {
  const left = new Map<FieldId, [number, number][]>();
  const right = new Map<FieldId, [number, number][]>();

  for (const T of sampleTemperatures()) {
    for (const segment of isothermalSection(T)) {
      if (!left.has(segment.field)) {
        left.set(segment.field, []);
        right.set(segment.field, []);
      }
      left.get(segment.field)!.push([segment.cLeft, T]);
      right.get(segment.field)!.push([segment.cRight, T]);
    }
  }

  const polygons: FieldPolygon[] = [];
  for (const [field, leftEdge] of left) {
    const rightEdge = right.get(field)!;
    const ring = [...simplify(leftEdge), ...simplify(rightEdge).reverse()];
    if (ring.length >= 3) polygons.push({ field, points: ring });
  }
  return polygons;
}

/**
 * Where to place the label of each field. Hand-placed rather than computed:
 * several fields (delta, alpha, delta+gamma) are slivers a few hundredths of a
 * percent wide, and a centroid would put their labels on top of each other.
 */
export interface FieldLabelAnchor {
  field: FieldId;
  c: number;
  T: number;
  /** Draw a leader line from the label to this point inside the sliver. */
  leader?: { c: number; T: number };
  /** Render at reduced size (used for the narrow high-temperature fields). */
  small?: boolean;
}

export const FIELD_LABEL_ANCHORS: FieldLabelAnchor[] = [
  { field: 'L', c: 3.1, T: 1480 },
  { field: 'gamma', c: 1.05, T: 1010 },
  { field: 'alpha+gamma', c: 0.25, T: 790 },
  { field: 'gamma+Fe3C', c: 3.6, T: 940 },
  { field: 'alpha+Fe3C', c: 3.6, T: 420 },
  { field: 'L+gamma', c: 2.75, T: 1290 },
  { field: 'L+Fe3C', c: 5.65, T: 1175 },
  { field: 'L+delta', c: 1.15, T: 1565, small: true, leader: { c: 0.26, T: 1521 } },
  { field: 'delta', c: 1.15, T: 1505, small: true, leader: { c: 0.045, T: 1468 } },
  { field: 'delta+gamma', c: 1.15, T: 1445, small: true, leader: { c: 0.095, T: 1443 } },
  { field: 'alpha', c: 0.5, T: 300, small: true, leader: { c: 0.013, T: 330 } },
];
