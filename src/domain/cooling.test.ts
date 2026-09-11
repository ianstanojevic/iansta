import { describe, expect, it } from 'vitest';
import { coolingCurve, coolingEvents, temperatureAtTime } from './cooling';
import { EUTECTIC, EUTECTOID, PERITECTIC, ROOM_T } from './constants';

const kinds = (c: number) => coolingEvents(c).map((e) => e.kind);

describe('coolingEvents', () => {
  it('always starts in the melt and ends at room temperature', () => {
    for (const c of [0, 0.4, 0.76, 1.2, 3, 4.3, 5.5]) {
      const events = coolingEvents(c);
      expect(events[0].kind).toBe('start');
      expect(events[0].toField).toBe('L');
      expect(events[events.length - 1].kind).toBe('end');
      expect(events[events.length - 1].T).toBe(ROOM_T);
    }
  });

  it('reports strictly decreasing temperatures', () => {
    for (const c of [0.2, 0.8, 2.5, 4.3, 6.0]) {
      const temps = coolingEvents(c).map((e) => e.T);
      for (let i = 1; i < temps.length; i++) expect(temps[i]).toBeLessThan(temps[i - 1]);
    }
  });

  it('takes a 0.4 % C steel through the peritectic and the eutectoid', () => {
    const events = coolingEvents(0.4);
    expect(kinds(0.4)).toContain('peritectic');
    expect(kinds(0.4)).toContain('eutectoid');
    expect(kinds(0.4)).toContain('a3');
    const peritectic = events.find((e) => e.kind === 'peritectic')!;
    expect(peritectic.T).toBeCloseTo(PERITECTIC.T, 3);
    const eutectoid = events.find((e) => e.kind === 'eutectoid')!;
    expect(eutectoid.T).toBeCloseTo(EUTECTOID.T, 3);
    expect(eutectoid.toField).toBe('alpha+Fe3C');
  });

  it('sends eutectoid steel straight from austenite to pearlite (no A3 arrest)', () => {
    const list = kinds(EUTECTOID.cGamma);
    expect(list).toContain('eutectoid');
    expect(list).not.toContain('a3');
    expect(list).not.toContain('acm');
    const eutectoid = coolingEvents(EUTECTOID.cGamma).find((e) => e.kind === 'eutectoid')!;
    // The whole alloy transforms at 727 degC.
    expect(eutectoid.transformedFraction).toBeCloseTo(1, 2);
    expect(eutectoid.fromField).toBe('gamma');
  });

  it('precipitates proeutectoid cementite in a 1.2 % C steel', () => {
    expect(kinds(1.2)).toContain('acm');
    expect(kinds(1.2)).not.toContain('a3');
  });

  it('solidifies the eutectic alloy at a single temperature', () => {
    const events = coolingEvents(EUTECTIC.cLiquid);
    const eutectic = events.find((e) => e.kind === 'eutectic')!;
    expect(eutectic.T).toBeCloseTo(EUTECTIC.T, 3);
    expect(eutectic.transformedFraction).toBeCloseTo(1, 2);
    expect(events.filter((e) => e.kind === 'liquidus')).toHaveLength(0);
  });

  it('gives a hypoeutectic cast iron primary austenite before the eutectic', () => {
    const events = coolingEvents(3.0);
    const liquidus = events.find((e) => e.kind === 'liquidus')!;
    expect(liquidus.appears).toEqual(['gamma']);
    const eutectic = events.find((e) => e.kind === 'eutectic')!;
    // Lever rule at 1147 degC: liquid fraction = (3.0 - 2.14) / (4.3 - 2.14).
    expect(eutectic.transformedFraction).toBeCloseTo((3.0 - 2.14) / (4.3 - 2.14), 2);
  });

  it('gives a hypereutectic cast iron primary cementite before the eutectic', () => {
    const events = coolingEvents(5.5);
    const liquidus = events.find((e) => e.kind === 'liquidus')!;
    expect(liquidus.appears).toEqual(['Fe3C']);
    expect(kinds(5.5)).toContain('eutectic');
  });

  it('takes pure iron through delta -> gamma -> alpha with no two-phase fields', () => {
    const fields = coolingEvents(0).map((e) => e.toField);
    expect(fields).toContain('delta');
    expect(fields).toContain('gamma');
    expect(fields).toContain('alpha');
    expect(fields).not.toContain('alpha+Fe3C');
  });
});

