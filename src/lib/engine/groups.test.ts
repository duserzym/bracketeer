import { describe, expect, it } from 'vitest';
import { countStandards } from './count';
import { groupRecipe, groupStandards, mineralGroup } from './groups';
import { calculateBudget, projectLayouts } from './plan';
import { newSessionFrom, parseProject, serializeProject } from './project';
import { planProject } from './sequence';
import { TEST_PROJECT } from './test-data';
import {
  DEFAULT_EXPERIMENT,
  DEFAULT_RECIPE,
  type Project,
  type Standard,
  type StandardRole,
} from './types';

function standard(
  name: string,
  role: StandardRole,
  from: number,
  to: number,
  mineral?: string,
): Standard {
  return {
    name,
    role,
    ranges: [{ from, to }],
    used: [],
    spare: 0,
    ...(mineral === undefined ? {} : { mineral }),
  };
}
function mixed(): Project {
  return {
    version: 1,
    wizard: { step: 3, mineral: 'zircon' },
    experiment: DEFAULT_EXPERIMENT,
    standards: [
      standard('S513', 'primary', 100, 113),
      standard('Z1', 'secondary', 200, 205, 'zircon'),
      standard('Z2', 'secondary', 206, 211),
      standard('AP', 'primary', 300, 309, 'apatite'),
      standard('A1', 'secondary', 400, 403, 'apatite'),
      standard('A2', 'secondary', 404, 407, 'apatite'),
      standard('NIST610', 'reference', 500, 535, 'apatite'),
      standard('NIST612', 'reference', 600, 635),
    ],
    recipe: {
      ...DEFAULT_RECIPE,
      rotationStart: 1,
      rotationStarts: { apatite: 1 },
    },
    sessions: [
      [1, 8, undefined],
      [20, 25, 'apatite'],
      [40, 43, 'zircon'],
      [60, 62, 'apatite'],
    ].map(([from, to, mineral], i) => ({
      number: i + 1,
      unknowns: [
        { name: `X${i + 1}`, tag: '', from: from as number, to: to as number },
      ],
      rows: [],
      fixed: false,
      ...(mineral === undefined ? {} : { mineral: mineral as string }),
    })),
  };
}

function checkCounts(p: Project) {
  const plan = planProject(p);
  for (const c of countStandards(p)) {
    const sessions = plan.sessions
      .filter((s) => !s.fixed)
      .map((s) => ({
        session: s.number,
        needed: s.rows.filter(
          (r) => r.meta.kind === c.role && r.meta.name === c.name,
        ).length,
      }));
    expect(c.perSession).toEqual(sessions);
    expect(c.needed).toBe(sessions.reduce((n, s) => n + s.needed, 0));
  }
  return plan;
}

