import { projectLayouts, type BracketLayout } from './plan';
import { groupRecipe, mineralGroup } from './groups';
import { parseLabel } from './labels';
import { deriveSession } from './derive';
import { createDrawer } from './pools';
import type {
  Block,
  BlockEntry,
  Budget,
  Experiment,
  Project,
  Recipe,
  Row,
  Session,
  Standard,
  Unknown,
  Warning,
} from './types';

export interface Generation {
  number: number;
  fixed: boolean;
  rows: Row[];
  warnings: Warning[];
  chunks: number[];
  pairsPerBracket: number[];
  /** One standard name per secondary pair, in run order. */
  rotation: string[];
  nextRotation: number;
}
export interface ProjectPlan {
  sessions: Generation[];
  budget: Budget;
  advisories: string[];
}

function emitSession(
  experiment: Experiment,
  unknowns: readonly Unknown[],
  standards: readonly Standard[],
  layout: BracketLayout,
  drawer: ReturnType<typeof createDrawer>,
): Row[] {
  const byName = new Map(standards.map((s) => [s.name, s]));
  const rows: Row[] = [];
  const addRow = (label: string, spot: number | null, meta: Row['meta']) =>
    rows.push({
      ...experiment.defaults,
      Label: label,
      Status: null,
      'Laser Scan Position Number': spot,
      meta,
    });
  const emit = (entries: readonly BlockEntry[], block: Block) => {
    for (const { standard: name, count } of entries) {
      const standard = byName.get(name)!;
      for (const spot of drawer.take(name, count).spots)
        addRow(`${name}_${spot ?? '?'}`, spot, {
          kind: standard.role,
          name,
          block,
        });
    }
  };
  const pending = unknowns.flatMap((sample) =>
    Array.from({ length: sample.to - sample.from + 1 }, (_, i) => ({
      sample,
      spot: sample.from + i,
    })),
  );
  let cursor = 0;
  emit(layout.opening, 'opening');
  if (layout.openingBracket) {
    emit(layout.openingBracket.secondaries, 'bracket');
    emit([layout.openingBracket.primary], 'bracket');
  }
  for (const bracket of layout.brackets) {
    for (let i = 0; i < bracket.chunkSize; i++) {
      const { sample, spot } = pending[cursor++]!;
      addRow(
        [sample.name, ...(sample.tag ? [sample.tag] : []), spot].join('_'),
        spot,
        { kind: 'unknown', name: sample.name, block: 'unknowns' },
      );
    }
    emit(bracket.mid, 'mid');
    emit(bracket.secondaries, 'bracket');
    emit([bracket.primary], 'bracket');
  }
  emit(layout.closing, 'closing');
  return rows;
}

/** Pure project-wide planning: fixed rows survive, draws and rotation span planned sessions. */
export function planProject(project: Project): ProjectPlan {
  const plan = projectLayouts(project);
  const standards = plan.standards;
  const drawer = createDrawer(standards);
  let index = 0;
  const sessions: Generation[] = project.sessions.map((session) => {
    if (session.fixed) {
      const derived = deriveSession(session.rows, project.standards);
      const rotation = derived.structure.brackets.flatMap((entries) =>
        entries
          .filter((e) =>
            project.standards.some(
              (s) => s.name === e.standard && s.role === 'secondary',
            ),
          )
          .flatMap((e) =>
            Array.from(
              { length: Math.ceil(e.count / project.recipe.spotsPerSecondary) },
              () => e.standard,
            ),
          ),
      );
      return {
        number: session.number,
        fixed: true,
        rows: structuredClone(session.rows),
        chunks: derived.structure.chunks,
        pairsPerBracket: derived.structure.brackets.map((entries) =>
          entries
            .filter((e) =>
              project.standards.some(
                (s) => s.name === e.standard && s.role === 'secondary',
              ),
            )
            .reduce(
              (n, e) =>
                n + Math.ceil(e.count / project.recipe.spotsPerSecondary),
              0,
            ),
        ),
        rotation,
        nextRotation: groupRecipe(
          project,
          mineralGroup(project, session.mineral),
        ).rotationStart,
        warnings: [],
      };
    }
    const i = index++;
    const layout = plan.layouts[i]!;
    return {
      number: session.number,
      fixed: false,
      rows: emitSession(
        project.experiment,
        session.unknowns,
        standards,
        layout,
        drawer,
      ),
      chunks: plan.chunks[i]!,
      pairsPerBracket: plan.pairsPerBracket[i]!,
      rotation:
        project.recipe.secondaries === 'cadence'
          ? []
          : [
              ...(layout.openingBracket ? [layout.openingBracket] : []),
              ...layout.brackets,
            ].flatMap((b) => b.secondaries.map((e) => e.standard)),
      nextRotation: layout.nextRotation,
      warnings: [],
    };
  });
  const resolved = project.sessions.map((s, i) => ({
    ...s,
    rows: sessions[i]!.rows,
  }));
  sessions.forEach((session, i) => {
    session.warnings = validate(
      session.rows,
      project.standards,
      resolved[i]!.unknowns,
      resolved.filter((_, j) => j !== i),
      session.number,
    );
  });
  return { sessions, budget: plan.budget, advisories: plan.advisories };
}

