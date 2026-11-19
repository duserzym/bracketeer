import { describe, expect, it } from 'vitest';
import example from '../../../fixtures/session-1.bracketeer.json';
import { countStandards } from './count';
import { checkSpots } from './checks';
import {
  addSample,
  addStandardRange,
  autoStandardRange,
  autoUnknown,
  editStandardRange,
  editUnknown,
  resolveAuto,
} from './numbering';
import { parseProject, serializeProject } from './project';
import {
  DEFAULT_EXPERIMENT,
  DEFAULT_RECIPE,
  type Project,
  type Unknown,
} from './types';

function design(): Project {
  return {
    version: 1,
    experiment: structuredClone(DEFAULT_EXPERIMENT),
    recipe: {
      ...structuredClone(DEFAULT_RECIPE),
      opening: [],
      mid: [],
      closing: [],
      chunking: { mode: 'size', size: 2 },
    },
    standards: [
      { name: 'P', role: 'primary', ranges: [], used: [], spare: 0 },
      { name: 'A', role: 'secondary', ranges: [], used: [], spare: 0 },
      { name: 'B', role: 'secondary', ranges: [], used: [], spare: 0 },
    ],
    sessions: [
      {
        number: 1,
        fixed: false,
        rows: [],
        unknowns: [{ name: 'X', tag: '', from: 1, to: 4 }],
      },
    ],
  };
}
function auto(name: string, from: number, to: number): Unknown {
  return { name, tag: '', from, to, auto: { from: true, to: true } };
}
function positions(p: Project) {
  return p.sessions[0]!.unknowns.map((u) => [u.from, u.to]);
}

