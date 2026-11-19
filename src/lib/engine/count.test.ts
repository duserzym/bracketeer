import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countStandards } from './count';
import { projectLayouts } from './plan';
import { parseProject } from './project';
import { planProject } from './sequence';
import { TEST_PROJECT } from './test-data';
import {
  DEFAULT_EXPERIMENT,
  DEFAULT_RECIPE,
  type Project,
  type Standard,
} from './types';

const example = () =>
  parseProject(
    readFileSync(
      new URL('../../../fixtures/session-1.bracketeer.json', import.meta.url),
      'utf8',
    ),
  );

function checkEmitted(project: Project) {
  const original = structuredClone(project);
  const plan = planProject(project);
  for (const count of countStandards(project)) {
    const emitted = plan.sessions
      .filter((s) => !s.fixed)
      .map((session) => ({
        session: session.number,
        needed: session.rows.filter(
          (r) => r.meta.name === count.name && r.meta.kind === count.role,
        ).length,
      }));
    expect(count.perSession, count.name).toEqual(emitted);
    expect(count.needed, count.name).toBe(
      emitted.reduce((n, s) => n + s.needed, 0),
    );
    expect(count.terms.reduce((n, t) => n + t.count * t.each, 0)).toBe(
      count.needed,
    );
    expect(count.needed).toBe(plan.budget.perStandard[count.name]!.needed);
  }
  expect(project).toEqual(original);
  return plan;
}

