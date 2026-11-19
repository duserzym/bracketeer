import type { ParseError } from './parse';

interface RecordLine {
  line: number;
  text: string;
  fields: string[];
  error?: string;
}

/** CSV records, including escaped quotes and newlines inside quoted fields. */
function csvRecords(text: string): RecordLine[] {
  const records: RecordLine[] = [];
  let fields: string[] = [],
    field = '',
    raw = '',
    line = 1,
    start = 1;
  let quoted = false,
    closed = false,
    error: string | undefined;
  const finish = () => {
    fields.push(field.trim());
    if (raw.trim())
      records.push({
        line: start,
        text: raw,
        fields,
        ...(error ? { error } : {}),
      });
    fields = [];
    field = '';
    raw = '';
    closed = false;
    error = undefined;
  };
  const source = text.replace(/\r\n|\r/gu, '\n');
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (c === '\n') {
      if (quoted) {
        field += c;
        raw += c;
      } else finish();
      line++;
      if (!quoted) start = line;
      continue;
    }
    raw += c;
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          raw += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === ',') {
      fields.push(field.trim());
      field = '';
      closed = false;
    } else if (c === '"') {
      if (field.trim() || closed) error = 'Unexpected quote in CSV field.';
      else {
        field = '';
        quoted = true;
      }
    } else {
      if (closed && c.trim())
        error = 'Unexpected text after a quoted CSV field.';
      field += c;
    }
  }
  if (quoted) error = 'Unclosed quoted CSV field.';
  finish();
  return records;
}

/** Read generic GrainAtlas laser CSV or one spot name per line, retaining bad lines. */
export function parseGrainAtlasSpots(text: string): {
  spots: number[];
  errors: ParseError[];
} {
  const source = text.replace(/^\uFEFF/u, '');
  const first = source.split(/\r\n|\n|\r/u).find((s) => s.trim()) ?? '';
  const csv = first.includes(',');
  const records: RecordLine[] = csv
    ? csvRecords(source)
    : source
        .split(/\r\n|\n|\r/u)
        .flatMap((line, i) =>
          line.trim()
            ? [{ line: i + 1, text: line, fields: [line.trim()] }]
            : [],
        );
  const errors: ParseError[] = [];
  const spots = new Set<number>();
  let nameIndex = 0,
    columns = 1;
  if (csv) {
    const header = records.shift()!;
    const names = header.fields.map((s) => s.toLowerCase());
    nameIndex = names.indexOf('name');
    columns = names.length;
    if (header.error || nameIndex < 0 || !names.includes('x_stage')) {
      return {
        spots: [],
        errors: [
          {
            line: header.line,
            text: header.text,
            reason:
              header.error ??
              'Expected a GrainAtlas CSV header with name and x_stage columns.',
          },
        ],
      };
    }
  }
  for (const record of records) {
    const name = record.fields[nameIndex] ?? '';
    const match = /^.+_(\d+)$/u.exec(name);
    const spot = Number(match?.[1]);
    const reason =
      record.error ??
      (record.fields.length !== columns
        ? `Expected ${columns} CSV fields.`
        : !match || !Number.isSafeInteger(spot) || spot < 1
          ? 'Expected a name ending in _ followed by a positive whole spot number.'
          : '');
    if (reason) errors.push({ line: record.line, text: record.text, reason });
    else spots.add(spot);
  }
  return { spots: [...spots].sort((a, b) => a - b), errors };
}
