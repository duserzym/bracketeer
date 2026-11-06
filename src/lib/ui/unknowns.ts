import {
  formatSpots,
  parseSpotList,
  parseUnknowns,
  spotRuns,
  type ParseResult,
} from '../engine/parse';
import type { Project, Session, SpotRange, Unknown } from '../engine/types';

export interface SampleRow {
  key: string;
  name: string;
  tag: string;
  ranges: SpotRange[];
  text: string;
}
export interface TextDraft {
  text: string;
  saved: string;
}
export interface UnknownsState {
  sessions: Record<number, { signature: string; rows: SampleRow[] }>;
  standards: Record<string, TextDraft>;
}
export interface InputProblem {
  message: string;
  session: number | null;
  row?: number;
  standard?: string;
  field: 'name' | 'spots' | 'pool' | 'used' | 'unknowns';
}

export function rangeSpots(ranges: readonly SpotRange[]): number[] {
  const spots = new Set<number>();
  for (const { from, to } of ranges) {
    if (
      !Number.isSafeInteger(from) ||
      !Number.isSafeInteger(to) ||
      from < 1 ||
      to < from ||
      to - from + 1 > 100000
    )
      continue;
    for (let n = from; n <= to; n++) spots.add(n);
  }
  return [...spots].sort((a, b) => a - b);
}

/** Only adjacent identities represent one sample in a saved project. */
export function groupUnknowns(unknowns: readonly Unknown[]): SampleRow[] {
  const rows: SampleRow[] = [];
  for (const [i, u] of unknowns.entries()) {
    let row = rows.at(-1);
    if (!row || row.name !== u.name || row.tag !== u.tag) {
      row = { key: `row-${i}`, name: u.name, tag: u.tag, ranges: [], text: '' };
      rows.push(row);
    }
    row.ranges.push({ from: u.from, to: u.to });
  }
  return rows.map((r) => {
    const raw = r.ranges.map(({ from, to }) => `${from}–${to}`).join(', ');
    const parsed = parseSpotList(raw);
    return {
      ...r,
      text: parsed.errors.length ? raw : formatSpots(parsed.spots),
    };
  });
}

export function sampleRows(
  session: Session,
  state?: UnknownsState,
): SampleRow[] {
  const saved = state?.sessions[session.number];
  return saved?.signature === JSON.stringify(session.unknowns)
    ? saved.rows
    : groupUnknowns(session.unknowns);
}

export function draftText(
  state: UnknownsState | undefined,
  key: string,
  saved: string,
): string {
  const draft = state?.standards[key];
  return draft?.saved === saved ? draft.text : saved;
}

/** Extend the paste grammar without changing the engine's original parser. */
export function parseSamplePaste(text: string): ParseResult<SampleRow> {
  const rows: SampleRow[] = [];
  const errors: ParseResult<SampleRow>['errors'] = [];
  text.split(/\r\n|\n|\r/u).forEach((original, index) => {
    const line = original.trim();
    if (!line) return;
    const whitespaceStyle =
      !line.includes('\t') &&
      /^\S+\s+(?:[^\s,]+\s+)?[+-]?\d/u.test(line.split(',')[0]!);
    const legacy = parseUnknowns(line);
    if (
      !whitespaceStyle &&
      !legacy.errors.length &&
      legacy.rows.every(
        (r) => !parseSpotList(`${r.from}-${r.to}`).errors.length,
      )
    ) {
      rows.push(
        ...groupUnknowns(legacy.rows).map((r) => ({
          ...r,
          key: `paste-${index}`,
        })),
      );
      return;
    }
    let name = '',
      tag = '',
      spots = '';
    if (line.includes('\t') || (line.includes(',') && !whitespaceStyle)) {
      const fields = line
        .split(line.includes('\t') ? '\t' : ',')
        .map((s) => s.trim());
      name = fields[0] ?? '';
      tag = fields[1] ?? '';
      spots = fields.slice(2).join(', ');
    } else {
      const match = /^(\S+)\s+(?:(\S+)\s+)?(.+)$/u.exec(line);
      if (match) {
        name = match[1]!;
        // A numeric second field starts an untagged spot list.
        const rest = line.slice(name.length).trim();
        if (/^[\d+−-]/u.test(rest)) spots = rest;
        else {
          tag = match[2] ?? '';
          spots = match[3] ?? '';
        }
      }
    }
    const parsed = parseSpotList(spots);
    if (!name || !parsed.spots.length || parsed.errors.length) {
      errors.push({
        line: index + 1,
        text: original,
        reason:
          parsed.errors.map((e) => `${e.token}: ${e.reason}`).join(' ') ||
          'Expected a name, optional tag, and spots.',
      });
    } else
      rows.push({
        key: `paste-${index}`,
        name,
        tag,
        ranges: spotRuns(parsed.spots),
        text: formatSpots(parsed.spots),
      });
  });
  return { rows, errors };
}

