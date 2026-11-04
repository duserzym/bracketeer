import { remainingCounts } from './pools';
import type {
  BlockEntry,
  Budget,
  Chunking,
  Recipe,
  Standard,
  Unknown,
} from './types';

function integer(value: number, name: string, minimum = 1): void {
  if (!Number.isSafeInteger(value) || value < minimum)
    throw new RangeError(`${name} must be an integer of at least ${minimum}.`);
}

/** Equal nonempty chunks, larger first. Counts above total are capped at total. */
export function chunkSizes(total: number, count: number): number[] {
  integer(total, 'Unknown count', 0);
  integer(count, 'Chunk count');
  if (total === 0) return [];
  const actual = Math.min(count, total);
  const q = Math.floor(total / actual);
  const r = total % actual;
  return Array.from({ length: actual }, (_, i) => q + (i < r ? 1 : 0));
}

/** Resolve the mode, falling back to one chunk when no budget fits. */
export function chunkCount(
  total: number,
  chunking: Chunking,
  Bmax: number,
): number {
  integer(total, 'Unknown count', 0);
  integer(Bmax, 'Bmax', 0);
  if (chunking.mode === 'size') integer(chunking.size, 'Chunk size');
  if (chunking.mode === 'count') integer(chunking.count, 'Chunk count');
  if (total === 0) return 0;
  switch (chunking.mode) {
    case 'auto':
      return Math.min(total, Math.max(1, Bmax));
    case 'size':
      return Math.ceil(total / chunking.size);
    case 'count':
      return Math.min(total, chunking.count);
  }
}

/** Chunk across samples, or chunk each sample with a shared target size. */
export function planChunks(
  unknowns: readonly Unknown[],
  recipe: Recipe,
  Bmax: number,
): number[] {
  const sizes = unknowns.map(({ from, to }) => {
    integer(from, 'Sample start');
    integer(to, 'Sample end');
    if (to < from) throw new RangeError('Sample ranges must be ascending.');
    return to - from + 1;
  });
  const total = sizes.reduce((a, b) => a + b, 0);
  const count = chunkCount(total, recipe.chunking, Bmax);
  if (total === 0) return [];
  if (!recipe.bracketAtSampleBoundaries) return chunkSizes(total, count);
  const target =
    recipe.chunking.mode === 'size'
      ? recipe.chunking.size
      : Math.ceil(total / count);
  return sizes.flatMap((size) => chunkSizes(size, Math.ceil(size / target)));
}

/** Zero-based bracket nearest half the unknowns, ties earlier; null below two. */
export function midBracketIndex(chunks: readonly number[]): number | null {
  for (const size of chunks) integer(size, 'Chunk size');
  if (chunks.length < 2) return null;
  const half = chunks.reduce((a, b) => a + b, 0) / 2;
  let cumulative = 0;
  let nearest = 0;
  let distance = Infinity;
  chunks.forEach((size, i) => {
    cumulative += size;
    const next = Math.abs(cumulative - half);
    if (next < distance) {
      distance = next;
      nearest = i;
    }
  });
  return nearest;
}

function context(standards: readonly Standard[], recipe: Recipe) {
  const names = new Map(standards.map((s) => [s.name, s]));
  if (
    names.size !== standards.length ||
    standards.some((s) => !s.name || s.name === '@primary')
  )
    throw new Error(
      'Standard names must be nonempty, unique, and not @primary.',
    );
  const primaries = standards.filter((s) => s.role === 'primary');
  const primary = primaries[0];
  if (primaries.length !== 1 || !primary)
    throw new Error('Exactly one primary standard is required.');
  const secondaries = standards.filter((s) => s.role === 'secondary');
  integer(recipe.secondaryPairsPerBracket, 'Secondary pairs', 0);
  integer(recipe.spotsPerSecondary, 'Spots per secondary');
  integer(recipe.primaryPerBracket, 'Primary per bracket', 0);
  integer(recipe.sessionsLeft, 'Sessions left');
  integer(recipe.rotationStart, 'Rotation start', 0);
  if (recipe.secondaryPairsPerBracket > 0 && !secondaries.length)
    throw new Error('A secondary standard is required for secondary pairs.');
  const resolve = (entries: readonly BlockEntry[]): BlockEntry[] =>
    entries.map((entry) => {
      integer(entry.count, 'Block draw count', 0);
      const standard =
        entry.standard === '@primary' ? primary.name : entry.standard;
      if (!names.has(standard))
        throw new Error(`Unknown standard: ${standard}.`);
      return { standard, count: entry.count };
    });
  return {
    primary,
    secondaries,
    start: secondaries.length ? recipe.rotationStart % secondaries.length : 0,
    opening: resolve(recipe.opening),
    mid: resolve(recipe.mid),
    closing: resolve(recipe.closing),
  };
}

