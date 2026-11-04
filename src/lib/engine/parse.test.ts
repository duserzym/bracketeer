import { describe, expect, it } from 'vitest';
import { parseRanges, parseUnknowns, parseUsedSpots } from './parse';

describe('parseUnknowns', () => {
  it.each([
    ['SYN-H3 S 1-30', 'SYN-H3', 'S', 1, 30],
    ['SYN-V1 384-487', 'SYN-V1', '', 384, 487],
    ['SYN-J1 xs 235–252', 'SYN-J1', 'xs', 235, 252],
    ['SYN-J1 xs 235 — 252', 'SYN-J1', 'xs', 235, 252],
    ['SYN-H3 S 1 - 30', 'SYN-H3', 'S', 1, 30],
    ['SYN-H3, S, 1, 30', 'SYN-H3', 'S', 1, 30],
    ['SYN-H3\tS\t1\t30', 'SYN-H3', 'S', 1, 30],
    ['SYN-V1\t\t384\t487', 'SYN-V1', '', 384, 487],
    ['SYN-V1,384,487', 'SYN-V1', '', 384, 487],
    ['SYN-H3,S,1–30', 'SYN-H3', 'S', 1, 30],
    ['SYN-K2 S 182-192', 'SYN-K2', 'S', 182, 192],
    ['X 5', 'X', '', 5, 5],
    ['X xs 5', 'X', 'xs', 5, 5],
    ['X\t5', 'X', '', 5, 5],
  ])('parses %s', (text, name, tag, from, to) => {
    expect(parseUnknowns(text as string)).toEqual({
      rows: [{ name, tag, from, to }],
      errors: [],
    });
  });

  it('accepts an Excel header, blank lines and CRLF; keeps input order', () => {
    expect(
      parseUnknowns(
        '\r\nName\tTag\tFrom\tTo\r\nHH3\tS\t1\t30\r\nX\t\t31\t31\r\n',
      ),
    ).toEqual({
      rows: [
        { name: 'SYN-H3', tag: 'S', from: 1, to: 30 },
        { name: 'X', tag: '', from: 31, to: 31 },
      ],
      errors: [],
    });
    expect(parseUnknowns('Sample\tFrom\tTo\nX\t1\t2').rows).toEqual([
      { name: 'X', tag: '', from: 1, to: 2 },
    ]);
  });

  it('returns per-line errors without throwing or losing valid rows', () => {
    const lines = [
      'X 5',
      '',
      'oops',
      'X S 5-1',
      'X 0',
      'X -1',
      'X 1.5',
      'X 9007199254740992',
      ', S, 1, 2',
      'X,S,1-3,4',
      'Y 8',
    ];
    const result = parseUnknowns(lines.join('\n'));
    expect(result.rows).toEqual([
      { name: 'X', tag: '', from: 5, to: 5 },
      { name: 'Y', tag: '', from: 8, to: 8 },
    ]);
    expect(result.errors.map((e) => e.line)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    for (const error of result.errors) {
      expect(error.text).toBe(lines[error.line - 1]);
      expect(error.reason).not.toBe('');
    }
    expect(parseUnknowns('')).toEqual({ rows: [], errors: [] });
  });
});

describe('standard and used ranges', () => {
  it('parses separated ranges and single spots with all dash forms', () => {
    expect(parseRanges('848-856, 866 – 874\n900—901, 905')).toEqual({
      rows: [
        { from: 848, to: 856 },
        { from: 866, to: 874 },
        { from: 900, to: 901 },
        { from: 905, to: 905 },
      ],
      errors: [],
    });
  });

  it('expands, sorts and deduplicates used positions', () => {
    expect(parseUsedSpots('700, 628-631, 630–632')).toEqual({
      rows: [628, 629, 630, 631, 632, 700],
      errors: [],
    });
    expect(parseUsedSpots('')).toEqual({ rows: [], errors: [] });
  });

  it('reports malformed tokens and line numbers while keeping valid ranges', () => {
    const result = parseRanges('8-2, nope\n0, 1.5, 3');
    expect(result.rows).toEqual([{ from: 3, to: 3 }]);
    expect(result.errors.map(({ line, text }) => ({ line, text }))).toEqual([
      { line: 1, text: '8-2' },
      { line: 1, text: 'nope' },
      { line: 2, text: '0' },
      { line: 2, text: '1.5' },
    ]);
    expect(parseUsedSpots('1-2, bad').errors).toEqual(
      parseRanges('1-2, bad').errors,
    );
  });
});
