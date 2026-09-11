import { describe, expect, it } from 'vitest';
import { classifyPoint, isothermalSection, meltingRange, segmentAt } from './diagram';
import { buildFieldPolygons } from './regions';
import { CEMENTITE_C, EUTECTIC, EUTECTOID, PERITECTIC } from './constants';
import type { FieldId } from './phases';

const fieldAt = (c: number, T: number): FieldId => classifyPoint(c, T).field;

describe('isothermalSection', () => {
  it('tiles the whole composition axis with no gaps or overlaps', () => {
    for (let T = 0; T <= 1600; T += 3.5) {
      const section = isothermalSection(T);
      expect(section.length, `no segments at ${T} degC`).toBeGreaterThan(0);
      expect(section[0].cLeft).toBeCloseTo(0, 9);
      expect(section[section.length - 1].cRight).toBeCloseTo(CEMENTITE_C, 9);
      for (let i = 1; i < section.length; i++) {
        expect(section[i].cLeft, `gap at ${T} degC`).toBeCloseTo(section[i - 1].cRight, 9);
      }
    }
  });

  it('produces strictly increasing, non-degenerate segments', () => {
    for (let T = 0; T <= 1600; T += 7) {
      for (const s of isothermalSection(T)) {
        expect(s.cRight).toBeGreaterThan(s.cLeft);
      }
    }
  });

  it('is fully liquid above the melting point of iron', () => {
    const section = isothermalSection(1560);
    expect(section).toHaveLength(1);
    expect(section[0].field).toBe('L');
  });

  it('reproduces the five-field cut just below the peritectic', () => {
    expect(isothermalSection(1450).map((s) => s.field)).toEqual([
      'delta',
      'delta+gamma',
      'gamma',
      'L+gamma',
      'L',
    ]);
  });

  it('reproduces the two-field cut below the eutectoid', () => {
    expect(isothermalSection(500).map((s) => s.field)).toEqual(['alpha', 'alpha+Fe3C']);
  });
});

