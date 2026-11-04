import { describe, expect, it } from 'vitest';
import { availableSpots, createDrawer, remainingCounts } from './pools';
import { SESSION_2_STANDARDS } from './test-data';
import type { Standard } from './types';

const pool: Standard = {
  name: 'P',
  spare: 0,
  role: 'primary',
  ranges: [
    { from: 8, to: 10 },
    { from: 3, to: 5 },
    { from: 4, to: 6 },
  ],
  used: [4, 9, 9, 999],
};

describe('pools', () => {
  it('sorts and deduplicates overlapping ranges, ignoring used spots outside them', () => {
    const original = structuredClone(pool);
    expect(availableSpots(pool)).toEqual([3, 5, 6, 8, 10]);
    expect(pool).toEqual(original);
    expect(availableSpots({ ...pool, ranges: [] })).toEqual([]);
  });

  it('reports the exact remaining counts before session 2', () => {
    expect(remainingCounts(SESSION_2_STANDARDS)).toEqual({
      S513: 78,
      Seiland: 20,
      '91500': 20,
      PL: 20,
      LTSE: 20,
      NIST610: 18,
      NIST612: 18,
    });
  });

  it('draws independently, reports exhaustion, and returns defensive snapshots', () => {
    const secondary: Standard = {
      name: 'S',
      spare: 0,
      role: 'secondary',
      ranges: [{ from: 20, to: 21 }],
      used: [],
    };
    const drawer = createDrawer([pool, secondary]);
    expect(drawer.take('P', 2)).toEqual({ spots: [3, 5], exhausted: 0 });
    expect(drawer.take('S', 3)).toEqual({
      spots: [20, 21, null],
      exhausted: 1,
    });
    expect(drawer.take('P', 4)).toEqual({
      spots: [6, 8, 10, null],
      exhausted: 1,
    });
    expect(drawer.take('P', 1)).toEqual({ spots: [null], exhausted: 1 });
    expect(drawer.take('P', 0)).toEqual({ spots: [], exhausted: 0 });
    const drawn = drawer.getDrawn();
    expect(drawn).toEqual({ P: [3, 5, 6, 8, 10], S: [20, 21] });
    drawn.P?.push(999);
    expect(drawer.getDrawn().P).not.toContain(999);
    expect(createDrawer([pool]).take('P', 1).spots).toEqual([3]);
    expect(pool.used).toEqual([4, 9, 9, 999]);
  });

  it('walks the two NIST610 ranges in order', () => {
    const nist: Standard = {
      name: 'NIST610',
      spare: 0,
      role: 'reference',
      ranges: [
        { from: 866, to: 874 },
        { from: 848, to: 856 },
      ],
      used: [848, 855],
    };
    expect(createDrawer([nist]).take('NIST610', 10).spots).toEqual([
      849, 850, 851, 852, 853, 854, 856, 866, 867, 868,
    ]);
  });

  it('rejects malformed structured ranges and invalid draw requests', () => {
    for (const ranges of [
      [{ from: 2, to: 1 }],
      [{ from: 0, to: 1 }],
      [{ from: 1.5, to: 2 }],
    ])
      expect(() => availableSpots({ ...pool, ranges })).toThrow(RangeError);
    const drawer = createDrawer([pool]);
    expect(() => drawer.take('missing', 1)).toThrow('Unknown standard');
    expect(() => drawer.take('P', -1)).toThrow(RangeError);
    expect(() => drawer.take('P', 1.2)).toThrow(RangeError);
  });
});

it('reserves the highest unused spots as spare across ranges and never draws them', () => {
  const standard = { ...pool, spare: 2 };
  expect(availableSpots(standard)).toEqual([3, 5, 6]);
  expect(createDrawer([standard]).take('P', 5)).toEqual({
    spots: [3, 5, 6, null, null],
    exhausted: 2,
  });
  expect(availableSpots({ ...pool, spare: 100 })).toEqual([]);
  expect(() => availableSpots({ ...pool, spare: -1 })).toThrow('Spare');
  expect(() => availableSpots({ ...pool, spare: 0.5 })).toThrow('Spare');
});
