/** Phase and phase-field identifiers plus their display metadata. */

export type Phase = 'L' | 'delta' | 'gamma' | 'alpha' | 'Fe3C';

export type FieldId =
  // single-phase fields
  | 'L'
  | 'delta'
  | 'gamma'
  | 'alpha'
  | 'Fe3C'
  // two-phase fields
  | 'L+delta'
  | 'L+gamma'
  | 'L+Fe3C'
  | 'delta+gamma'
  | 'alpha+gamma'
  | 'gamma+Fe3C'
  | 'alpha+Fe3C';

export interface PhaseMeta {
  id: Phase;
  /** Greek/chemical symbol used in the plot, e.g. "γ". */
  symbol: string;
  /** Crystal structure shorthand (BCC/FCC/orthorhombic). */
  structure: string;
}

export const PHASE_META: Record<Phase, PhaseMeta> = {
  L: { id: 'L', symbol: 'L', structure: '—' },
  delta: { id: 'delta', symbol: 'δ', structure: 'BCC' },
  gamma: { id: 'gamma', symbol: 'γ', structure: 'FCC' },
  alpha: { id: 'alpha', symbol: 'α', structure: 'BCC' },
  Fe3C: { id: 'Fe3C', symbol: 'Fe₃C', structure: 'ortho.' },
};

/** Phases making up each field, ordered left-to-right on the composition axis. */
export const FIELD_PHASES: Record<FieldId, Phase[]> = {
  L: ['L'],
  delta: ['delta'],
  gamma: ['gamma'],
  alpha: ['alpha'],
  Fe3C: ['Fe3C'],
  'L+delta': ['delta', 'L'],
  'L+gamma': ['gamma', 'L'],
  'L+Fe3C': ['L', 'Fe3C'],
  'delta+gamma': ['delta', 'gamma'],
  'alpha+gamma': ['alpha', 'gamma'],
  'gamma+Fe3C': ['gamma', 'Fe3C'],
  'alpha+Fe3C': ['alpha', 'Fe3C'],
};

/** Short label drawn inside the shaded field, e.g. "α + Fe₃C". */
export function fieldLabel(field: FieldId): string {
  return FIELD_PHASES[field].map((p) => PHASE_META[p].symbol).join(' + ');
}

export function isTwoPhase(field: FieldId): boolean {
  return FIELD_PHASES[field].length === 2;
}
