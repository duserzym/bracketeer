import { parseLabel } from './labels';
import type { BlockEntry, Row, Standard, Unknown } from './types';

export interface ImportIssue {
  rowIndex: number;
  message: string;
}
export interface SessionStructure {
  opening: BlockEntry[];
  chunks: number[];
  brackets: BlockEntry[][];
  closing: BlockEntry[];
}

/** Recover sample runs, actual used spots, and ordered standard blocks from rows. */
export function deriveSession(
  rows: readonly Row[],
  standards: readonly Standard[],
): {
  unknowns: Unknown[];
  used: Record<string, number[]>;
  structure: SessionStructure;
  issues: ImportIssue[];
} {
  const unknowns: Unknown[] = [];
  const used = Object.fromEntries(
    standards.map((s) => [s.name, [] as number[]]),
  );
  const structure: SessionStructure = {
    opening: [],
    chunks: [],
    brackets: [],
    closing: [],
  };
  const issues: ImportIssue[] = [];
  let run: Unknown | undefined,
    inChunk = false;
  const add = (entries: BlockEntry[], standard: string) => {
    const last = entries.at(-1);
    if (last?.standard === standard) last.count++;
    else entries.push({ standard, count: 1 });
  };
  rows.forEach((row, rowIndex) => {
    const label = parseLabel(row.Label, standards);
    const spot = row['Laser Scan Position Number'];
    if (label.kind === 'unknown') {
      if (!inChunk) {
        structure.chunks.push(0);
        structure.brackets.push([]);
      }
      structure.chunks[structure.chunks.length - 1]!++;
      inChunk = true;
      if (spot !== null && Number.isSafeInteger(spot) && spot > 0) {
        if (
          run &&
          run.name === label.name &&
          run.tag === label.tag &&
          spot === run.to + 1
        )
          run.to = spot;
        else {
          run = { name: label.name, tag: label.tag, from: spot, to: spot };
          unknowns.push(run);
        }
      } else {
        run = undefined;
        issues.push({
          rowIndex,
          message: `Row ${rowIndex + 1} (${row.Label}) has no valid unknown position; row retained.`,
        });
      }
    } else {
      run = undefined;
      inChunk = false;
      if (label.kind === 'unrecognized') {
        issues.push({
          rowIndex,
          message: `Row ${rowIndex + 1} (${row.Label}) has an unrecognized label; row retained.`,
        });
        return;
      }
      if (spot !== null && Number.isSafeInteger(spot) && spot > 0)
        used[label.name]!.push(spot);
      add(
        structure.chunks.length
          ? structure.brackets.at(-1)!
          : structure.opening,
        label.name,
      );
    }
  });
  const last = structure.brackets.at(-1);
  if (last) {
    let split = last.length;
    while (
      split &&
      standards.find((s) => s.name === last[split - 1]!.standard)?.role ===
        'reference'
    )
      split--;
    structure.closing = last.splice(split);
  }
  for (const name of Object.keys(used))
    used[name] = [...new Set(used[name])].sort((a, b) => a - b);
  return { unknowns, used, structure, issues };
}
