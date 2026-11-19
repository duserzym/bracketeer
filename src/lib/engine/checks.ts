import { countStandards } from './count';
import { parseLabel } from './labels';
import { formatSpots } from './parse';
import type { PoolRange, Project, SpotRange } from './types';

export type SpotTarget =
  | { kind: 'unknown'; session: number; index: number }
  | { kind: 'standard'; name: string; index: number };
export interface SpotIssue {
  severity: 'error' | 'warning';
  message: string;
  target: SpotTarget;
}

function valid(range: PoolRange): boolean {
  return (
    Number.isSafeInteger(range.from) &&
    range.from > 0 &&
    Number.isSafeInteger(range.to) &&
    (range.to >= range.from ||
      (range.auto?.to === true && range.to === range.from - 1))
  );
}
function overlap(a: SpotRange, b: SpotRange): SpotRange | null {
  const from = Math.max(a.from, b.from),
    to = Math.min(a.to, b.to);
  return from <= to ? { from, to } : null;
}
function display(ranges: SpotRange[]): string {
  return union(ranges)
    .map((r) => (r.from === r.to ? String(r.from) : `${r.from}–${r.to}`))
    .join(', ');
}
function union(ranges: SpotRange[]): SpotRange[] {
  const merged: SpotRange[] = [];
  for (const range of ranges
    .filter((r) => r.to >= r.from)
    .sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last && range.from <= last.to + 1)
      last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}
function missing(range: SpotRange, placed: SpotRange[]): SpotRange[] {
  const result: SpotRange[] = [];
  let from = range.from;
  for (const r of placed) {
    if (r.to < from) continue;
    if (r.from > range.to) break;
    if (r.from > from) result.push({ from, to: r.from - 1 });
    from = Math.max(from, r.to + 1);
  }
  if (from <= range.to) result.push({ from, to: range.to });
  return result;
}

