import * as XLSX from 'xlsx';
import { parseLabel } from './labels';
import {
  DEFAULT_EXPERIMENT,
  QTEGRA_COLUMNS,
  type BlockEntry,
  type Row,
  type Standard,
  type Unknown,
} from './types';

export interface ImportIssue {
  rowIndex: number;
  message: string;
}
export interface ImportResult {
  rows: Row[];
  issues: ImportIssue[];
}
export interface SessionStructure {
  opening: BlockEntry[];
  chunks: number[];
  brackets: BlockEntry[][];
  closing: BlockEntry[];
}

function readRecords(
  records: unknown[][],
  standards: readonly Standard[],
  requireHeader: boolean,
): ImportResult {
  const first = records[0];
  const hasHeader = first?.[0] === 'Label';
  if (hasHeader && !QTEGRA_COLUMNS.every((c, i) => first[i] === c))
    throw new Error(
      'Expected the 13 Qtegra column headers in their exact order.',
    );
  if (requireHeader && !hasHeader)
    throw new Error('Expected a Qtegra header row in Sheet1.');
  const issues: ImportIssue[] = [];
  const rows = (hasHeader ? records.slice(1) : records).map(
    (record, rowIndex): Row => {
      const label = String(record[0] ?? '');
      const parsed = parseLabel(label, standards);
      const issue = (message: string) =>
        issues.push({
          rowIndex,
          message: `Row ${rowIndex + 1} (${label}): ${message}`,
        });
      if (parsed.kind === 'unrecognized')
        issue('unrecognized label; row retained.');
      if (record.length !== QTEGRA_COLUMNS.length)
        issue(`expected 13 columns, found ${record.length}; row retained.`);
      const number = (index: number, fallback: number): number => {
        const value = record[index];
        if (value === undefined || value === null || value === '')
          return fallback;
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n)) {
          issue(`invalid number in ${QTEGRA_COLUMNS[index]}.`);
          return fallback;
        }
        return n;
      };
      const evaluate = record[4];
      const boolean =
        typeof evaluate === 'boolean'
          ? evaluate
          : typeof evaluate === 'string' && /^(true|false)$/iu.test(evaluate)
            ? evaluate.toLowerCase() === 'true'
            : DEFAULT_EXPERIMENT.defaults.Evaluate;
      if (
        evaluate !== undefined &&
        evaluate !== '' &&
        typeof evaluate !== 'boolean' &&
        !(typeof evaluate === 'string' && /^(true|false)$/iu.test(evaluate))
      )
        issue('Evaluate must be TRUE or FALSE.');
      return {
        Label: label,
        Status: null,
        'Duration [s]': number(2, DEFAULT_EXPERIMENT.defaults['Duration [s]']),
        Comment: String(record[3] ?? ''),
        Evaluate: boolean,
        'Sample Type': String(record[5] ?? ''),
        Standard: String(record[6] ?? ''),
        'Dilution Factor': number(
          7,
          DEFAULT_EXPERIMENT.defaults['Dilution Factor'],
        ),
        Amount: String(record[8] ?? ''),
        'Final Quantity': String(record[9] ?? ''),
        Identifier: String(record[10] ?? ''),
        'Laser Scan Position Number':
          record[11] === undefined || record[11] === null || record[11] === ''
            ? null
            : number(11, NaN),
        'Laser Output Setting [%]': number(
          12,
          DEFAULT_EXPERIMENT.defaults['Laser Output Setting [%]'],
        ),
        meta: {
          kind: parsed.kind,
          name: parsed.name,
          block:
            parsed.kind === 'unknown' || parsed.kind === 'unrecognized'
              ? 'unknowns'
              : 'bracket',
        },
      };
    },
  );
  // Derivation also knows opening/mid/closing positions; give imported rows useful metadata.
  const derived = deriveSession(rows, standards);
  let cursor = 0;
  const mark = (
    entries: readonly BlockEntry[],
    block: Row['meta']['block'],
  ) => {
    for (const entry of entries)
      for (let i = 0; i < entry.count; i++)
        if (rows[cursor]) rows[cursor++]!.meta.block = block;
  };
  // Only annotate well-formed sequences; arbitrary rows always survive in original order.
  if (!derived.issues.length) {
    mark(derived.structure.opening, 'opening');
    derived.structure.chunks.forEach((size, b) => {
      cursor += size;
      for (const entry of derived.structure.brackets[b]!)
        mark(
          [entry],
          standards.find((s) => s.name === entry.standard)?.role === 'reference'
            ? 'mid'
            : 'bracket',
        );
    });
    mark(derived.structure.closing, 'closing');
  }
  return { rows, issues };
}

/** Read a Qtegra Sheet1 from either BIFF8 or XLSX bytes. No filesystem or DOM. */
export function importWorkbook(
  bytes: Uint8Array | ArrayBuffer,
  standards: readonly Standard[],
): ImportResult {
  const workbook = XLSX.read(bytes, { type: 'array' });
  const sheet = workbook.Sheets.Sheet1;
  if (!sheet) throw new Error('Workbook has no Sheet1.');
  const records: unknown[][] = [];
  if (sheet['!ref']) {
    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let r = 0; r <= range.e.r; r++) {
      const record = QTEGRA_COLUMNS.map(
        (_, c) => sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? null,
      );
      // Ignore formatting-only trailing rows; retain blank rows inside the sequence.
      records.push(record);
    }
    while (
      records.length &&
      records.at(-1)!.every((v) => v === null || v === '')
    )
      records.pop();
  }
  return readRecords(records, standards, true);
}

/** RFC 4180 fields, also accepting literal tab delimiters and CR/LF records. */
function textRecords(text: string): string[][] {
  text = text.replace(/^\uFEFF/u, '');
  const firstLine = text.split(/\r\n|\r|\n/u)[0] ?? '';
  const delimiter = firstLine.includes('\t') ? '\t' : ',';
  const records: string[][] = [];
  let record: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || !field) quoted = !quoted;
      else field += char;
    } else if (!quoted && char === delimiter) {
      record.push(field);
      field = '';
    } else if (!quoted && (char === '\r' || char === '\n')) {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else field += char;
  }
  if (quoted) throw new Error('Unclosed quoted field in pasted sequence.');
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** Pasted TSV or CSV, with an optional exact Qtegra header. */
export function importText(
  text: string,
  standards: readonly Standard[],
): ImportResult {
  return readRecords(textRecords(text), standards, false);
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
