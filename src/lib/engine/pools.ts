import type { Standard } from './types';

/** Unique unused positions, sorted across all ranges. Does not change the pool. */
export function availableSpots(standard: Standard): number[] {
  const spots = new Set<number>();
  const used = new Set(standard.used);
  for (const { from, to, auto } of standard.ranges) {
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 1 ||
      (to < from && !(auto?.to && to === from - 1))
    )
      throw new RangeError(`Invalid range for ${standard.name}.`);
    for (let spot = from; spot <= to; spot++) {
      if (!used.has(spot)) spots.add(spot);
    }
  }
  const spare = standard.spare ?? 0;
  if (!Number.isSafeInteger(spare) || spare < 0)
    throw new RangeError(
      `Spare for ${standard.name} must be a non-negative integer.`,
    );
  const sorted = [...spots].sort((a, b) => a - b);
  return sorted.slice(0, Math.max(0, sorted.length - spare));
}

/** Remaining counts per standard (used positions outside a pool do not count). */
export function remainingCounts(
  standards: readonly Standard[],
): Record<string, number> {
  return Object.fromEntries(
    standards.map((s) => [s.name, availableSpots(s).length]),
  );
}

/**
 * A run-wide drawer. It owns its cursors, never mutates input standards,
 * and returns null for each exhausted draw so sequence rows are never lost.
 */
export function createDrawer(standards: readonly Standard[]) {
  const pools = new Map(standards.map((s) => [s.name, availableSpots(s)]));
  const drawn = new Map(standards.map((s) => [s.name, [] as number[]]));
  return {
    take(
      name: string,
      count: number,
    ): { spots: (number | null)[]; exhausted: number } {
      const pool = pools.get(name);
      const used = drawn.get(name);
      if (!pool || !used) throw new Error(`Unknown standard: ${name}.`);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new RangeError('Draw count must be a non-negative integer.');
      const spots: (number | null)[] = [];
      let exhausted = 0;
      for (let i = 0; i < count; i++) {
        const spot = pool[used.length];
        if (spot === undefined) {
          spots.push(null);
          exhausted++;
        } else {
          spots.push(spot);
          used.push(spot);
        }
      }
      return { spots, exhausted };
    },
    getDrawn(): Record<string, number[]> {
      return Object.fromEntries(
        [...drawn].map(([name, spots]) => [name, [...spots]]),
      );
    },
  };
}
