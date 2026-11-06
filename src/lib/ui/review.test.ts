import { describe, expect, it } from 'vitest';
import { toTSV } from '../engine/export';
import { planProject } from '../engine/sequence';
import { exampleProject } from './model';
import { compactChunks, doubledBrackets, splitTSV } from './review';

describe('Qtegra paste cells', () => {
  it('reassembles the generated 332 rows byte for byte, with 13 cells per row', () => {
    const rows = planProject(exampleProject()).sessions.find(
      (s) => s.number === 2,
    )!.rows;
    const text = toTSV(rows);
    const cells = splitTSV(text);
    expect(cells).toHaveLength(332);
    expect(cells.every((row) => row.length === 13)).toBe(true);
    expect(cells.map((row) => row.join('\t') + '\r\n').join('')).toBe(text);
    expect(cells[0]).toEqual([
      'NIST612_875',
      '',
      '30',
      '<Comment>',
      'TRUE',
      'UNKNOWN',
      '',
      '1',
      '',
      '',
      '<Identifier>',
      '875',
      '46',
    ]);
  });
  it('preserves whitespace, empty last cells and booleans, and handles no rows', () => {
    expect(splitTSV('')).toEqual([]);
    expect(splitTSV(' a \tTRUE\t\r\n')).toEqual([[' a ', 'TRUE', '']]);
    expect(splitTSV('\t\r\n')).toEqual([['', '']]);
  });
});

it('compacts chunk sizes in their first-seen order', () => {
  expect(compactChunks([13, 13, 12, 12, 12])).toBe('2 × 13, 3 × 12');
  expect(compactChunks([])).toBe('');
});

it('numbers doubled brackets across planned sessions, excluding the imported session', () => {
  const plan = planProject(exampleProject());
  expect(doubledBrackets(plan)).toEqual([13, 25, 37]);
  expect(compactChunks(plan.sessions[1]!.chunks)).toBe('6 × 13, 13 × 12');
  expect(compactChunks(plan.sessions[2]!.chunks)).toBe('12 × 13, 6 × 12');
  expect(doubledBrackets({ ...plan, sessions: [] })).toEqual([]);
});
