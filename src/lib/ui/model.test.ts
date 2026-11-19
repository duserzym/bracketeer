import { describe, expect, it } from 'vitest';
import { planProject } from '../engine/sequence';
import { parseProject, serializeProject } from '../engine/project';
import {
  editCell,
  emptyProject,
  exampleProject,
  fileStem,
  moveRows,
  rowsDiffer,
} from './model';

describe('UI project operations', () => {
  it('starts with one empty planned session, lab pools and nothing used', () => {
    const project = emptyProject();
    expect(project.recipe.chunking).toEqual({ mode: 'size', size: 18 });
    expect(project.sessions).toEqual([
      { number: 1, fixed: false, unknowns: [], rows: [] },
    ]);
    expect(project.standards).toHaveLength(7);
    expect(
      project.standards.every((s) => s.used.length === 0 && s.spare === 0),
    ).toBe(true);
    project.standards[0]!.name = 'changed';
    expect(emptyProject().standards[0]!.name).toBe('S513');
  });
  it('loads the offline example with the acceptance plan', () => {
    const plan = planProject(exampleProject());
    expect(plan.sessions.map((s) => s.rows.length)).toEqual([245, 332, 324]);
    expect(plan.sessions.flatMap((s) => s.warnings)).toEqual([]);
  });
  it('preserves cell types and updates label identity', () => {
    const project = exampleProject();
    const row = planProject(project).sessions[1]!.rows[0]!;
    expect(
      editCell(row, 'Laser Scan Position Number', '123', project)[
        'Laser Scan Position Number'
      ],
    ).toBe(123);
    expect(
      editCell(row, 'Laser Scan Position Number', '', project)[
        'Laser Scan Position Number'
      ],
    ).toBeNull();
    expect(editCell(row, 'Evaluate', false, project).Evaluate).toBe(false);
    expect(editCell(row, 'Label', 'S513_650', project).meta.kind).toBe(
      'primary',
    );
    expect(editCell(row, 'Status', 'text', project).Status).toBeNull();
    expect(() => editCell(row, 'Duration [s]', '', project)).toThrow();
    expect(() =>
      editCell(row, 'Laser Scan Position Number', 'bad', project),
    ).toThrow();
    expect(row.Label).toBe('NIST612_875');
  });
  it('recognizes saved generated rows without false manual edit warnings', () => {
    const project = exampleProject();
    const plan = planProject(project);
    project.sessions.forEach((s, i) => {
      s.rows = plan.sessions[i]!.rows;
    });
    const saved = parseProject(serializeProject(project));
    expect(rowsDiffer(saved.sessions[1]!.rows, plan.sessions[1]!.rows)).toBe(
      false,
    );
    saved.sessions[1]!.rows[0]!.Evaluate = false;
    expect(rowsDiffer(saved.sessions[1]!.rows, plan.sessions[1]!.rows)).toBe(
      true,
    );
    expect(rowsDiffer([], plan.sessions[1]!.rows)).toBe(true);
  });
  it('moves adjacent and disjoint selections without reversing them', () => {
    expect(moveRows(['a', 'b', 'c', 'd', 'e'], [1, 2, 4], -1)).toEqual({
      rows: ['b', 'c', 'a', 'e', 'd'],
      selected: [0, 1, 3],
    });
    expect(moveRows(['a', 'b', 'c', 'd'], [0, 1], 1)).toEqual({
      rows: ['c', 'a', 'b', 'd'],
      selected: [1, 2],
    });
    expect(moveRows(['a', 'b'], [0, 1], -1).rows).toEqual(['a', 'b']);
  });
  it('keeps experiment filenames valid on Windows', () => {
    expect(fileStem(' a/b:run. ')).toBe('a_b_run');
    expect(fileStem('')).toBe('Experiment');
  });
});
