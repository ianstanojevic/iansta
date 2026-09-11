import { describe, expect, it } from 'vitest';
import {
  ALL_CURVES,
  a3,
  acm,
  alphaSolvus,
  cementiteLiquidus,
  deltaLiquidus,
  gammaLiquidus,
  gammaSolidus,
} from './curves';
import { CEMENTITE_MELT_T, EUTECTIC, EUTECTOID, FE_MELTING_C, PERITECTIC } from './constants';

describe('boundary curves', () => {
  it('passes exactly through the invariant points', () => {
    expect(gammaLiquidus.tempAt(EUTECTIC.cLiquid)).toBeCloseTo(EUTECTIC.T, 9);
    expect(gammaSolidus.tempAt(EUTECTIC.cGamma)).toBeCloseTo(EUTECTIC.T, 9);
    expect(acm.tempAt(EUTECTOID.cGamma)).toBeCloseTo(EUTECTOID.T, 9);
    expect(a3.tempAt(EUTECTOID.cGamma)).toBeCloseTo(EUTECTOID.T, 9);
    expect(a3.tempAt(0)).toBeCloseTo(912, 9);
    expect(deltaLiquidus.tempAt(0)).toBeCloseTo(FE_MELTING_C, 9);
    expect(deltaLiquidus.tempAt(PERITECTIC.cLiquid)).toBeCloseTo(PERITECTIC.T, 9);
    expect(cementiteLiquidus.tempAt(6.67)).toBeCloseTo(CEMENTITE_MELT_T, 9);
  });

  it('is monotone in temperature along every boundary', () => {
    for (const curve of ALL_CURVES) {
      const [c0, c1] = curve.cRange;
      let previous = curve.tempAt(c0);
      let direction = 0;
      for (let i = 1; i <= 50; i++) {
        const T = curve.tempAt(c0 + ((c1 - c0) * i) / 50);
        const step = Math.sign(T - previous);
        if (step !== 0) {
          if (direction === 0) direction = step;
          expect(step, `${curve.id} reverses direction`).toBe(direction);
        }
        previous = T;
      }
    }
  });

  it('round-trips between tempAt and compositionAt', () => {
    for (const curve of ALL_CURVES) {
      const [c0, c1] = curve.cRange;
      for (let i = 0; i <= 20; i++) {
        const c = c0 + ((c1 - c0) * i) / 20;
        const T = curve.tempAt(c);
        expect(curve.compositionAt(T)).toBeCloseTo(c, 6);
      }
    }
  });

  it('clamps outside its own range instead of extrapolating', () => {
    expect(acm.tempAt(0)).toBeCloseTo(EUTECTOID.T, 9);
    expect(acm.tempAt(6.67)).toBeCloseTo(EUTECTIC.T, 9);
    expect(gammaLiquidus.compositionAt(2000)).toBeCloseTo(PERITECTIC.cLiquid, 9);
    expect(gammaLiquidus.compositionAt(0)).toBeCloseTo(EUTECTIC.cLiquid, 9);
  });

  it('models carbon solubility in ferrite correctly (0.022 % max, ~0.008 % at RT)', () => {
    expect(alphaSolvus.compositionAt(EUTECTOID.T)).toBeCloseTo(0.022, 6);
    expect(alphaSolvus.compositionAt(20)).toBeLessThan(0.009);
    expect(alphaSolvus.compositionAt(20)).toBeGreaterThan(0.007);
  });
});
