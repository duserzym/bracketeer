import { describe, expect, it } from 'vitest';
import { generate, validate } from './sequence';
import { availableSpots } from './pools';
import {
  SESSION_2_STANDARDS,
  SESSION_2_UNKNOWNS,
  SESSION_3_UNKNOWNS,
} from './test-data';
import {
  DEFAULT_EXPERIMENT,
  DEFAULT_RECIPE,
  type Recipe,
  type Row,
  type Unknown,
} from './types';

const session2Recipe: Recipe = {
  ...DEFAULT_RECIPE,
  chunking: { mode: 'count', count: 10 },
  sessionsLeft: 2,
};
const experiment2 = {
  ...DEFAULT_EXPERIMENT,
  name: 'Zircon_04Nov26_Synthetic',
  session: 2,
};
const experiment3 = { ...experiment2, session: 3 };

describe('today’s acceptance sessions', () => {
  it('reproduces session 2 and carries exact spots and rotation into session 3', () => {
    const original = structuredClone({
      experiment2,
      unknowns: SESSION_2_UNKNOWNS,
      standards: SESSION_2_STANDARDS,
      recipe: session2Recipe,
    });
    const second = generate(
      experiment2,
      SESSION_2_UNKNOWNS,
      SESSION_2_STANDARDS,
      session2Recipe,
    );
    expect(second.rows).toHaveLength(294);
    expect(second.chunks).toEqual([24, 24, 24, 24, 23, 23, 23, 23, 23, 23]);
    expect(second.rotation).toEqual([
      'Seiland',
      '91500',
      'PL',
      'LTSE',
      'Seiland',
      '91500',
      'PL',
      'LTSE',
      'Seiland',
      '91500',
    ]);
    expect(second.nextRotation).toBe(2);
    expect(second.rows.slice(0, 9).map((row) => row.Label)).toEqual([
      'NIST612_875',
      'NIST612_876',
      'NIST612_877',
      'NIST610_848',
      'NIST610_849',
      'NIST610_850',
      'S513_650',
      'S513_651',
      'HH3_S_1',
    ]);
    const mid = second.rows.findIndex((row) => row.meta.block === 'mid');
    expect(mid).toBe(143);
    expect(
      second.rows.slice(0, mid).filter((row) => row.meta.kind === 'unknown'),
    ).toHaveLength(119);
    expect(second.rows[mid - 1]?.Label).toBe('TH2_S_119');
    expect(second.rows.slice(mid, mid + 7).map((row) => row.Label)).toEqual([
      'NIST610_851',
      'NIST610_852',
      'NIST610_853',
      'NIST612_878',
      'NIST612_879',
      'NIST612_880',
      'Seiland_780',
    ]);
    expect(second.rows.slice(-6).map((row) => row.Label)).toEqual([
      'NIST612_881',
      'NIST612_882',
      'NIST612_883',
      'NIST610_854',
      'NIST610_855',
      'NIST610_856',
    ]);
    expect(second.warnings).toEqual([]);
    expect(second.budget.Bmax).toBe(10);
    expect(second.budget.warnings).toEqual([]);
    expect(second.drawn).toEqual({
      S513: Array.from({ length: 22 }, (_, i) => 650 + i),
      Seiland: [778, 779, 780, 781, 782, 783],
      '91500': [748, 749, 750, 751, 752, 753],
      PL: [838, 839, 840, 841],
      LTSE: [808, 809, 810, 811],
      NIST610: [848, 849, 850, 851, 852, 853, 854, 855, 856],
      NIST612: [875, 876, 877, 878, 879, 880, 881, 882, 883],
    });
    const standards3 = SESSION_2_STANDARDS.map((s) => ({
      ...s,
      used: [...s.used, ...second.drawn[s.name]!],
    }));
    const recipe3: Recipe = {
      ...session2Recipe,
      sessionsLeft: 1,
      rotationStart: second.nextRotation,
    };
    const third = generate(
      experiment3,
      SESSION_3_UNKNOWNS,
      standards3,
      recipe3,
    );
    expect(third.rows).toHaveLength(288);
    expect(third.chunks).toEqual([23, 23, 23, 23, 23, 23, 23, 23, 22, 22]);
    expect(third.rotation).toEqual([
      'PL',
      'LTSE',
      'Seiland',
      '91500',
      'PL',
      'LTSE',
      'Seiland',
      '91500',
      'PL',
      'LTSE',
    ]);
    expect(third.nextRotation).toBe(0);
    expect(third.rows[8]?.Label).toBe('SYN-J1_xs_235');
    expect(third.rows.slice(0, 8).map((row) => row.Label)).toEqual([
      'NIST612_884',
      'NIST612_885',
      'NIST612_886',
      'NIST610_866',
      'NIST610_867',
      'NIST610_868',
      'S513_672',
      'S513_673',
    ]);
    expect(third.rows.slice(-6).map((row) => row.Label)).toEqual([
      'NIST612_890',
      'NIST612_891',
      'NIST612_892',
      'NIST610_872',
      'NIST610_873',
      'NIST610_874',
    ]);
    expect(third.drawn.S513).toEqual(
      Array.from({ length: 22 }, (_, i) => 672 + i),
    );
    expect([...second.drawn.S513!, ...third.drawn.S513!]).toEqual(
      Array.from({ length: 44 }, (_, i) => 650 + i),
    );
    expect(third.warnings).toEqual([]);
    expect(third.budget.Bmax).toBe(10);
    expect(third.budget.warnings).toEqual([]);
    for (const standard of standards3.filter((s) => s.role === 'secondary')) {
      expect(third.drawn[standard.name]).toEqual(availableSpots(standard));
      expect(
        availableSpots({
          ...standard,
          used: [...standard.used, ...third.drawn[standard.name]!],
        }),
      ).toEqual([]);
    }
    for (const [generated, samples] of [
      [second, SESSION_2_UNKNOWNS],
      [third, SESSION_3_UNKNOWNS],
    ] as const) {
      const expectedUnknowns = samples.flatMap((sample) =>
        Array.from(
          { length: sample.to - sample.from + 1 },
          (_, i) => `${sample.name}_${sample.tag}_${sample.from + i}`,
        ),
      );
      expect(
        generated.rows
          .filter((r) => r.meta.kind === 'unknown')
          .map((r) => r.Label),
      ).toEqual(expectedUnknowns);
      for (const row of generated.rows) {
        expect(row).toMatchObject({
          Status: null,
          'Duration [s]': 30,
          Comment: '<Comment>',
          Evaluate: true,
          'Sample Type': 'UNKNOWN',
          Standard: '',
          'Dilution Factor': 1,
          Amount: '',
          'Final Quantity': '',
          Identifier: '<Identifier>',
          'Laser Output Setting [%]': 46,
        });
        expect(typeof row['Laser Scan Position Number']).toBe('number');
      }
    }
    expect(
      generate(experiment2, SESSION_2_UNKNOWNS, SESSION_2_STANDARDS, {
        ...session2Recipe,
        chunking: { mode: 'auto' },
      }).rows,
    ).toEqual(second.rows);
    expect(
      generate(experiment3, SESSION_3_UNKNOWNS, standards3, {
        ...recipe3,
        chunking: { mode: 'auto' },
      }).rows,
    ).toEqual(third.rows);
    expect({
      experiment2,
      unknowns: SESSION_2_UNKNOWNS,
      standards: SESSION_2_STANDARDS,
      recipe: session2Recipe,
    }).toEqual(original);
  });
});

