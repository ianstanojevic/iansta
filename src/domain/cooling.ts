/**
 * Equilibrium cooling of an alloy of fixed composition.
 *
 * Two things are produced here:
 *
 *  1. `coolingEvents` - the reactions an alloy passes through on its way down
 *     from the melt, found by *watching the phase field change* rather than by
 *     hard-coding "steel does A, cast iron does B". The transition temperature
 *     is then pinned down by bisection, so the reported numbers agree with the
 *     drawn boundaries to six decimals.
 *
 *  2. `coolingCurve` - a schematic temperature/time curve. Newtonian cooling is
 *     slowed in proportion to how fast solid is forming (latent heat), and the
 *     invariant reactions produce true thermal arrests whose length scales with
 *     how much of the alloy actually transforms. That is why a 4.3 % C iron
 *     shows one long plateau at 1147 degC while a 0.4 % C steel shows a short
 *     one at 727 degC.
 */

import { EUTECTIC, EUTECTOID, INVARIANT_T_TOL, PERITECTIC, ROOM_T, T_MAX } from './constants';
import { classifyPoint, meltingRange, type InvariantId } from './diagram';
import { FIELD_PHASES, type FieldId, type Phase } from './phases';

export type CoolingEventKind =
  | 'start'
  | 'liquidus'
  | 'peritectic'
  | 'solidus'
  | 'eutectic'
  | 'a3'
  | 'acm'
  | 'eutectoid'
  | 'solvus'
  | 'transition'
  | 'end';

export interface CoolingEvent {
  kind: CoolingEventKind;
  /** Temperature of the event, degC. */
  T: number;
  fromField: FieldId | null;
  toField: FieldId;
  /** Phases that appear at this event. */
  appears: Phase[];
  /** Phases that disappear at this event. */
  disappears: Phase[];
  /** Weight fraction of the alloy that transforms, for invariant reactions. */
  transformedFraction?: number;
  invariant?: InvariantId;
}

export interface CoolingSample {
  /** Normalised time, 0..1. */
  t: number;
  T: number;
}

export interface CoolingPath {
  c: number;
  startT: number;
  endT: number;
  events: CoolingEvent[];
  samples: CoolingSample[];
  /** Normalised time at which each event happens, same order as `events`. */
  eventTimes: number[];
}

const SCAN_STEP = 0.25;
/** How far above/below a reaction to probe for phase amounts, in degC. */
const PROBE = 0.02;

function fractionOf(c: number, T: number, phase: Phase): number {
  const state = classifyPoint(c, T);
  const match = state.phases.find((p) => p.phase === phase);
  return match ? match.fraction : 0;
}

function solidFraction(c: number, T: number): number {
  return 1 - fractionOf(c, T, 'L');
}

