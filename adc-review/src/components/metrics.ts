import type { GameAnalysis, LineStats } from '../domain/analyzeGame';
import { fmtClock, fmtNum, fmtPct } from './format';

/** Rows of the "you vs lane opponent" comparison. */
export interface Metric {
  label: string;
  get: (s: LineStats) => number | null;
  format: (v: number | null) => string;
  /** Format a difference (you − opponent). */
  diff: (v: number) => string;
  higherIsBetter: boolean;
}

const sgn = (v: number, s: string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${s}`;

export const METRICS: Metric[] = [
  { label: 'CS @10', get: (s) => s.cs10, format: (v) => fmtNum(v, 1), diff: (v) => sgn(v, Math.abs(v).toFixed(1)), higherIsBetter: true },
  { label: 'CS @15', get: (s) => s.cs15, format: (v) => fmtNum(v, 1), diff: (v) => sgn(v, Math.abs(v).toFixed(1)), higherIsBetter: true },
  { label: 'Guld @15', get: (s) => s.gold15, format: (v) => fmtNum(v), diff: (v) => sgn(v, Math.abs(v).toFixed(0)), higherIsBetter: true },
  { label: 'XP @15', get: (s) => s.xp15, format: (v) => fmtNum(v), diff: (v) => sgn(v, Math.abs(v).toFixed(0)), higherIsBetter: true },
  { label: 'Dödsfall före 15', get: (s) => s.deathsPre15, format: (v) => fmtNum(v, 2), diff: (v) => sgn(v, Math.abs(v).toFixed(2)), higherIsBetter: false },
  { label: 'CS/min totalt', get: (s) => s.csPerMin, format: (v) => fmtNum(v, 2), diff: (v) => sgn(v, Math.abs(v).toFixed(2)), higherIsBetter: true },
  { label: 'CS/min efter 15', get: (s) => s.csPerMinPost15, format: (v) => fmtNum(v, 2), diff: (v) => sgn(v, Math.abs(v).toFixed(2)), higherIsBetter: true },
  { label: 'Första legendary', get: (s) => s.firstItemMin, format: (v) => fmtClock(v), diff: (v) => sgn(v, `${Math.abs(v * 60).toFixed(0)} s`), higherIsBetter: false },
  { label: 'Damage-andel', get: (s) => s.damageShare, format: (v) => fmtPct(v, 1), diff: (v) => sgn(v, `${Math.abs(v * 100).toFixed(1)} pp`), higherIsBetter: true },
  { label: 'Skada per guld', get: (s) => s.damagePerGold, format: (v) => fmtNum(v, 2), diff: (v) => sgn(v, Math.abs(v).toFixed(2)), higherIsBetter: true },
  { label: 'Andel mottagen skada', get: (s) => s.damageTakenShare, format: (v) => fmtPct(v, 1), diff: (v) => sgn(v, `${Math.abs(v * 100).toFixed(1)} pp`), higherIsBetter: false },
  { label: 'Kill participation', get: (s) => s.killParticipation, format: (v) => fmtPct(v), diff: (v) => sgn(v, `${Math.abs(v * 100).toFixed(0)} pp`), higherIsBetter: true },
  { label: 'Dödsfall', get: (s) => s.deaths, format: (v) => fmtNum(v, 1), diff: (v) => sgn(v, Math.abs(v).toFixed(1)), higherIsBetter: false },
  { label: 'Tid död', get: (s) => s.timeDeadShare, format: (v) => fmtPct(v, 1), diff: (v) => sgn(v, `${Math.abs(v * 100).toFixed(1)} pp`), higherIsBetter: false },
  { label: 'Vision/min', get: (s) => s.visionPerMin, format: (v) => fmtNum(v, 2), diff: (v) => sgn(v, Math.abs(v).toFixed(2)), higherIsBetter: true },
  { label: 'Control wards', get: (s) => s.controlWards, format: (v) => fmtNum(v, 1), diff: (v) => sgn(v, Math.abs(v).toFixed(1)), higherIsBetter: true },
];

export function averageRow(games: GameAnalysis[], m: Metric) {
  const pairs = games
    .filter((g) => g.opp)
    .map((g) => [m.get(g.me), m.get(g.opp!)] as const)
    .filter((p): p is readonly [number, number] => p[0] !== null && p[1] !== null);
  if (!pairs.length) return null;
  const me = pairs.reduce((s, p) => s + p[0], 0) / pairs.length;
  const opp = pairs.reduce((s, p) => s + p[1], 0) / pairs.length;
  return { me, opp, diff: me - opp };
}
