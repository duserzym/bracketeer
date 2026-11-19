import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countStandards } from './count';
import { availableSpots } from './pools';
import { parseProject, serializeProject } from './project';
import { planProject, validate } from './sequence';
import { TEST_PROJECT } from './test-data';
import type { PoolRange, Project } from './types';
import { rangeSpots } from '../ui/unknowns';

function edit(change: (p: Project) => void) {
  const p = structuredClone(TEST_PROJECT);
  change(p);
  return JSON.stringify(p);
}

describe('optional design model', () => {
  it('preserves the example project byte for byte without new fields', () => {
    const text = readFileSync(
      new URL('../../../fixtures/session-1.bracketeer.json', import.meta.url),
      'utf8',
    );
    expect(serializeProject(parseProject(text))).toBe(text);
  });

  it('validates and preserves every nondefault new field in version 1', () => {
    const p = structuredClone(TEST_PROJECT);
    p.wizard = { step: 3, mineral: 'zircon' };
    p.sessions[0]!.unknowns[0]!.auto = { from: true, to: true };
    p.sessions[1]!.unknowns[0]!.auto = { from: true };
    p.sessions[0]!.mineral = 'zircon';
    p.standards[0]!.mineral = 'zircon';
    p.standards[1]!.cadence = 'odd';
    p.standards[1]!.perBracket = 3;
    p.standards[2]!.cadence = 'even';
    p.standards[0]!.ranges[0]!.auto = { from: true, to: true };
    p.recipe.secondaries = 'cadence';
    p.recipe.openingBracket = true;
    p.recipe.rotationStarts = { apatite: 2, titanite: 1 };
    p.recipe.chunking = { mode: 'size', size: 18 };
    p.grainatlas = {
      file: 'mount.csv',
      spots: [
        { from: 1, to: 20 },
        { from: 50, to: 55 },
      ],
    };
    expect(parseProject(JSON.stringify(p))).toEqual(p);
    delete p.sessions[0]!.mineral;
    delete p.standards[0]!.mineral;
    const serialized = serializeProject(p);
    expect(parseProject(serialized)).toEqual(p);
    expect(serializeProject(parseProject(serialized))).toBe(serialized);
    expect(JSON.parse(serialized).version).toBe(1);
  });

  it('omits default optional fields and normalizes map order without mutating input', () => {
    const p = structuredClone(TEST_PROJECT);
    const without = serializeProject(p);
    p.recipe.secondaries = 'rotate';
    p.recipe.openingBracket = false;
    p.recipe.rotationStarts = { apatite: 0 };
    p.standards.forEach((s) => {
      s.perBracket = p.recipe.spotsPerSecondary;
      s.cadence = 'every';
      s.ranges.forEach((r) => {
        r.auto = {};
      });
    });
    p.sessions[0]!.unknowns[0]!.auto = {};
    const original = structuredClone(p);
    expect(serializeProject(p)).toBe(without);
    expect(p).toEqual(original);
    p.recipe.rotationStarts = { titanite: 1, apatite: 2 };
    const canonical = serializeProject(p);
    p.recipe.rotationStarts = { apatite: 2, titanite: 1 };
    expect(serializeProject(p)).toBe(canonical);
  });

  it.each([
    [
      'unknown auto object',
      (p: Project) => {
        Object.assign(p.sessions[0]!.unknowns[0]!, { auto: true });
      },
      'unknowns[0].auto',
    ],
    [
      'unknown auto false',
      (p: Project) => {
        Object.assign(p.sessions[0]!.unknowns[0]!, { auto: { to: false } });
      },
      'auto.to',
    ],
    [
      'pool auto false',
      (p: Project) => {
        Object.assign(p.standards[0]!.ranges[0]!, { auto: { from: false } });
      },
      'auto.from',
    ],
    [
      'pool auto type',
      (p: Project) => {
        Object.assign(p.standards[0]!.ranges[0]!, { auto: [] });
      },
      'ranges[0].auto',
    ],
    [
      'standard mineral',
      (p: Project) => {
        p.standards[0]!.mineral = '';
      },
      'standards[0].mineral',
    ],
    [
      'session mineral',
      (p: Project) => {
        Object.assign(p.sessions[0]!, { mineral: 1 });
      },
      'sessions[0].mineral',
    ],
    [
      'perBracket zero',
      (p: Project) => {
        p.standards[0]!.perBracket = 0;
      },
      'perBracket',
    ],
    [
      'perBracket fraction',
      (p: Project) => {
        p.standards[0]!.perBracket = 1.5;
      },
      'perBracket',
    ],
    [
      'perBracket type',
      (p: Project) => {
        Object.assign(p.standards[0]!, { perBracket: '2' });
      },
      'perBracket',
    ],
    [
      'cadence',
      (p: Project) => {
        Object.assign(p.standards[0]!, { cadence: 'sometimes' });
      },
      'cadence',
    ],
    [
      'secondaries',
      (p: Project) => {
        Object.assign(p.recipe, { secondaries: 'pairs' });
      },
      'secondaries',
    ],
    [
      'opening bracket',
      (p: Project) => {
        Object.assign(p.recipe, { openingBracket: 1 });
      },
      'openingBracket',
    ],
    [
      'rotationStarts type',
      (p: Project) => {
        Object.assign(p.recipe, { rotationStarts: [] });
      },
      'rotationStarts',
    ],
    [
      'rotationStarts negative',
      (p: Project) => {
        p.recipe.rotationStarts = { apatite: -1 };
      },
      'rotationStarts.apatite',
    ],
    [
      'rotationStarts fraction',
      (p: Project) => {
        p.recipe.rotationStarts = { apatite: 0.5 };
      },
      'rotationStarts.apatite',
    ],
    [
      'rotationStarts name',
      (p: Project) => {
        p.recipe.rotationStarts = { '': 1 };
      },
      'rotationStarts mineral',
    ],
    [
      'grainatlas object',
      (p: Project) => {
        Object.assign(p, { grainatlas: null });
      },
      'grainatlas',
    ],
    [
      'grainatlas file',
      (p: Project) => {
        Object.assign(p, { grainatlas: { file: 2, spots: [] } });
      },
      'grainatlas.file',
    ],
    [
      'grainatlas spots',
      (p: Project) => {
        Object.assign(p, { grainatlas: { file: 'x', spots: null } });
      },
      'grainatlas.spots',
    ],
    [
      'grainatlas range',
      (p: Project) => {
        p.grainatlas = { file: 'x', spots: [{ from: 2, to: 1 }] };
      },
      'ascending range',
    ],
    [
      'grainatlas no auto empties',
      (p: Project) => {
        Object.assign(p, {
          grainatlas: {
            file: 'x',
            spots: [{ from: 2, to: 1, auto: { to: true } }],
          },
        });
      },
      'ascending range',
    ],
  ])('rejects malformed %s', (_name, change, path) => {
    expect(() => parseProject(edit(change))).toThrow(path);
  });
});

