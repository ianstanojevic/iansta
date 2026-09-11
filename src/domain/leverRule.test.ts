import { describe, expect, it } from 'vitest';
import { formatFraction, leverRule } from './leverRule';

describe('leverRule', () => {
  it('splits a tie line in inverse proportion to the arms', () => {
    // C0 sits 1/4 of the way along the tie line -> 75 % of the left phase.
    const r = leverRule(1, 0, 4);
    expect(r.fractionLeft).toBeCloseTo(0.75, 12);
    expect(r.fractionRight).toBeCloseTo(0.25, 12);
    expect(r.armLeft).toBeCloseTo(3, 12);
    expect(r.armRight).toBeCloseTo(1, 12);
    expect(r.tieLine).toBeCloseTo(4, 12);
  });

  it('always conserves mass', () => {
    for (let c0 = 0; c0 <= 6.67; c0 += 0.13) {
      const r = leverRule(c0, 0.022, 6.67);
      expect(r.fractionLeft + r.fractionRight).toBeCloseTo(1, 12);
    }
  });

  it('reproduces the textbook eutectoid split (88.9 % ferrite / 11.1 % cementite)', () => {
    const r = leverRule(0.76, 0.022, 6.67);
    expect(r.fractionLeft * 100).toBeCloseTo(88.9, 1);
    expect(r.fractionRight * 100).toBeCloseTo(11.1, 1);
  });

  it('returns pure phases at the ends of the tie line', () => {
    expect(leverRule(0.022, 0.022, 6.67).fractionLeft).toBe(1);
    expect(leverRule(6.67, 0.022, 6.67).fractionRight).toBeCloseTo(1, 12);
  });

  it('clamps compositions that fall marginally outside the tie line', () => {
    const below = leverRule(0.0219999, 0.022, 6.67);
    expect(below.fractionLeft).toBe(1);
    expect(below.fractionRight).toBe(0);
    const above = leverRule(6.6700001, 0.022, 6.67);
    expect(above.fractionRight).toBeCloseTo(1, 12);
  });

  it('degrades gracefully when the tie line collapses', () => {
    const r = leverRule(2, 2, 2);
    expect(r.fractionLeft).toBe(1);
    expect(r.fractionRight).toBe(0);
    expect(Number.isFinite(r.fractionLeft)).toBe(true);
  });
});

describe('formatFraction', () => {
  it('avoids printing a misleading 0.0 % or 100.0 %', () => {
    expect(formatFraction(0.0002)).toBe('<0.1');
    expect(formatFraction(0.9999)).toBe('>99.9');
    expect(formatFraction(0)).toBe('0.0');
    expect(formatFraction(1)).toBe('100.0');
    expect(formatFraction(0.889)).toBe('88.9');
  });
});
