import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { deriveSession, importWorkbook } from './import';
import { exportWorkbook, toTSV, toWorksheet } from './export';
import { parseProject, serializeProject } from './project';
import { planProject } from './sequence';
import { QTEGRA_COLUMNS } from './types';

const bytes = (n: number) =>
  readFileSync(
    new URL(`../../../fixtures/synthetic-session-${n}.xls`, import.meta.url),
  );
const readSheet = (data: Uint8Array) => XLSX.read(data).Sheets.Sheet1!;
const fixtureText = readFileSync(
  new URL(
    '../../../fixtures/synthetic-session-1.bracketeer.json',
    import.meta.url,
  ),
  'utf8',
);
const project = parseProject(fixtureText);
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Compare every header/data cell, deliberately ignoring styling and formatted text. */
function compareSheets(actual: XLSX.WorkSheet, expected: XLSX.WorkSheet) {
  expect(actual['!ref']).toBe(expected['!ref']);
  const end = XLSX.utils.decode_range(expected['!ref']!).e.r;
  for (let r = 0; r <= end; r++)
    for (let c = 0; c < 13; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      const a = actual[address],
        e = expected[address];
      expect(a && { v: a.v, t: a.t }, address).toEqual(e && { v: e.v, t: e.t });
    }
}

describe('RULES.md revision 3 golden workbooks', () => {
  it('imports synthetic session 1 intact, derives all used spots and the fixed structure', () => {
    const imported = importWorkbook(bytes(1), project.standards);
    expect(imported.rows).toHaveLength(245);
    expect(imported.issues).toEqual([]);
    compareSheets(toWorksheet(imported.rows), readSheet(bytes(1)));
    const derived = deriveSession(imported.rows, project.standards);
    expect(derived.issues).toEqual([]);
    expect(derived.unknowns).toEqual([
      { name: 'SYN-17.7R-02', tag: '', from: 323, to: 337 },
      { name: 'SYN-17.7R-02', tag: '', from: 338, to: 352 },
      { name: 'SYN-17.7R-02', tag: '', from: 353, to: 367 },
      { name: 'SYN-17.7R-02', tag: '', from: 368, to: 383 },
      { name: 'SYN-18', tag: '', from: 384, to: 403 },
      { name: 'SYN-18', tag: '', from: 404, to: 422 },
      { name: 'SYN-18', tag: '', from: 423, to: 442 },
      { name: 'SYN-18', tag: '', from: 443, to: 457 },
      { name: 'SYN-18', tag: '', from: 458, to: 472 },
      { name: 'SYN-18', tag: '', from: 473, to: 487 },
    ]);
    expect(derived.used).toEqual({
      S513: range(628, 649),
      Seiland: range(768, 777),
      '91500': range(738, 747),
      PL: range(828, 837),
      LTSE: range(798, 807),
      NIST610: range(857, 865),
      NIST612: range(893, 901),
    });
    expect(derived.structure.chunks).toEqual([
      15, 15, 15, 16, 20, 19, 20, 15, 15, 15,
    ]);
    expect(derived.structure.opening).toEqual([
      { standard: 'NIST612', count: 3 },
      { standard: 'NIST610', count: 3 },
      { standard: 'S513', count: 2 },
    ]);
    expect(derived.structure.closing).toEqual([
      { standard: 'NIST612', count: 3 },
      { standard: 'NIST610', count: 3 },
    ]);
    expect(derived.structure.brackets).toHaveLength(10);
    derived.structure.brackets.forEach((entries, i) => {
      const secondary = entries.filter(
        (e) =>
          project.standards.find((s) => s.name === e.standard)!.role ===
          'secondary',
      );
      expect(secondary).toHaveLength(2);
      expect(secondary.map((e) => e.count)).toEqual([2, 2]);
      expect(entries.at(-1)).toEqual({ standard: 'S513', count: 2 });
      expect(entries.filter((e) => e.standard.startsWith('NIST'))).toEqual(
        i === 4
          ? [
              { standard: 'NIST610', count: 3 },
              { standard: 'NIST612', count: 3 },
            ]
          : [],
      );
    });
    expect(project.sessions[0]!.rows).toEqual(imported.rows);
    expect(project.sessions.slice(1).map((s) => s.rows)).toEqual([[], []]);
    expect(serializeProject(project)).toBe(fixtureText);
  });

  it('generates sessions 2 and 3 cell for cell, with exact allocation, mid blocks and no remaining supply', () => {
    const result = planProject(project);
    expect(result.budget).toMatchObject({ K: 37, P: 40 });
    expect(result.advisories).toEqual([]);
    expect(result.sessions.map((s) => s.warnings)).toEqual([[], [], []]);
    expect(result.sessions[0]!.rows).toEqual(project.sessions[0]!.rows);
    const second = result.sessions[1]!,
      third = result.sessions[2]!;
    expect([second.rows.length, third.rows.length]).toEqual([332, 324]);
    expect(second.chunks).toEqual([
      ...Array(6).fill(13),
      ...Array(13).fill(12),
    ]);
    expect(third.chunks).toEqual([...Array(12).fill(13), ...Array(6).fill(12)]);
    expect(
      second.pairsPerBracket.flatMap((p, i) => (p === 2 ? [i + 1] : [])),
    ).toEqual([13]);
    expect(
      third.pairsPerBracket.flatMap((p, i) => (p === 2 ? [i + 1] : [])),
    ).toEqual([6, 18]);
    for (const [session, n, mid] of [
      [second, 2, 10],
      [third, 3, 9],
    ] as const) {
      compareSheets(toWorksheet(session.rows), readSheet(bytes(n)));
      const structure = deriveSession(
        session.rows,
        project.standards,
      ).structure;
      expect(
        structure.brackets.flatMap((b, i) =>
          b.some((e) => e.standard === 'NIST610') ? [i + 1] : [],
        ),
      ).toEqual([mid]);
      expect(session.rotation).toEqual(
        Array.from(
          { length: 20 },
          (_, i) => ['Seiland', '91500', 'PL', 'LTSE'][i % 4],
        ),
      );
    }
    for (const s of project.standards) {
      expect(result.budget.perStandard[s.name]!.leftAfter).toBe(0);
      const used = result.sessions
        .flatMap(
          (session) =>
            deriveSession(session.rows, project.standards).used[s.name]!,
        )
        .sort((a, b) => a - b);
      expect(used).toEqual(s.ranges.flatMap((r) => range(r.from, r.to)));
    }
  });

  it.each(['xls', 'xlsx'] as const)(
    'round-trips both generated sessions through %s with exact cell values and types',
    (format) => {
      const result = planProject(project);
      for (const n of [2, 3]) {
        const rows = result.sessions.find((s) => s.number === n)!.rows;
        const written = exportWorkbook(rows, format);
        compareSheets(readSheet(written), readSheet(bytes(n)));
        const imported = importWorkbook(written, project.standards);
        expect(imported.issues).toEqual([]);
        compareSheets(toWorksheet(imported.rows), readSheet(bytes(n)));
      }
    },
  );

  it('copies session 2 as headerless CRLF TSV with exact Qtegra text values', () => {
    const sheet = readSheet(bytes(2));
    const text = range(1, 332)
      .map(
        (r) =>
          QTEGRA_COLUMNS.map((_, c) => {
            const value: unknown = sheet[XLSX.utils.encode_cell({ r, c })]?.v;
            return value === undefined
              ? ''
              : typeof value === 'boolean'
                ? value
                  ? 'TRUE'
                  : 'FALSE'
                : String(value);
          }).join('\t') + '\r\n',
      )
      .join('');
    expect(toTSV(planProject(project).sessions[1]!.rows)).toBe(text);
  });
});