describe('design counts', () => {
  it('has the exact golden example terms and formulas, excluding fixed use', () => {
    const project = example();
    const counts = countStandards(project);
    expect(counts.map((c) => c.name)).toEqual(
      project.standards.map((s) => s.name),
    );
    expect(counts.find((c) => c.name === 'S513')).toEqual({
      name: 'S513',
      role: 'primary',
      mineral: '',
      needed: 78,
      spare: 0,
      placed: 100,
      available: 78,
      short: 0,
      perSession: [
        { session: 2, needed: 40 },
        { session: 3, needed: 38 },
      ],
      terms: [
        { count: 2, each: 2, label: 'openings' },
        { count: 37, each: 2, label: 'brackets' },
      ],
      formula: '2 openings × 2 + 37 brackets × 2 = 78',
    });
    for (const name of ['Seiland', '91500', 'PL', 'LTSE']) {
      expect(counts.find((c) => c.name === name)?.terms).toEqual([
        { count: 10, each: 2, label: 'pairs' },
      ]);
      expect(counts.find((c) => c.name === name)?.formula).toBe(
        '10 pairs × 2 = 20',
      );
    }
    for (const name of ['NIST610', 'NIST612']) {
      expect(counts.find((c) => c.name === name)?.terms).toEqual([
        { count: 2, each: 3, label: 'openings' },
        { count: 2, each: 3, label: 'mids' },
        { count: 2, each: 3, label: 'closings' },
      ]);
      expect(counts.find((c) => c.name === name)?.formula).toBe(
        '2 openings × 3 + 2 mids × 3 + 2 closings × 3 = 18',
      );
    }
    checkEmitted(project);
  });

  it('matches emitted rows in all original modes, including shortages and sample boundaries', () => {
    for (const project of [example(), structuredClone(TEST_PROJECT)])
      for (const chunking of [
        { mode: 'budget' },
        { mode: 'size', size: 18 },
        { mode: 'count', count: 3 },
      ] as const)
        for (const bracketAtSampleBoundaries of [false, true]) {
          const p = structuredClone(project);
          p.recipe = { ...p.recipe, chunking, bracketAtSampleBoundaries };
          checkEmitted(p);
          p.standards.forEach((s) => {
            s.ranges = [];
          });
          const plan = checkEmitted(p);
          expect(
            plan.sessions.some((s) =>
              s.rows.some((r) => r.Label.endsWith('_?')),
            ),
          ).toBe(true);
        }
  });

  it('drops zero terms, uses singular labels and counts unique pool/used spots and spare', () => {
    const p = structuredClone(TEST_PROJECT);
    p.sessions = [
      {
        number: 2,
        unknowns: [{ name: 'X', tag: '', from: 1, to: 1 }],
        rows: [],
        fixed: false,
      },
    ];
    p.recipe.chunking = { mode: 'count', count: 1 };
    p.recipe.mid = [{ standard: '@primary', count: 9 }]; // No mid for one chunk.
    p.recipe.opening = [
      { standard: '@primary', count: 1 },
      { standard: '@primary', count: 0 },
    ];
    p.recipe.closing = [{ standard: '@primary', count: 3 }];
    p.standards[0] = {
      ...p.standards[0]!,
      ranges: [
        { from: 10, to: 13 },
        { from: 12, to: 14 },
      ],
      used: [10, 10, 99],
      spare: 1,
    };
    const counts = countStandards(p);
    expect(counts[0]).toMatchObject({
      needed: 6,
      placed: 5,
      available: 3,
      spare: 1,
      short: 3,
      formula: '1 opening × 1 + 1 closing × 3 + 1 bracket × 2 = 6',
    });
    expect(counts.find((s) => s.name === 'Seiland')?.formula).toBe(
      '1 pair × 2 = 2',
    );
    expect(counts.find((s) => s.name === 'PL')).toMatchObject({
      needed: 0,
      terms: [],
      formula: '0',
    });
    checkEmitted(p);
    p.sessions.push({
      ...structuredClone(p.sessions[0]!),
      number: 3,
      fixed: true,
      rows: planProject(p).sessions[0]!.rows,
    });
    p.standards[0]!.used = [10, 11];
    expect(countStandards(p)[0]?.available).toBe(0);
    checkEmitted(p);
  });

  it('counts opening brackets in rotate mode and continues pairs through sessions', () => {
    const p = structuredClone(TEST_PROJECT);
    p.recipe = {
      ...p.recipe,
      chunking: { mode: 'count', count: 2 },
      opening: [],
      openingBracket: true,
    };
    const plan = checkEmitted(p);
    expect(plan.budget).toMatchObject({ K: 6, P: 6 });
    expect(plan.sessions.map((s) => s.rotation)).toEqual([
      ['Seiland', '91500', 'PL'],
      ['LTSE', 'Seiland', '91500'],
    ]);
    expect(countStandards(p)[0]?.formula).toBe('6 brackets × 2 = 12');
    expect(plan.sessions[0]!.rows[0]!.meta).toMatchObject({
      name: 'Seiland',
      block: 'bracket',
    });
  });

  it('reports the specified input problem for both unsupported budget options', () => {
    for (const options of [
      { openingBracket: true },
      { secondaries: 'cadence' as const },
      { openingBracket: true, secondaries: 'cadence' as const },
    ]) {
      const p = structuredClone(TEST_PROJECT);
      Object.assign(p.recipe, options);
      expect(() => planProject(p)).toThrow(
        'Every, odd or even secondaries and the opening bracket need Chunk target or Chunk count',
      );
      expect(() => countStandards(p)).toThrow(
        'Every, odd or even secondaries and the opening bracket need Chunk target or Chunk count',
      );
    }
  });
});