describe('coolingCurve', () => {
  it('is monotone in time and temperature', () => {
    for (const c of [0.2, 0.76, 3.0, 4.3]) {
      const path = coolingCurve(c);
      expect(path.samples[0].t).toBe(0);
      expect(path.samples[path.samples.length - 1].t).toBeCloseTo(1, 9);
      for (let i = 1; i < path.samples.length; i++) {
        expect(path.samples[i].t).toBeGreaterThanOrEqual(path.samples[i - 1].t);
        expect(path.samples[i].T).toBeLessThanOrEqual(path.samples[i - 1].T);
      }
    }
  });

  it('starts above the liquidus and ends at room temperature', () => {
    const path = coolingCurve(1.0);
    expect(path.startT).toBeGreaterThan(1450);
    expect(path.samples[path.samples.length - 1].T).toBeCloseTo(ROOM_T, 6);
  });

  it('produces a long thermal arrest for the eutectic alloy', () => {
    const eutectic = coolingCurve(EUTECTIC.cLiquid);
    const steel = coolingCurve(0.2);
    const arrestLength = (path: ReturnType<typeof coolingCurve>, T: number) => {
      const at = path.samples.filter((s) => Math.abs(s.T - T) < 0.51);
      return at.length < 2 ? 0 : at[at.length - 1].t - at[0].t;
    };
    expect(arrestLength(eutectic, EUTECTIC.T)).toBeGreaterThan(0.1);
    // A 0.2 % C steel only has ~24 % pearlite, so its 727 degC arrest is short.
    expect(arrestLength(steel, EUTECTOID.T)).toBeLessThan(arrestLength(eutectic, EUTECTIC.T));
    expect(arrestLength(steel, EUTECTOID.T)).toBeGreaterThan(0);
  });

  it('reads temperatures back off the curve', () => {
    const path = coolingCurve(0.45);
    expect(temperatureAtTime(path, 0)).toBe(path.startT);
    expect(temperatureAtTime(path, 1)).toBeCloseTo(ROOM_T, 6);
    expect(temperatureAtTime(path, -5)).toBe(path.startT);
    expect(temperatureAtTime(path, 5)).toBeCloseTo(ROOM_T, 6);
    let previous = Infinity;
    for (let t = 0; t <= 1; t += 0.02) {
      const T = temperatureAtTime(path, t);
      expect(T).toBeLessThanOrEqual(previous + 1e-9);
      previous = T;
    }
  });

  it('places every event on the curve in chronological order', () => {
    const path = coolingCurve(3.0);
    for (let i = 1; i < path.eventTimes.length; i++) {
      expect(path.eventTimes[i]).toBeGreaterThanOrEqual(path.eventTimes[i - 1]);
    }
    path.events.forEach((event, i) => {
      if (event.kind === 'start' || event.kind === 'end') return;
      expect(temperatureAtTime(path, path.eventTimes[i])).toBeCloseTo(event.T, 0);
    });
  });
});

describe('invariant reaction sizes', () => {
  it('measures the peritectic by the austenite it produces, not by the melt present', () => {
    // L (0.53) + delta (0.09) -> gamma (0.17): a 0.45 % C alloy is 82 % liquid
    // at 1495 degC, but only (0.53 - 0.45) / (0.53 - 0.17) = 22 % of it reacts.
    const peritectic = coolingEvents(0.45).find((e) => e.kind === 'peritectic')!;
    expect(peritectic.transformedFraction).toBeCloseTo((0.53 - 0.45) / (0.53 - 0.17), 2);
  });

  it('measures the eutectoid by the austenite it consumes', () => {
    // A 0.4 % C steel is (0.4 - 0.022) / (0.76 - 0.022) = 51 % austenite at 727.
    const eutectoid = coolingEvents(0.4).find((e) => e.kind === 'eutectoid')!;
    expect(eutectoid.transformedFraction).toBeCloseTo((0.4 - 0.022) / (0.76 - 0.022), 2);
  });

  it('measures the eutectic by the melt it consumes', () => {
    const eutectic = coolingEvents(3.0).find((e) => e.kind === 'eutectic')!;
    expect(eutectic.transformedFraction).toBeCloseTo((3.0 - 2.14) / (4.3 - 2.14), 2);
  });
});

describe('invariant compositions', () => {
  it('reports the peritectic once at exactly 0.17 % C, even though two field boundaries are crossed', () => {
    const events = coolingEvents(PERITECTIC.cGamma);
    const peritectic = events.filter((e) => e.kind === 'peritectic');
    expect(peritectic).toHaveLength(1);
    expect(peritectic[0].toField).toBe('gamma');
    expect(peritectic[0].transformedFraction).toBeCloseTo(1, 2);
    expect(peritectic[0].disappears.sort()).toEqual(['L', 'delta']);
    expect(peritectic[0].appears).toEqual(['gamma']);
  });

  it('never reports the same reaction twice', () => {
    for (const c of [0, 0.09, 0.17, 0.53, 0.76, 2.14, 4.3, 5.5, 6.67]) {
      const ids = coolingEvents(c).map((e) => `${e.kind}@${e.T.toFixed(3)}`);
      expect(new Set(ids).size, `duplicate reaction at ${c} wt% C`).toBe(ids.length);
    }
  });

  it('does not call the 0.09 wt% C solidus a peritectic reaction', () => {
    // At the delta end of the peritectic the melt simply runs out; the reaction
    // itself involves an infinitesimal amount of material.
    expect(coolingEvents(0.09).map((e) => e.kind)).not.toContain('peritectic');
  });
});
