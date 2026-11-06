import { describe, expect, it } from 'vitest';
import { newSessionFrom, parseProject, serializeProject } from './project';
import { generate, planProject } from './sequence';
import { SESSION_2_STANDARDS, TEST_PROJECT } from './test-data';
import { DEFAULT_EXPERIMENT, DEFAULT_RECIPE, type Project } from './types';

const text = () => serializeProject(structuredClone(TEST_PROJECT));
function changed(edit: (p: Project) => void): string {
  const p = structuredClone(TEST_PROJECT);
  edit(p);
  return JSON.stringify(p);
}

describe('project persistence', () => {
  it('round-trips all project state with stable key order and pretty JSON', () => {
    const p = structuredClone(TEST_PROJECT);
    const plan = planProject(p);
    p.sessions.forEach((s, i) => {
      s.rows = plan.sessions[i]!.rows;
    });
    p.sessions[0]!.source = 'earlier.xls';
    p.sessions[0]!.fixed = true;
    p.standards[0]!.spare = 2;
    const serialized = serializeProject(p);
    expect(serialized.startsWith('{\n  "version": 1,\n  "experiment": {')).toBe(
      true,
    );
    expect(serialized.endsWith('\n')).toBe(true);
    expect(parseProject(serialized)).toEqual(p);
    // Reverse object insertion order at every level, preserving array order.
    const reorder = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(reorder)
        : v && typeof v === 'object'
          ? Object.fromEntries(
              Object.entries(v)
                .reverse()
                .map(([k, x]) => [k, reorder(x)]),
            )
          : v;
    expect(serializeProject(parseProject(JSON.stringify(reorder(p))))).toBe(
      serialized,
    );
    expect(serialized).not.toContain('bracketeer.theme');
    expect(serialized).not.toContain('bracketeer.layout');
  });
  it('defaults missing spare and recipe controls without accepting the old auto model', () => {
    const p = JSON.parse(text()) as Record<string, unknown>;
    p.recipe = {};
    p.standards = TEST_PROJECT.standards.map(
      ({ name, role, ranges, used }) => ({ name, role, ranges, used }),
    );
    const result = parseProject(JSON.stringify(p));
    expect(result.recipe).toEqual(DEFAULT_RECIPE);
    expect(result.standards.every((s) => s.spare === 0)).toBe(true);
    expect(() => parseProject(text().replace('"budget"', '"auto"'))).toThrow(
      'budget, size, or count',
    );
  });
  it('rejects unknown versions, malformed JSON and missing model fields with readable errors', () => {
    expect(() => parseProject('{')).toThrow('not valid JSON');
    expect(() => parseProject('null')).toThrow('must be an object');
    expect(() =>
      parseProject(text().replace('"version": 1', '"version": 2')),
    ).toThrow('Unsupported project version 2');
    expect(() => parseProject('{}')).toThrow('Unsupported project version');
    expect(() =>
      parseProject(
        text().replace('"sessions": [', '"sessions": null, "old": ['),
      ),
    ).toThrow('sessions must be an array');
    expect(() =>
      parseProject(
        changed((p) => {
          p.sessions[0]!.number = 0;
        }),
      ),
    ).toThrow('sessions[0].number');
    expect(() =>
      parseProject(
        changed((p) => {
          p.sessions[1]!.number = 2;
        }),
      ),
    ).toThrow('duplicates session 2');
    expect(() =>
      parseProject(
        changed((p) => {
          p.sessions[0]!.unknowns[0]!.from = 100;
        }),
      ),
    ).toThrow('ascending range');
    expect(() =>
      parseProject(
        changed((p) => {
          p.standards[0]!.spare = -1;
        }),
      ),
    ).toThrow('standards[0].spare');
    expect(() =>
      parseProject(
        changed((p) => {
          p.standards[0]!.used = [0];
        }),
      ),
    ).toThrow('standards[0].used[0]');
    expect(() =>
      parseProject(
        changed((p) => {
          p.standards[0]!.name = p.standards[1]!.name;
        }),
      ),
    ).toThrow('unique');
    expect(() =>
      parseProject(
        changed((p) => {
          p.standards[0]!.role = 'secondary';
        }),
      ),
    ).toThrow('Exactly one primary');
    expect(() =>
      parseProject(
        changed((p) => {
          p.recipe.chunking = { mode: 'size', size: 0 };
        }),
      ),
    ).toThrow('recipe.chunking.size');
    expect(() =>
      parseProject(
        changed((p) => {
          p.recipe.chunking = { mode: 'count', count: 1.5 };
        }),
      ),
    ).toThrow('recipe.chunking.count');
    expect(() =>
      parseProject(text().replace('"fixed": false', '"fixed": "no"')),
    ).toThrow('fixed must be true or false');
    expect(() =>
      parseProject(text().replace('"reference"', '"glass"')),
    ).toThrow('role must be primary, secondary, or reference');
  });
  it('preserves edited and unrecognized rows while validating their column types', () => {
    const p = structuredClone(TEST_PROJECT);
    p.sessions[0]!.rows = [
      {
        ...DEFAULT_EXPERIMENT.defaults,
        Label: 'manual label',
        Status: null,
        'Laser Scan Position Number': null,
        meta: { kind: 'unrecognized', name: 'manual label', block: 'unknowns' },
      },
    ];
    expect(parseProject(serializeProject(p))).toEqual(p);
    const raw = JSON.parse(serializeProject(p));
    raw.sessions[0].rows[0].Evaluate = 'TRUE';
    expect(() => parseProject(JSON.stringify(raw))).toThrow(
      'Evaluate must be true or false',
    );
    raw.sessions[0].rows[0].Evaluate = true;
    raw.sessions[0].rows[0].Status = '';
    expect(() => parseProject(JSON.stringify(raw))).toThrow(
      'Status must be null',
    );
    raw.sessions[0].rows[0].Status = null;
    delete raw.sessions[0].rows[0].meta;
    expect(
      parseProject(JSON.stringify(raw)).sessions[0]!.rows[0]!.meta.kind,
    ).toBe('unrecognized');
  });
});