type Design = {
  id: string;
  g: number;
  unknowns: [number, number][][];
  pools: Record<string, [number, number]>;
  needed: Record<string, number>;
  rows: number[];
};
const designs: Design[] = [
  {
    id: 'A, 2026-11-10',
    g: 14,
    unknowns: [
      [
        [1, 7],
        [8, 50],
        [51, 91],
        [92, 121],
        [122, 173],
        [174, 194],
      ],
      [
        [195, 216],
        [217, 289],
        [290, 331],
        [332, 334],
        [335, 337],
        [338, 343],
        [344, 362],
      ],
    ],
    pools: {
      NIST610: [363, 380],
      NIST612: [381, 398],
      S513: [399, 454],
      LTSE: [455, 484],
      Seiland: [485, 514],
      '91500': [515, 540],
    },
    needed: {
      S513: 56,
      LTSE: 30,
      Seiland: 30,
      '91500': 26,
      NIST610: 18,
      NIST612: 18,
    },
    rows: [288, 252],
  },
  {
    id: 'B, 2026-11-12',
    g: 15,
    unknowns: [
      [
        [1, 68],
        [69, 145],
        [146, 154],
        [155, 172],
        [173, 195],
        [196, 201],
      ],
    ],
    pools: {
      NIST610: [202, 210],
      NIST612: [211, 219],
      S513: [235, 264],
      LTSE: [220, 234],
      Seiland: [265, 279],
      '91500': [280, 294],
      PL: [295, 309],
    },
    needed: {
      S513: 30,
      LTSE: 15,
      Seiland: 15,
      '91500': 15,
      PL: 15,
      NIST610: 9,
      NIST612: 9,
    },
    rows: [309],
  },
  {
    id: 'C, 2026-11-12 setup 2',
    g: 14,
    unknowns: [
      [
        [310, 410],
        [577, 650],
      ],
      [[411, 576]],
    ],
    pools: {
      NIST610: [651, 668],
      NIST612: [669, 686],
      S513: [687, 740],
      LTSE: [741, 768],
      Seiland: [769, 796],
      '91500': [797, 822],
    },
    needed: {
      S513: 54,
      LTSE: 28,
      Seiland: 28,
      '91500': 26,
      NIST610: 18,
      NIST612: 18,
    },
    rows: [263, 250],
  },
  {
    id: 'D, 2026-11-17',
    g: 14,
    unknowns: [
      [
        [1, 66],
        [67, 97],
        [98, 135],
        [364, 384],
      ],
      [[136, 333]],
      [
        [334, 363],
        [385, 464],
        [465, 538],
      ],
    ],
    pools: {
      NIST610: [539, 565],
      NIST612: [566, 592],
      S513: [593, 680],
      LTSE: [681, 726],
      Seiland: [727, 772],
      '91500': [773, 814],
    },
    needed: {
      S513: 88,
      LTSE: 46,
      Seiland: 46,
      '91500': 42,
      NIST610: 27,
      NIST612: 27,
    },
    rows: [240, 296, 278],
  },
];

function designProject(design: Design): Project {
  const every = design.id.startsWith('B');
  const standards: Standard[] = [
    'NIST610',
    'NIST612',
    'S513',
    'LTSE',
    'Seiland',
    '91500',
    ...(every ? ['PL'] : []),
  ].map((name) => {
    const [from, to] = design.pools[name]!;
    return {
      name,
      role: name.startsWith('NIST')
        ? 'reference'
        : name === 'S513'
          ? 'primary'
          : 'secondary',
      ranges: [{ from, to }],
      used: [],
      spare: 0,
      ...(!['NIST610', 'NIST612', 'S513'].includes(name)
        ? {
            perBracket: every ? 1 : 2,
            cadence: every
              ? ('every' as const)
              : name === '91500'
                ? ('even' as const)
                : ('odd' as const),
          }
        : {}),
    };
  });
  const nist = [
    { standard: 'NIST610', count: 3 },
    { standard: 'NIST612', count: 3 },
  ];
  return {
    version: 1,
    wizard: { step: 3, mineral: 'zircon' },
    experiment: DEFAULT_EXPERIMENT,
    standards,
    recipe: {
      ...DEFAULT_RECIPE,
      opening: nist,
      mid: nist,
      closing: nist,
      openingBracket: true,
      secondaries: 'cadence',
      chunking: { mode: 'size', size: design.g },
    },
    sessions: design.unknowns.map((ranges, i) => ({
      number: i + 1,
      fixed: false,
      rows: [],
      unknowns: ranges.map(([from, to], j) => ({
        name: `S${i + 1}-${j + 1}`,
        tag: '',
        from,
        to,
      })),
    })),
  };
}

