/**
 * Schematic micrograph.
 *
 * The grain skeleton is a Lloyd-relaxed Voronoi tessellation from a *fixed*
 * seed, so the grains never jump around while you move the marker. What changes
 * is which constituent each grain is assigned to - and the assignment is done
 * by area, so the picture is quantitatively honest: if the diagram says 51 %
 * pearlite, 51 % of the drawn area is pearlite.
 *
 * Cementite films are deliberately *not* given their own grains. Proeutectoid
 * and secondary cementite grow as networks along the austenite grain
 * boundaries, so they are drawn as boundary strokes whose width follows the
 * computed fraction.
 */

import { useMemo } from 'react';
import { Delaunay } from 'd3-delaunay';
import { motion } from 'framer-motion';

import type { Microstructure, ConstituentId } from '../domain/microstructure';
import { CONSTITUENT_COLORS } from '../theme/palette';
import { CHROME } from '../theme/palette';
import { useAppStore } from '../store/useAppStore';

const W = 320;
const H = 190;
const GRAINS = 48;
const SEED = 0x5eed_1e55;

/** Small deterministic PRNG - identical grains on every machine and reload. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polygonArea(polygon: [number, number][]): number {
  let area = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    area += polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
  }
  return Math.abs(area / 2);
}

function polygonCentroid(polygon: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const cross = polygon[j][0] * polygon[i][1] - polygon[i][0] * polygon[j][1];
    a += cross;
    x += (polygon[j][0] + polygon[i][0]) * cross;
    y += (polygon[j][1] + polygon[i][1]) * cross;
  }
  if (a === 0) return polygon[0];
  return [x / (3 * a), y / (3 * a)];
}

interface Grain {
  polygon: [number, number][];
  area: number;
  /** Stable pseudo-random value used for lamella orientation etc. */
  jitter: number;
}

/** Build the (fixed) grain skeleton once. */
const GRAIN_SKELETON: Grain[] = (() => {
  const random = mulberry32(SEED);
  let points: [number, number][] = Array.from({ length: GRAINS }, () => [
    random() * W,
    random() * H,
  ]);

  // Two rounds of Lloyd relaxation turn random points into believable grains.
  for (let pass = 0; pass < 3; pass++) {
    const voronoi = Delaunay.from(points).voronoi([0, 0, W, H]);
    points = points.map((point, index) => {
      const cell = voronoi.cellPolygon(index) as [number, number][] | null;
      return cell ? polygonCentroid(cell) : point;
    });
  }

  const voronoi = Delaunay.from(points).voronoi([0, 0, W, H]);
  return points.map((_, index) => {
    const polygon = (voronoi.cellPolygon(index) ?? []) as [number, number][];
    return { polygon, area: polygonArea(polygon), jitter: random() };
  });
})();

const TOTAL_AREA = GRAIN_SKELETON.reduce((sum, grain) => sum + grain.area, 0);

/** Deterministic visiting order - shuffled so constituents interleave. */
const VISIT_ORDER = (() => {
  const random = mulberry32(SEED ^ 0x9e37);
  return GRAIN_SKELETON.map((_, index) => index).sort(() => random() - 0.5);
})();

/** Constituents that get their own grains (cementite is drawn as a network). */
const CELL_CONSTITUENTS: ConstituentId[] = [
  'ferrite',
  'pearlite',
  'austenite',
  'ledeburite',
  'delta',
];
/** While the alloy is still mushy, primary cementite really is a solid crystal. */
const MUSHY_CELL_CONSTITUENTS: ConstituentId[] = [...CELL_CONSTITUENTS, 'cementite'];

function assignGrains(structure: Microstructure): Map<number, ConstituentId> {
  const assignment = new Map<number, ConstituentId>();
  const mushy = structure.mode === 'mushy';
  const allowed = mushy ? MUSHY_CELL_CONSTITUENTS : CELL_CONSTITUENTS;
  const cellular = structure.constituents.filter((k) => allowed.includes(k.id));
  const cellularTotal = cellular.reduce((sum, k) => sum + k.fraction, 0);
  if (cellularTotal <= 0) return assignment;

  // Fully solid: the grains tile the whole frame (cementite films are drawn on
  // top of them). Still mushy: the grains only cover the solidified fraction,
  // and the melt shows through everywhere else.
  const scale = mushy ? 1 : 1 / cellularTotal;

  let cursor = 0;
  for (const constituent of cellular) {
    const quota = constituent.fraction * scale * TOTAL_AREA;
    let filled = 0;
    while (cursor < VISIT_ORDER.length && filled < quota - 1e-9) {
      const index = VISIT_ORDER[cursor];
      assignment.set(index, constituent.id);
      filled += GRAIN_SKELETON[index].area;
      cursor++;
    }
  }
  // Rounding remainder (solid state only) goes to the dominant constituent.
  if (!mushy) {
    while (cursor < VISIT_ORDER.length) {
      assignment.set(VISIT_ORDER[cursor], cellular[0].id);
      cursor++;
    }
  }
  return assignment;
}

