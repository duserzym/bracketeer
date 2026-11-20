import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseLabel } from '../engine/labels';
import {
  applyDrop,
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

describe('catalogue drops (positions exclude the source)', () => {
  it('reorders either way within a group without changing other groups or input', () => {
    const original = seeds('zircon');
    const before = structuredClone(original);
    const moved = applyDrop(
      original,
      original.findIndex((e) => e.name === 'LTSE'),
      'secondary',
      0,
    );
    expect(
      moved
        .filter((e) => e.role === 'secondary' && e.checked)
        .map((e) => e.name),
    ).toEqual(['LTSE', 'Seiland', '91500', 'PL']);
    expect(moved.filter((e) => e.role !== 'secondary')).toEqual(
      original.filter((e) => e.role !== 'secondary'),
    );
    const back = applyDrop(
      moved,
      moved.findIndex((e) => e.name === 'LTSE'),
      'secondary',
      3,
    );
    expect(back).toEqual(original);
    expect(original).toEqual(before);
    moved[0]!.name = 'changed';
    expect(original).toEqual(before);
  });
  it.each([true, false])(
    'keeps checked=%s between secondaries and references, at the requested position',
    (checked) => {
      const entries = seeds('zircon');
      const from = entries.findIndex((e) => e.name === '91500');
      entries[from]!.checked = checked;
      const moved = applyDrop(entries, from, 'reference', 1);
      expect(moved.filter((e) => e.role === 'reference')).toEqual([
        { name: 'NIST610', role: 'reference', checked: true },
        { name: '91500', role: 'reference', checked },
        { name: 'NIST612', role: 'reference', checked: true },
      ]);
      expect(
        applyDrop(
          moved,
          moved.findIndex((e) => e.name === '91500'),
          'secondary',
          1,
        ),
      ).toEqual(entries);
    },
  );
  it('reorders unchecked and checked Primary entries without changing any checked flags', () => {
    const entries = seeds('zircon');
    const original = structuredClone(entries);
    const moved = applyDrop(entries, 1, 'primary', 0);
    expect(moved.filter((e) => e.role === 'primary')).toEqual([
      { name: 'GJ1', role: 'primary', checked: false },
      { name: 'S513', role: 'primary', checked: true },
      { name: 'Plešovice', role: 'primary', checked: false },
    ]);
    const movedActive = applyDrop(moved, 1, 'primary', 2);
    expect(movedActive.filter((e) => e.role === 'primary')).toEqual([
      { name: 'GJ1', role: 'primary', checked: false },
      { name: 'Plešovice', role: 'primary', checked: false },
      { name: 'S513', role: 'primary', checked: true },
    ]);
    for (const next of [moved, movedActive]) {
      for (const entry of next)
        expect(entry).toEqual(original.find((e) => e.name === entry.name));
      expect(next.filter((e) => e.role !== 'primary')).toEqual(
        original.filter((e) => e.role !== 'primary'),
      );
      expect(selectionProblem('zircon', next)).toBe('');
    }
    expect(entries).toEqual(original);
  });
  it.each(['GJ1', 'LTSE', 'NIST610'])(
    'makes %s primary and keeps all previous candidates, unticked, without moving anyone else',
    (name) => {
      const entries =
        name === 'GJ1'
          ? applyDrop(seeds('zircon'), 1, 'secondary', 0)
          : seeds('zircon');
      const from = entries.findIndex((e) => e.name === name);
      const next = applyDrop(entries, from, 'primary', 0);
      expect(next[0]).toEqual({ name, role: 'primary', checked: true });
      expect(
        next.filter((e) => e.role === 'primary' && e.checked),
      ).toHaveLength(1);
      expect(next.find((e) => e.name === 'S513')).toEqual({
        name: 'S513',
        role: 'primary',
        checked: false,
      });
      expect(
        next.filter((e) => e.name !== name).map((e) => [e.name, e.role]),
      ).toEqual(
        entries.filter((e) => e.name !== name).map((e) => [e.name, e.role]),
      );
      expect(next.filter((e) => e.role !== 'primary')).toEqual(
        entries.filter((e) => e.role !== 'primary' && e.name !== name),
      );
    },
  );
  it.each(['secondary', 'reference'] as const)(
    'keeps a ticked primary ticked when moved to %s and requires a replacement',
    (role) => {
      const next = applyDrop(seeds('zircon'), 0, role, 0);
      expect(next.find((e) => e.name === 'S513')).toEqual({
        name: 'S513',
        role,
        checked: true,
      });
      expect(selectionProblem('zircon', next)).toBe(
        'Add your primary standard',
      );
      const unchecked = applyDrop(seeds('zircon'), 1, role, 0);
      expect(unchecked.find((e) => e.name === 'GJ1')?.checked).toBe(false);
    },
  );
  it('handles empty groups, clamps positions, and leaves another mineral untouched', () => {
    const apatite = seeds('apatite').filter((e) => e.role !== 'reference');
    const saved = structuredClone(apatite);
    const only = [
      { name: 'Custom', role: 'secondary' as const, checked: false },
    ];
    expect(applyDrop(only, 0, 'primary', 99)).toEqual([
      { name: 'Custom', role: 'primary', checked: true },
    ]);
    expect(applyDrop(only, -1, 'primary', 0)).toEqual(only);
    const zircon = seeds('zircon');
    const first = applyDrop(zircon, 6, 'secondary', -10);
    expect(first.filter((e) => e.role === 'secondary')[0]?.name).toBe('LTSE');
    const last = applyDrop(
      first,
      first.findIndex((e) => e.name === 'LTSE'),
      'secondary',
      100,
    );
    expect(last.filter((e) => e.role === 'secondary').at(-1)?.name).toBe(
      'LTSE',
    );
    expect(apatite).toEqual(saved);
  });
  it('applies the dropped roles and rotation to the project while retaining spot settings', () => {
    const project = exampleProject();
    let entries = seeds('zircon');
    entries = applyDrop(
      entries,
      entries.findIndex((e) => e.name === '91500'),
      'reference',
      0,
    );
    entries = applyDrop(
      entries,
      entries.findIndex((e) => e.name === 'LTSE'),
      'secondary',
      0,
    );
    const next = applySelection(project, 'zircon', entries);
    expect(
      next.standards.filter((e) => e.role === 'secondary').map((e) => e.name),
    ).toEqual(['LTSE', 'Seiland', 'PL']);
    expect(next.standards.find((e) => e.name === '91500')).toEqual({
      ...project.standards.find((e) => e.name === '91500'),
      role: 'reference',
    });
  });
});