it.each(designs)(
  'reproduces Ablation Station design $id without changing its expected values',
  (design) => {
    const p = designProject(design);
    const counts = countStandards(p);
    expect(Object.fromEntries(counts.map((c) => [c.name, c.needed]))).toEqual(
      design.needed,
    );
    expect(
      counts.every(
        (c) => c.placed === c.needed && c.available === c.needed && !c.short,
      ),
    ).toBe(true);
    const plan = checkEmitted(p);
    expect(plan.sessions.map((s) => s.rows.length)).toEqual(design.rows);
    expect(
      plan.sessions.every(
        (s) =>
          !s.warnings.length &&
          !s.rotation.length &&
          s.pairsPerBracket.every((pairs) => pairs === 0),
      ),
    ).toBe(true);
    expect(plan.advisories).toEqual([]);
    // Count mode with the same number of chunks gives exactly the same rows per session.
    p.sessions.forEach((session, i) => {
      const q = structuredClone(p);
      q.sessions = [session];
      q.recipe.chunking = {
        mode: 'count',
        count: plan.sessions[i]!.chunks.length,
      };
      expect(checkEmitted(q).sessions[0]!.rows.length).toBe(design.rows[i]);
    });
    const layouts = projectLayouts(p).layouts;
    expect(plan.sessions[0]!.rows.slice(0, 6).map((r) => r.meta.block)).toEqual(
      Array(6).fill('opening'),
    );
    layouts.forEach((layout, i) => {
      const k = plan.sessions[i]!.chunks.length;
      expect(layout.openingBracket?.mid).toEqual([]);
      expect(
        layout.brackets.flatMap((b, j) => (b.mid.length ? [j + 1] : [])),
      ).toEqual([Math.floor((k + 1) / 2)]);
      expect(layout.openingBracket?.secondaries.map((s) => s.standard)).toEqual(
        design.id.startsWith('B')
          ? ['LTSE', 'Seiland', '91500', 'PL']
          : ['LTSE', 'Seiland'],
      );
    });
  },
);

it('has cadence formulas, resets parity per session, defaults to every and recipe spot count', () => {
  const p = designProject(designs[0]!);
  const counts = countStandards(p);
  expect(counts.find((s) => s.name === 'S513')?.formula).toBe(
    '28 brackets × 2 = 56',
  );
  expect(counts.find((s) => s.name === 'LTSE')?.formula).toBe(
    '15 odd brackets × 2 = 30',
  );
  expect(counts.find((s) => s.name === '91500')?.formula).toBe(
    '13 even brackets × 2 = 26',
  );
  p.recipe.openingBracket = false;
  p.sessions = [
    {
      number: 1,
      unknowns: [{ name: 'X', tag: '', from: 1, to: 1 }],
      fixed: false,
      rows: [],
    },
  ];
  p.standards.find((s) => s.name === 'LTSE')!.cadence = 'odd';
  const seiland = p.standards.find((s) => s.name === 'Seiland')!;
  delete seiland.perBracket;
  delete seiland.cadence;
  const short = countStandards(p);
  expect(short.find((s) => s.name === 'LTSE')?.formula).toBe(
    '1 odd bracket × 2 = 2',
  );
  expect(short.find((s) => s.name === 'Seiland')?.formula).toBe(
    '1 every bracket × 2 = 2',
  );
  expect(short.find((s) => s.name === '91500')?.formula).toBe('0');
  expect(short.find((s) => s.name === 'NIST610')?.formula).toBe(
    '1 opening × 3 + 1 closing × 3 = 6',
  );
  checkEmitted(p);
  p.sessions[0]!.unknowns = [];
  expect(
    countStandards(p).every((s) => !s.terms.length && s.formula === '0'),
  ).toBe(true);
  expect(checkEmitted(p).sessions[0]!.rows).toEqual([]);
});
