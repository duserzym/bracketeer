import { parseLabel } from './labels';
import { bracketLayout } from './plan';
import { planProject } from './sequence';
import {
  DEFAULT_RECIPE,
  QTEGRA_COLUMNS,
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
function range(value: unknown, path: string) {
  const r = object(value, path);
  const from = integer(r.from, `${path}.from`),
    to = integer(r.to, `${path}.to`);
  if (to < from) throw new Error(`${path} must be an ascending range.`);
  return { from, to };
}
function unknown(value: unknown, path: string): Unknown {
  const s = object(value, path);
  return {
    name: string(s.name, `${path}.name`, true),
    tag: string(s.tag, `${path}.tag`),
    ...range(s, path),
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
          range(r, `${path}.ranges[${j}]`),
        ),
        used: array(s.used, `${path}.used`).map((u, j) =>
          integer(u, `${path}.used[${j}]`),
        ),
        spare: integer(s.spare ?? 0, `${path}.spare`, 0),
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
  };
  bracketLayout([], standards, recipe);
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
      ...(s.source === undefined
        ? {}
        : { source: string(s.source, `${path}.source`) }),
    };
  });
  return {
    version: 1,
    ...(wizard === undefined ? {} : { wizard }),
    experiment: {
      name: string(experiment.name, 'experiment.name'),
      defaults: defaults(experiment.defaults, 'experiment.defaults'),
    },
    standards,
    recipe,
    sessions,
  };
}

/** Canonical key order, two-space JSON and a final newline, independent of insertion order. */
export function serializeProject(project: Project): string {
  return JSON.stringify(parseProject(JSON.stringify(project)), null, 2) + '\n';
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
    const secondaries = next.standards.filter((s) => s.role === 'secondary');
    const last = [...session.rows]
      .reverse()
      .map((row) => parseLabel(row.Label, next.standards))
      .find((label) => label.kind === 'secondary');
    if (last && secondaries.length)
      next.recipe.rotationStart =
        (secondaries.findIndex((s) => s.name === last.name) + 1) %
        secondaries.length;
    session.fixed = true;
  }
  next.sessions.push({
    number: Math.max(0, ...next.sessions.map((s) => s.number)) + 1,
    unknowns: [],
    rows: [],
    fixed: false,
  });
  return next;
}
