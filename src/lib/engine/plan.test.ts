import { describe, expect, it } from 'vitest';
import {
  bracketLayout,
  calculateBudget,
  chunkCount,
  chunkSizes,
  midBracketIndex,
  planChunks,
} from './plan';
import { SESSION_2_STANDARDS } from './test-data';
import {
  DEFAULT_RECIPE,
  type Recipe,
  type Standard,
  type Unknown,
} from './types';

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
    expect(() => chunkSizes(10, 0)).toThrow(RangeError);
    expect(() => chunkSizes(-1, 1)).toThrow(RangeError);
    expect(() => chunkSizes(10, 1.5)).toThrow(RangeError);
  });

  it('resolves size, count and auto modes, including an empty or impossible run', () => {
    expect(chunkCount(234, { mode: 'size', size: 25 }, 3)).toBe(10);
    expect(chunkCount(234, { mode: 'count', count: 10 }, 3)).toBe(10);
    expect(chunkCount(3, { mode: 'count', count: 10 }, 3)).toBe(3);
    expect(chunkCount(234, { mode: 'auto' }, 10)).toBe(10);
    expect(chunkCount(234, { mode: 'auto' }, 0)).toBe(1);
    expect(chunkCount(0, { mode: 'auto' }, 0)).toBe(0);
    expect(() => chunkCount(3, { mode: 'size', size: 0 }, 1)).toThrow(
      RangeError,
    );
    expect(() => chunkCount(3, { mode: 'count', count: -1 }, 1)).toThrow(
      RangeError,
    );
  });

  it('uses a shared target size when chunking at sample boundaries', () => {
    const samples: Unknown[] = [
      { name: 'A', tag: '', from: 1, to: 5 },
      { name: 'B', tag: '', from: 6, to: 8 },
    ];
    const recipe: Recipe = {
      ...DEFAULT_RECIPE,
      chunking: { mode: 'count', count: 2 },
    };
    expect(planChunks(samples, recipe, 2)).toEqual([4, 4]);
    recipe.bracketAtSampleBoundaries = true;
    expect(planChunks(samples, recipe, 2)).toEqual([3, 2, 3]);
    expect(
      planChunks(samples, { ...recipe, chunking: { mode: 'auto' } }, 2),
    ).toEqual([3, 2, 3]);
    expect(
      planChunks(
        samples,
        { ...recipe, chunking: { mode: 'size', size: 2 } },
        2,
      ),
    ).toEqual([2, 2, 1, 2, 1]);
    expect(planChunks([], recipe, 0)).toEqual([]);
    expect(() => planChunks([{ ...samples[0]!, from: 6 }], recipe, 2)).toThrow(
      RangeError,
    );
  });

  it('places the mid block by cumulative unknowns, with ties earlier', () => {
    expect(midBracketIndex([24, 24, 24, 24, 23, 23, 23, 23, 23, 23])).toBe(4);
    expect(midBracketIndex([2, 2, 2])).toBe(0);
    expect(midBracketIndex([1, 1, 8])).toBe(1);
    expect(midBracketIndex([10])).toBeNull();
    expect(midBracketIndex([])).toBeNull();
    expect(() => midBracketIndex([1, 0])).toThrow(RangeError);
  });
});

describe('bracket layout', () => {
  it('places blocks, resolves @primary, and rotates two pairs per bracket', () => {
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
    expect(layout.brackets.map((b) => b.mid)).toEqual([recipe.mid, [], []]);
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
  });

  it('supports primary-only brackets and custom block counts', () => {
    const standards: Standard[] = [
      { name: 'P', role: 'primary', ranges: [{ from: 50, to: 99 }], used: [] },
    ];
    const recipe: Recipe = {
      ...DEFAULT_RECIPE,
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
    expect(calculateBudget(30, standards, recipe).Bmax).toBe(16);
  });

  it('rejects invalid structured recipes rather than silently dropping standards', () => {
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
        sessionsLeft: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      bracketLayout(
        [1],
        SESSION_2_STANDARDS.filter((s) => s.role !== 'secondary'),
        DEFAULT_RECIPE,
      ),
    ).toThrow('secondary standard');
  });
});