export interface Bracket {
  chunkSize: number;
  mid: BlockEntry[];
  secondaries: BlockEntry[];
  primary: BlockEntry;
}

export interface BracketLayout {
  opening: BlockEntry[];
  brackets: Bracket[];
  closing: BlockEntry[];
  nextRotation: number;
}

/** Resolve standard names and ordered draws without consuming any pool spots. */
export function bracketLayout(
  chunks: readonly number[],
  standards: readonly Standard[],
  recipe: Recipe,
): BracketLayout {
  const ctx = context(standards, recipe);
  const midIndex = midBracketIndex(chunks);
  let rotation = ctx.start;
  const brackets = chunks.map((chunkSize, i): Bracket => {
    const secondaries: BlockEntry[] = [];
    for (let pair = 0; pair < recipe.secondaryPairsPerBracket; pair++) {
      const secondary = ctx.secondaries[rotation]!;
      secondaries.push({
        standard: secondary.name,
        count: recipe.spotsPerSecondary,
      });
      rotation = (rotation + 1) % ctx.secondaries.length;
    }
    return {
      chunkSize,
      mid: i === midIndex ? ctx.mid : [],
      secondaries,
      primary: { standard: ctx.primary.name, count: recipe.primaryPerBracket },
    };
  });
  return {
    opening: chunks.length ? ctx.opening : [],
    brackets,
    closing: chunks.length ? ctx.closing : [],
    nextRotation: rotation,
  };
}

function simulateNeed(
  count: number,
  standards: readonly Standard[],
  recipe: Recipe,
  ctx: ReturnType<typeof context>,
): Map<string, number> {
  const needs = new Map(standards.map((s) => [s.name, 0]));
  const add = (name: string, n: number) =>
    needs.set(name, needs.get(name)! + n);
  const block = (entries: readonly BlockEntry[]) => {
    for (const entry of entries) add(entry.standard, entry.count);
  };
  if (count === 0) return needs;
  let rotation = ctx.start;
  for (let session = 0; session < recipe.sessionsLeft; session++) {
    block(ctx.opening);
    if (count >= 2) block(ctx.mid);
    for (let bracket = 0; bracket < count; bracket++) {
      for (let pair = 0; pair < recipe.secondaryPairsPerBracket; pair++) {
        add(ctx.secondaries[rotation]!.name, recipe.spotsPerSecondary);
        rotation = (rotation + 1) % ctx.secondaries.length;
      }
      add(ctx.primary.name, recipe.primaryPerBracket);
    }
    block(ctx.closing);
  }
  return needs;
}

/**
 * Exact multi-session Bmax: count each rotated draw with the rotation continuing
 * between sessions. Demand is monotone in C, so binary search finds the maximum.
 * perStandard describes the proposed (or mode-selected) count, including all
 * sessionsLeft sessions. Sample-boundary expansion can be supplied as proposed.
 */
export function calculateBudget(
  total: number,
  standards: readonly Standard[],
  recipe: Recipe,
  proposed?: number,
): Budget {
  integer(total, 'Unknown count', 0);
  const ctx = context(standards, recipe);
  const remaining = remainingCounts(standards);
  const fits = (count: number) =>
    [...simulateNeed(count, standards, recipe, ctx)].every(
      ([name, need]) => need <= remaining[name]!,
    );
  let low = 0;
  let high = total;
  while (low < high) {
    const candidate = Math.floor((low + high + 1) / 2);
    if (fits(candidate)) low = candidate;
    else high = candidate - 1;
  }
  const count = proposed ?? chunkCount(total, recipe.chunking, low);
  integer(count, 'Proposed chunk count', total === 0 ? 0 : 1);
  if (count > total)
    throw new RangeError('Proposed chunk count exceeds unknown count.');
  const needs = simulateNeed(count, standards, recipe, ctx);
  const warnings =
    count > low
      ? [
          low === 0
            ? 'No bracket count fits the remaining standard pools for all sessions left.'
            : `${count} chunks exceed the budget of ${low} for all sessions left.`,
        ]
      : [];
  return {
    Bmax: low,
    chunksPerSession: count,
    perStandard: Object.fromEntries(
      standards.map((s) => [
        s.name,
        {
          need: needs.get(s.name)!,
          remaining: remaining[s.name]!,
        },
      ]),
    ),
    warnings,
  };
}