/** Check the project's mount positions; targets use zero-based entry/range indexes. */
export function checkSpots(project: Project): SpotIssue[] {
  const issues: SpotIssue[] = [];
  const add = (
    severity: SpotIssue['severity'],
    message: string,
    target: SpotTarget,
  ) => issues.push({ severity, message, target });
  const entries: { range: PoolRange; name: string; target: SpotTarget }[] = [];
  const checkRange = (range: PoolRange, prefix: string, target: SpotTarget) => {
    if (!Number.isSafeInteger(range.from) || range.from < 1)
      add('error', `${prefix} begin must be a positive whole number.`, target);
    if (!Number.isSafeInteger(range.to) || range.to < (range.auto?.to ? 0 : 1))
      add('error', `${prefix} end must be a positive whole number.`, target);
    else if (
      Number.isSafeInteger(range.from) &&
      range.to < range.from &&
      !(range.auto?.to && range.to === range.from - 1)
    )
      add('error', `${prefix} end must be at least begin.`, target);
  };
  const pools = project.standards.map((s) => ({
    ...s,
    validRanges: s.ranges.filter(valid),
  }));
  const seen: {
    range: SpotRange;
    name: string;
    session: number;
    index: number;
  }[] = [];
  for (const session of project.sessions) {
    session.unknowns.forEach((entry, index) => {
      const target: SpotTarget = {
        kind: 'unknown',
        session: session.number,
        index,
      };
      const prefix = `Row ${index + 1}, ${entry.name || 'unnamed'}:`;
      checkRange(entry, prefix, target);
      if (!valid(entry)) return;
      entries.push({ range: entry, name: entry.name, target });
      for (const earlier of seen) {
        const shared = overlap(entry, earlier.range);
        if (!shared) continue;
        if (
          entry.from === earlier.range.from &&
          entry.to === earlier.range.to &&
          earlier.session === session.number
        )
          add(
            'error',
            `Rows ${earlier.index + 1} and ${index + 1}, ${entry.name}: the same spots ${display([shared])}.`,
            target,
          );
        else {
          const singular = shared.from === shared.to;
          add(
            'error',
            `${prefix} ${singular ? 'spot' : 'spots'} ${display([shared])} ${singular ? 'is' : 'are'} also in ${earlier.session === session.number ? '' : `session ${earlier.session}, `}row ${earlier.index + 1}, ${earlier.name}.`,
            target,
          );
        }
      }
      for (const pool of pools) {
        const shared = union(
          pool.validRanges.flatMap((r) => overlap(entry, r) ?? []),
        );
        if (shared.length) {
          const singular =
            shared.length === 1 && shared[0]!.from === shared[0]!.to;
          add(
            'error',
            `${prefix} ${singular ? 'spot' : 'spots'} ${display(shared)} ${singular ? 'is' : 'are'} in the ${pool.name} pool.`,
            target,
          );
        }
      }
      seen.push({
        range: entry,
        name: entry.name,
        session: session.number,
        index,
      });
    });
  }
  for (const [i, pool] of pools.entries()) {
    pool.ranges.forEach((range, index) => {
      const target: SpotTarget = { kind: 'standard', name: pool.name, index };
      checkRange(range, `${pool.name}, range ${index + 1}:`, target);
      if (!valid(range)) return;
      entries.push({ range, name: pool.name, target });
      pool.ranges.slice(0, index).forEach((earlier, j) => {
        const shared = valid(earlier) ? overlap(range, earlier) : null;
        if (shared)
          add(
            'error',
            `${pool.name}: ranges ${j + 1} and ${index + 1} overlap at ${display([shared])}.`,
            target,
          );
      });
    });
    const target: SpotTarget = { kind: 'standard', name: pool.name, index: 0 };
    for (const other of pools.slice(0, i)) {
      const shared = union(
        pool.validRanges.flatMap((r) =>
          other.validRanges.flatMap((o) => overlap(r, o) ?? []),
        ),
      );
      if (shared.length) {
        const index = pool.ranges.findIndex(
          (r) => valid(r) && other.validRanges.some((o) => overlap(r, o)),
        );
        add(
          'error',
          `${pool.name} and ${other.name} pools overlap at ${display(shared)}.`,
          { ...target, index },
        );
      }
    }
    const used = new Set(pool.used);
    for (const session of project.sessions.filter((s) => s.fixed))
      for (const row of session.rows) {
        const label = parseLabel(row.Label, project.standards);
        const spot = row['Laser Scan Position Number'];
        if (
          label.kind === pool.role &&
          label.name === pool.name &&
          spot !== null
        )
          used.add(spot);
      }
    const outside = [...used].filter(
      (n) => !pool.validRanges.some((r) => n >= r.from && n <= r.to),
    );
    if (outside.length)
      add(
        'warning',
        `${pool.name}: used ${outside.length === 1 ? 'spot' : 'spots'} ${formatSpots(outside)} outside its pool.`,
        target,
      );
  }
  if (
    project.sessions.every((s) => s.unknowns.every(valid)) &&
    project.standards.every((s) => s.ranges.every(valid))
  )
    for (const count of countStandards(project))
      if (count.short)
        add(
          'warning',
          `${count.name}: needs ${count.needed}, ${count.available} available (${count.short} short).`,
          { kind: 'standard', name: count.name, index: 0 },
        );

  if (project.grainatlas && entries.length) {
    const placed = union(project.grainatlas.spots);
    const size = (ranges: SpotRange[]) =>
      ranges.reduce((n, r) => n + r.to - r.from + 1, 0);
    const used = size(union(entries.map((e) => e.range)));
    const total = size(placed);
    const target = entries[0]!.target;
    if (used > total)
      add(
        'warning',
        `This run uses ${used} spots; GrainAtlas placed ${total} (${project.grainatlas.file}).`,
        target,
      );
    const absent = entries.flatMap((entry) => {
      const ranges = missing(entry.range, placed);
      return ranges.length
        ? [{ text: `${entry.name} ${display(ranges)}`, target: entry.target }]
        : [];
    });
    if (absent.length)
      add(
        'warning',
        `Not placed in GrainAtlas: ${absent
          .slice(0, 8)
          .map((e) => e.text)
          .join(
            ', ',
          )}${absent.length > 8 ? `, and ${absent.length - 8} more` : ''}.`,
        absent[0]!.target,
      );
  }
  return issues;
}
