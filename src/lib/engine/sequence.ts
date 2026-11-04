import { bracketLayout, calculateBudget, planChunks } from './plan';
import { createDrawer } from './pools';
import type {
  Block,
  BlockEntry,
  Budget,
  Experiment,
  Recipe,
  Row,
  Standard,
  Unknown,
  Warning,
} from './types';

export interface Generation {
  rows: Row[];
  warnings: Warning[];
  chunks: number[];
  /** One name per secondary pair, in bracket order (one per bracket by default). */
  rotation: string[];
  nextRotation: number;
  drawn: Record<string, number[]>;
  budget: Budget;
}

/**
 * Generate one session without changing inputs. Structured inputs must satisfy
 * the model (one primary, valid ranges and nonnegative recipe counts). Budget
 * advisories live in budget.warnings; row-cell warnings come from validate.
 */
export function generate(
  experiment: Experiment,
  unknowns: readonly Unknown[],
  standards: readonly Standard[],
  recipe: Recipe,
): Generation {
  const total = unknowns.reduce(
    (n, sample) => n + sample.to - sample.from + 1,
    0,
  );
  let budget = calculateBudget(total, standards, recipe);
  const chunks = planChunks(unknowns, recipe, budget.Bmax);
  if (chunks.length !== budget.chunksPerSession)
    budget = calculateBudget(total, standards, recipe, chunks.length);
  const layout = bracketLayout(chunks, standards, recipe);
  const drawer = createDrawer(standards);
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
  // Flatten the unknowns in run order; planned chunks can cross sample ranges.
  const pending = unknowns.flatMap((sample) =>
    Array.from({ length: sample.to - sample.from + 1 }, (_, i) => ({
      sample,
      spot: sample.from + i,
    })),
  );
  let cursor = 0;
  emit(layout.opening, 'opening');
  for (const bracket of layout.brackets) {
    for (let i = 0; i < bracket.chunkSize; i++) {
      const { sample, spot } = pending[cursor++]!;
      const label = [
        sample.name,
        ...(sample.tag ? [sample.tag] : []),
        spot,
      ].join('_');
      addRow(label, spot, {
        kind: 'unknown',
        name: sample.name,
        block: 'unknowns',
      });
    }
    emit(bracket.mid, 'mid');
    emit(bracket.secondaries, 'bracket');
    emit([bracket.primary], 'bracket');
  }
  emit(layout.closing, 'closing');
  return {
    rows,
    warnings: validate(rows, standards, unknowns),
    chunks,
    rotation: layout.brackets.flatMap((b) =>
      b.secondaries.map((s) => s.standard),
    ),
    nextRotation: layout.nextRotation,
    drawn: drawer.getDrawn(),
    budget,
  };
}

/** Recompute warnings after edits using only current rows and pool/sample definitions. */
export function validate(
  rows: readonly Row[],
  standards: readonly Standard[],
  unknowns: readonly Unknown[],
): Warning[] {
  const warnings: Warning[] = [];
  const byName = new Map(standards.map((s) => [s.name, s]));
  const positions = new Map<number, number[]>();
  rows.forEach((row, i) => {
    const spot = row['Laser Scan Position Number'];
    const description = `Row ${i + 1} (${row.Label})`;
    const warn = (kind: Warning['kind'], message: string) =>
      warnings.push({
        kind,
        message: `${description} ${message}`,
        rowIndexes: [i],
      });
    if (spot !== null) {
      const indexes = positions.get(spot) ?? [];
      indexes.push(i);
      positions.set(spot, indexes);
    }
    const validSpot = spot !== null && Number.isSafeInteger(spot) && spot > 0;
    if (row.meta.kind === 'unknown') {
      if (
        !validSpot ||
        !unknowns.some(
          (sample) =>
            sample.name === row.meta.name &&
            spot >= sample.from &&
            spot <= sample.to,
        )
      )
        warn('outside-sample', `has a spot outside sample ${row.meta.name}.`);
    } else if (spot === null) {
      warn('pool-exhausted', `has no spot available from ${row.meta.name}.`);
    } else {
      const standard = byName.get(row.meta.name);
      if (
        !validSpot ||
        !standard?.ranges.some(({ from, to }) => spot >= from && spot <= to)
      )
        warn('outside-pool', `has a spot outside the ${row.meta.name} pool.`);
      if (standard?.used.includes(spot))
        warn(
          'already-used',
          `uses spot ${spot}, already used in an earlier session.`,
        );
    }
  });
  for (const [spot, indexes] of positions) {
    if (indexes.length > 1)
      warnings.push({
        kind: 'duplicate-spot',
        message: `Rows ${indexes.map((i) => i + 1).join(', ')} share spot ${spot}.`,
        rowIndexes: indexes,
      });
  }
  return warnings;
}