describe('mineral groups', () => {
  it('normalizes the main id, shares references and resolves independent rotation starts', () => {
    const p = mixed();
    expect(mineralGroup(p)).toBe('');
    expect(mineralGroup(p, 'zircon')).toBe('');
    expect(mineralGroup(p, 'apatite')).toBe('apatite');
    expect(groupStandards(p, '').map((s) => s.name)).toEqual([
      'S513',
      'Z1',
      'Z2',
      'NIST610',
      'NIST612',
    ]);
    expect(groupStandards(p, 'apatite').map((s) => s.name)).toEqual([
      'AP',
      'A1',
      'A2',
      'NIST610',
      'NIST612',
    ]);
    expect(groupRecipe(p, '')).toBe(p.recipe);
    expect(groupRecipe(p, 'apatite').rotationStart).toBe(1);
    expect(groupRecipe(p, 'titanite').rotationStart).toBe(0);
  });

  it('budgets each group and its pair spacing independently; references draw in session order', () => {
    const p = mixed();
    const original = structuredClone(p);
    const layout = projectLayouts(p);
    const plan = checkCounts(p);
    expect(layout.chunks.map((c) => c.length)).toEqual([3, 2, 2, 1]);
    expect(plan.budget).toMatchObject({ K: 8, P: 10 });
    expect(plan.sessions.map((s) => s.pairsPerBracket)).toEqual([
      [1, 1, 1],
      [1, 1],
      [1, 2],
      [2],
    ]);
    expect(plan.sessions.map((s) => s.rotation)).toEqual([
      ['Z2', 'Z1', 'Z2'],
      ['A2', 'A1'],
      ['Z1', 'Z2', 'Z1'],
      ['A2', 'A1'],
    ]);
    expect(plan.sessions.map((s) => s.nextRotation)).toEqual([0, 1, 1, 1]);
    plan.sessions.forEach((session, i) => {
      const group = i % 2 ? 'apatite' : '';
      expect(
        session.rows
          .filter((r) => r.meta.kind === 'primary')
          .every((r) => r.meta.name === (group ? 'AP' : 'S513')),
      ).toBe(true);
      const nist = session.rows
        .filter((r) => r.meta.name === 'NIST610')
        .map((r) => r['Laser Scan Position Number']);
      expect(nist).toEqual(
        Array.from({ length: i === 3 ? 6 : 9 }, (_, j) => 500 + 9 * i + j),
      );
      expect(session.warnings).toEqual([]);
    });
    expect(
      Object.fromEntries(countStandards(p).map((s) => [s.name, s.needed])),
    ).toEqual({
      S513: 14,
      Z1: 6,
      Z2: 6,
      AP: 10,
      A1: 4,
      A2: 4,
      NIST610: 33,
      NIST612: 33,
    });
    expect(countStandards(p).find((s) => s.name === 'AP')?.mineral).toBe(
      'apatite',
    );
    expect(countStandards(p).find((s) => s.name === 'NIST610')?.mineral).toBe(
      '',
    );
    expect(plan.advisories).toEqual([]);
    expect(p).toEqual(original);
  });

  it('keeps the exact original single-mineral algorithm with explicit main ids', () => {
    const p = structuredClone(TEST_PROJECT);
    const original = planProject(p);
    p.wizard = { step: 3, mineral: 'zircon' };
    p.standards.forEach((s) => {
      s.mineral = s.role === 'reference' ? 'ignored' : 'zircon';
    });
    p.sessions.forEach((s) => {
      s.mineral = 'zircon';
    });
    p.recipe.rotationStarts = { apatite: 99 };
    expect(checkCounts(p)).toEqual(original);
    const { standards, ...layout } = projectLayouts(p);
    expect(layout).toEqual(
      calculateBudget(
        p.sessions.map((s) => s.unknowns),
        standards,
        p.recipe,
      ),
    );
  });

  it('reserves fixed spots once and checks shared reference shortages across all groups', () => {
    const p = mixed();
    const earlier = planProject(p).sessions[0]!.rows;
    p.sessions.unshift({ number: 5, unknowns: [], rows: earlier, fixed: true });
    p.standards.find((s) => s.name === 'NIST610')!.ranges = [
      { from: 500, to: 517 },
    ];
    p.standards.find((s) => s.name === 'NIST610')!.used = [500, 500];
    const plan = checkCounts(p);
    expect(plan.sessions[0]!.rows).toEqual(earlier);
    expect(plan.budget.perStandard.NIST610).toEqual({
      needed: 27,
      available: 9,
      leftAfter: -18,
    });
    expect(
      plan.advisories.filter((a) => a.startsWith('NIST610 needs')),
    ).toEqual([
      'NIST610 needs 27 spots; 9 available after used spots and spare.',
    ]);
    expect(
      plan.sessions
        .slice(1)
        .flatMap((s) => s.rows)
        .filter((r) => r.meta.name === 'NIST610')
        .some((r) => r.Label === 'NIST610_?'),
    ).toBe(true);
    expect(
      plan.sessions[2]!.rows.filter((r) => r.meta.kind === 'primary').every(
        (r) => r.meta.name === 'AP',
      ),
    ).toBe(true);
  });

  it('requires one primary for each open group and globally unique names', () => {
    const p = mixed();
    expect(parseProject(serializeProject(p)).sessions[1]!.mineral).toBe(
      'apatite',
    );
    p.standards = p.standards.filter((s) => s.name !== 'AP');
    expect(() => planProject(p)).toThrow('Exactly one primary');
    expect(() => parseProject(JSON.stringify(p))).toThrow(
      'Exactly one primary',
    );
    p.sessions
      .filter((s) => s.mineral === 'apatite')
      .forEach((s) => {
        s.fixed = true;
      });
    expect(() => parseProject(JSON.stringify(p))).not.toThrow();
    expect(() => planProject(p)).not.toThrow();
    p.standards.push({ ...p.standards[0]!, mineral: 'apatite' });
    expect(() => planProject(p)).toThrow('unique');
    expect(() => parseProject(JSON.stringify(p))).toThrow('unique');
  });

  it('marking as run moves only its own group start and new sessions inherit the mineral', () => {
    for (const number of [1, 2]) {
      const p = mixed();
      p.recipe.chunking = { mode: 'count', count: 1 };
      const original = structuredClone(p);
      const next = newSessionFrom(p, number);
      expect(p).toEqual(original);
      expect(next.sessions.find((s) => s.number === number)?.fixed).toBe(true);
      expect(next.sessions.at(-1)?.mineral).toBe(
        number === 1 ? undefined : 'apatite',
      );
      expect(next.recipe.rotationStart).toBe(number === 1 ? 0 : 1);
      expect(next.recipe.rotationStarts?.apatite).toBe(number === 1 ? 1 : 0);
      // Calling Mark as run uses this same transition and removes the appended session.
      next.sessions.pop();
      checkCounts(next);
      const again = newSessionFrom(next, number);
      expect(again.recipe).toEqual(next.recipe);
    }
  });

  it('cadence ignores rotation, including marking as run, and stays within each group', () => {
    const p = mixed();
    p.recipe = {
      ...p.recipe,
      secondaries: 'cadence',
      openingBracket: true,
      chunking: { mode: 'count', count: 2 },
    };
    p.standards
      .filter((s) => s.role === 'secondary')
      .forEach((s) => {
        s.cadence = 'even';
        s.perBracket = 1;
      });
    const plan = checkCounts(p);
    expect(plan.sessions.every((s) => s.rotation.length === 0)).toBe(true);
    expect(countStandards(p).find((s) => s.name === 'A1')?.formula).toBe(
      '2 even brackets × 1 = 2',
    );
    const next = newSessionFrom(p, 2);
    expect(next.recipe.rotationStart).toBe(p.recipe.rotationStart);
    expect(next.recipe.rotationStarts).toEqual(p.recipe.rotationStarts);
  });
});
