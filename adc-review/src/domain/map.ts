import type { Position } from '../riot/types';

/** Summoner's Rift spans roughly 0..14 800 on both axes; blue base is bottom-left. */
export const MAP_SIZE = 14_800;

export type Zone =
  | 'base'
  | 'botlane'
  | 'toplane'
  | 'midlane'
  | 'river'
  | 'ownJungle'
  | 'enemyJungle';

export const ZONE_LABEL: Record<Zone, string> = {
  base: 'bas',
  botlane: 'botlane',
  toplane: 'toplane',
  midlane: 'midlane',
  river: 'river',
  ownJungle: 'egen jungel',
  enemyJungle: 'fiendens jungel',
};

/**
 * Coarse classification of a map position. Lanes are the outer edges and the
 * main diagonal, the river is the anti-diagonal, everything else is jungle.
 */
export function zoneOf(p: Position, teamId: number): Zone {
  const { x, y } = p;
  if ((x < 3600 && y < 3600) || (x > 11200 && y > 11200)) return 'base';
  if (y < 2400 || x > 12400) return 'botlane';
  if (x < 2400 || y > 12400) return 'toplane';
  if (Math.abs(x - y) < 1300) return 'midlane';
  if (Math.abs(x + y - MAP_SIZE) < 1500) return 'river';
  const blueSide = x + y < MAP_SIZE;
  return blueSide === (teamId === 100) ? 'ownJungle' : 'enemyJungle';
}

export function distance(a: Position, b: Position): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
