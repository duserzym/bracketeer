import { describe, expect, it } from 'vitest';
import { deriveSession } from './derive';
import { SESSION_2_STANDARDS } from './test-data';
import { DEFAULT_EXPERIMENT, type Row } from './types';

const row = (Label: string, spot: number | null): Row => ({
  ...DEFAULT_EXPERIMENT.defaults,
  Label,
  Status: null,
  'Laser Scan Position Number': spot,
  meta: { kind: 'unknown', name: 'stale metadata', block: 'unknowns' },
});

describe('session derivation', () => {
  it('splits unknowns at sample/tag changes, position gaps, descending spots and standard interruptions', () => {
    const input = [
      row('A_S_1', 1),
      row('A_S_2', 2),
      row('A_S_4', 4),
      row('A_S_3', 3),
      row('A_xs_5', 5),
      row('B_6', 6),
      row('S513_650', 650),
      row('B_7', 7),
    ];
    const derived = deriveSession(input, SESSION_2_STANDARDS);
    expect(derived.unknowns).toEqual([
      { name: 'A', tag: 'S', from: 1, to: 2 },
      { name: 'A', tag: 'S', from: 4, to: 4 },
      { name: 'A', tag: 'S', from: 3, to: 3 },
      { name: 'A', tag: 'xs', from: 5, to: 5 },
      { name: 'B', tag: '', from: 6, to: 6 },
      { name: 'B', tag: '', from: 7, to: 7 },
    ]);
    expect(derived.structure.chunks).toEqual([6, 1]);
    expect(derived.structure.brackets).toEqual([
      [{ standard: 'S513', count: 1 }],
      [],
    ]);
    expect(derived.used.S513).toEqual([650]);
    expect(derived.issues).toEqual([]);
  });
  it('reports invalid unknown positions, deduplicates used spots and counts exhausted standards', () => {
    const input = [
      row('S513_650', 650),
      row('S513_650', 650),
      row('A_1', null),
      row('S513_?', null),
    ];
    const d = deriveSession(input, SESSION_2_STANDARDS);
    expect(d.used.S513).toEqual([650]);
    expect(d.unknowns).toEqual([]);
    expect(d.issues.map((i) => i.rowIndex)).toEqual([2]);
    expect(d.structure.opening).toEqual([{ standard: 'S513', count: 2 }]);
    expect(d.structure.brackets).toEqual([[{ standard: 'S513', count: 1 }]]);
    expect(deriveSession([], SESSION_2_STANDARDS).structure).toEqual({
      opening: [],
      chunks: [],
      brackets: [],
      closing: [],
    });
  });
});