describe('classifyPoint', () => {
  it('identifies the single-phase fields', () => {
    expect(fieldAt(0.4, 1000)).toBe('gamma');
    expect(fieldAt(0.005, 400)).toBe('alpha');
    expect(fieldAt(0.03, 1500)).toBe('delta');
    expect(fieldAt(3.0, 1450)).toBe('L');
    expect(fieldAt(CEMENTITE_C, 900)).toBe('Fe3C');
  });

  it('identifies the two-phase fields', () => {
    expect(fieldAt(0.4, 800)).toBe('alpha+gamma');
    expect(fieldAt(0.4, 400)).toBe('alpha+Fe3C');
    expect(fieldAt(1.5, 900)).toBe('gamma+Fe3C');
    expect(fieldAt(3.0, 1250)).toBe('L+gamma');
    expect(fieldAt(6.0, 1160)).toBe('L+Fe3C');
    expect(fieldAt(0.1, 1500)).toBe('L+delta');
    expect(fieldAt(0.07, 1450)).toBe('delta+gamma');
  });

  it('conserves mass in every two-phase field', () => {
    for (let c = 0; c <= CEMENTITE_C; c += 0.07) {
      for (let T = 0; T <= 1600; T += 11) {
        const total = classifyPoint(c, T).phases.reduce((sum, p) => sum + p.fraction, 0);
        expect(total, `mass not conserved at ${c} wt% / ${T} degC`).toBeCloseTo(1, 9);
      }
    }
  });

  it('never reports a negative or >100 % phase fraction', () => {
    for (let c = 0; c <= CEMENTITE_C; c += 0.031) {
      for (let T = 0; T <= 1600; T += 13) {
        for (const p of classifyPoint(c, T).phases) {
          expect(p.fraction).toBeGreaterThanOrEqual(0);
          expect(p.fraction).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('gives the textbook phase split for a 0.4 wt% C steel just below A1', () => {
    // Classic worked example: ~94 % ferrite, ~6 % cementite.
    const { phases } = classifyPoint(0.4, EUTECTOID.T - 1);
    const ferrite = phases.find((p) => p.phase === 'alpha')!;
    const cementite = phases.find((p) => p.phase === 'Fe3C')!;
    expect(ferrite.fraction * 100).toBeCloseTo(94.3, 0);
    expect(cementite.fraction * 100).toBeCloseTo(5.7, 0);
    expect(cementite.composition).toBeCloseTo(CEMENTITE_C, 9);
  });

  it('gives 88.9 / 11.1 for eutectoid steel just below A1', () => {
    const { phases } = classifyPoint(EUTECTOID.cGamma, EUTECTOID.T - 1);
    expect(phases[0].fraction * 100).toBeCloseTo(88.9, 0);
    expect(phases[1].fraction * 100).toBeCloseTo(11.1, 0);
  });

  it('places eutectoid steel in single-phase austenite just above A1', () => {
    expect(fieldAt(EUTECTOID.cGamma, EUTECTOID.T + 2)).toBe('gamma');
  });

  it('treats cementite as a line compound', () => {
    const state = classifyPoint(CEMENTITE_C, 600);
    expect(state.field).toBe('Fe3C');
    expect(state.phases).toHaveLength(1);
    expect(state.phases[0].fraction).toBe(1);
  });

  it('flags the three invariant reactions', () => {
    expect(classifyPoint(3.0, EUTECTIC.T).invariant).toBe('eutectic');
    expect(classifyPoint(0.4, EUTECTOID.T).invariant).toBe('eutectoid');
    expect(classifyPoint(0.3, PERITECTIC.T).invariant).toBe('peritectic');
    // Outside the composition span of the reaction there is no invariant.
    expect(classifyPoint(1.5, PERITECTIC.T).invariant).toBeNull();
    expect(classifyPoint(0.001, EUTECTOID.T).invariant).toBeNull();
  });

  it('handles the edges of the plotted window', () => {
    expect(classifyPoint(0, 20).field).toBe('alpha');
    expect(classifyPoint(0, 1000).field).toBe('gamma');
    expect(classifyPoint(0, 1450).field).toBe('delta');
    expect(classifyPoint(0, 1590).field).toBe('L');
    expect(classifyPoint(-1, 500).outside).toBe(true);
    expect(classifyPoint(8, 500).outside).toBe(true);
    expect(classifyPoint(2, 1700).outside).toBe(true);
    // ...and still returns a usable answer rather than throwing.
    expect(classifyPoint(8, 1700).field).toBe('L');
  });

  it('agrees with segmentAt', () => {
    const s = segmentAt(800, 0.4);
    expect(s.field).toBe('alpha+gamma');
    expect(classifyPoint(0.4, 800).phases[1].composition).toBeCloseTo(s.cRight, 9);
  });
});

describe('meltingRange', () => {
  it('starts and ends at the melting point of pure iron', () => {
    const pure = meltingRange(0);
    expect(pure.solidus).toBeCloseTo(1538, 9);
    expect(pure.liquidus).toBeCloseTo(1538, 9);
  });

  it('has the eutectic alloy melting at a single temperature', () => {
    const eutectic = meltingRange(EUTECTIC.cLiquid);
    expect(eutectic.solidus).toBeCloseTo(EUTECTIC.T, 9);
    expect(eutectic.liquidus).toBeCloseTo(EUTECTIC.T, 9);
  });

  it('keeps the solidus below the liquidus for every alloy', () => {
    for (let c = 0; c <= CEMENTITE_C; c += 0.05) {
      const { solidus, liquidus } = meltingRange(c);
      expect(liquidus).toBeGreaterThanOrEqual(solidus - 1e-9);
    }
  });
});

describe('buildFieldPolygons', () => {
  const polygons = buildFieldPolygons();

  it('produces one closed ring per two-dimensional field', () => {
    const fields = polygons.map((p) => p.field).sort();
    expect(fields).toEqual(
      [
        'L',
        'L+Fe3C',
        'L+delta',
        'L+gamma',
        'alpha',
        'alpha+Fe3C',
        'alpha+gamma',
        'delta',
        'delta+gamma',
        'gamma',
        'gamma+Fe3C',
      ].sort(),
    );
    for (const p of polygons) expect(p.points.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps every vertex inside the plotted window', () => {
    for (const { points } of polygons) {
      for (const [c, T] of points) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(CEMENTITE_C + 1e-9);
        expect(T).toBeGreaterThanOrEqual(0);
        expect(T).toBeLessThanOrEqual(1600 + 1e-9);
      }
    }
  });

  it('simplifies straight boundaries away (the shading stays lightweight)', () => {
    const total = polygons.reduce((n, p) => n + p.points.length, 0);
    expect(total).toBeLessThan(700);
  });
});