describe('new session from an existing session', () => {
  it('freezes planned rows, continues after the last actual pair and appends the next number', () => {
    const p = structuredClone(TEST_PROJECT);
    p.recipe.chunking = { mode: 'count', count: 3 };
    p.sessions[0]!.rows = planProject(p).sessions[0]!.rows;
    const original = structuredClone(p);
    const next = newSessionFrom(p, 2);
    expect(next.sessions[0]!.fixed).toBe(true);
    expect(next.sessions[0]!.rows).toEqual(p.sessions[0]!.rows);
    expect(next.recipe.rotationStart).toBe(3); // Seiland, 91500, PL -> LTSE.
    expect(next.sessions.at(-1)).toEqual({
      number: 4,
      unknowns: [],
      rows: [],
      fixed: false,
    });
    expect(p).toEqual(original);
  });
  it('preserves rotation for imported/fixed sessions even with a handmade pair order', () => {
    const p = structuredClone(TEST_PROJECT);
    p.sessions[0]!.rows = generate(
      DEFAULT_EXPERIMENT,
      [{ name: 'X', tag: '', from: 1, to: 3 }],
      SESSION_2_STANDARDS,
      { ...DEFAULT_RECIPE, chunking: { mode: 'count', count: 3 } },
    ).rows;
    p.sessions[0]!.fixed = true;
    p.sessions[0]!.source = 'handmade.xls';
    p.recipe.rotationStart = 1;
    const next = newSessionFrom(p, 2);
    expect(next.recipe.rotationStart).toBe(1);
    expect(next.sessions[0]!.source).toBe('handmade.xls');
  });
  it('reports nonexistent sources, generates an ungenerated source, and handles a blank session', () => {
    expect(() => newSessionFrom(TEST_PROJECT, 1)).toThrow('does not exist');
    const generated = newSessionFrom(TEST_PROJECT, 2);
    expect(generated.sessions[0]!.rows).toHaveLength(332);
    expect(generated.sessions[0]!.fixed).toBe(true);
    expect(generated.recipe.rotationStart).toBe(0);
    const p = structuredClone(TEST_PROJECT);
    p.sessions[0]!.unknowns = [];
    expect(newSessionFrom(p, 2).sessions.at(-1)!.number).toBe(4);
  });
});

describe('optional wizard state', () => {
  it('round trips version 1 projects with and without wizard state', () => {
    const project = structuredClone(TEST_PROJECT);
    expect(parseProject(serializeProject(project))).toEqual(project);
    expect(parseProject(serializeProject(project))).not.toHaveProperty(
      'wizard',
    );
    for (const step of [1, 2, 3, 4] as const) {
      project.wizard = { step, mineral: 'carbonate' };
      expect(parseProject(serializeProject(project))).toEqual(project);
      expect(JSON.parse(serializeProject(project)).version).toBe(1);
    }
  });
  it.each([
    [null, 'wizard'],
    [[], 'wizard'],
    [{ step: 0, mineral: 'zircon' }, 'wizard.step'],
    [{ step: 5, mineral: 'zircon' }, 'wizard.step'],
    [{ step: 1.5, mineral: 'zircon' }, 'wizard.step'],
    [{ step: '2', mineral: 'zircon' }, 'wizard.step'],
    [{ mineral: 'zircon' }, 'wizard.step'],
    [{ step: 1, mineral: '' }, 'wizard.mineral'],
    [{ step: 1, mineral: '  ' }, 'wizard.mineral'],
    [{ step: 1, mineral: 3 }, 'wizard.mineral'],
    [{ step: 1 }, 'wizard.mineral'],
  ])('rejects invalid wizard state %j with a path', (wizard, path) => {
    expect(() =>
      parseProject(JSON.stringify({ ...TEST_PROJECT, wizard })),
    ).toThrow(path);
  });
});
