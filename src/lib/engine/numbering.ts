import { countStandards } from './count';
import { projectLayouts } from './plan';
import type { Auto, PoolRange, Project, Unknown } from './types';

/** Resolve the two opt-in chains without changing hand values or fixed sessions. */
export function resolveAuto(project: Project): Project {
  const next = structuredClone(project);
  let previous = 0;
  for (const session of [...next.sessions].sort((a, b) => a.number - b.number))
    for (const entry of session.unknowns) {
      const width = entry.to - entry.from;
      if (!session.fixed) {
        if (entry.auto?.from) entry.from = previous + 1;
        if (entry.auto?.to) entry.to = entry.from + width;
      }
      previous = entry.to;
    }

  // A hand endpoint may cross an automatic begin. Keep it for checkSpots to
  // report; invalid ranges cannot contribute spots to the demand calculation.
  const valid = (r: PoolRange) =>
    Number.isSafeInteger(r.from) &&
    r.from > 0 &&
    Number.isSafeInteger(r.to) &&
    (r.to >= r.from || (r.auto?.to && r.to === r.from - 1));
  const countInput = {
    ...next,
    sessions: next.sessions.map((s) => ({
      ...s,
      unknowns: s.unknowns.filter(valid),
    })),
    standards: next.standards.map((s) => ({
      ...s,
      ranges: s.ranges.filter(valid),
    })),
  };
  const counts = countStandards(countInput);
  const used = projectLayouts(countInput).standards.map((s) => new Set(s.used));
  previous = Math.max(
    0,
    ...next.sessions.flatMap((s) => s.unknowns.map((u) => u.to)),
  );
  const budget = next.recipe.chunking.mode === 'budget';
  next.standards.forEach((standard, i) => {
    const target = counts[i]!.needed + standard.spare;
    if (!budget && !standard.ranges.length && target > 0)
      standard.ranges.push({
        from: previous + 1,
        to: previous,
        auto: { from: true, to: true },
      });
    if (
      !budget &&
      target === 0 &&
      standard.ranges.length === 1 &&
      standard.ranges[0]!.auto?.from &&
      standard.ranges[0]!.auto?.to
    ) {
      standard.ranges = [];
    }
    const placed = new Set<number>();
    standard.ranges.forEach((range, j) => {
      if (range.auto?.from) range.from = previous + 1;
      if (!budget && j === standard.ranges.length - 1 && range.auto?.to) {
        let remaining = Math.max(0, target - placed.size);
        range.to = range.from - 1;
        while (remaining > 0) {
          range.to++;
          if (!Number.isSafeInteger(range.to))
            throw new RangeError(
              'Automatic spots exceed the safe integer range.',
            );
          if (!used[i]!.has(range.to) && !placed.has(range.to)) remaining--;
        }
      }
      for (let spot = range.from; spot <= range.to; spot++)
        if (!used[i]!.has(spot)) placed.add(spot);
      previous = range.to;
    });
  });
  return JSON.stringify(next) === JSON.stringify(project) ? project : next;
}

function setAuto(range: PoolRange, field: keyof Auto, automatic: boolean) {
  const flags = { ...range.auto };
  if (automatic) flags[field] = true;
  else delete flags[field];
  if (Object.keys(flags).length) range.auto = flags;
  else delete range.auto;
}

function unknownIn(project: Project, session: number, index: number): Unknown {
  const s = project.sessions.find((s) => s.number === session);
  if (!s) throw new Error(`Session ${session} does not exist.`);
  if (s.fixed) throw new Error(`Session ${session} is fixed.`);
  const entry = s.unknowns[index];
  if (!entry) throw new Error(`Unknown entry ${index} does not exist.`);
  return entry;
}

function standardIn(project: Project, name: string) {
  const standard = project.standards.find((s) => s.name === name);
  if (!standard) throw new Error(`Standard ${name} does not exist.`);
  return standard;
}

function rangeIn(project: Project, name: string, index: number) {
  const range = standardIn(project, name).ranges[index];
  if (!range) throw new Error(`Range ${index} of ${name} does not exist.`);
  return range;
}

function positive(value: number) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new RangeError('Enter a positive whole number.');
}

/** Session numbers identify sessions; entry/range indexes are zero-based. */
export function editUnknown(
  project: Project,
  session: number,
  index: number,
  field: 'from' | 'to' | 'count',
  value: number,
): Project {
  positive(value);
  const next = structuredClone(project);
  const entry = unknownIn(next, session, index);
  if (field === 'count') {
    entry.to = entry.from + value - 1;
    setAuto(entry, 'to', true);
  } else {
    const width = entry.to - entry.from;
    entry[field] = value;
    setAuto(entry, field, false);
    if (field === 'from' && entry.auto?.to) entry.to = value + width;
  }
  return resolveAuto(next);
}

/** Give an unknown endpoint back to its automatic chain. */
export function autoUnknown(
  project: Project,
  session: number,
  index: number,
  field: keyof Auto,
): Project {
  const next = structuredClone(project);
  setAuto(unknownIn(next, session, index), field, true);
  return resolveAuto(next);
}

/** Set a standard endpoint by hand; other automatic values follow it. */
export function editStandardRange(
  project: Project,
  name: string,
  index: number,
  field: keyof Auto,
  value: number,
): Project {
  positive(value);
  const next = structuredClone(project);
  const range = rangeIn(next, name, index);
  range[field] = value;
  setAuto(range, field, false);
  return resolveAuto(next);
}

/** Only the last standard range can have an automatic end. */
export function autoStandardRange(
  project: Project,
  name: string,
  index: number,
  field: keyof Auto,
): Project {
  const next = structuredClone(project);
  const standard = standardIn(next, name);
  if (field === 'to' && index !== standard.ranges.length - 1)
    throw new Error('Only the last range can have an automatic end.');
  setAuto(rangeIn(next, name, index), field, true);
  return resolveAuto(next);
}

/** Append a sample with an automatic begin and the requested count. */
export function addSample(
  project: Project,
  session: number,
  sample: Pick<Unknown, 'name' | 'tag'>,
  count: number,
): Project {
  positive(count);
  const next = structuredClone(project);
  const s = next.sessions.find((s) => s.number === session);
  if (!s) throw new Error(`Session ${session} does not exist.`);
  if (s.fixed) throw new Error(`Session ${session} is fixed.`);
  s.unknowns.push({
    ...sample,
    from: 1,
    to: count,
    auto: { from: true, to: true },
  });
  return resolveAuto(next);
}

/** Start a new range above the mount, keeping the preceding end at its value. */
export function addStandardRange(project: Project, name: string): Project {
  const next = structuredClone(project);
  const standard = standardIn(next, name);
  const last = standard.ranges.at(-1);
  if (last) setAuto(last, 'to', false);
  const highest = Math.max(
    0,
    ...next.sessions.flatMap((s) => s.unknowns.map((u) => u.to)),
    ...next.standards.flatMap((s) => s.ranges.map((r) => r.to)),
    ...next.standards.flatMap((s) => s.used),
    ...next.sessions.flatMap((s) =>
      s.rows.flatMap((r) => r['Laser Scan Position Number'] ?? []),
    ),
    ...(next.grainatlas?.spots.map((r) => r.to) ?? []),
  );
  standard.ranges.push({ from: highest + 1, to: highest, auto: { to: true } });
  return resolveAuto(next);
}
