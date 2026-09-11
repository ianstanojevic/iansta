/** Ready-made alloys: the points people actually care about on this diagram. */

import { EUTECTIC, EUTECTOID } from './constants';

export type PresetId =
  | 'armco'
  | '1020'
  | '1045'
  | 'eutectoid'
  | '1095'
  | 'castIron30'
  | 'castIron43'
  | 'castIron55';

export interface AlloyPreset {
  id: PresetId;
  /** Carbon content, wt%. */
  c: number;
  /** Temperature to jump to - chosen to show the alloy's defining structure. */
  T: number;
  /** Short label drawn on the chip. */
  short: string;
}

export const PRESETS: AlloyPreset[] = [
  { id: 'armco', c: 0.02, T: 400, short: 'Fe' },
  { id: '1020', c: 0.2, T: 400, short: '1020' },
  { id: '1045', c: 0.45, T: 400, short: '1045' },
  { id: 'eutectoid', c: EUTECTOID.cGamma, T: 400, short: '0.76' },
  { id: '1095', c: 0.95, T: 400, short: '1095' },
  { id: 'castIron30', c: 3.0, T: 900, short: '3.0' },
  { id: 'castIron43', c: EUTECTIC.cLiquid, T: 900, short: '4.3' },
  { id: 'castIron55', c: 5.5, T: 900, short: '5.5' },
];

/** The preset matching a composition, if the marker is sitting on one. */
export function presetFor(c: number): AlloyPreset | null {
  return PRESETS.find((p) => Math.abs(p.c - c) < 1e-6) ?? null;
}