/** Convenience for a single planned session; multi-session callers use planProject. */
export function generate(
  experiment: Experiment,
  unknowns: readonly Unknown[],
  standards: readonly Standard[],
  recipe: Recipe,
): Generation & {
  budget: Budget;
  advisories: string[];
  drawn: Record<string, number[]>;
} {
  const result = planProject({
    version: 1,
    experiment,
    standards: [...standards],
    recipe,
    sessions: [{ number: 1, unknowns: [...unknowns], rows: [], fixed: false }],
  });
  const session = result.sessions[0]!;
  const drawn = Object.fromEntries(
    standards.map((s) => [
      s.name,
      session.rows
        .filter((row) => row.meta.name === s.name && row.meta.kind === s.role)
        .flatMap((row) =>
          row['Laser Scan Position Number'] === null
            ? []
            : [row['Laser Scan Position Number']],
        ),
    ]),
  );
  return {
    ...session,
    budget: result.budget,
    advisories: result.advisories,
    drawn,
  };
}

/** Recompute from edited cells, including global positions and other fixed sessions. */
export function validate(
  rows: readonly Row[],
  standards: readonly Standard[],
  unknowns: readonly Unknown[],
  otherSessions: readonly Session[] = [],
  sessionNumber = 1,
): Warning[] {
  const warnings: Warning[] = [];
  const byName = new Map(standards.map((s) => [s.name, s]));
  const positions = new Map<number, { session: number; rowIndex: number }[]>();
  const addPosition = (row: Row, session: number, rowIndex: number) => {
    const spot = row['Laser Scan Position Number'];
    if (spot === null) return;
    const locations = positions.get(spot) ?? [];
    locations.push({ session, rowIndex });
    positions.set(spot, locations);
  };
  rows.forEach((row, i) => {
    addPosition(row, sessionNumber, i);
    const label = parseLabel(row.Label, standards);
    const spot = row['Laser Scan Position Number'];
    const warn = (kind: Warning['kind'], message: string) =>
      warnings.push({
        kind,
        message: `Row ${i + 1} (${row.Label}) ${message}`,
        rowIndexes: [i],
      });
    const validSpot = spot !== null && Number.isSafeInteger(spot) && spot > 0;
    if (label.kind === 'unrecognized')
      warn('unrecognized-row', 'has an unrecognized label.');
    else if (label.kind === 'unknown') {
      if (
        !validSpot ||
        !unknowns.some(
          (sample) =>
            sample.name === label.name &&
            sample.tag === label.tag &&
            spot >= sample.from &&
            spot <= sample.to,
        )
      )
        warn('outside-sample', `has a spot outside sample ${label.name}.`);
    } else if (spot === null)
      warn('pool-exhausted', `has no spot available from ${label.name}.`);
    else {
      const standard = byName.get(label.name)!;
      if (
        !validSpot ||
        !standard.ranges.some(({ from, to }) => spot >= from && spot <= to)
      )
        warn('outside-pool', `has a spot outside the ${label.name} pool.`);
      const usedInFixed = otherSessions
        .filter((s) => s.fixed)
        .some((s) =>
          s.rows.some(
            (r) =>
              r['Laser Scan Position Number'] === spot &&
              parseLabel(r.Label, standards).name === label.name,
          ),
        );
      if (standard.used.includes(spot) || usedInFixed)
        warn(
          'already-used',
          `uses spot ${spot}, already used in an earlier session or the used list.`,
        );
    }
  });
  for (const session of otherSessions)
    session.rows.forEach((row, i) => addPosition(row, session.number, i));
  for (const [spot, locations] of positions) {
    const local = locations.filter((l) => l.session === sessionNumber);
    if (locations.length < 2 || !local.length) continue;
    const cross = locations.some((l) => l.session !== sessionNumber);
    warnings.push({
      kind: 'duplicate-spot',
      message: cross
        ? `${locations.map((l) => `Session ${l.session} row ${l.rowIndex + 1}`).join(', ')} share spot ${spot}.`
        : `Rows ${local.map((l) => l.rowIndex + 1).join(', ')} share spot ${spot}.`,
      rowIndexes: local.map((l) => l.rowIndex),
      ...(cross ? { locations } : {}),
    });
  }
  return warnings;
}