/** Exact temperature of the field change bracketed by [tLow, tHigh]. */
function bisectTransition(c: number, tLow: number, tHigh: number, fieldLow: FieldId): number {
  let lo = tLow;
  let hi = tHigh;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (classifyPoint(c, mid).field === fieldLow) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function classifyKind(
  T: number,
  c: number,
  from: FieldId,
  to: FieldId,
  appears: Phase[],
  disappears: Phase[],
): { kind: CoolingEventKind; invariant?: InvariantId } {
  const near = (target: number) => Math.abs(T - target) <= INVARIANT_T_TOL;

  if (near(EUTECTOID.T) && disappears.includes('gamma')) {
    return { kind: 'eutectoid', invariant: 'eutectoid' };
  }
  if (near(EUTECTIC.T) && disappears.includes('L') && c > EUTECTIC.cGamma) {
    return { kind: 'eutectic', invariant: 'eutectic' };
  }
  // A peritectic needs both parents present: L + delta -> gamma. At exactly
  // 0.09 wt% C the last liquid disappears at 1495 degC and delta simply starts
  // transforming - that is a solidus and a solvus, not a peritectic.
  if (near(PERITECTIC.T) && from === 'L+delta' && appears.includes('gamma')) {
    return { kind: 'peritectic', invariant: 'peritectic' };
  }
  if (from === 'L') return { kind: 'liquidus' };
  if (disappears.includes('L')) return { kind: 'solidus' };
  if (from === 'gamma' && to === 'alpha+gamma') return { kind: 'a3' };
  if (from === 'gamma' && to === 'gamma+Fe3C') return { kind: 'acm' };
  if (from === 'alpha' && to === 'alpha+Fe3C') return { kind: 'solvus' };
  return { kind: 'transition' };
}

/**
 * Append an event, merging it into the previous one when both are the *same*
 * invariant reaction at the same temperature.
 *
 * This matters at the invariant compositions. At exactly 0.17 wt% C the
 * peritectic consumes all of the liquid and all of the delta-ferrite, so the
 * scan crosses two field boundaries (L+delta -> delta+gamma -> gamma) within a
 * fraction of a degree. That is one reaction, not two.
 */
function mergeOrPush(events: CoolingEvent[], event: CoolingEvent): void {
  const previous = events[events.length - 1];
  // Anything that happens at the temperature of an invariant reaction is part
  // of that reaction: at exactly 0.17 wt% C the peritectic runs to completion,
  // crossing L+delta -> delta+gamma -> gamma within a fraction of a degree.
  const continuation =
    previous !== undefined &&
    previous.invariant !== undefined &&
    Math.abs(previous.T - event.T) < 0.05;

  if (!continuation) {
    events.push(event);
    return;
  }

  const before = FIELD_PHASES[previous.fromField ?? event.toField];
  const after = FIELD_PHASES[event.toField];
  previous.toField = event.toField;
  previous.appears = after.filter((p) => !before.includes(p));
  previous.disappears = before.filter((p) => !after.includes(p));
  previous.transformedFraction = Math.max(
    previous.transformedFraction ?? 0,
    event.transformedFraction ?? 0,
  );
}

/** Reactions encountered while cooling an alloy of composition `c` to room temperature. */
export function coolingEvents(c: number, startT = T_MAX): CoolingEvent[] {
  const events: CoolingEvent[] = [];
  let previousField = classifyPoint(c, startT).field;

  events.push({
    kind: 'start',
    T: startT,
    fromField: null,
    toField: previousField,
    appears: FIELD_PHASES[previousField],
    disappears: [],
  });

  for (let T = startT - SCAN_STEP; T >= ROOM_T; T -= SCAN_STEP) {
    const field = classifyPoint(c, T).field;
    if (field === previousField) continue;

    const exact = bisectTransition(c, T, T + SCAN_STEP, field);
    const before = FIELD_PHASES[previousField];
    const after = FIELD_PHASES[field];
    const appears = after.filter((p) => !before.includes(p));
    const disappears = before.filter((p) => !after.includes(p));
    const { kind, invariant } = classifyKind(exact, c, previousField, field, appears, disappears);

    const event: CoolingEvent = {
      kind,
      T: exact,
      fromField: previousField,
      toField: field,
      appears,
      disappears,
    };

    if (invariant) {
      // How much of the alloy actually changes phase in the reaction.
      //
      // For the eutectic and the eutectoid that is simply how much parent phase
      // is left just above the reaction - all of it transforms. The peritectic
      // is different: L + delta -> gamma consumes all of the delta but only
      // *part* of the liquid, so the amount that reacts is the amount of
      // austenite that exists just below the reaction.
      event.transformedFraction =
        invariant === 'peritectic'
          ? fractionOf(c, exact - PROBE, 'gamma')
          : fractionOf(c, exact + PROBE, invariant === 'eutectoid' ? 'gamma' : 'L');
      event.invariant = invariant;
    }

    mergeOrPush(events, event);
    previousField = field;
  }

  events.push({
    kind: 'end',
    T: ROOM_T,
    fromField: previousField,
    toField: previousField,
    appears: [],
    disappears: [],
  });

  return events;
}

/** Latent-heat weighting: how much slower cooling gets while solid is forming. */
const LATENT_SCALE = 55;
const MAX_LATENT = 9;
/**
 * Length of a full (100 % transforming) thermal arrest, as a fraction of the
 * time the alloy would take to cool with no latent heat at all. Scaling to the
 * run length rather than to absolute units keeps the plateaus readable for
 * every alloy, from pure iron to cementite.
 */
const ARREST_SHARE = 0.22;
/** Newton cooling constant and the (fictitious) ambient temperature. */
const COOLING_K = 0.035;
const AMBIENT_T = -120;
const STEP = 1;

/** dt for a one-degree step at `T`, including the latent-heat slowdown. */
function timeStep(c: number, T: number, previousSolid: number): { dt: number; solid: number } {
  const solid = solidFraction(c, T);
  const latent = Math.min(MAX_LATENT, 1 + LATENT_SCALE * Math.abs(solid - previousSolid));
  return { dt: (latent * STEP) / (COOLING_K * (T - AMBIENT_T)), solid };
}

/** First time at which the curve reaches temperature `T` (linear interpolation). */
function timeAtTemperature(samples: CoolingSample[], T: number): number {
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.T <= T && a.T > T) {
      const span = a.T - b.T;
      return span <= 0 ? b.t : a.t + ((a.T - T) / span) * (b.t - a.t);
    }
  }
  return samples[samples.length - 1].t;
}

