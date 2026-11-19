import { describe, expect, it } from 'vitest';
import example from '../../../fixtures/session-1.bracketeer.json';
import { checkSpots } from './checks';
import { parseProject } from './project';
import { DEFAULT_EXPERIMENT, DEFAULT_RECIPE, type Project } from './types';

function project(): Project {
  return {
    version: 1,
    experiment: structuredClone(DEFAULT_EXPERIMENT),
    recipe: {
      ...structuredClone(DEFAULT_RECIPE),
      opening: [],
      mid: [],
      closing: [],
      chunking: { mode: 'count', count: 1 },
    },
    standards: [
      {
        name: 'S513',
        role: 'primary',
        ranges: [{ from: 20, to: 21 }],
        used: [],
        spare: 0,
      },
      {
        name: 'Seiland',
        role: 'secondary',
        ranges: [{ from: 30, to: 31 }],
        used: [],
        spare: 0,
      },
    ],
    sessions: [
      {
        number: 1,
        fixed: false,
        rows: [],
        unknowns: [{ name: 'SYN-H3', tag: '', from: 1, to: 4 }],
      },
    ],
  };
}
const messages = (p: Project) => checkSpots(p).map((i) => i.message);

describe('spot checks', () => {
  it('accepts a valid design and the example without mutating either', () => {
    const p = parseProject(JSON.stringify(example)),
      before = structuredClone(p);
    expect(checkSpots(p)).toEqual([]);
    expect(p).toEqual(before);
    expect(checkSpots(project())).toEqual([]);
  });
  it.each([
    'budget without pools',
    'no primary',
    'no secondary',
    'invalid recipe',
  ])('continues checking an incomplete design with %s', (problem) => {
    const p = project();
    if (problem === 'budget without pools') {
      p.recipe.chunking = { mode: 'budget' };
      p.standards.forEach((s) => {
        s.ranges = [];
      });
    }
    if (problem === 'no primary') p.standards[0]!.role = 'secondary';
    if (problem === 'no secondary') p.standards.pop();
    if (problem === 'invalid recipe') p.recipe.primaryPerBracket = -1;
    p.standards[0]!.used = [99];
    expect(() => checkSpots(p)).not.toThrow();
    expect(messages(p)).toContain('S513: used spot 99 outside its pool.');
    expect(messages(p).some((m) => m.includes('short'))).toBe(
      problem === 'budget without pools',
    );
  });
  it('names identical entry ranges and keeps separate continued entries valid', () => {
    const p = project();
    p.sessions[0]!.unknowns.push(
      { name: 'Y', tag: '', from: 5, to: 6 },
      { name: 'SYN-H3', tag: '', from: 1, to: 4 },
    );
    expect(checkSpots(p)).toContainEqual({
      severity: 'error',
      message: 'Rows 1 and 3, SYN-H3: the same spots 1–4.',
      target: { kind: 'unknown', session: 1, index: 2 },
    });
    p.sessions[0]!.unknowns[2] = { name: 'Y', tag: '', from: 7, to: 8 };
    expect(checkSpots(p).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('reports partial overlaps and overlaps across sessions and minerals on the same mount', () => {
    const p = project();
    p.sessions[0]!.unknowns.push({ name: 'Y', tag: '', from: 4, to: 6 });
    p.sessions.push({
      number: 2,
      fixed: true,
      mineral: 'apatite',
      rows: [],
      unknowns: [{ name: 'Z', tag: '', from: 2, to: 3 }],
    });
    expect(checkSpots(p)).toContainEqual({
      severity: 'error',
      message: 'Row 2, Y: spot 4 is also in row 1, SYN-H3.',
      target: { kind: 'unknown', session: 1, index: 1 },
    });
    expect(checkSpots(p)).toContainEqual({
      severity: 'error',
      message: 'Row 1, Z: spots 2–3 are also in session 1, row 1, SYN-H3.',
      target: { kind: 'unknown', session: 2, index: 0 },
    });
  });
  it('checks unknowns against standard pools with the existing wording', () => {
    const p = project();
    p.standards[0]!.ranges = [{ from: 3, to: 20 }];
    expect(messages(p)).toContain(
      'Row 1, SYN-H3: spots 3–4 are in the S513 pool.',
    );
  });
  it('reports overlaps within a standard and between standards, with range targets', () => {
    const p = project();
    p.standards[0]!.name = 'NIST610';
    p.standards[0]!.ranges = [
      { from: 848, to: 856 },
      { from: 850, to: 860 },
    ];
    p.standards[1]!.ranges = [
      { from: 900, to: 901 },
      { from: 856, to: 858 },
    ];
    expect(checkSpots(p)).toContainEqual({
      severity: 'error',
      message: 'NIST610: ranges 1 and 2 overlap at 850–856.',
      target: { kind: 'standard', name: 'NIST610', index: 1 },
    });
    expect(checkSpots(p)).toContainEqual({
      severity: 'error',
      message: 'Seiland and NIST610 pools overlap at 856–858.',
      target: { kind: 'standard', name: 'Seiland', index: 1 },
    });
  });
  it.each([undefined, null, NaN, Infinity, 1.5, 0, -1])(
    'reports invalid or missing endpoints (%s) without trying to count invalid pools',
    (value) => {
      const p = project();
      p.sessions[0]!.unknowns[0]!.from = value as number;
      p.standards[0]!.ranges[0]!.to = value as number;
      const errors = checkSpots(p).filter((i) => i.severity === 'error');
      expect(errors).toContainEqual({
        severity: 'error',
        message: 'Row 1, SYN-H3: begin must be a positive whole number.',
        target: { kind: 'unknown', session: 1, index: 0 },
      });
      expect(errors).toContainEqual({
        severity: 'error',
        message: 'S513, range 1: end must be a positive whole number.',
        target: { kind: 'standard', name: 'S513', index: 0 },
      });
    },
  );
  it('accepts empty auto ranges, but rejects reversed hand ranges', () => {
    const p = project();
    p.standards[0]!.ranges = [{ from: 20, to: 19, auto: { to: true } }];
    expect(checkSpots(p).filter((i) => i.severity === 'error')).toEqual([]);
    delete p.standards[0]!.ranges[0]!.auto;
    expect(messages(p)).toContain('S513, range 1: end must be at least begin.');
  });
  it('warns about shortages after typed/fixed use and spare, and used spots outside the pool', () => {
    const p = project();
    p.standards[0]!.used = [20, 50, 51];
    p.standards[0]!.spare = 1;
    p.sessions.push({
      number: 2,
      fixed: true,
      unknowns: [],
      rows: [
        {
          ...DEFAULT_EXPERIMENT.defaults,
          Label: 'S513_52',
          Status: null,
          'Laser Scan Position Number': 52,
          meta: { kind: 'primary', name: 'S513', block: 'bracket' },
        },
      ],
    });
    expect(checkSpots(p)).toContainEqual({
      severity: 'warning',
      message: 'S513: needs 2, 0 available (2 short).',
      target: { kind: 'standard', name: 'S513', index: 0 },
    });
    expect(messages(p)).toContain('S513: used spots 50–52 outside its pool.');
    expect(checkSpots(p).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('warns with the specified shortage wording for 80 needed and 78 available', () => {
    const p = project();
    p.recipe.primaryPerBracket = 80;
    p.standards[0]!.ranges = [{ from: 100, to: 177 }];
    expect(messages(p)).toContain('S513: needs 80, 78 available (2 short).');
  });
});

describe('GrainAtlas checks', () => {
  it('counts distinct positions across all entries/ranges and deduplicates GrainAtlas ranges', () => {
    const p = project();
    p.grainatlas = {
      file: 'mount.csv',
      spots: [
        { from: 1, to: 4 },
        { from: 3, to: 4 },
        { from: 20, to: 21 },
      ],
    };
    p.sessions[0]!.unknowns.push({ name: 'SYN-H3', tag: '', from: 1, to: 4 });
    expect(messages(p)).toContain(
      'This run uses 8 spots; GrainAtlas placed 6 (mount.csv).',
    );
    expect(messages(p)).toContain('Not placed in GrainAtlas: Seiland 30–31.');
    p.grainatlas.spots.push({ from: 30, to: 31 });
    expect(messages(p).some((s) => s.includes('GrainAtlas'))).toBe(false);
  });
  it('lists absent positions by entry/range with the specified punctuation', () => {
    const p = project();
    p.sessions[0]!.unknowns[0] = { name: 'SYN-H3', tag: '', from: 1, to: 32 };
    p.standards[0]!.ranges = [{ from: 726, to: 727 }];
    p.standards[1]!.ranges = [{ from: 20, to: 21 }];
    p.grainatlas = {
      file: 'mount.csv',
      spots: [
        { from: 1, to: 30 },
        { from: 40, to: 800 },
      ],
    };
    expect(checkSpots(p)).toContainEqual({
      severity: 'warning',
      message: 'Not placed in GrainAtlas: SYN-H3 31–32.',
      target: { kind: 'unknown', session: 1, index: 0 },
    });
    p.grainatlas.spots = [
      { from: 1, to: 30 },
      { from: 1000, to: 2000 },
    ];
    expect(messages(p)).toContain(
      'Not placed in GrainAtlas: SYN-H3 31–32, S513 726–727.',
    );
  });
  it('emits the exact total warning and caps the absent row list at eight items', () => {
    const p = project();
    p.sessions[0]!.unknowns = [{ name: 'X', tag: '', from: 1, to: 658 }];
    p.standards[0]!.ranges = [{ from: 659, to: 660 }];
    p.standards[1]!.ranges = [{ from: 661, to: 662 }];
    p.grainatlas = { file: 'mount.csv', spots: [{ from: 1, to: 640 }] };
    expect(messages(p)).toContain(
      'This run uses 662 spots; GrainAtlas placed 640 (mount.csv).',
    );
    p.sessions[0]!.unknowns = Array.from({ length: 9 }, (_, i) => ({
      name: `X${i}`,
      tag: '',
      from: i + 1,
      to: i + 1,
    }));
    p.grainatlas.spots = [];
    expect(messages(p)).toContain(
      'Not placed in GrainAtlas: X0 1, X1 2, X2 3, X3 4, X4 5, X5 6, X6 7, X7 8, and 3 more.',
    );
  });
});

it('uses singular spot wording in GrainAtlas and identical-range messages', () => {
  const p = project();
  p.standards = [];
  p.sessions[0]!.unknowns = [{ name: 'A', tag: '', from: 1, to: 1 }];
  p.grainatlas = { file: 'mount.csv', spots: [] };
  expect(messages(p)).toContain(
    'This run uses 1 spot; GrainAtlas placed 0 (mount.csv).',
  );
  p.sessions[0]!.unknowns.push({ name: 'A', tag: '', from: 1, to: 1 });
  expect(messages(p)).toContain('Rows 1 and 2, A: the same spot 1.');
});