describe('automatic numbering', () => {
  it('leaves the example deep-equal, identical by reference and serialized unchanged', () => {
    const p = parseProject(JSON.stringify(example));
    const before = structuredClone(p),
      text = serializeProject(p);
    expect(resolveAuto(p)).toBe(p);
    expect(p).toEqual(before);
    expect(serializeProject(resolveAuto(p))).toBe(text);
    expect(p.recipe.chunking).toEqual({ mode: 'budget' });
  });

  it.each(['budget', 'primary', 'secondary', 'recipe'])(
    'resolves begins and unknowns when %s prevents counting',
    (problem) => {
      const p = design();
      p.sessions[0]!.unknowns = [auto('X', 10, 13), auto('Y', 20, 22)];
      p.standards[0]!.ranges = [
        { from: 50, to: 60, auto: { from: true, to: true } },
      ];
      if (problem === 'budget') {
        p.recipe.chunking = { mode: 'budget' };
        p.standards[0]!.ranges[0]!.to = 0;
      }
      if (problem === 'primary') p.standards[0]!.role = 'secondary';
      if (problem === 'secondary')
        p.standards = p.standards.filter((s) => s.role !== 'secondary');
      if (problem === 'recipe') p.recipe.primaryPerBracket = -1;
      const next = resolveAuto(p);
      expect(positions(next)).toEqual([
        [1, 4],
        [5, 7],
      ]);
      expect(next.standards[0]!.ranges[0]).toMatchObject({
        from: 8,
        to: problem === 'budget' ? 0 : 60,
      });
      expect(() => checkSpots(next)).not.toThrow();
      expect(checkSpots(next).some((i) => i.message.includes('short'))).toBe(
        false,
      );
      expect(resolveAuto(next)).toBe(next);
    },
  );

  it('drops an empty automatic last range before appending a range', () => {
    const p = design();
    p.standards[0]!.ranges = [
      { from: 20, to: 23 },
      { from: 90, to: 89, auto: { to: true } },
    ];
    const next = addStandardRange(p, 'P');
    expect(next.standards[0]!.ranges).toHaveLength(2);
    expect(next.standards[0]!.ranges[1]!.auto?.to).toBe(true);
    expect(checkSpots(next).filter((i) => i.severity === 'error')).toEqual([]);
    expect(p.standards[0]!.ranges[1]!.to).toBe(89);
  });

  it('walks sessions in number order, retains fixed values and chains through hand endpoints', () => {
    const p = design();
    p.sessions = [
      { number: 3, fixed: false, rows: [], unknowns: [auto('C', 1, 3)] },
      { number: 1, fixed: false, rows: [], unknowns: [auto('A', 7, 8)] },
      { number: 2, fixed: true, rows: [], unknowns: [auto('B', 20, 24)] },
    ];
    const before = structuredClone(p),
      next = resolveAuto(p);
    expect(
      next.sessions.map((s) => s.unknowns.map((u) => [u.from, u.to])),
    ).toEqual([[[25, 27]], [[1, 2]], [[20, 24]]]);
    expect(p).toEqual(before);
    expect(resolveAuto(next)).toBe(next);
  });

  it('keeps row 4 hand begin when row 2 count moves row 3; row 5 chains from row 4', () => {
    const p = design();
    p.sessions[0]!.unknowns = [
      auto('1', 1, 5),
      auto('2', 6, 10),
      auto('3', 11, 15),
      { name: '4', tag: '', from: 50, to: 54, auto: { to: true } },
      auto('5', 55, 59),
    ];
    const before = structuredClone(p);
    const next = editUnknown(p, 1, 1, 'count', 10);
    expect(positions(next)).toEqual([
      [1, 5],
      [6, 15],
      [16, 20],
      [50, 54],
      [55, 59],
    ]);
    expect(p).toEqual(before);
    expect(resolveAuto(next)).toBe(next);
  });

  it('edits begin, end and count, preserving hand values and restoring Auto', () => {
    const p = design();
    p.sessions[0]!.unknowns = [auto('X', 1, 4), auto('Y', 5, 8)];
    let next = editUnknown(p, 1, 0, 'from', 10);
    expect(positions(next)).toEqual([
      [10, 13],
      [14, 17],
    ]);
    expect(next.sessions[0]!.unknowns[0]!.auto).toEqual({ to: true });
    next = editUnknown(next, 1, 0, 'to', 15);
    expect(positions(next)).toEqual([
      [10, 15],
      [16, 19],
    ]);
    next = editUnknown(next, 1, 0, 'from', 12);
    expect(positions(next)[0]).toEqual([12, 15]); // Hand end never moves.
    next = autoUnknown(next, 1, 0, 'from');
    expect(positions(next)[0]).toEqual([1, 15]);
    next = autoUnknown(next, 1, 0, 'to');
    next = editUnknown(next, 1, 0, 'from', 2);
    expect(positions(next)[0]).toEqual([2, 16]);
  });

  it('adds a sample with the supplied count after the preceding session/entry', () => {
    const p = design();
    const next = addSample(p, 1, { name: 'Y', tag: 'S' }, 3);
    expect(next.sessions[0]!.unknowns[1]).toEqual({
      name: 'Y',
      tag: 'S',
      from: 5,
      to: 7,
      auto: { from: true, to: true },
    });
    expect(p.sessions[0]!.unknowns).toHaveLength(1);
    next.sessions.push({ number: 2, fixed: false, rows: [], unknowns: [] });
    expect(
      addSample(next, 2, { name: 'Z', tag: '' }, 2).sessions[1]!.unknowns[0]!
        .from,
    ).toBe(8);
  });

  it.each(['size', 'count'] as const)(
    'fills needed plus spare in %s, skipping typed and fixed use',
    (mode) => {
      const p = design();
      if (mode === 'count') p.recipe.chunking = { mode, count: 2 };
      p.standards[0]!.used = [5, 7];
      p.standards[0]!.spare = 1;
      p.sessions.push({
        number: 2,
        fixed: true,
        unknowns: [],
        rows: [
          {
            ...DEFAULT_EXPERIMENT.defaults,
            Label: 'P_6',
            Status: null,
            'Laser Scan Position Number': 6,
            meta: { kind: 'primary', name: 'P', block: 'bracket' },
          },
        ],
      });
      const next = resolveAuto(p);
      expect(next.standards.map((s) => s.ranges)).toEqual([
        [{ from: 5, to: 12, auto: { from: true, to: true } }],
        [{ from: 13, to: 14, auto: { from: true, to: true } }],
        [{ from: 15, to: 16, auto: { from: true, to: true } }],
      ]);
      expect(countStandards(next).every((c) => c.short === 0)).toBe(true);
      expect(resolveAuto(next)).toBe(next);
    },
  );

  it('walks table/range order and keeps hand endpoints', () => {
    const p = design();
    p.standards[0]!.ranges = [
      { from: 30, to: 31 },
      { from: 1, to: 2, auto: { from: true, to: true } },
    ];
    p.standards[1]!.ranges = [{ from: 100, to: 101 }];
    p.standards[2]!.ranges = [
      { from: 3, to: 4, auto: { from: true, to: true } },
    ];
    const next = resolveAuto(p);
    expect(
      next.standards.map((s) => s.ranges.map((r) => [r.from, r.to])),
    ).toEqual([
      [
        [30, 31],
        [32, 33],
      ],
      [[100, 101]],
      [[102, 103]],
    ]);
    expect(resolveAuto(next)).toBe(next);
  });

  it('makes the last auto range empty when earlier unique unused spots suffice', () => {
    const p = design();
    p.standards[0]!.ranges = [
      { from: 20, to: 23 },
      { from: 21, to: 23 },
      { from: 90, to: 100, auto: { to: true } },
    ];
    const next = resolveAuto(p);
    expect(next.standards[0]!.ranges[2]).toEqual({
      from: 90,
      to: 89,
      auto: { to: true },
    });
    expect(countStandards(next)[0]!.available).toBe(4);
    expect(resolveAuto(next)).toBe(next);
  });

  it('removes only the sole fully automatic range when no spots are needed', () => {
    const p = resolveAuto(design());
    p.sessions[0]!.unknowns = [];
    p.standards[1]!.ranges = [{ from: 40, to: 41, auto: { to: true } }];
    p.standards[2]!.ranges = [{ from: 50, to: 51 }];
    const next = resolveAuto(p);
    expect(next.standards.map((s) => s.ranges)).toEqual([
      [],
      [{ from: 40, to: 39, auto: { to: true } }],
      [{ from: 50, to: 51 }],
    ]);
    expect(resolveAuto(next)).toBe(next);
  });

  it('leaves auto ends and absent ranges alone in budget mode', () => {
    const p = resolveAuto(design());
    p.recipe.chunking = { mode: 'budget' };
    p.standards[0]!.ranges[0]!.to = 50;
    p.standards[1]!.ranges[0]!.to = 60;
    p.standards[2]!.ranges = [];
    const next = resolveAuto(p);
    expect(
      next.standards.map((s) => s.ranges.map((r) => [r.from, r.to])),
    ).toEqual([[[5, 50]], [[51, 60]], []]);
    expect(resolveAuto(next)).toBe(next);
  });

  it('edits standard begin/end, restores Auto, and keeps a typed end', () => {
    const p = resolveAuto(design());
    let next = editStandardRange(p, 'P', 0, 'from', 100);
    expect(next.standards[0]!.ranges[0]).toEqual({
      from: 100,
      to: 103,
      auto: { to: true },
    });
    next = editStandardRange(next, 'P', 0, 'to', 110);
    next = editStandardRange(next, 'P', 0, 'from', 101);
    expect(next.standards[0]!.ranges[0]).toEqual({ from: 101, to: 110 });
    next = autoStandardRange(next, 'P', 0, 'to');
    expect(next.standards[0]!.ranges[0]!.to).toBe(104);
    next = autoStandardRange(next, 'P', 0, 'from');
    expect(next.standards[0]!.ranges[0]).toEqual({
      from: 5,
      to: 8,
      auto: { from: true, to: true },
    });
    expect(p.standards[0]!.ranges[0]!.from).toBe(5);
  });

  it('adds a hand begin above the mount and freezes the preceding end', () => {
    const p = resolveAuto(design());
    p.grainatlas = { file: 'mount.csv', spots: [{ from: 1, to: 200 }] };
    const next = addStandardRange(p, 'P');
    expect(next.standards[0]!.ranges).toEqual([
      { from: 5, to: 8, auto: { from: true } },
      { from: 201, to: 200, auto: { to: true } },
    ]);
    expect(p.standards[0]!.ranges).toHaveLength(1);
    expect(resolveAuto(next)).toBe(next);
    expect(() => autoStandardRange(next, 'P', 0, 'to')).toThrow(
      'Only the last',
    );
  });

  it('keeps crossed hand endpoints for checks rather than moving them', () => {
    const p = design();
    const next = editUnknown(p, 1, 0, 'from', 10);
    expect(positions(next)).toEqual([[10, 4]]);
    expect(
      checkSpots(next).some(
        (i) => i.message === 'Row 1, X: end must be at least begin.',
      ),
    ).toBe(true);
    expect(resolveAuto(next)).toBe(next);

    const budget = resolveAuto(design());
    budget.recipe.chunking = { mode: 'budget' };
    const changed = editStandardRange(budget, 'P', 0, 'from', 100);
    expect(changed.standards[0]!.ranges[0]).toEqual({
      from: 100,
      to: 8,
      auto: { to: true },
    });
    expect(resolveAuto(changed)).toBe(changed);
  });

  it('fills standards across mineral groups and shared references without pools', () => {
    const p = design();
    p.wizard = { step: 3, mineral: 'zircon' };
    p.recipe.secondaries = 'cadence';
    p.recipe.openingBracket = true;
    p.recipe.opening = [{ standard: 'NIST', count: 3 }];
    p.standards.push(
      {
        name: 'AP',
        role: 'primary',
        mineral: 'apatite',
        ranges: [],
        used: [],
        spare: 0,
      },
      {
        name: 'AS',
        role: 'secondary',
        mineral: 'apatite',
        cadence: 'odd',
        perBracket: 3,
        ranges: [],
        used: [],
        spare: 1,
      },
      { name: 'NIST', role: 'reference', ranges: [], used: [], spare: 0 },
    );
    p.sessions.push({
      number: 2,
      fixed: false,
      mineral: 'apatite',
      rows: [],
      unknowns: [auto('Y', 1, 4)],
    });
    const next = resolveAuto(p);
    expect(next.sessions[1]!.unknowns[0]!.from).toBe(5);
    expect(
      next.standards.map((s) => s.ranges.map((r) => [r.from, r.to])),
    ).toEqual([
      [[9, 14]],
      [[15, 20]],
      [[21, 26]],
      [[27, 32]],
      [[33, 39]],
      [[40, 45]],
    ]);
    expect(countStandards(next).every((c) => c.short === 0)).toBe(true);
    expect(checkSpots(next)).toEqual([]);
    expect(resolveAuto(next)).toBe(next);
  });

  it('rejects invalid edit targets, fixed sessions and nonpositive/noninteger input', () => {
    const p = design();
    expect(() => editUnknown(p, 99, 0, 'count', 1)).toThrow('does not exist');
    expect(() => autoUnknown(p, 1, 99, 'from')).toThrow('does not exist');
    expect(() => editStandardRange(p, 'missing', 0, 'from', 1)).toThrow(
      'does not exist',
    );
    expect(() => autoStandardRange(p, 'P', 0, 'from')).toThrow(
      'does not exist',
    );
    for (const n of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => editUnknown(p, 1, 0, 'count', n)).toThrow('positive whole');
      expect(() => addSample(p, 1, { name: 'Y', tag: '' }, n)).toThrow(
        'positive whole',
      );
      expect(() => editStandardRange(p, 'P', 0, 'to', n)).toThrow(
        'positive whole',
      );
    }
    p.sessions[0]!.fixed = true;
    expect(() => editUnknown(p, 1, 0, 'to', 5)).toThrow('fixed');
    expect(() => addSample(p, 1, { name: 'Y', tag: '' }, 1)).toThrow('fixed');
  });
});