/** All six blocking rules and the two advisory rules, independent of the DOM. */
export function validateUnknowns(
  project: Project,
  state?: UnknownsState,
): { errors: InputProblem[]; warnings: InputProblem[] } {
  const errors: InputProblem[] = [],
    warnings: InputProblem[] = [];
  const sessions = project.sessions.map((s) => ({
    ...s,
    samples: sampleRows(s, state),
  }));
  if (
    !sessions.some(
      (s) => !s.fixed && s.samples.some((r) => rangeSpots(r.ranges).length),
    )
  )
    errors.push({
      message: 'Add unknowns to an open session',
      session: sessions.find((s) => !s.fixed)?.number ?? null,
      field: 'unknowns',
    });
  const pools = project.standards.map((s) => ({
    ...s,
    spots: rangeSpots(s.ranges),
  }));
  const seen: {
    spots: Set<number>;
    row: number;
    name: string;
    session: number;
  }[] = [];
  for (const s of sessions) {
    if (!s.fixed && !s.samples.length)
      warnings.push({
        message: `Session ${s.number} has no unknowns.`,
        session: s.number,
        field: 'unknowns',
      });
    const names = new Map<string, number>();
    for (const [i, r] of s.samples.entries()) {
      const at = { session: s.number, row: i + 1 };
      const prefix = `Row ${i + 1}, ${r.name || 'unnamed'}:`;
      if (!r.name.trim())
        errors.push({ ...at, field: 'name', message: `${prefix} add a name.` });
      const parsed = parseSpotList(r.text);
      if (parsed.errors.length || !parsed.spots.length)
        errors.push({
          ...at,
          field: 'spots',
          message: `${prefix} ${parsed.errors.length ? parsed.errors.map((e) => `${e.token}: ${e.reason}`).join(' ') : 'add at least one spot.'}`,
        });
      const identity = JSON.stringify([r.name.trim(), r.tag.trim()]);
      const duplicate = names.get(identity);
      if (duplicate !== undefined)
        errors.push({
          ...at,
          field: 'name',
          message: `${prefix} this name and tag are also in row ${duplicate}.`,
        });
      else names.set(identity, i + 1);
      const spots = parsed.errors.length ? rangeSpots(r.ranges) : parsed.spots;
      for (const earlier of seen) {
        const overlap = spots.filter((n) => earlier.spots.has(n));
        if (overlap.length)
          errors.push({
            ...at,
            field: 'spots',
            message: `${prefix} ${overlap.length === 1 ? 'spot' : 'spots'} ${formatSpots(overlap)} ${overlap.length === 1 ? 'is' : 'are'} also in ${earlier.session === s.number ? '' : `session ${earlier.session}, `}row ${earlier.row}, ${earlier.name}.`,
          });
      }
      for (const pool of pools) {
        const set = new Set(pool.spots);
        const overlap = spots.filter((n) => set.has(n));
        if (overlap.length)
          errors.push({
            ...at,
            field: 'spots',
            message: `${prefix} ${overlap.length === 1 ? 'spot' : 'spots'} ${formatSpots(overlap)} ${overlap.length === 1 ? 'is' : 'are'} in the ${pool.name} pool.`,
          });
      }
      seen.push({
        spots: new Set(spots),
        row: i + 1,
        name: r.name,
        session: s.number,
      });
    }
  }
  for (const [i, pool] of pools.entries()) {
    const at = { session: null, standard: pool.name };
    const text = draftText(state, `${pool.name}:pool`, formatSpots(pool.spots));
    const parsed = parseSpotList(text);
    if (parsed.errors.length)
      errors.push({
        ...at,
        field: 'pool',
        message: `${pool.name} pool: ${parsed.errors.map((e) => `${e.token}: ${e.reason}`).join(' ')}`,
      });
    else if (!parsed.spots.length)
      errors.push({
        ...at,
        field: 'pool',
        message: `Add a pool for ${pool.name}`,
      });
    for (const other of pools.slice(0, i)) {
      const set = new Set(other.spots);
      const overlap = pool.spots.filter((n) => set.has(n));
      if (overlap.length)
        errors.push({
          ...at,
          field: 'pool',
          message: `${pool.name} and ${other.name} pools overlap at ${formatSpots(overlap)}.`,
        });
    }
    const outside = pool.used.filter((n) => !pool.spots.includes(n));
    if (outside.length)
      warnings.push({
        ...at,
        field: 'used',
        message: `${pool.name}: used ${outside.length === 1 ? 'spot' : 'spots'} ${formatSpots(outside)} outside its pool.`,
      });
  }
  return { errors, warnings };
}
