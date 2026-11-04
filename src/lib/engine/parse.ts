import type { SpotRange, Unknown } from './types';

export interface ParseError {
  line: number;
  text: string;
  reason: string;
}

export interface ParseResult<T> {
  rows: T[];
  errors: ParseError[];
}

const spotPattern = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/u;

function readRange(text: string): SpotRange | null {
  const match = spotPattern.exec(text.trim());
  if (!match) return null;
  const from = Number(match[1]);
  const to = Number(match[2] ?? match[1]);
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 1 ||
    to < from
  )
    return null;
  return { from, to };
}

function isHeader(fields: string[]): boolean {
  const names = fields.map((field) => field.toLowerCase());
  return (
    ['name', 'sample', 'sample name'].includes(names[0] ?? '') &&
    ((names.length === 4 &&
      ['tag', 'size', 'size tag'].includes(names[1] ?? '') &&
      ['from', 'spot from'].includes(names[2] ?? '') &&
      ['to', 'spot to'].includes(names[3] ?? '')) ||
      (names.length === 3 && names[1] === 'from' && names[2] === 'to'))
  );
}

/** Parse hand-written or comma/tab-separated unknowns, keeping every bad line. */
export function parseUnknowns(text: string): ParseResult<Unknown> {
  const rows: Unknown[] = [];
  const errors: ParseError[] = [];
  let firstContent = true;
  text.split(/\r\n|\n|\r/u).forEach((original, index) => {
    const line = original.trim();
    if (!line) return;
    const separated = /[,\t]/u.test(original);
    const fields = separated
      ? original
          .split(original.includes('\t') ? '\t' : ',')
          .map((part) => part.trim())
      : line.split(/\s+/u);
    if (firstContent && isHeader(fields)) {
      firstContent = false;
      return;
    }
    firstContent = false;
    let name = '';
    let tag = '';
    let range: SpotRange | null = null;
    if (separated) {
      name = fields[0] ?? '';
      if (fields.length === 4) {
        tag = fields[1] ?? '';
        // Separate endpoints must each be a single integer.
        if (/^\d+$/u.test(fields[2] ?? '') && /^\d+$/u.test(fields[3] ?? ''))
          range = readRange(`${fields[2]}-${fields[3]}`);
      } else if (fields.length === 3) {
        // Both "name, from, to" and "name, tag, range" are useful pastes.
        if (/^\d+$/u.test(fields[1] ?? '') && /^\d+$/u.test(fields[2] ?? '')) {
          range = readRange(`${fields[1]}-${fields[2]}`);
        } else {
          tag = fields[1] ?? '';
          range = readRange(fields[2] ?? '');
        }
      } else if (fields.length === 2) {
        range = readRange(fields[1] ?? '');
      }
    } else {
      // Match the range at the end so hyphens/dots in the name stay intact.
      const match = /^(\S+)(?:\s+(\S+))?\s+(\d+(?:\s*[-–—]\s*\d+)?)$/u.exec(
        line,
      );
      if (match) {
        name = match[1] ?? '';
        tag = match[2] ?? '';
        range = readRange(match[3] ?? '');
      }
    }
    if (!name || !range) {
      errors.push({
        line: index + 1,
        text: original,
        reason:
          'Expected a name, optional tag, and ascending positive spot range.',
      });
    } else {
      rows.push({ name, tag, ...range });
    }
  });
  return { rows, errors };
}

/** Parse comma/newline-separated inclusive standard ranges; no exceptions. */
export function parseRanges(text: string): ParseResult<SpotRange> {
  const rows: SpotRange[] = [];
  const errors: ParseError[] = [];
  text.split(/\r\n|\n|\r/u).forEach((original, index) => {
    if (!original.trim()) return;
    for (const token of original.split(',')) {
      const range = readRange(token);
      if (range) rows.push(range);
      else
        errors.push({
          line: index + 1,
          text: token.trim(),
          reason: 'Expected a positive spot or ascending range.',
        });
    }
  });
  return { rows, errors };
}

/** Expand used-spot ranges into sorted unique positions, retaining parse errors. */
export function parseUsedSpots(text: string): ParseResult<number> {
  const parsed = parseRanges(text);
  const spots = new Set<number>();
  for (const { from, to } of parsed.rows) {
    for (let spot = from; spot <= to; spot++) spots.add(spot);
  }
  return { rows: [...spots].sort((a, b) => a - b), errors: parsed.errors };
}
