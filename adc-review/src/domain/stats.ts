export function mean(values: (number | null | undefined)[]): number | null {
  const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Mean of a − b over pairs where both sides exist. */
export function meanDiff<T>(items: T[], a: (t: T) => number | null | undefined, b: (t: T) => number | null | undefined) {
  return mean(
    items.map((t) => {
      const x = a(t);
      const y = b(t);
      return typeof x === 'number' && typeof y === 'number' ? x - y : null;
    }),
  );
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function winrate(wins: boolean[]): number | null {
  return wins.length ? wins.filter(Boolean).length / wins.length : null;
}