const toPath = (polygon: [number, number][]) =>
  polygon.length ? `M${polygon.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L')}Z` : '';

export function MicrostructureView({ structure }: { structure: Microstructure }) {
  const theme = useAppStore((s) => s.theme);
  const chrome = CHROME[theme];

  const assignment = useMemo(() => assignGrains(structure), [structure]);
  const cementite = structure.constituents.find((k) => k.id === 'cementite')?.fraction ?? 0;
  const liquid = structure.constituents.find((k) => k.id === 'liquid')?.fraction ?? 0;
  const networkWidth = structure.mode === 'solid' ? Math.min(3.6, Math.sqrt(cementite) * 7) : 0;

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-lg"
      style={{ background: chrome.surfaceSoft }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="block h-full w-full"
      >
        <defs>
          {/* pearlite lamellae, four orientations so colonies read as colonies */}
          {[0, 42, 84, 126].map((angle) => (
            <pattern
              key={angle}
              id={`pearlite-${angle}`}
              patternUnits="userSpaceOnUse"
              width={5}
              height={5}
              patternTransform={`rotate(${angle})`}
            >
              <rect width={5} height={5} fill={CONSTITUENT_COLORS.pearlite} fillOpacity={0.55} />
              <line
                x1={0}
                y1={0}
                x2={0}
                y2={5}
                stroke={CONSTITUENT_COLORS.cementite}
                strokeWidth={1.5}
                strokeOpacity={0.85}
              />
            </pattern>
          ))}
          <pattern id="ledeburite" patternUnits="userSpaceOnUse" width={12} height={12}>
            <rect width={12} height={12} fill={CONSTITUENT_COLORS.cementite} fillOpacity={0.5} />
            <circle cx={4} cy={4} r={2.6} fill={CONSTITUENT_COLORS.pearlite} />
            <circle cx={10} cy={9} r={2.1} fill={CONSTITUENT_COLORS.pearlite} />
            <circle cx={2} cy={10} r={1.5} fill={CONSTITUENT_COLORS.pearlite} />
          </pattern>
          <radialGradient id="melt" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#ffd9a0" />
            <stop offset="45%" stopColor={CONSTITUENT_COLORS.liquid} />
            <stop offset="100%" stopColor="#8c4a12" />
          </radialGradient>
          <filter id="melt-blur">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* melt background */}
        {liquid > 0 && (
          <g>
            <rect width={W} height={H} fill="url(#melt)" opacity={0.92} />
            <g filter="url(#melt-blur)" opacity={0.5}>
              {[0.2, 0.55, 0.8].map((position, index) => (
                <motion.ellipse
                  key={position}
                  initial={{ cx: W * position }}
                  cx={W * position}
                  cy={H * (0.3 + index * 0.22)}
                  rx={40}
                  ry={16}
                  fill="#ffe9c4"
                  animate={{ cx: [W * position, W * (position + 0.06), W * position] }}
                  transition={{ duration: 6 + index, repeat: Infinity, ease: 'easeInOut' }}
                />
              ))}
            </g>
          </g>
        )}

        {/* solid grains */}
        <g>
          {GRAIN_SKELETON.map((grain, index) => {
            const constituent = assignment.get(index);
            if (!constituent) return null;
            const path = toPath(grain.polygon);
            const fill =
              constituent === 'pearlite'
                ? `url(#pearlite-${[0, 42, 84, 126][Math.floor(grain.jitter * 4) % 4]})`
                : constituent === 'ledeburite'
                  ? 'url(#ledeburite)'
                  : CONSTITUENT_COLORS[constituent];

            return (
              <motion.path
                key={index}
                d={path}
                fill={fill}
                fillOpacity={constituent === 'pearlite' || constituent === 'ledeburite' ? 1 : 0.78}
                stroke={chrome.surface}
                strokeOpacity={0.55}
                strokeWidth={0.8}
                initial={false}
                animate={{ opacity: structure.mode === 'mushy' ? 0.96 : 1 }}
                transition={{ duration: 0.35 }}
              />
            );
          })}
        </g>

        {/* proeutectoid / secondary cementite as a grain-boundary network */}
        {networkWidth > 0.2 && (
          <g pointerEvents="none">
            {GRAIN_SKELETON.map((grain, index) =>
              assignment.has(index) ? (
                <path
                  key={`net-${index}`}
                  d={toPath(grain.polygon)}
                  fill="none"
                  stroke={CONSTITUENT_COLORS.cementite}
                  strokeOpacity={0.95}
                  strokeWidth={networkWidth}
                  strokeLinejoin="round"
                />
              ) : null,
            )}
          </g>
        )}

        <rect
          width={W}
          height={H}
          fill="none"
          stroke={chrome.gridStrong}
          strokeWidth={1}
          rx={2}
        />
      </svg>

    </div>
  );
}
