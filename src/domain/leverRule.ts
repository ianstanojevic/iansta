/**
 * The lever rule.
 *
 * In a two-phase field the overall composition C0 sits on a "beam" whose ends
 * are the compositions of the two phases in equilibrium (the ends of the tie
 * line). The weight fraction of each phase is the length of the *opposite* arm
 * divided by the total tie-line length:
 *
 *     W_left  = (C_right - C0)     / (C_right - C_left)
 *     W_right = (C0      - C_left) / (C_right - C_left)
 *
 * The arms are named the way a physical balance works: the fraction of a phase
 * is proportional to the arm reaching *away* from it.
 */

export interface LeverRuleResult {
  /** Overall alloy composition, wt% C. */
  c0: number;
  /** Composition of the left-hand (lower carbon) phase, wt% C. */
  cLeft: number;
  /** Composition of the right-hand (higher carbon) phase, wt% C. */
  cRight: number;
  /** Weight fraction of the left phase, 0..1. */
  fractionLeft: number;
  /** Weight fraction of the right phase, 0..1. */
  fractionRight: number;
  /** Arm that determines the left fraction: C_right - C0. */
  armLeft: number;
  /** Arm that determines the right fraction: C0 - C_left. */
  armRight: number;
  /** Total tie-line length, C_right - C_left. */
  tieLine: number;
}

/** Widths below this are treated as a degenerate (collapsed) tie line. */
const MIN_TIE_LINE = 1e-12;

export function leverRule(c0: number, cLeft: number, cRight: number): LeverRuleResult {
  const tieLine = cRight - cLeft;

  if (tieLine <= MIN_TIE_LINE) {
    // Degenerate tie line (the two boundaries have met). Report everything as
    // the left phase rather than dividing by ~0.
    return {
      c0,
      cLeft,
      cRight,
      fractionLeft: 1,
      fractionRight: 0,
      armLeft: 0,
      armRight: 0,
      tieLine: 0,
    };
  }

  // Clamping keeps the result physical when c0 sits a floating-point hair
  // outside the tie line (which happens on boundary hits).
  const clamped = c0 < cLeft ? cLeft : c0 > cRight ? cRight : c0;
  const armRight = clamped - cLeft;
  const armLeft = cRight - clamped;

  return {
    c0,
    cLeft,
    cRight,
    fractionLeft: armLeft / tieLine,
    fractionRight: armRight / tieLine,
    armLeft,
    armRight,
    tieLine,
  };
}

/** Format a weight fraction as a percentage string with sensible precision. */
export function formatFraction(fraction: number, digits = 1): string {
  const pct = fraction * 100;
  if (pct > 0 && pct < 0.1) return '<0.1';
  if (pct < 100 && pct > 99.9) return '>99.9';
  return pct.toFixed(digits);
}
