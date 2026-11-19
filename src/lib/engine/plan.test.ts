import { describe, expect, it } from 'vitest';
import {
  bracketLayout,
  calculateBudget,
  chunkCount,
  chunkSizes,
  largestRemainder,
  midBracketIndex,
  planChunks,
} from './plan';
import {
  SESSION_2_STANDARDS,
  SESSION_2_UNKNOWNS,
  SESSION_3_UNKNOWNS,
} from './test-data';
import {
  DEFAULT_RECIPE,
  type Recipe,
  type Standard,
  type Unknown,
} from './types';

const samples: Unknown[] = [
  { name: 'A', tag: '', from: 1, to: 5 },
  { name: 'B', tag: '', from: 6, to: 8 },
];

describe('chunk planning', () => {
  it('balances exactly, puts larger chunks first and avoids empty chunks', () => {
    expect(chunkSizes(234, 10)).toEqual([
      24, 24, 24, 24, 23, 23, 23, 23, 23, 23,
    ]);
    expect(chunkSizes(228, 10)).toEqual([
      23, 23, 23, 23, 23, 23, 23, 23, 22, 22,
    ]);
    expect(chunkSizes(3, 9)).toEqual([1, 1, 1]);
    expect(chunkSizes(0, 1)).toEqual([]);
    for (const [total, count] of [
      [10, 0],
      [-1, 1],
      [10, 1.5],
    ])
      expect(() => chunkSizes(total!, count!)).toThrow(RangeError);
  });
  it('resolves size, count and budget modes, including an empty or impossible run', () => {
    expect(chunkCount(234, { mode: 'size', size: 25 }, 3)).toBe(10);
    expect(chunkCount(234, { mode: 'count', count: 10 }, 3)).toBe(10);
    expect(chunkCount(3, { mode: 'count', count: 10 }, 3)).toBe(3);
    expect(chunkCount(234, { mode: 'budget' }, 19)).toBe(19);
    expect(chunkCount(234, { mode: 'budget' }, 0)).toBe(1);
    expect(chunkCount(0, { mode: 'budget' }, 0)).toBe(0);
    expect(() => chunkCount(3, { mode: 'size', size: 0 }, 1)).toThrow(
      RangeError,
    );
    expect(() => chunkCount(3, { mode: 'count', count: -1 }, 1)).toThrow(
      RangeError,
    );
  });
  it('apportions k at sample boundaries by largest remainder, including minimums', () => {
    const recipe: Recipe = {
      ...DEFAULT_RECIPE,
      chunking: { mode: 'count', count: 2 },
    };
    expect(planChunks(samples, recipe, 2)).toEqual([4, 4]);
    recipe.bracketAtSampleBoundaries = true;
    expect(planChunks(samples, recipe, 2)).toEqual([5, 3]);
    expect(
      planChunks(samples, { ...recipe, chunking: { mode: 'budget' } }, 2),
    ).toEqual([5, 3]);
    expect(
      planChunks(
        samples,
        { ...recipe, chunking: { mode: 'size', size: 2 } },
        0,
      ),
    ).toEqual([2, 2, 1, 3]);
    expect(
      planChunks(
        samples,
        { ...recipe, chunking: { mode: 'count', count: 1 } },
        0,
      ),
    ).toEqual([5, 3]);
    expect(planChunks([], recipe, 0)).toEqual([]);
    expect(() => planChunks([{ ...samples[0]!, from: 6 }], recipe, 2)).toThrow(
      RangeError,
    );
  });
  it('treats adjacent runs of one sample as one boundary in every mode', () => {
    const split = [
      { name: 'A', tag: 'S', from: 1, to: 3 },
      { name: 'A', tag: 'S', from: 10, to: 12 },
      { name: 'A', tag: 'S', from: 20, to: 23 },
      { name: 'B', tag: '', from: 30, to: 34 },
    ];
    const contiguous = [{ name: 'A', tag: 'S', from: 1, to: 10 }, split[3]!];
    for (const chunking of [
      { mode: 'budget' },
      { mode: 'count', count: 4 },
      { mode: 'size', size: 3 },
    ] as const) {
      const recipe = {
        ...DEFAULT_RECIPE,
        chunking,
        bracketAtSampleBoundaries: true,
      };
      expect(planChunks(split, recipe, 4)).toEqual(
        planChunks(contiguous, recipe, 4),
      );
      expect(calculateBudget([split], SESSION_2_STANDARDS, recipe)).toEqual(
        calculateBudget([contiguous], SESSION_2_STANDARDS, recipe),
      );
    }
    const short = SESSION_2_STANDARDS.map((s) => ({ ...s, ranges: [] }));
    const recipe = {
      ...DEFAULT_RECIPE,
      chunking: { mode: 'budget' as const },
      bracketAtSampleBoundaries: true,
    };
    expect(calculateBudget([split], short, recipe).chunks).toEqual([[10, 5]]);
    expect(calculateBudget([split], short, recipe).advisories[0]).toContain(
      '2 samples',
    );
    expect(
      planChunks(
        [split[0]!, split[3]!, split[1]!],
        { ...recipe, chunking: { mode: 'count', count: 1 } },
        0,
      ),
    ).toEqual([3, 5, 3]);
    expect(
      planChunks(
        [split[0]!, { ...split[1]!, tag: 'L' }],
        { ...recipe, chunking: { mode: 'count', count: 1 } },
        0,
      ),
    ).toEqual([3, 3]);
  });
  it('places the mid block at floor((k+1)/2), independent of chunk sizes', () => {
    expect(midBracketIndex([24, 24, 24, 24, 23, 23, 23, 23, 23, 23])).toBe(4);
    expect(midBracketIndex([2, 2, 2])).toBe(1);
    expect(midBracketIndex([8, 1, 1])).toBe(1);
    expect(midBracketIndex([10])).toBeNull();
    expect(midBracketIndex([])).toBeNull();
    expect(() => midBracketIndex([1, 0])).toThrow(RangeError);
  });
  it('allocates exact totals with earlier ties, bounded by unknowns and minimums', () => {
    expect(largestRemainder(37, [234, 228])).toEqual([19, 18]);
    expect(largestRemainder(3, [2, 2])).toEqual([2, 1]);
    expect(largestRemainder(3, [1000, 1, 1])).toEqual([1, 1, 1]);
    expect(largestRemainder(4, [1000, 1, 1])).toEqual([2, 1, 1]);
    expect(largestRemainder(20, [2, 3, 0])).toEqual([2, 3, 0]);
    expect(largestRemainder(0, [])).toEqual([]);
    expect(() => largestRemainder(1, [2, 2])).toThrow('Not enough');
    expect(() => largestRemainder(2, [2], [3])).toThrow('minimum exceeds');
    expect(() => largestRemainder(2, [2], [])).toThrow('bounds');
  });
});

