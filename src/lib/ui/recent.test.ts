import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeProject } from '../engine/project';
import { emptyProject, exampleProject } from './model';
import {
  launchContinue,
  nonemptyProject,
  readRecent,
  recordRecent,
} from './recent';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('recent snapshots', () => {
  it('records serialized snapshots, newest first, six maximum, deduplicated by experiment name', () => {
    const project = exampleProject();
    for (let i = 0; i < 8; i++) {
      project.experiment.name = `Experiment ${i}`;
      recordRecent(project, new Date(`2026-11-0${i + 1}T12:00:00Z`));
    }
    expect(readRecent().map((e) => e.name)).toEqual([
      'Experiment 7',
      'Experiment 6',
      'Experiment 5',
      'Experiment 4',
      'Experiment 3',
      'Experiment 2',
    ]);
    project.experiment.name = 'Experiment 4';
    project.wizard = { mineral: 'zircon', step: 2 };
    const entries = recordRecent(project, new Date('2026-11-09T12:00:00Z'));
    expect(entries[0]).toEqual({
      name: 'Experiment 4',
      mineral: 'zircon',
      step: 2,
      savedAt: '2026-11-09T12:00:00.000Z',
      project: serializeProject(project),
    });
    expect(entries.filter((e) => e.name === 'Experiment 4')).toHaveLength(1);
    expect(readRecent()).toEqual(entries);
  });
  it('infers old projects and preserves experiment names, including an empty title', () => {
    const project = exampleProject();
    expect(recordRecent(project)[0]).toMatchObject({
      mineral: 'zircon',
      step: 3,
    });
    project.experiment.name = '';
    expect(recordRecent(project)[0]?.name).toBe('');
  });
  it('drops oldest snapshots to stay within 3 MB of UTF-8 JSON, including a single oversized project', () => {
    const project = exampleProject();
    project.experiment.defaults.Comment = '晶'.repeat(550_000);
    project.experiment.name = 'Older';
    recordRecent(project, new Date('2026-11-01T12:00:00Z'));
    project.experiment.name = 'Newer';
    const result = recordRecent(project, new Date('2026-11-02T12:00:00Z'));
    expect(result.map((e) => e.name)).toEqual(['Newer']);
    expect(
      new TextEncoder().encode(localStorage.getItem('bracketeer.recent')!)
        .byteLength,
    ).toBeLessThanOrEqual(3 * 1024 * 1024);
    project.experiment.defaults.Comment = 'x'.repeat(3 * 1024 * 1024);
    expect(recordRecent(project, new Date('2026-11-03T12:00:00Z'))).toEqual([]);
  });
  it('handles corrupt data and unavailable storage', () => {
    for (const value of ['bad JSON', '{}', '[null,{"name":"bad"}]']) {
      localStorage.setItem('bracketeer.recent', value);
      expect(readRecent()).toEqual([]);
    }
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    });
    expect(readRecent()).toEqual([]);
    expect(recordRecent(exampleProject())).toEqual([]);
    expect(launchContinue()).toBeNull();
  });
  it('offers a nonempty autosave separately without consuming a recent slot', () => {
    const project = exampleProject();
    recordRecent(project);
    localStorage.setItem('bracketeer.project', serializeProject(project));
    const entry = launchContinue();
    expect(entry).toMatchObject({
      mineral: 'zircon',
      step: 3,
      project: serializeProject(project),
    });
    expect(readRecent()).toHaveLength(1);
    expect(
      JSON.parse(localStorage.getItem('bracketeer.recent.continue')!),
    ).toEqual(entry);
    const blank = emptyProject();
    blank.standards.forEach((s) => {
      s.ranges = [];
    });
    localStorage.setItem('bracketeer.project', serializeProject(blank));
    expect(launchContinue()).toEqual(entry);
    localStorage.setItem('bracketeer.project', 'broken');
    expect(launchContinue()).toEqual(entry);
  });
  it('recognizes unknowns, rows or pools as nonempty, and ignores empty projects', () => {
    const project = emptyProject();
    project.standards.forEach((s) => {
      s.ranges = [];
    });
    expect(nonemptyProject(project)).toBe(false);
    localStorage.setItem('bracketeer.project', serializeProject(project));
    expect(launchContinue()).toBeNull();
    project.sessions[0]!.unknowns.push({
      name: 'Sample',
      tag: '',
      from: 1,
      to: 2,
    });
    expect(nonemptyProject(project)).toBe(true);
    project.sessions[0]!.unknowns = [];
    project.sessions[0]!.rows = exampleProject().sessions[0]!.rows;
    expect(nonemptyProject(project)).toBe(true);
    project.sessions[0]!.rows = [];
    project.standards[0]!.ranges = [{ from: 10, to: 20 }];
    expect(nonemptyProject(project)).toBe(true);
  });
  it('retains an autosave in memory when storage writes fail', () => {
    const text = serializeProject(exampleProject());
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === 'bracketeer.project' ? text : null),
      setItem() {
        throw new Error('quota');
      },
    });
    expect(launchContinue()?.project).toBe(text);
  });
});
