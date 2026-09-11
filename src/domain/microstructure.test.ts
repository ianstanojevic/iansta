import { describe, expect, it } from 'vitest';
import { classifyAlloy, microstructureAt, type ConstituentId } from './microstructure';
import { CEMENTITE_C, EUTECTIC, EUTECTOID } from './constants';

const fractionOf = (c: number, T: number, id: ConstituentId) =>
  microstructureAt(c, T).constituents.find((k) => k.id === id)?.fraction ?? 0;

describe('classifyAlloy', () => {
  it('splits the diagram into the standard alloy families', () => {
    expect(classifyAlloy(0.002)).toBe('pure-iron');
    expect(classifyAlloy(0.2)).toBe('hypoeutectoid-steel');
    expect(classifyAlloy(EUTECTOID.cGamma)).toBe('eutectoid-steel');
    expect(classifyAlloy(1.2)).toBe('hypereutectoid-steel');
    expect(classifyAlloy(3.0)).toBe('hypoeutectic-cast-iron');
    expect(classifyAlloy(EUTECTIC.cLiquid)).toBe('eutectic-cast-iron');
    expect(classifyAlloy(5.5)).toBe('hypereutectic-cast-iron');
    expect(classifyAlloy(CEMENTITE_C)).toBe('cementite');
  });
});

describe('microstructureAt', () => {
  it('always sums to 100 %', () => {
    for (let c = 0; c <= CEMENTITE_C; c += 0.09) {
      for (let T = 20; T <= 1600; T += 23) {
        const total = microstructureAt(c, T).constituents.reduce((s, k) => s + k.fraction, 0);
        expect(total, `${c} wt% / ${T} degC`).toBeCloseTo(1, 9);
      }
    }
  });

  it('is molten above the liquidus and mushy inside it', () => {
    expect(microstructureAt(0.4, 1580).mode).toBe('melt');
    expect(microstructureAt(3.0, 1250).mode).toBe('mushy');
    expect(microstructureAt(3.0, 1250).solidFraction).toBeGreaterThan(0);
    expect(microstructureAt(3.0, 1250).solidFraction).toBeLessThan(1);
    expect(microstructureAt(0.4, 600).mode).toBe('solid');
  });

  it('reproduces the textbook pearlite fraction of a 0.4 % C steel (~51 %)', () => {
    expect(fractionOf(0.4, 600, 'pearlite') * 100).toBeCloseTo(51.2, 0);
    expect(fractionOf(0.4, 600, 'ferrite') * 100).toBeCloseTo(48.8, 0);
  });

  it('makes eutectoid steel 100 % pearlite', () => {
    expect(fractionOf(EUTECTOID.cGamma, 600, 'pearlite')).toBeCloseTo(1, 3);
  });

  it('adds a proeutectoid cementite network above 0.76 % C', () => {
    expect(fractionOf(1.0, 600, 'pearlite') * 100).toBeCloseTo(95.9, 0);
    expect(fractionOf(1.0, 600, 'cementite') * 100).toBeCloseTo(4.1, 0);
  });

  it('makes the eutectic cast iron fully ledeburitic', () => {
    expect(fractionOf(EUTECTIC.cLiquid, 1100, 'ledeburite')).toBeCloseTo(1, 2);
  });

  it('splits a hypoeutectic cast iron into primary austenite and ledeburite', () => {
    const expected = (3.0 - EUTECTIC.cGamma) / (EUTECTIC.cLiquid - EUTECTIC.cGamma);
    expect(fractionOf(3.0, 1100, 'ledeburite')).toBeCloseTo(expected, 2);
    expect(fractionOf(3.0, 1100, 'austenite')).toBeGreaterThan(0.4);
    // ...and below 727 degC that austenite has become pearlite.
    expect(fractionOf(3.0, 500, 'austenite')).toBe(0);
    expect(fractionOf(3.0, 500, 'pearlite')).toBeGreaterThan(0.4);
  });

  it('gives a hypereutectic cast iron primary cementite', () => {
    const expected = (5.5 - EUTECTIC.cLiquid) / (CEMENTITE_C - EUTECTIC.cLiquid);
    expect(fractionOf(5.5, 1100, 'cementite')).toBeCloseTo(expected, 2);
  });

  it('has no austenite left anywhere below the eutectoid temperature', () => {
    for (let c = 0; c <= CEMENTITE_C; c += 0.13) {
      expect(fractionOf(c, EUTECTOID.T - 1, 'austenite')).toBe(0);
    }
  });

  it('keeps pure iron essentially single-phase ferrite', () => {
    expect(fractionOf(0.002, 400, 'ferrite')).toBeGreaterThan(0.99);
    expect(fractionOf(0.002, 1000, 'austenite')).toBeCloseTo(1, 6);
    expect(fractionOf(0.002, 1450, 'delta')).toBeCloseTo(1, 6);
  });
});