describe('empty auto ranges', () => {
  it('treats empty unknown and pool ranges as empty in all modes and boundary settings', () => {
    for (const chunking of [
      { mode: 'budget' },
      { mode: 'size', size: 18 },
      { mode: 'count', count: 3 },
    ] as const)
      for (const bracketAtSampleBoundaries of [false, true]) {
        const p = structuredClone(TEST_PROJECT);
        p.recipe = { ...p.recipe, chunking, bracketAtSampleBoundaries };
        const expected = planProject(p);
        const counts = countStandards(p);
        p.sessions[0]!.unknowns.unshift({
          name: 'Empty',
          tag: '',
          from: 1,
          to: 0,
          auto: { to: true },
        });
        p.sessions[0]!.unknowns.push({
          name: 'Empty end',
          tag: '',
          from: 235,
          to: 234,
          auto: { to: true },
        });
        p.standards[0]!.ranges.push({ from: 1, to: 0, auto: { to: true } });
        expect(parseProject(serializeProject(p))).toEqual(p);
        expect(planProject(p)).toEqual(expected);
        expect(countStandards(p)).toEqual(counts);
      }
  });

  it('empty-only sessions emit nothing; pool walkers and validation never include the begin', () => {
    const p = structuredClone(TEST_PROJECT);
    const empty: PoolRange = { from: 1, to: 0, auto: { from: true, to: true } };
    const s = { ...p.standards[0]!, ranges: [empty], used: [] };
    expect(availableSpots(s)).toEqual([]);
    expect(rangeSpots([empty])).toEqual([]);
    const row = planProject(p).sessions[0]!.rows.find(
      (r) => r.meta.kind === 'primary',
    )!;
    expect(validate([row], [s], []).map((w) => w.kind)).toEqual([
      'outside-pool',
    ]);
    p.standards[0] = s;
    p.sessions.forEach((s) => {
      s.unknowns = [{ name: 'Empty', tag: '', ...empty }];
    });
    expect(planProject(p).sessions.every((s) => s.rows.length === 0)).toBe(
      true,
    );
    expect(countStandards(p).every((s) => s.needed === 0)).toBe(true);
  });

  it('requires auto.to and exactly from minus one; only the last pool range can have auto.to', () => {
    for (const range of [
      { from: 2, to: 1 },
      { from: 2, to: 1, auto: { from: true as const } },
      { from: 3, to: 1, auto: { to: true as const } },
    ]) {
      expect(() =>
        parseProject(
          edit((p) => {
            p.standards[0]!.ranges = [range];
          }),
        ),
      ).toThrow('ascending');
      expect(() =>
        parseProject(
          edit((p) => {
            Object.assign(p.sessions[0]!.unknowns[0]!, range);
          }),
        ),
      ).toThrow('ascending');
      expect(() =>
        availableSpots({ ...TEST_PROJECT.standards[0]!, ranges: [range] }),
      ).toThrow('Invalid range');
    }
    expect(() =>
      parseProject(
        edit((p) => {
          p.standards[0]!.ranges.unshift({
            from: 1,
            to: 0,
            auto: { to: true },
          });
        }),
      ),
    ).toThrow('only allowed on the last range');
  });
});
