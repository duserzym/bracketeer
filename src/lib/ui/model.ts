import example from '../../../fixtures/synthetic-session-1.bracketeer.json';
import { parseLabel } from '../engine/labels';
import { parseProject } from '../engine/project';
import {
  DEFAULT_EXPERIMENT,
  DEFAULT_RECIPE,
  QTEGRA_COLUMNS,
  type Project,
  type QtegraCells,
  type Row,
} from '../engine/types';

export function exampleProject(): Project {
  return parseProject(JSON.stringify(example));
}

export function emptyProject(): Project {
  return {
    version: 1,
    experiment: structuredClone(DEFAULT_EXPERIMENT),
    standards: exampleProject().standards.map((s) => ({ ...s, used: [] })),
    recipe: structuredClone(DEFAULT_RECIPE),
    sessions: [{ number: 1, fixed: false, unknowns: [], rows: [] }],
  };
}

/** Only cell edits are accepted here: metadata follows the edited label. */
export function editCell(
  row: Row,
  column: keyof QtegraCells,
  value: string | boolean,
  project: Project,
): Row {
  const next = structuredClone(row);
  if (column === 'Status') return next; // Qtegra requires a truly blank Status.
  if (column === 'Evaluate') next.Evaluate = Boolean(value);
  else if (column === 'Laser Scan Position Number') {
    const number = String(value).trim() === '' ? null : Number(value);
    if (number !== null && !Number.isFinite(number))
      throw new Error('Enter a finite position number.');
    next[column] = number;
  } else if (
    column === 'Duration [s]' ||
    column === 'Dilution Factor' ||
    column === 'Laser Output Setting [%]'
  ) {
    if (String(value).trim() === '' || !Number.isFinite(Number(value)))
      throw new Error(`Enter a number for ${column}.`);
    next[column] = Number(value);
  } else next[column] = String(value);
  if (column === 'Label') {
    const parsed = parseLabel(next.Label, project.standards);
    next.meta = { ...next.meta, kind: parsed.kind, name: parsed.name };
  }
  return next;
}

/** A multi-row move preserves order, including disjoint selections. */
export function moveRows<T>(
  rows: readonly T[],
  selected: readonly number[],
  direction: -1 | 1,
): { rows: T[]; selected: number[] } {
  const result = [...rows];
  const indexes = new Set(selected);
  const order = [...selected].sort((a, b) =>
    direction === -1 ? a - b : b - a,
  );
  for (const index of order) {
    const target = index + direction;
    if (target < 0 || target >= result.length || indexes.has(target)) continue;
    [result[index], result[target]] = [result[target]!, result[index]!];
    indexes.delete(index);
    indexes.add(target);
  }
  return { rows: result, selected: [...indexes].sort((a, b) => a - b) };
}

export function fileStem(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*]/gu, '_')
      .split('')
      .map((c) => (c.charCodeAt(0) < 32 ? '_' : c))
      .join('')
      .replace(/[. ]+$/u, '') || 'Experiment'
  );
}

/** Compare persisted rows by value, independent of JSON property order. */
export function rowsDiffer(a: readonly Row[], b: readonly Row[]): boolean {
  return (
    a.length !== b.length ||
    a.some((row, i) => {
      const other = b[i]!;
      return (
        QTEGRA_COLUMNS.some((column) => row[column] !== other[column]) ||
        row.meta.kind !== other.meta.kind ||
        row.meta.name !== other.meta.name ||
        row.meta.block !== other.meta.block
      );
    })
  );
}
