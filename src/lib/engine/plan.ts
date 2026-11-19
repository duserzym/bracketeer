import { remainingCounts } from './pools';
import { parseLabel } from './labels';
import { groupRecipe, groupStandards, mineralGroup } from './groups';
import type {
  BlockEntry,
  Budget,
  Chunking,
  Project,
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

/** Hamilton allocation with lower bounds; fractions tie in input order. */
export function largestRemainder(
  total: number,
  weights: readonly number[],
  minima: readonly number[] = weights.map((w) => (w ? 1 : 0)),
): number[] {
  integer(total, 'Allocation total', 0);
  weights.forEach((w) => integer(w, 'Allocation weight', 0));
  if (minima.length !== weights.length)
    throw new RangeError('Allocation bounds must match weights.');
  minima.forEach((m, i) => {
    integer(m, 'Allocation minimum', 0);
    if (m > weights[i]!)
      throw new RangeError('Allocation minimum exceeds weight.');
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  total = Math.min(total, sum);
  if (minima.reduce((a, b) => a + b, 0) > total)
    throw new RangeError('Not enough brackets for the allocation minimums.');
  const quotas = weights.map((w) => (sum ? (total * w) / sum : 0));
  const counts = quotas.map((q, i) => Math.max(minima[i]!, Math.floor(q)));
  const order = quotas
    .map((q, i) => ({ i, fraction: q - Math.floor(q) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  let assigned = counts.reduce((a, b) => a + b, 0);
  while (assigned < total)
    for (const { i } of order) {
      if (assigned === total) break;
      if (counts[i]! < weights[i]!) {
        counts[i]!++;
        assigned++;
      }
    }
  while (assigned > total)
    for (const { i } of [...order].reverse()) {
      if (assigned === total) break;
      if (counts[i]! > minima[i]!) {
        counts[i]!--;
        assigned--;
      }
    }
  return counts;
}

/** Resolve a session's mode, retaining one chunk when a budget cannot fit. */
export function chunkCount(
  total: number,
  chunking: Chunking,
  budget: number,
): number {
  integer(total, 'Unknown count', 0);
  integer(budget, 'Bracket budget', 0);
  if (chunking.mode === 'size') integer(chunking.size, 'Chunk size');
  if (chunking.mode === 'count') integer(chunking.count, 'Chunk count');
  if (total === 0) return 0;
  switch (chunking.mode) {
    case 'budget':
      return Math.min(total, Math.max(1, budget));
    case 'size':
      return Math.ceil(total / chunking.size);
    case 'count':
      return Math.min(total, chunking.count);
  }
}

/** Samples share k by largest remainder when brackets must respect boundaries. */
export function planChunks(
  unknowns: readonly Unknown[],
  recipe: Recipe,
  budget: number,
): number[] {
  const sizes = unknowns.map(({ from, to, auto }) => {
    integer(from, 'Sample start');
    integer(to, 'Sample end', auto?.to ? 0 : 1);
    if (to < from && !(auto?.to && to === from - 1))
      throw new RangeError('Sample ranges must be ascending.');
    return to - from + 1;
  });
  const total = sizes.reduce((a, b) => a + b, 0);
  const count = chunkCount(total, recipe.chunking, budget);
  if (!total) return [];
  if (!recipe.bracketAtSampleBoundaries) return chunkSizes(total, count);
  const grouped = sampleSizes(unknowns, sizes).filter((size) => size > 0);
  return largestRemainder(Math.max(count, grouped.length), grouped).flatMap(
    (k, i) => chunkSizes(grouped[i]!, k),
  );
}

function sampleSizes(unknowns: readonly Unknown[], sizes: readonly number[]) {
  const grouped: number[] = [];
  unknowns.forEach((sample, i) => {
    const previous = unknowns[i - 1];
    if (previous?.name === sample.name && previous.tag === sample.tag)
      grouped[grouped.length - 1]! += sizes[i]!;
    else grouped.push(sizes[i]!);
  });
  return grouped;
}

/** Zero-based floor((k + 1) / 2) bracket, with no mid block below two chunks. */
export function midBracketIndex(chunks: readonly number[]): number | null {
  chunks.forEach((size) => integer(size, 'Chunk size'));
  return chunks.length < 2 ? null : Math.floor((chunks.length + 1) / 2) - 1;
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
  integer(recipe.maxPairsPerBracket, 'Maximum pairs per bracket');
  integer(recipe.spotsPerSecondary, 'Spots per secondary');
  integer(recipe.primaryPerBracket, 'Primary per bracket');
  integer(recipe.rotationStart, 'Rotation start', 0);
  if (
    recipe.secondaries !== 'cadence' &&
    (recipe.chunking.mode === 'budget' ||
      recipe.secondaryPairsPerBracket > 0) &&
    !secondaries.length
  )
    throw new Error('A secondary standard is required for secondary pairs.');
  for (const secondary of secondaries) {
    integer(
      secondary.perBracket ?? recipe.spotsPerSecondary,
      'Secondary per bracket',
    );
    if (
      secondary.cadence !== undefined &&
      !['every', 'odd', 'even'].includes(secondary.cadence)
    )
      throw new Error('Secondary cadence must be every, odd, or even.');
  }
  const resolve = (entries: readonly BlockEntry[]) =>
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
  openingBracket?: Bracket;
  closing: BlockEntry[];
  nextRotation: number;
}

/** Ordered draws without consuming pool spots; pair counts may vary per bracket. */
export function bracketLayout(
  chunks: readonly number[],
  standards: readonly Standard[],
  recipe: Recipe,
  pairsPerBracket = chunks.map(() => recipe.secondaryPairsPerBracket),
): BracketLayout {
  const ctx = context(standards, recipe);
  const midIndex = midBracketIndex(chunks);
  if (pairsPerBracket.length !== chunks.length)
    throw new RangeError('Pair counts must match brackets.');
  let rotation = ctx.start;
  const makeBracket = (
    chunkSize: number,
    i: number,
    pairs: number,
    b: number,
  ): Bracket => {
    integer(pairs, 'Secondary pairs', 0);
    const secondaries: BlockEntry[] = [];
    if (recipe.secondaries === 'cadence') {
      for (const secondary of ctx.secondaries) {
        const cadence = secondary.cadence ?? 'every';
        if (
          cadence === 'every' ||
          (cadence === 'odd' ? b % 2 === 1 : b % 2 === 0)
        )
          secondaries.push({
            standard: secondary.name,
            count: secondary.perBracket ?? recipe.spotsPerSecondary,
          });
      }
    } else {
      for (let pair = 0; pair < pairs; pair++) {
        const secondary = ctx.secondaries[rotation];
        if (!secondary)
          throw new Error(
            'A secondary standard is required for secondary pairs.',
          );
        secondaries.push({
          standard: secondary.name,
          count: recipe.spotsPerSecondary,
        });
        rotation = (rotation + 1) % ctx.secondaries.length;
      }
    }
    return {
      chunkSize,
      mid: i === midIndex ? ctx.mid : [],
      secondaries,
      primary: { standard: ctx.primary.name, count: recipe.primaryPerBracket },
    };
  };
  const openingBracket =
    recipe.openingBracket && chunks.length
      ? makeBracket(0, -1, recipe.secondaryPairsPerBracket, 1)
      : undefined;
  const brackets = chunks.map((chunkSize, i) =>
    makeBracket(
      chunkSize,
      i,
      pairsPerBracket[i]!,
      i + (openingBracket ? 2 : 1),
    ),
  );
  return {
    opening: chunks.length ? ctx.opening : [],
    brackets,
    ...(openingBracket ? { openingBracket } : {}),
    closing: chunks.length ? ctx.closing : [],
    nextRotation: rotation,
  };
}

export interface ProjectLayout {
  layouts: BracketLayout[];
  chunks: number[][];
  pairsPerBracket: number[][];
  budget: Budget;
  advisories: string[];
}

function validateChunkingOptions(recipe: Recipe): void {
  if (
    recipe.chunking.mode === 'budget' &&
    (recipe.secondaries === 'cadence' || recipe.openingBracket)
  )
    throw new Error(
      'Every, odd or even secondaries and the opening bracket need Chunk target or Chunk count',
    );
}

/** Plan all nonempty planned sessions; standards already include fixed-session use. */
export function calculateBudget(
  unknowns: readonly (readonly Unknown[])[],
  standards: readonly Standard[],
  recipe: Recipe,
): ProjectLayout {
  validateChunkingOptions(recipe);
  const ctx = context(standards, recipe);
  const available = remainingCounts(standards);
  const advisories: string[] = [];
  for (const s of standards) {
    const fresh = remainingCounts([{ ...s, spare: 0 }])[s.name]!;
    if (s.spare > fresh)
      advisories.push(
        `${s.name}: keep ${s.spare} spare exceeds ${fresh} unused spots.`,
      );
  }
  const totals = unknowns.map((samples) =>
    samples.reduce((n, s) => n + s.to - s.from + 1, 0),
  );
  const active = totals.filter((n) => n > 0).length;
  const total = totals.reduce((a, b) => a + b, 0);
  const fixedPrimary = [...ctx.opening, ...ctx.mid, ...ctx.closing]
    .filter((e) => e.standard === ctx.primary.name)
    .reduce((n, e) => n + e.count, 0);
  // The first exhausted secondary stops the rotation, even if others have supply.
  const capacities = ctx.secondaries.map((s) =>
    Math.floor(available[s.name]! / recipe.spotsPerSecondary),
  );
  let pairBudget = 0;
  if (capacities.length) {
    const fullRounds = Math.min(...capacities);
    pairBudget = fullRounds * capacities.length;
    for (let step = 0; step < capacities.length; step++) {
      if (capacities[(ctx.start + step) % capacities.length]! === fullRounds)
        break;
      pairBudget++;
    }
  }
  let K = active
    ? Math.max(
        0,
        Math.min(
          total,
          pairBudget,
          Math.floor(
            (available[ctx.primary.name]! - active * fixedPrimary) /
              recipe.primaryPerBracket,
          ),
        ),
      )
    : 0;
  let P = Math.min(pairBudget, recipe.maxPairsPerBracket * K);
  let chunks: number[][];
  if (recipe.chunking.mode === 'budget') {
    const minima = unknowns.map((samples) =>
      samples.some((s) => s.to >= s.from)
        ? recipe.bracketAtSampleBoundaries
          ? sampleSizes(
              samples,
              samples.map((s) => s.to - s.from + 1),
            ).filter((size) => size > 0).length
          : 1
        : 0,
    );
    const minimum = minima.reduce((a, b) => a + b, 0);
    if (K < minimum)
      advisories.push(
        `Budget has ${K} brackets for ${active} sessions${recipe.bracketAtSampleBoundaries ? ` and ${minimum} samples` : ''}; emitting at least one bracket per ${recipe.bracketAtSampleBoundaries ? 'sample' : 'session'} with shortage warnings.`,
      );
    const counts = largestRemainder(Math.max(K, minimum), totals, minima);
    chunks = unknowns.map((samples, i) =>
      planChunks(samples, recipe, counts[i]!),
    );
  } else {
    chunks = unknowns.map((samples) => planChunks(samples, recipe, 0));
    K = chunks.reduce((n, c) => n + c.length, 0);
    P = K * recipe.secondaryPairsPerBracket;
  }
  const emittedK = chunks.reduce((n, c) => n + c.length, 0);
  let bracket = 0;
  const pairsPerBracket = chunks.map((c) =>
    c.map(() => {
      const j = ++bracket;
      return recipe.chunking.mode !== 'budget'
        ? recipe.secondaryPairsPerBracket
        : emittedK > K
          ? 1
          : Math.floor((j * P) / K) - Math.floor(((j - 1) * P) / K);
    }),
  );
  let rotation = ctx.start;
  const layouts = chunks.map((c, i) => {
    const layout = bracketLayout(
      c,
      standards,
      { ...recipe, rotationStart: rotation },
      pairsPerBracket[i],
    );
    rotation = layout.nextRotation;
    return layout;
  });
  if (recipe.chunking.mode !== 'budget') {
    K += layouts.filter((layout) => layout.openingBracket).length;
    P =
      recipe.secondaries === 'cadence'
        ? 0
        : K * recipe.secondaryPairsPerBracket;
    pairsPerBracket.forEach((pairs, i) => {
      if (layouts[i]!.openingBracket)
        pairs.unshift(recipe.secondaryPairsPerBracket);
      if (recipe.secondaries === 'cadence') pairs.fill(0);
    });
  }
  const needed = Object.fromEntries(standards.map((s) => [s.name, 0]));
  for (const layout of layouts)
    for (const e of [
      ...layout.opening,
      ...[
        ...(layout.openingBracket ? [layout.openingBracket] : []),
        ...layout.brackets,
      ].flatMap((b) => [...b.mid, ...b.secondaries, b.primary]),
      ...layout.closing,
    ])
      needed[e.standard]! += e.count;
  const perStandard = Object.fromEntries(
    standards.map((s) => {
      const need = needed[s.name]!;
      if (need > available[s.name]!)
        advisories.push(
          `${s.name} needs ${need} spots; ${available[s.name]} available after used spots and spare.`,
        );
      return [
        s.name,
        {
          available: available[s.name]!,
          needed: need,
          leftAfter: available[s.name]! - need,
        },
      ];
    }),
  );
  return {
    layouts,
    chunks,
    pairsPerBracket,
    budget: { K, P, perStandard },
    advisories,
  };
}

/** The same layouts drive both row generation and design counts. Fixed use is reserved once. */
export function projectLayouts(
  project: Project,
): ProjectLayout & { standards: Standard[] } {
  validateChunkingOptions(project.recipe);
  const names = new Set(project.standards.map((s) => s.name));
  if (
    names.size !== project.standards.length ||
    project.standards.some((s) => !s.name || s.name === '@primary')
  )
    throw new Error(
      'Standard names must be nonempty, unique, and not @primary.',
    );
  const fixed = project.sessions.filter((s) => s.fixed);
  const standards = project.standards.map((s) => ({
    ...s,
    used: [
      ...s.used,
      ...fixed.flatMap((session) =>
        session.rows.flatMap((row) => {
          const label = parseLabel(row.Label, project.standards);
          const spot = row['Laser Scan Position Number'];
          return label.kind === s.role && label.name === s.name && spot !== null
            ? [spot]
            : [];
        }),
      ),
    ],
  }));
  const planned = project.sessions.filter((s) => !s.fixed);
  // Preserve the original algorithm and advisory ordering for a single main mineral.
  if (
    standards.every(
      (s) => s.role === 'reference' || mineralGroup(project, s.mineral) === '',
    ) &&
    planned.every((s) => mineralGroup(project, s.mineral) === '')
  )
    return {
      ...calculateBudget(
        planned.map((s) => s.unknowns),
        standards,
        project.recipe,
      ),
      standards,
    };
  const layouts: BracketLayout[] = [];
  const chunks: number[][] = [];
  const pairsPerBracket: number[][] = [];
  const needed = Object.fromEntries(standards.map((s) => [s.name, 0]));
  const advisories: string[] = [];
  let K = 0,
    P = 0;
  for (const group of new Set(
    planned.map((s) => mineralGroup(project, s.mineral)),
  )) {
    const indices = planned.flatMap((s, i) =>
      mineralGroup(project, s.mineral) === group ? [i] : [],
    );
    const plan = calculateBudget(
      indices.map((i) => planned[i]!.unknowns),
      groupStandards(project, group, standards),
      groupRecipe(project, group),
    );
    indices.forEach((index, i) => {
      layouts[index] = plan.layouts[i]!;
      chunks[index] = plan.chunks[i]!;
      pairsPerBracket[index] = plan.pairsPerBracket[i]!;
    });
    K += plan.budget.K;
    P += plan.budget.P;
    for (const [name, use] of Object.entries(plan.budget.perStandard))
      needed[name]! += use.needed;
    advisories.push(
      ...plan.advisories.filter((a) => a.startsWith('Budget has ')),
    );
  }
  const available = remainingCounts(standards);
  const perStandard = Object.fromEntries(
    standards.map((s) => {
      const fresh = remainingCounts([{ ...s, spare: 0 }])[s.name]!;
      if (s.spare > fresh)
        advisories.push(
          `${s.name}: keep ${s.spare} spare exceeds ${fresh} unused spots.`,
        );
      const need = needed[s.name]!;
      if (need > available[s.name]!)
        advisories.push(
          `${s.name} needs ${need} spots; ${available[s.name]} available after used spots and spare.`,
        );
      return [
        s.name,
        {
          available: available[s.name]!,
          needed: need,
          leftAfter: available[s.name]! - need,
        },
      ];
    }),
  );
  return {
    layouts,
    chunks,
    pairsPerBracket,
    budget: { K, P, perStandard },
    advisories,
    standards,
  };
}