describe('bracket layout', () => {
  it('resolves @primary, rotates consecutive pairs, and places all blocks', () => {
    const recipe = { ...DEFAULT_RECIPE, secondaryPairsPerBracket: 2 };
    const layout = bracketLayout([2, 2, 2], SESSION_2_STANDARDS, recipe);
    expect(layout.opening).toEqual([
      { standard: 'NIST612', count: 3 },
      { standard: 'NIST610', count: 3 },
      { standard: 'S513', count: 2 },
    ]);
    expect(layout.brackets.map((b) => b.secondaries)).toEqual([
      [
        { standard: 'Seiland', count: 2 },
        { standard: '91500', count: 2 },
      ],
      [
        { standard: 'PL', count: 2 },
        { standard: 'LTSE', count: 2 },
      ],
      [
        { standard: 'Seiland', count: 2 },
        { standard: '91500', count: 2 },
      ],
    ]);
    expect(layout.brackets.map((b) => b.mid)).toEqual([[], recipe.mid, []]);
    expect(layout.brackets.map((b) => b.primary)).toEqual(
      Array(3).fill({ standard: 'S513', count: 2 }),
    );
    expect(layout.closing).toEqual(recipe.closing);
    expect(layout.nextRotation).toBe(2);
    expect(
      bracketLayout([6], SESSION_2_STANDARDS, recipe).brackets[0]?.mid,
    ).toEqual([]);
    expect(bracketLayout([], SESSION_2_STANDARDS, recipe)).toEqual({
      opening: [],
      brackets: [],
      closing: [],
      nextRotation: 0,
    });
    expect(
      bracketLayout([1, 1], SESSION_2_STANDARDS, recipe, [1, 2]).nextRotation,
    ).toBe(3);
  });
  it('supports size/count primary-only brackets and custom block counts', () => {
    const standards: Standard[] = [
      {
        name: 'P',
        role: 'primary',
        ranges: [{ from: 50, to: 99 }],
        used: [],
        spare: 0,
      },
    ];
    const recipe: Recipe = {
      ...DEFAULT_RECIPE,
      chunking: { mode: 'count', count: 16 },
      opening: [{ standard: '@primary', count: 1 }],
      mid: [],
      closing: [],
      secondaryPairsPerBracket: 0,
      primaryPerBracket: 3,
      rotationStart: 7,
    };
    expect(bracketLayout([1], standards, recipe)).toEqual({
      opening: [{ standard: 'P', count: 1 }],
      brackets: [
        {
          chunkSize: 1,
          mid: [],
          secondaries: [],
          primary: { standard: 'P', count: 3 },
        },
      ],
      closing: [],
      nextRotation: 0,
    });
    const result = calculateBudget(
      [[{ name: 'X', tag: '', from: 1, to: 30 }]],
      standards,
      recipe,
    );
    expect(result.budget.perStandard.P).toEqual({
      available: 50,
      needed: 49,
      leftAfter: 1,
    });
    expect(result.advisories).toEqual([]);
  });
  it('rejects invalid recipes rather than silently dropping standards', () => {
    expect(() => bracketLayout([1], [], DEFAULT_RECIPE)).toThrow(
      'Exactly one primary',
    );
    expect(() =>
      bracketLayout(
        [1],
        [...SESSION_2_STANDARDS, SESSION_2_STANDARDS[0]!],
        DEFAULT_RECIPE,
      ),
    ).toThrow('unique');
    expect(() =>
      bracketLayout(
        [1],
        SESSION_2_STANDARDS.map((s) => ({ ...s, role: 'primary' })),
        DEFAULT_RECIPE,
      ),
    ).toThrow('Exactly one primary');
    expect(() =>
      bracketLayout([1], SESSION_2_STANDARDS, {
        ...DEFAULT_RECIPE,
        opening: [{ standard: 'missing', count: 1 }],
      }),
    ).toThrow('Unknown standard');
    expect(() =>
      bracketLayout([1], SESSION_2_STANDARDS, {
        ...DEFAULT_RECIPE,
        maxPairsPerBracket: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      bracketLayout(
        [1],
        SESSION_2_STANDARDS.filter((s) => s.role !== 'secondary'),
        DEFAULT_RECIPE,
      ),
    ).toThrow('secondary standard');
    expect(() =>
      bracketLayout([1], SESSION_2_STANDARDS, DEFAULT_RECIPE, []),
    ).toThrow('Pair counts');
  });
});

describe('project budget', () => {
  it('uses the full primary and pair supplies and spreads pairs over run-wide brackets', () => {
    const result = calculateBudget(
      [SESSION_2_UNKNOWNS, SESSION_3_UNKNOWNS],
      SESSION_2_STANDARDS,
      { ...DEFAULT_RECIPE, chunking: { mode: 'budget' } },
    );
    expect(result.budget).toMatchObject({ K: 37, P: 40 });
    expect(result.chunks.map((c) => c.length)).toEqual([19, 18]);
    expect(
      result.pairsPerBracket.flat().flatMap((p, i) => (p === 2 ? [i + 1] : [])),
    ).toEqual([13, 25, 37]);
    expect(
      Object.values(result.budget.perStandard).every((s) => s.leftAfter === 0),
    ).toBe(true);
    expect(result.advisories).toEqual([]);
  });
  it('stops at the first exhausted rotated secondary rather than averaging capacities', () => {
    const standards: Standard[] = [
      {
        name: 'P',
        role: 'primary',
        ranges: [{ from: 100, to: 199 }],
        used: [],
        spare: 0,
      },
      {
        name: 'A',
        role: 'secondary',
        ranges: [{ from: 200, to: 201 }],
        used: [],
        spare: 0,
      },
      { name: 'B', role: 'secondary', ranges: [], used: [], spare: 0 },
      {
        name: 'R',
        role: 'reference',
        ranges: [{ from: 300, to: 301 }],
        used: [],
        spare: 0,
      },
    ];
    const recipe = {
      ...DEFAULT_RECIPE,
      chunking: { mode: 'budget' as const },
      opening: [],
      closing: [],
      mid: [],
    };
    expect(calculateBudget([samples], standards, recipe).budget).toMatchObject({
      K: 1,
      P: 1,
    });
    expect(
      calculateBudget([samples], standards, { ...recipe, rotationStart: 1 })
        .budget,
    ).toMatchObject({ K: 0, P: 0 });
    const limited = calculateBudget([samples], standards, {
      ...recipe,
      mid: [{ standard: 'R', count: 3 }],
      chunking: { mode: 'count', count: 2 },
    });
    expect(limited.advisories).toContain(
      'R needs 3 spots; 2 available after used spots and spare.',
    );
  });
  it('caps by maxPairsPerBracket, by total unknowns, and includes no mid for one chunk', () => {
    const r = calculateBudget([[samples[0]!]], SESSION_2_STANDARDS, {
      ...DEFAULT_RECIPE,
      chunking: { mode: 'budget' },
    });
    expect(r.budget).toMatchObject({ K: 5, P: 10 });
    const r2 = calculateBudget(
      [[{ ...samples[0]!, to: 1 }]],
      SESSION_2_STANDARDS,
      { ...DEFAULT_RECIPE, chunking: { mode: 'budget' } },
    );
    expect(r2.budget).toMatchObject({ K: 1, P: 2 });
    expect(r2.layouts[0]!.brackets[0]!.mid).toEqual([]);
    const capped = calculateBudget(
      [SESSION_2_UNKNOWNS, SESSION_3_UNKNOWNS],
      SESSION_2_STANDARDS,
      {
        ...DEFAULT_RECIPE,
        chunking: { mode: 'budget' as const },
        maxPairsPerBracket: 1,
      },
    );
    expect(capped.budget).toMatchObject({ K: 37, P: 37 });
  });
  it('reports insufficient supplies in every mode without losing requested chunks', () => {
    const standards = SESSION_2_STANDARDS.map((s) => ({ ...s, ranges: [] }));
    for (const chunking of [
      { mode: 'budget' },
      { mode: 'size', size: 2 },
      { mode: 'count', count: 3 },
    ] as const) {
      const r = calculateBudget([samples], standards, {
        ...DEFAULT_RECIPE,
        chunking,
      });
      expect(r.chunks.flat().reduce((a, b) => a + b, 0)).toBe(8);
      expect(r.advisories.length).toBeGreaterThan(0);
    }
    const empty = calculateBudget([[]], standards, DEFAULT_RECIPE);
    expect(empty.budget).toMatchObject({ K: 0, P: 0 });
    expect(empty.chunks).toEqual([[]]);
    expect(empty.advisories).toEqual([]);
  });
});
