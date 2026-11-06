import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseLabel } from '../engine/labels';
import {
  applySelection,
  catalogue,
  deriveStep,
  guessMineral,
  minerals,
  restoreSeeds,
  saveCatalogue,
  seeds,
  selectionFromProject,
  selectionProblem,
} from './catalogue';
import { emptyProject, exampleProject } from './model';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('mineral catalogue', () => {
  it('has nine tiles in order, with both SVG variants', () => {
    expect(minerals.map((m) => m.id)).toEqual([
      'zircon',
      'apatite',
      'rutile',
      'titanite',
      'garnet',
      'monazite',
      'xenotime',
      'carbonate',
      'other',
    ]);
    expect(minerals.map((m) => m.name)).toEqual([
      'Zircon',
      'Apatite',
      'Rutile',
      'Titanite',
      'Garnet',
      'Monazite',
      'Xenotime',
      'Carbonate',
      'Other',
    ]);
    for (const m of minerals) {
      expect(m.light).toMatch(/^(data:image\/svg\+xml,|.*-light\.svg)/u);
      expect(m.dark).toMatch(/^(data:image\/svg\+xml,|.*-dark\.svg)/u);
      expect(m.light).not.toBe(m.dark);
    }
  });
  it.each([
    [
      'zircon',
      ['S513', 'GJ1', 'Plešovice'],
      [
        'Seiland',
        '91500',
        'PL',
        'LTSE',
        'FC1',
        'R33',
        'OG1',
        'Temora',
        'AUSz2',
        'Maniitsoq',
      ],
    ],
    [
      'apatite',
      ['MAD', 'MADUCSB'],
      ['McClure', 'Durango', 'BR5', 'OL2', 'AFB1'],
    ],
    ['rutile', ['R632'], ['KNW']],
    ['titanite', ['MKED'], ['BLR', 'Kahn', 'OLT', 'Elmuerto']],
    ['carbonate', ['WC_1'], ['MMC']],
    ['garnet', [], []],
    ['monazite', [], []],
    ['xenotime', [], []],
    ['other', [], []],
  ])(
    'matches the full %s seed list and preselection',
    (id, primary, secondary) => {
      const entries = seeds(id);
      expect(
        entries.filter((e) => e.role === 'primary').map((e) => e.name),
      ).toEqual(primary);
      expect(
        entries.filter((e) => e.role === 'secondary').map((e) => e.name),
      ).toEqual(secondary);
      expect(entries.filter((e) => e.checked).map((e) => e.name)).toEqual([
        ...primary.slice(0, 1),
        ...(id === 'zircon' ? secondary.slice(0, 4) : []),
        'NIST610',
        'NIST612',
      ]);
      expect(entries.filter((e) => e.role === 'reference')).toEqual([
        { name: 'NIST610', role: 'reference', checked: true },
        { name: 'NIST612', role: 'reference', checked: true },
      ]);
    },
  );
  it('persists edits separately, restores seeds, and never shares mutable seed objects', () => {
    const entries = seeds('garnet');
    entries.push({ name: 'Lab garnet', role: 'primary', checked: true });
    saveCatalogue('garnet', entries);
    expect(catalogue('garnet')).toEqual(entries);
    expect(catalogue('zircon')).toEqual(seeds('zircon'));
    expect(catalogue('toString')).toEqual(seeds('other'));
    const copy = catalogue('garnet');
    copy[0]!.name = 'changed';
    expect(catalogue('garnet')).toEqual(entries);
    expect(restoreSeeds('garnet')).toEqual(seeds('garnet'));
    expect(catalogue('garnet')).toEqual(seeds('garnet'));
  });
  it('handles unavailable storage, malformed JSON and invalid entries', () => {
    for (const value of ['bad JSON', 'null', '[]', '{"zircon":[{"name":2}]}']) {
      localStorage.setItem('bracketeer.minerals', value);
      expect(catalogue('zircon')).toEqual(seeds('zircon'));
    }
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    });
    expect(catalogue('zircon')).toEqual(seeds('zircon'));
    expect(() => saveCatalogue('zircon', [])).not.toThrow();
    expect(restoreSeeds('zircon')).toEqual(seeds('zircon'));
  });
  it('returns the first selection problem with trimmed, unique names', () => {
    expect(selectionProblem('', [])).toBe('Choose a mineral');
    expect(selectionProblem('garnet', seeds('garnet'))).toBe(
      'Add your primary standard',
    );
    const entries = seeds('zircon');
    entries[1]!.checked = true;
    expect(selectionProblem('zircon', entries)).toBe(
      'Choose one primary standard',
    );
    entries[1]!.checked = false;
    entries[0]!.name = '  ';
    expect(selectionProblem('zircon', entries)).toBe(
      'Give every checked standard a name',
    );
    entries[0]!.name = ' PL ';
    expect(selectionProblem('zircon', entries)).toBe(
      'Two standards are called PL',
    );
    entries[0]!.name = '@primary';
    expect(selectionProblem('zircon', entries)).toContain('@primary');
    expect(selectionProblem('zircon', seeds('zircon'))).toBe('');
  });
  it('applies checked entries in role/list order, preserves matching pools, and filters all blocks', () => {
    const project = exampleProject();
    project.standards.find((s) => s.name === 'S513')!.spare = 4;
    const original = structuredClone(project);
    const next = applySelection(project, 'zircon', [
      { name: ' NIST610 ', role: 'reference', checked: true },
      { name: 'PL', role: 'secondary', checked: true },
      { name: 'S513', role: 'primary', checked: true },
      { name: 'New', role: 'secondary', checked: true },
      { name: '91500', role: 'secondary', checked: false },
    ]);
    expect(next.standards.map((s) => s.name)).toEqual([
      'S513',
      'PL',
      'New',
      'NIST610',
    ]);
    expect(next.standards[0]).toEqual(
      project.standards.find((s) => s.name === 'S513'),
    );
    expect(next.standards[2]).toEqual({
      name: 'New',
      role: 'secondary',
      ranges: [],
      used: [],
      spare: 0,
    });
    for (const block of ['opening', 'mid', 'closing'] as const) {
      expect(next.recipe[block]).toEqual(
        project.recipe[block].filter((e) => e.standard !== 'NIST612'),
      );
    }
    expect(next.wizard).toEqual({ mineral: 'zircon', step: 1 });
    expect(project).toEqual(original);
    next.standards[0]!.ranges[0]!.from = 999;
    expect(project).toEqual(original);
    project.wizard = { step: 3, mineral: 'other' };
    expect(
      applySelection(project, 'zircon', seeds('zircon')).wizard?.step,
    ).toBe(3);
  });
  it('recognizes WC_1 labels as a carbonate primary, without treating the underscore as a tag', () => {
    const project = applySelection(
      emptyProject(),
      'carbonate',
      seeds('carbonate'),
    );
    expect(parseLabel('WC_1_12', project.standards)).toEqual({
      kind: 'primary',
      name: 'WC_1',
      tag: '',
      spot: 12,
    });
  });
  it('guesses by primary seeds, ignoring saved catalogues, and falls back to other', () => {
    const project = emptyProject();
    for (const [primary, id] of [
      ['S513', 'zircon'],
      ['Plešovice', 'zircon'],
      ['MADUCSB', 'apatite'],
      ['R632', 'rutile'],
      ['MKED', 'titanite'],
      ['WC_1', 'carbonate'],
      ['Lab', 'other'],
    ]) {
      project.standards[0]!.name = primary!;
      expect(guessMineral(project)).toBe(id);
    }
    project.standards = [];
    expect(guessMineral(project)).toBe('other');
  });
  it('derives the step only from open rows, open unknowns, and pools', () => {
    const project = exampleProject();
    expect(deriveStep(project)).toBe(3); // Fixed session 1 rows do not mean review.
    project.sessions[1]!.rows = project.sessions[0]!.rows;
    expect(deriveStep(project)).toBe(4);
    project.sessions[1]!.rows = [];
    project.standards[0]!.ranges = [];
    expect(deriveStep(project)).toBe(2);
    project.standards = [];
    project.sessions = [{ number: 1, fixed: false, rows: [], unknowns: [] }];
    expect(deriveStep(project)).toBe(1);
  });
  it('restores project roles/order, including custom standards, ahead of unchecked catalogue entries', () => {
    const project = applySelection(emptyProject(), 'zircon', [
      { name: 'Custom', role: 'primary', checked: true },
      { name: 'PL', role: 'secondary', checked: true },
      { name: 'Seiland', role: 'secondary', checked: true },
      { name: 'NIST610', role: 'secondary', checked: true },
    ]);
    const entries = selectionFromProject(project, 'zircon');
    expect(entries.filter((e) => e.checked)).toEqual(
      project.standards.map(({ name, role }) => ({
        name,
        role,
        checked: true,
      })),
    );
    expect(entries.find((e) => e.name === 'S513')?.checked).toBe(false);
    expect(entries.filter((e) => e.name === 'NIST610')).toHaveLength(1);
  });
});
