import { describe, expect, it } from 'vitest';
import { generate, planProject, validate } from './sequence';
import { newSessionFrom } from './project';
import { availableSpots } from './pools';
import {
  SESSION_2_STANDARDS,
  SESSION_2_UNKNOWNS,
  SESSION_3_UNKNOWNS,
  TEST_PROJECT,
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
};
const experiment2 = {
  ...DEFAULT_EXPERIMENT,
  name: 'Zircon_04Nov26_Synthetic',
  session: 2,
};

describe('project generation', () => {
  it('plans both sessions without mutating inputs and draws every unused spot exactly once', () => {
    const original = structuredClone(TEST_PROJECT);
    const result = planProject(TEST_PROJECT);
    const [second, third] = result.sessions;
    expect(result.sessions.map((s) => s.rows.length)).toEqual([332, 324]);
    expect(result.sessions.map((s) => s.chunks.length)).toEqual([19, 18]);
    expect(result.sessions.map((s) => s.nextRotation)).toEqual([0, 0]);
    expect(second!.rotation).toEqual(
      Array.from(
        { length: 20 },
        (_, i) => ['Seiland', '91500', 'PL', 'LTSE'][i % 4],
      ),
    );
    expect(third!.rotation).toEqual(second!.rotation);
    expect(result.advisories).toEqual([]);
    expect(result.sessions.flatMap((s) => s.warnings)).toEqual([]);
    for (const standard of SESSION_2_STANDARDS) {
      const positions = result.sessions.flatMap((s) =>
        s.rows
          .filter((r) => r.meta.name === standard.name)
          .map((r) => r['Laser Scan Position Number']),
      );
      expect(positions).toEqual(availableSpots(standard));
    }
    for (const [session, samples] of [
      [second!, SESSION_2_UNKNOWNS],
      [third!, SESSION_3_UNKNOWNS],
    ] as const) {
      expect(
        session.rows
          .filter((r) => r.meta.kind === 'unknown')
          .map((r) => r.Label),
      ).toEqual(
        samples.flatMap((s) =>
          Array.from(
            { length: s.to - s.from + 1 },
            (_, i) => `${s.name}_${s.tag}_${s.from + i}`,
          ),
        ),
      );
      for (const row of session.rows) {
        expect(row).toMatchObject({
          ...DEFAULT_EXPERIMENT.defaults,
          Status: null,
        });
        expect(typeof row['Laser Scan Position Number']).toBe('number');
      }
    }
    expect(TEST_PROJECT).toEqual(original);
  });

  it('balances target-18 chunks with 13 brackets per session and mid at 7', () => {
    const r = planProject({
      ...TEST_PROJECT,
      recipe: { ...DEFAULT_RECIPE, chunking: { mode: 'size', size: 18 } },
    });
    expect(r.sessions.map((s) => s.rows.length)).toEqual([306, 300]);
    expect(r.sessions[0]!.chunks).toEqual(Array(13).fill(18));
    expect(r.sessions[1]!.chunks).toEqual([
      ...Array(7).fill(18),
      ...Array(6).fill(17),
    ]);
    expect(r.sessions.map((s) => s.pairsPerBracket)).toEqual([
      Array(13).fill(1),
      Array(13).fill(1),
    ]);
    for (const session of r.sessions) {
      const mid = session.rows.findIndex((row) => row.meta.block === 'mid');
      expect(
        session.rows.slice(0, mid).filter((row) => row.meta.kind === 'unknown'),
      ).toHaveLength(session.chunks.slice(0, 7).reduce((a, b) => a + b, 0));
      expect(session.warnings).toEqual([]);
    }
    expect(r.advisories).toEqual([]);
  });

  it('keeps eight spare per secondary, with twelve one-pair brackets in each session', () => {
    const r = planProject({
      ...TEST_PROJECT,
      standards: TEST_PROJECT.standards.map((s) => ({
        ...s,
        spare: s.role === 'secondary' ? 8 : 0,
      })),
    });
    expect(r.budget).toMatchObject({ K: 24, P: 24 });
    expect(r.sessions.map((s) => s.pairsPerBracket)).toEqual([
      Array(12).fill(1),
      Array(12).fill(1),
    ]);
    expect(r.sessions.flatMap((s) => s.warnings)).toEqual([]);
    expect(r.advisories).toEqual([]);
    expect(r.budget.perStandard.S513!.leftAfter).toBe(26);
    for (const standard of TEST_PROJECT.standards.filter(
      (s) => s.role === 'secondary',
    )) {
      const drawn = r.sessions.flatMap((s) =>
        s.rows
          .filter((row) => row.meta.name === standard.name)
          .map((row) => row['Laser Scan Position Number']),
      );
      expect(drawn).toHaveLength(12);
      expect(
        availableSpots(standard).filter((spot) => !drawn.includes(spot)),
      ).toHaveLength(8);
    }
  });

  it('reports spare larger than a pool and emits exhausted rows without crashing', () => {
    const r = planProject({
      ...TEST_PROJECT,
      standards: TEST_PROJECT.standards.map((s) => ({ ...s, spare: 1000 })),
    });
    expect(r.budget).toMatchObject({ K: 0, P: 0 });
    expect(
      r.advisories.some((a) => a.includes('keep 1000 spare exceeds')),
    ).toBe(true);
    expect(r.sessions.map((s) => s.chunks.length)).toEqual([1, 1]);
    expect(
      r.sessions
        .flatMap((s) => s.warnings)
        .every((w) => w.kind === 'pool-exhausted'),
    ).toBe(true);
    expect(r.sessions.flatMap((s) => s.warnings).length).toBeGreaterThan(0);
  });

  it('reserves fixed rows and advances rotation when marking a planned session as run', () => {
    const initial = planProject(TEST_PROJECT);
    const saved = {
      ...structuredClone(TEST_PROJECT),
      sessions: TEST_PROJECT.sessions.map((s, i) => ({
        ...s,
        rows: initial.sessions[i]!.rows,
      })),
    };
    const continued = newSessionFrom(saved, 2);
    const result = planProject(continued);
    expect(result.sessions[0]!.fixed).toBe(true);
    expect(result.sessions[0]!.rows).toEqual(initial.sessions[0]!.rows);
    expect(result.sessions[1]!.chunks).toEqual(initial.sessions[1]!.chunks);
    // Replanning restarts run-wide bracket numbering for the remaining session.
    expect(
      result.sessions[1]!.pairsPerBracket.flatMap((pairs, i) =>
        pairs === 2 ? [i + 1] : [],
      ),
    ).toEqual([9, 18]);
    expect(result.sessions[1]!.rows.map((row) => row.Label).sort()).toEqual(
      initial.sessions[1]!.rows.map((row) => row.Label).sort(),
    );
    expect(result.sessions[2]!.rows).toEqual([]);
    expect(result.budget).toMatchObject({ K: 18, P: 20 });
    expect(result.sessions.flatMap((s) => s.warnings)).toEqual([]);
    expect(result.advisories).toEqual([]);
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
    expect(result.chunks).toEqual([5, 3]);
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
      ['B'],
    ]);
    expect(result.budget.K).toBe(2);
    expect(result.warnings).toEqual([]);
    const expanded = generate(
      DEFAULT_EXPERIMENT,
      SESSION_2_UNKNOWNS,
      SESSION_2_STANDARDS,
      { ...session2Recipe, bracketAtSampleBoundaries: true },
    );
    expect(expanded.chunks.length).toBeGreaterThan(10);
    expect(expanded.chunks.length).toBe(SESSION_2_UNKNOWNS.length);
    expect(expanded.advisories).toEqual([]);
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
      'Seiland_758',
      'Seiland_759',
      '91500_728',
      '91500_729',
      'S513_652',
      'S513_653',
      'PL_818',
      'PL_819',
      'LTSE_788',
      'LTSE_789',
      'S513_654',
      'S513_655',
      'Seiland_760',
      'Seiland_761',
      '91500_730',
      '91500_731',
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
    expect(result.budget.K).toBe(0);
    expect(result.advisories.length).toBeGreaterThan(0);
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

it('reports cross-session duplicates with both row locations, including unknowns', () => {
  const p = structuredClone(TEST_PROJECT);
  const rows = planProject(p).sessions.map((s) => s.rows);
  const primary = rows[0]![6]!;
  const unknown = rows[1]![8]!;
  unknown['Laser Scan Position Number'] = primary['Laser Scan Position Number'];
  const other = { ...p.sessions[0]!, rows: rows[0]!, fixed: true };
  const warnings = validate(
    rows[1]!,
    p.standards,
    p.sessions[1]!.unknowns,
    [other],
    3,
  );
  expect(warnings.find((w) => w.kind === 'duplicate-spot')).toMatchObject({
    rowIndexes: [8],
    locations: [
      { session: 3, rowIndex: 8 },
      { session: 2, rowIndex: 6 },
    ],
  });
  expect(warnings.find((w) => w.kind === 'duplicate-spot')!.message).toContain(
    'Session 2 row 7',
  );
  const edited = structuredClone(rows[1]![6]!);
  edited['Laser Scan Position Number'] = primary['Laser Scan Position Number'];
  expect(
    validate([edited], p.standards, [], [other], 3).map((w) => w.kind),
  ).toEqual(['already-used', 'duplicate-spot']);
});

it('validates the current label and tag after manual edits', () => {
  const rows = generate(
    DEFAULT_EXPERIMENT,
    [{ name: 'A', tag: 'S', from: 1, to: 1 }],
    SESSION_2_STANDARDS,
    DEFAULT_RECIPE,
  ).rows;
  const unknown = rows.find((r) => r.meta.kind === 'unknown')!;
  expect(
    validate([{ ...unknown, Label: 'A_xs_1' }], SESSION_2_STANDARDS, [
      { name: 'A', tag: 'S', from: 1, to: 1 },
    ])[0]!.kind,
  ).toBe('outside-sample');
  expect(
    validate(
      [{ ...unknown, Label: 'unrecognized' }],
      SESSION_2_STANDARDS,
      [],
    )[0]!.kind,
  ).toBe('unrecognized-row');
});
