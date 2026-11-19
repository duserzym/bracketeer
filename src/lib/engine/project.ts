import { parseLabel } from './labels';
import { groupRecipe, groupStandards, mineralGroup } from './groups';
import { bracketLayout } from './plan';
import { planProject } from './sequence';
import {
  DEFAULT_RECIPE,
  QTEGRA_COLUMNS,
  type Auto,
  type PoolRange,
  type Block,
  type BlockEntry,
  type Chunking,
  type ColumnDefaults,
  type Project,
  type Recipe,
  type Row,
  type Standard,
  type Unknown,
} from './types';

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array.`);
  return value;
}
function string(value: unknown, path: string, nonempty = false): string {
  if (typeof value !== 'string' || (nonempty && !value.trim()))
    throw new Error(
      `${path} must be ${nonempty ? 'a nonempty string' : 'text'}.`,
    );
  return value;
}
function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error(`${path} must be a finite number.`);
  return value;
}
function integer(value: unknown, path: string, min = 1): number {
  const n = number(value, path);
  if (!Number.isSafeInteger(n) || n < min)
    throw new Error(`${path} must be an integer of at least ${min}.`);
  return n;
}
function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean')
    throw new Error(`${path} must be true or false.`);
  return value;
}
function auto(value: unknown, path: string): Auto {
  const flags = object(value, path);
  for (const key of ['from', 'to'])
    if (flags[key] !== undefined && flags[key] !== true)
      throw new Error(`${path}.${key} must be true when present.`);
  return {
    ...(flags.from === true ? { from: true as const } : {}),
    ...(flags.to === true ? { to: true as const } : {}),
  };
}
function range(value: unknown, path: string, allowAuto = false): PoolRange {
  const r = object(value, path);
  const flags =
    allowAuto && r.auto !== undefined
      ? auto(r.auto, `${path}.auto`)
      : undefined;
  const from = integer(r.from, `${path}.from`),
    to = integer(r.to, `${path}.to`, flags?.to ? 0 : 1);
  if (to < from && !(flags?.to && to === from - 1))
    throw new Error(`${path} must be an ascending range.`);
  return { from, to, ...(flags === undefined ? {} : { auto: flags }) };
}
function optionalMineral(value: Record<string, unknown>, path: string) {
  return value.mineral === undefined
    ? {}
    : { mineral: string(value.mineral, `${path}.mineral`, true) };
}
function unknown(value: unknown, path: string): Unknown {
  const s = object(value, path);
  return {
    name: string(s.name, `${path}.name`, true),
    tag: string(s.tag, `${path}.tag`),
    ...range(s, path, true),
  };
}
const numericColumns = new Set([
  'Duration [s]',
  'Dilution Factor',
  'Laser Output Setting [%]',
]);
function defaults(value: unknown, path: string): ColumnDefaults {
  const d = object(value, path);
  return Object.fromEntries(
    QTEGRA_COLUMNS.filter(
      (c) =>
        c !== 'Label' && c !== 'Status' && c !== 'Laser Scan Position Number',
    ).map((c) => [
      c,
      c === 'Evaluate'
        ? boolean(d[c], `${path}.${c}`)
        : numericColumns.has(c)
          ? number(d[c], `${path}.${c}`)
          : string(d[c], `${path}.${c}`),
    ]),
  ) as ColumnDefaults;
}
function block(value: unknown, path: string): BlockEntry[] {
  return array(value, path).map((e, i) => {
    const b = object(e, `${path}[${i}]`);
    return {
      standard: string(b.standard, `${path}[${i}].standard`, true),
      count: integer(b.count, `${path}[${i}].count`, 0),
    };
  });
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
): T {
  if (!values.includes(value as T))
    throw new Error(`${path} must be ${values.join(', ')}.`);
  return value as T;
}
function grainatlas(value: unknown): NonNullable<Project['grainatlas']> {
  const g = object(value, 'grainatlas');
  return {
    file: string(g.file, 'grainatlas.file'),
    spots: array(g.spots, 'grainatlas.spots').map((r, i) =>
      range(r, `grainatlas.spots[${i}]`),
    ),
  };
}

/** Validate and normalize a versioned project, with paths in all format errors. */
export function parseProject(text: string): Project {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Project is not valid JSON.');
  }
  const p = object(json, 'Project');
  if (p.version !== 1)
    throw new Error(
      `Unsupported project version ${String(p.version)}; expected 1.`,
    );
  let wizard: Project['wizard'];
  if (p.wizard !== undefined) {
    const w = object(p.wizard, 'wizard');
    const step = integer(w.step, 'wizard.step');
    if (step > 4)
      throw new Error('wizard.step must be an integer from 1 to 4.');
    wizard = {
      step: step as 1 | 2 | 3 | 4,
      mineral: string(w.mineral, 'wizard.mineral', true),
    };
  }
  const experiment = object(p.experiment, 'experiment');
  const standards: Standard[] = array(p.standards, 'standards').map(
    (value, i) => {
      const path = `standards[${i}]`,
        s = object(value, path);
      if (
        s.role !== 'primary' &&
        s.role !== 'secondary' &&
        s.role !== 'reference'
      )
        throw new Error(
          `${path}.role must be primary, secondary, or reference.`,
        );
      return {
        name: string(s.name, `${path}.name`, true),
        role: s.role,
        ranges: array(s.ranges, `${path}.ranges`).map((r, j) =>
          range(r, `${path}.ranges[${j}]`, true),
        ),
        used: array(s.used, `${path}.used`).map((u, j) =>
          integer(u, `${path}.used[${j}]`),
        ),
        spare: integer(s.spare ?? 0, `${path}.spare`, 0),
        ...optionalMineral(s, path),
        ...(s.perBracket === undefined
          ? {}
          : { perBracket: integer(s.perBracket, `${path}.perBracket`) }),
        ...(s.cadence === undefined
          ? {}
          : {
              cadence: enumValue(
                s.cadence,
                ['every', 'odd', 'even'] as const,
                `${path}.cadence`,
              ),
            }),
      };
    },
  );
  const r = object(p.recipe, 'recipe');
  const c = object(r.chunking ?? { mode: 'budget' }, 'recipe.chunking');
  let chunking: Chunking;
  if (c.mode === 'budget') chunking = { mode: 'budget' };
  else if (c.mode === 'size')
    chunking = { mode: 'size', size: integer(c.size, 'recipe.chunking.size') };
  else if (c.mode === 'count')
    chunking = {
      mode: 'count',
      count: integer(c.count, 'recipe.chunking.count'),
    };
  else throw new Error('recipe.chunking.mode must be budget, size, or count.');
  const recipe: Recipe = {
    opening: block(r.opening ?? DEFAULT_RECIPE.opening, 'recipe.opening'),
    mid: block(r.mid ?? DEFAULT_RECIPE.mid, 'recipe.mid'),
    closing: block(r.closing ?? DEFAULT_RECIPE.closing, 'recipe.closing'),
    secondaryPairsPerBracket: integer(
      r.secondaryPairsPerBracket ?? 1,
      'recipe.secondaryPairsPerBracket',
      0,
    ),
    maxPairsPerBracket: integer(
      r.maxPairsPerBracket ?? 2,
      'recipe.maxPairsPerBracket',
    ),
    spotsPerSecondary: integer(
      r.spotsPerSecondary ?? 2,
      'recipe.spotsPerSecondary',
    ),
    primaryPerBracket: integer(
      r.primaryPerBracket ?? 2,
      'recipe.primaryPerBracket',
    ),
    chunking,
    bracketAtSampleBoundaries: boolean(
      r.bracketAtSampleBoundaries ?? false,
      'recipe.bracketAtSampleBoundaries',
    ),
    rotationStart: integer(r.rotationStart ?? 0, 'recipe.rotationStart', 0),
    ...(r.secondaries === undefined
      ? {}
      : {
          secondaries: enumValue(
            r.secondaries,
            ['rotate', 'cadence'] as const,
            'recipe.secondaries',
          ),
        }),
    ...(r.openingBracket === undefined
      ? {}
      : { openingBracket: boolean(r.openingBracket, 'recipe.openingBracket') }),
    ...(r.rotationStarts === undefined
      ? {}
      : {
          rotationStarts: Object.fromEntries(
            Object.entries(
              object(r.rotationStarts, 'recipe.rotationStarts'),
            ).map(([mineral, start]) => {
              string(mineral, 'recipe.rotationStarts mineral', true);
              return [
                mineral,
                integer(start, `recipe.rotationStarts.${mineral}`, 0),
              ];
            }),
          ),
        }),
  };

  const sessionNumbers = new Set<number>();
  const sessions = array(p.sessions, 'sessions').map((value, i) => {
    const path = `sessions[${i}]`,
      s = object(value, path);
    const n = integer(s.number, `${path}.number`);
    if (sessionNumbers.has(n))
      throw new Error(`${path}.number duplicates session ${n}.`);
    sessionNumbers.add(n);
    return {
      number: n,
      unknowns: array(s.unknowns, `${path}.unknowns`).map((u, j) =>
        unknown(u, `${path}.unknowns[${j}]`),
      ),
      rows: array(s.rows, `${path}.rows`).map((value, j): Row => {
        const rowPath = `${path}.rows[${j}]`,
          row = object(value, rowPath);
        const label = string(row.Label, `${rowPath}.Label`);
        const parsed = parseLabel(label, standards);
        const meta =
          row.meta === undefined
            ? {
                kind: parsed.kind,
                name: parsed.name,
                block:
                  parsed.kind === 'unknown' || parsed.kind === 'unrecognized'
                    ? 'unknowns'
                    : 'bracket',
              }
            : object(row.meta, `${rowPath}.meta`);
        const kind = meta.kind;
        if (
          kind !== 'unknown' &&
          kind !== 'unrecognized' &&
          kind !== 'primary' &&
          kind !== 'secondary' &&
          kind !== 'reference'
        )
          throw new Error(`${rowPath}.meta.kind is invalid.`);
        const b = string(meta.block, `${rowPath}.meta.block`);
        if (!['opening', 'unknowns', 'mid', 'bracket', 'closing'].includes(b))
          throw new Error(`${rowPath}.meta.block is invalid.`);
        if (row.Status !== null)
          throw new Error(`${rowPath}.Status must be null (blank).`);
        return {
          Label: label,
          Status: null,
          ...defaults(row, rowPath),
          'Laser Scan Position Number':
            row['Laser Scan Position Number'] === null
              ? null
              : number(
                  row['Laser Scan Position Number'],
                  `${rowPath}.Laser Scan Position Number`,
                ),
          meta: {
            kind,
            name: string(meta.name, `${rowPath}.meta.name`),
            block: b as Block,
          },
        };
      }),
      fixed: boolean(s.fixed, `${path}.fixed`),
      ...optionalMineral(s, path),
      ...(s.source === undefined
        ? {}
        : { source: string(s.source, `${path}.source`) }),
    };
  });
  const project: Project = {
    version: 1,
    ...(wizard === undefined ? {} : { wizard }),
    experiment: {
      name: string(experiment.name, 'experiment.name'),
      defaults: defaults(experiment.defaults, 'experiment.defaults'),
    },
    standards,
    recipe,
    sessions,
    ...(p.grainatlas === undefined
      ? {}
      : { grainatlas: grainatlas(p.grainatlas) }),
  };
  const names = new Set(standards.map((s) => s.name));
  if (names.size !== standards.length || names.has('@primary'))
    throw new Error(
      'Standard names must be nonempty, unique, and not @primary.',
    );
  const groups = new Set(
    sessions
      .filter((s) => !s.fixed)
      .map((s) => mineralGroup(project, s.mineral)),
  );
  // Keep validation of old single-mineral projects, even with no open sessions.
  if (
    standards.every(
      (s) => s.role === 'reference' || !mineralGroup(project, s.mineral),
    )
  )
    groups.add('');
  for (const group of groups)
    bracketLayout(
      [],
      groupStandards(project, group),
      groupRecipe(project, group),
    );
  standards.forEach((s, i) =>
    s.ranges.slice(0, -1).forEach((r, j) => {
      if (r.auto?.to)
        throw new Error(
          `standards[${i}].ranges[${j}].auto.to is only allowed on the last range.`,
        );
    }),
  );
  return project;
}

/** Canonical key order, two-space JSON and a final newline, independent of insertion order. */
export function serializeProject(project: Project): string {
  const normalized = parseProject(JSON.stringify(project));
  const cleanAuto = (r: PoolRange) => {
    if (r.auto && !r.auto.from && !r.auto.to) delete r.auto;
  };
  for (const s of normalized.standards) {
    if (s.mineral === normalized.wizard?.mineral) delete s.mineral;
    if (s.perBracket === normalized.recipe.spotsPerSecondary)
      delete s.perBracket;
    if (s.cadence === 'every') delete s.cadence;
    s.ranges.forEach(cleanAuto);
  }
  for (const s of normalized.sessions) {
    if (s.mineral === normalized.wizard?.mineral) delete s.mineral;
    s.unknowns.forEach(cleanAuto);
  }
  const recipe = normalized.recipe;
  if (recipe.secondaries === 'rotate') delete recipe.secondaries;
  if (recipe.openingBracket === false) delete recipe.openingBracket;
  if (recipe.rotationStarts) {
    recipe.rotationStarts = Object.fromEntries(
      Object.entries(recipe.rotationStarts)
        .filter(([, start]) => start !== 0)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    );
    if (!Object.keys(recipe.rotationStarts).length)
      delete recipe.rotationStarts;
  }
  return JSON.stringify(normalized, null, 2) + '\n';
}

/** Mark the source as run and append an empty next session, without changing input. */
export function newSessionFrom(project: Project, n: number): Project {
  const next = structuredClone(project);
  const session = next.sessions.find((s) => s.number === n);
  if (!session) throw new Error(`Session ${n} does not exist.`);
  if (!session.fixed) {
    // A newly loaded planned session may not have been generated yet.
    if (session.unknowns.length && !session.rows.length)
      session.rows = planProject(next).sessions.find(
        (s) => s.number === n,
      )!.rows;
    const group = mineralGroup(next, session.mineral);
    const secondaries = groupStandards(next, group).filter(
      (s) => s.role === 'secondary',
    );
    const last = [...session.rows]
      .reverse()
      .map((row) => parseLabel(row.Label, next.standards))
      .find(
        (label) =>
          label.kind === 'secondary' &&
          secondaries.some((s) => s.name === label.name),
      );
    if (last && secondaries.length && next.recipe.secondaries !== 'cadence') {
      const start =
        (secondaries.findIndex((s) => s.name === last.name) + 1) %
        secondaries.length;
      if (group)
        next.recipe.rotationStarts = {
          ...next.recipe.rotationStarts,
          [group]: start,
        };
      else next.recipe.rotationStart = start;
    }
    session.fixed = true;
  }
  next.sessions.push({
    number: Math.max(0, ...next.sessions.map((s) => s.number)) + 1,
    unknowns: [],
    rows: [],
    fixed: false,
    ...(session.mineral === undefined ? {} : { mineral: session.mineral }),
  });
  return next;
}