describe('exact multi-session budget', () => {
  it('gives Bmax 10 before session 2, with C 11 exceeding rotating pools', () => {
    const recipe: Recipe = {
      ...DEFAULT_RECIPE,
      sessionsLeft: 2,
      chunking: { mode: 'count', count: 10 },
    };
    const result = calculateBudget(234, SESSION_2_STANDARDS, recipe);
    expect(result.Bmax).toBe(10);
    expect(result.perStandard).toEqual({
      S513: { need: 44, remaining: 78 },
      Seiland: { need: 10, remaining: 10 },
      '91500': { need: 10, remaining: 10 },
      PL: { need: 10, remaining: 10 },
      LTSE: { need: 10, remaining: 10 },
      NIST610: { need: 18, remaining: 18 },
      NIST612: { need: 18, remaining: 18 },
    });
    expect(result.warnings).toEqual([]);
    const tooMany = calculateBudget(234, SESSION_2_STANDARDS, recipe, 11);
    expect(tooMany.perStandard.Seiland?.need).toBe(12);
    expect(tooMany.perStandard['91500']?.need).toBe(12);
    expect(tooMany.warnings).toHaveLength(1);
  });

  it('continues at PL before session 3 and again gives Bmax 10', () => {
    const consumed: Record<string, number[]> = {
      S513: Array.from({ length: 22 }, (_, i) => 650 + i),
      Seiland: [778, 779, 780, 781, 782, 783],
      '91500': [748, 749, 750, 751, 752, 753],
      PL: [838, 839, 840, 841],
      LTSE: [808, 809, 810, 811],
      NIST610: [848, 849, 850, 851, 852, 853, 854, 855, 856],
      NIST612: [875, 876, 877, 878, 879, 880, 881, 882, 883],
    };
    const standards = SESSION_2_STANDARDS.map((s) => ({
      ...s,
      used: [...s.used, ...consumed[s.name]!],
    }));
    const result = calculateBudget(228, standards, {
      ...DEFAULT_RECIPE,
      rotationStart: 2,
    });
    expect(result.Bmax).toBe(10);
    expect(result.perStandard.PL).toEqual({ need: 6, remaining: 6 });
    expect(result.perStandard.LTSE).toEqual({ need: 6, remaining: 6 });
    expect(result.perStandard.Seiland).toEqual({ need: 4, remaining: 4 });
    expect(result.perStandard['91500']).toEqual({ need: 4, remaining: 4 });
    expect(result.warnings).toEqual([]);
  });

  it('does not average secondary demand, and includes the mid-block discontinuity', () => {
    const standards: Standard[] = [
      {
        name: 'P',
        role: 'primary',
        ranges: [{ from: 100, to: 199 }],
        used: [],
      },
      {
        name: 'A',
        role: 'secondary',
        ranges: [{ from: 200, to: 201 }],
        used: [],
      },
      { name: 'B', role: 'secondary', ranges: [], used: [] },
      {
        name: 'R',
        role: 'reference',
        ranges: [{ from: 300, to: 301 }],
        used: [],
      },
    ];
    const recipe: Recipe = {
      ...DEFAULT_RECIPE,
      opening: [],
      closing: [],
      mid: [],
    };
    expect(calculateBudget(10, standards, recipe).Bmax).toBe(1);
    expect(
      calculateBudget(10, standards, { ...recipe, rotationStart: 1 }).Bmax,
    ).toBe(0);
    const midLimited = {
      ...recipe,
      secondaryPairsPerBracket: 0,
      mid: [{ standard: 'R', count: 3 }],
    };
    expect(calculateBudget(10, standards, midLimited).Bmax).toBe(1);
    expect(
      calculateBudget(10, standards, { ...recipe, sessionsLeft: 2 }).Bmax,
    ).toBe(0);
  });

  it('warns in size/count modes and when even one chunk cannot fit', () => {
    for (const chunking of [
      { mode: 'size', size: 10 },
      { mode: 'count', count: 11 },
    ] as const) {
      const result = calculateBudget(234, SESSION_2_STANDARDS, {
        ...DEFAULT_RECIPE,
        sessionsLeft: 2,
        chunking,
      });
      expect(result.Bmax).toBe(10);
      expect(result.warnings).toHaveLength(1);
    }
    const standards = SESSION_2_STANDARDS.map((s) => ({ ...s, ranges: [] }));
    const result = calculateBudget(3, standards, DEFAULT_RECIPE);
    expect(result.Bmax).toBe(0);
    expect(result.chunksPerSession).toBe(1);
    expect(result.warnings[0]).toContain('No bracket count fits');
    expect(calculateBudget(0, standards, DEFAULT_RECIPE)).toMatchObject({
      Bmax: 0,
      chunksPerSession: 0,
      warnings: [],
    });
    expect(() => calculateBudget(3, standards, DEFAULT_RECIPE, 4)).toThrow(
      RangeError,
    );
  });
});