/**
 * Schematic cooling curve for composition `c`.
 * Temperature runs from a little above the liquidus down to room temperature.
 */
export function coolingCurve(c: number, events = coolingEvents(c)): CoolingPath {
  const { liquidus } = meltingRange(c);
  const startT = Math.min(T_MAX, Math.ceil((liquidus + 90) / 10) * 10);

  // Pass 1: how long does this alloy take to cool with no thermal arrests?
  let baseDuration = 0;
  let solid = solidFraction(c, startT);
  for (let T = startT - STEP; T >= ROOM_T; T -= STEP) {
    const next = timeStep(c, T, solid);
    baseDuration += next.dt;
    solid = next.solid;
  }
  const arrestUnit = ARREST_SHARE * baseDuration;

  const arrests: { T: number; length: number }[] = events
    .filter((e) => e.invariant && e.transformedFraction)
    .map((e) => ({ T: e.T, length: arrestUnit * (e.transformedFraction as number) }));

  // Pass 2: integrate again, this time holding temperature during each reaction.
  const raw: CoolingSample[] = [{ t: 0, T: startT }];
  let time = 0;
  solid = solidFraction(c, startT);
  for (let T = startT - STEP; T >= ROOM_T; T -= STEP) {
    const next = timeStep(c, T, solid);
    time += next.dt;
    solid = next.solid;
    raw.push({ t: time, T });
    for (const arrest of arrests) {
      if (T <= arrest.T && T + STEP > arrest.T) {
        time += arrest.length;
        raw.push({ t: time, T });
      }
    }
  }

  const duration = time || 1;
  const samples = raw.map((s) => ({ t: s.t / duration, T: s.T }));

  const eventTimes = events.map((event) =>
    event.kind === 'start' ? 0 : event.kind === 'end' ? 1 : timeAtTemperature(samples, event.T),
  );

  return { c, startT, endT: ROOM_T, events, samples, eventTimes };
}

/** Temperature of the cooling path at normalised time `t` (linear interpolation). */
export function temperatureAtTime(path: CoolingPath, t: number): number {
  const samples = path.samples;
  if (t <= 0) return samples[0].T;
  if (t >= 1) return samples[samples.length - 1].T;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const span = b.t - a.t;
  if (span <= 0) return b.T;
  return a.T + ((t - a.t) / span) * (b.T - a.T);
}