describe('generation options', () => {
  it('omits an empty tag and honors all experiment column defaults', () => {
    const defaults = {
      ...DEFAULT_EXPERIMENT.defaults,
      'Duration [s]': 15,
      Comment: 'Custom',
      Evaluate: false,
      'Sample Type': 'SAMPLE',
      Standard: 'custom',
      'Dilution Factor': 2.5,
      Amount: '1 mg',
      'Final Quantity': '2 ml',
      Identifier: 'ID',
      'Laser Output Setting [%]': 42,
    };
    const sample = { name: 'SYN-V1', tag: '', from: 384, to: 384 };
    const result = generate(
      { ...DEFAULT_EXPERIMENT, defaults },
      [sample],
      SESSION_2_STANDARDS,
      DEFAULT_RECIPE,
    );
    expect(result.rows.find((r) => r.meta.kind === 'unknown')).toMatchObject({
      ...defaults,
      Label: 'SYN-V1_384',
      'Laser Scan Position Number': 384,
    });
    expect(
      result.rows.every(
        (r) => r['Duration [s]'] === 15 && r.Evaluate === false,
      ),
    ).toBe(true);
    expect(result.rows.some((r) => r.meta.block === 'mid')).toBe(false);
    expect(result.warnings).toEqual([]);
  });

  it('keeps chunks inside samples when requested, including budget advisories', () => {
    const samples: Unknown[] = [
      { name: 'A', tag: '', from: 1, to: 5 },
      { name: 'B', tag: '', from: 6, to: 8 },
    ];
    const recipe: Recipe = {
      ...DEFAULT_RECIPE,
      chunking: { mode: 'count', count: 2 },
      bracketAtSampleBoundaries: true,
    };
    const result = generate(
      DEFAULT_EXPERIMENT,
      samples,
      SESSION_2_STANDARDS,
      recipe,
    );
    expect(result.chunks).toEqual([3, 2, 3]);
    let inChunk: Row[] = [];
    const groups: Row[][] = [];
    for (const row of result.rows) {
      if (row.meta.kind === 'unknown') inChunk.push(row);
      else if (inChunk.length) {
        groups.push(inChunk);
        inChunk = [];
      }
    }
    expect(groups.map((g) => g.length)).toEqual(result.chunks);
    expect(groups.map((g) => [...new Set(g.map((r) => r.meta.name))])).toEqual([
      ['A'],
      ['A'],
      ['B'],
    ]);
    expect(result.budget.chunksPerSession).toBe(3);
    expect(result.warnings).toEqual([]);
    const expanded = generate(
      DEFAULT_EXPERIMENT,
      SESSION_2_UNKNOWNS,
      SESSION_2_STANDARDS,
      { ...session2Recipe, bracketAtSampleBoundaries: true },
    );
    expect(expanded.chunks.length).toBeGreaterThan(10);
    expect(expanded.budget.warnings).toHaveLength(1);
  });

  it('draws two consecutive secondary pairs per bracket then the primary', () => {
    const result = generate(
      DEFAULT_EXPERIMENT,
      [{ name: 'X', tag: '', from: 1, to: 6 }],
      SESSION_2_STANDARDS,
      {
        ...DEFAULT_RECIPE,
        chunking: { mode: 'count', count: 3 },
        secondaryPairsPerBracket: 2,
      },
    );
    expect(result.rotation).toEqual([
      'Seiland',
      '91500',
      'PL',
      'LTSE',
      'Seiland',
      '91500',
    ]);
    expect(
      result.rows.filter((r) => r.meta.block === 'bracket').map((r) => r.Label),
    ).toEqual([
      'Seiland_778',
      'Seiland_779',
      '91500_748',
      '91500_749',
      'S513_652',
      'S513_653',
      'PL_838',
      'PL_839',
      'LTSE_808',
      'LTSE_809',
      'S513_654',
      'S513_655',
      'Seiland_780',
      'Seiland_781',
      '91500_750',
      '91500_751',
      'S513_656',
      'S513_657',
    ]);
    expect(result.nextRotation).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it('accepts the split NIST610 pool and produces the same session 2 rows', () => {
    const standards = SESSION_2_STANDARDS.map((s) =>
      s.name === 'NIST610'
        ? {
            ...s,
            ranges: [
              { from: 848, to: 856 },
              { from: 866, to: 874 },
            ],
          }
        : s,
    );
    expect(
      generate(experiment2, SESSION_2_UNKNOWNS, standards, session2Recipe).rows,
    ).toEqual(
      generate(
        experiment2,
        SESSION_2_UNKNOWNS,
        SESSION_2_STANDARDS,
        session2Recipe,
      ).rows,
    );
  });

  it('still emits exhausted draws as blank positions with row-specific warnings', () => {
    const standards = SESSION_2_STANDARDS.map((s) =>
      s.name === 'S513' ? { ...s, ranges: [{ from: 650, to: 650 }] } : s,
    );
    const result = generate(
      DEFAULT_EXPERIMENT,
      [{ name: 'X', tag: '', from: 1, to: 1 }],
      standards,
      DEFAULT_RECIPE,
    );
    const exhausted = result.rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => row.Label === 'S513_?');
    expect(result.rows).toHaveLength(19);
    expect(exhausted).toHaveLength(3);
    expect(
      exhausted.every(({ row }) => row['Laser Scan Position Number'] === null),
    ).toBe(true);
    expect(result.drawn.S513).toEqual([650]);
    expect(
      result.warnings.map((w) => ({ kind: w.kind, rowIndexes: w.rowIndexes })),
    ).toEqual(
      exhausted.map(({ i }) => ({ kind: 'pool-exhausted', rowIndexes: [i] })),
    );
    for (const { i } of exhausted)
      expect(
        result.warnings.find((w) => w.rowIndexes.includes(i))?.message,
      ).toContain(`Row ${i + 1}`);
    expect(result.budget.Bmax).toBe(0);
    expect(result.budget.warnings).toHaveLength(1);
  });

  it('returns an empty sequence for no unknowns', () => {
    const result = generate(
      DEFAULT_EXPERIMENT,
      [],
      SESSION_2_STANDARDS,
      DEFAULT_RECIPE,
    );
    expect(result.rows).toEqual([]);
    expect(result.chunks).toEqual([]);
    expect(result.rotation).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('validate after manual edits', () => {
  it('finds duplicate, outside-pool, already-used and outside-sample cells from current rows', () => {
    const result = generate(
      experiment2,
      SESSION_2_UNKNOWNS,
      SESSION_2_STANDARDS,
      session2Recipe,
    );
    const edited = structuredClone(result.rows);
    edited[0]!['Laser Scan Position Number'] = 628; // Wrong NIST612 pool; used S513 spot is irrelevant to NIST612.
    edited[6]!['Laser Scan Position Number'] = 628; // Primary: in pool but used in session 1.
    edited[8]!['Laser Scan Position Number'] = 900; // Unknown: outside SYN-H3's range.
    const warnings = validate(edited, SESSION_2_STANDARDS, SESSION_2_UNKNOWNS);
    expect(
      warnings.map(({ kind, rowIndexes }) => ({ kind, rowIndexes })),
    ).toEqual([
      { kind: 'outside-pool', rowIndexes: [0] },
      { kind: 'already-used', rowIndexes: [6] },
      { kind: 'outside-sample', rowIndexes: [8] },
      { kind: 'duplicate-spot', rowIndexes: [0, 6] },
    ]);
    expect(warnings[3]?.message).toContain('Rows 1, 7');
    // Reordering/deleting rows recomputes indexes, without generator history.
    expect(
      validate(
        [edited[6]!, edited[0]!],
        SESSION_2_STANDARDS,
        SESSION_2_UNKNOWNS,
      ).find((w) => w.kind === 'duplicate-spot')?.rowIndexes,
    ).toEqual([0, 1]);
    expect(
      validate([edited[6]!], SESSION_2_STANDARDS, SESSION_2_UNKNOWNS).some(
        (w) => w.kind === 'duplicate-spot',
      ),
    ).toBe(false);
    expect(
      validate(result.rows, SESSION_2_STANDARDS, SESSION_2_UNKNOWNS),
    ).toEqual([]);
  });

  it('catches global unknown/standard duplicates and blank or invalid edited positions', () => {
    const generated = generate(
      experiment2,
      SESSION_2_UNKNOWNS,
      SESSION_2_STANDARDS,
      session2Recipe,
    );
    const primary = structuredClone(generated.rows[6]!);
    const unknown = structuredClone(generated.rows[8]!);
    unknown['Laser Scan Position Number'] = 650;
    expect(
      validate([primary, unknown], SESSION_2_STANDARDS, SESSION_2_UNKNOWNS).map(
        (w) => w.kind,
      ),
    ).toEqual(['outside-sample', 'duplicate-spot']);
    primary['Laser Scan Position Number'] = null;
    unknown['Laser Scan Position Number'] = null;
    expect(
      validate([primary, unknown], SESSION_2_STANDARDS, SESSION_2_UNKNOWNS).map(
        (w) => w.kind,
      ),
    ).toEqual(['pool-exhausted', 'outside-sample']);
    for (const spot of [0, -1, 650.5, NaN]) {
      primary['Laser Scan Position Number'] = spot;
      expect(
        validate([primary], SESSION_2_STANDARDS, SESSION_2_UNKNOWNS)[0]?.kind,
      ).toBe('outside-pool');
    }
  });
});
