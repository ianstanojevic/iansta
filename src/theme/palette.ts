/**
 * Colour system for the diagram.
 *
 * One rule keeps the eleven phase fields readable instead of rainbow soup:
 * every *single-phase* field owns a hue, and every *two-phase* field is the
 * gamma-correct blend of its two parents. So "α + Fe₃C" is literally ferrite
 * green mixed with cementite rose, and the eye can decode the diagram without
 * consulting the legend.
 */

import type { FieldId, Phase } from '../domain/phases';
import { FIELD_PHASES } from '../domain/phases';

export type ThemeMode = 'dark' | 'light';

/** Base hue per phase, tuned for the dark laboratory theme. */
export const PHASE_COLORS: Record<Phase, string> = {
  L: '#f0a03c',
  delta: '#b78bf0',
  gamma: '#3fb0e8',
  alpha: '#4fd1a5',
  Fe3C: '#f4677f',
};

/** Slightly deepened hues so the same palette reads on a white ground. */
export const PHASE_COLORS_LIGHT: Record<Phase, string> = {
  L: '#d9781a',
  delta: '#8b5fd6',
  gamma: '#1a80bb',
  alpha: '#199e73',
  Fe3C: '#d93a58',
};

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Blend two colours in linear light (sRGB gamma 2.2) - mixing in raw sRGB muddies. */
export function mixHex(a: string, b: string, t = 0.5): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const blend = (x: number, y: number) =>
    Math.pow(Math.pow(x / 255, 2.2) * (1 - t) + Math.pow(y / 255, 2.2) * t, 1 / 2.2) * 255;
  return rgbToHex([blend(ar, br), blend(ag, bg), blend(ab, bb)]);
}

/** Representative colour of a phase field (blend for the two-phase fields). */
export function fieldColor(field: FieldId, mode: ThemeMode = 'dark'): string {
  const table = mode === 'dark' ? PHASE_COLORS : PHASE_COLORS_LIGHT;
  const phases = FIELD_PHASES[field];
  if (phases.length === 1) return table[phases[0]];
  return mixHex(table[phases[0]], table[phases[1]], 0.5);
}

/** Fill opacity: single-phase fields sit forward, two-phase fields recede. */
export function fieldOpacity(field: FieldId, mode: ThemeMode = 'dark'): number {
  const twoPhase = FIELD_PHASES[field].length === 2;
  if (mode === 'dark') return twoPhase ? 0.26 : 0.34;
  return twoPhase ? 0.2 : 0.26;
}

/**
 * Two-phase fields are filled with a gradient running from the left phase's
 * colour to the right phase's colour. Because the gradient uses the default
 * object bounding box, it lines up with the tie line automatically: the colour
 * at any point tells you which phase you are closest to.
 */
export function fieldGradient(field: FieldId, mode: ThemeMode = 'dark'): [string, string] {
  const table = mode === 'dark' ? PHASE_COLORS : PHASE_COLORS_LIGHT;
  const phases = FIELD_PHASES[field];
  return phases.length === 2
    ? [table[phases[0]], table[phases[1]]]
    : [table[phases[0]], table[phases[0]]];
}

/** DOM-safe id fragment for a field ("alpha+Fe3C" -> "alpha-Fe3C"). */
export const fieldSlug = (field: FieldId) => field.replace('+', '-');

/** Colour used for the schematic micrograph. */
export const CONSTITUENT_COLORS = {
  liquid: '#f0a03c',
  delta: '#b78bf0',
  austenite: '#3fb0e8',
  ferrite: '#4fd1a5',
  pearlite: '#7d93b5',
  cementite: '#f4677f',
  ledeburite: '#c78ab0',
} as const;

/** Accent used for markers, active lines and focus rings. */
export const ACCENT = '#48d6c4';

/** Non-phase colours (axes, grid, panels) for the SVG layers. */
export interface Chrome {
  grid: string;
  gridStrong: string;
  axis: string;
  text: string;
  textMuted: string;
  boundary: string;
  boundaryStrong: string;
  surface: string;
  surfaceSoft: string;
  marker: string;
  hatch: string;
}

export const CHROME: Record<ThemeMode, Chrome> = {
  dark: {
    grid: 'rgba(148, 180, 205, 0.07)',
    gridStrong: 'rgba(148, 180, 205, 0.16)',
    axis: 'rgba(169, 188, 204, 0.55)',
    text: '#e8eff4',
    textMuted: '#7a8fa4',
    boundary: 'rgba(226, 240, 250, 0.62)',
    boundaryStrong: '#eaf4fb',
    surface: '#0b1017',
    surfaceSoft: '#0f151e',
    marker: ACCENT,
    hatch: 'rgba(232, 239, 244, 0.055)',
  },
  light: {
    grid: 'rgba(30, 60, 90, 0.07)',
    gridStrong: 'rgba(30, 60, 90, 0.16)',
    axis: 'rgba(38, 60, 80, 0.6)',
    text: '#12202c',
    textMuted: '#5b7186',
    boundary: 'rgba(18, 32, 44, 0.66)',
    boundaryStrong: '#0d1a24',
    surface: '#ffffff',
    surfaceSoft: '#f2f6f9',
    marker: '#0f9c8c',
    hatch: 'rgba(18, 32, 44, 0.07)',
  },
};
