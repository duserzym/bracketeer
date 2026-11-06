import { describe, expect, it } from 'vitest';
import { formatSpots, spotRuns } from '../engine/parse';
import { emptyProject, exampleProject } from './model';
import {
  draftText,
  groupUnknowns,
  parseSamplePaste,
  rangeSpots,
  sampleRows,
  validateUnknowns,
  type UnknownsState,
} from './unknowns';

function projectWithSamples() {
  const p = emptyProject();
  p.standards = [p.standards[0]!];
  p.sessions[0]!.unknowns = [
    { name: 'SYN-H3', tag: 'S', from: 1, to: 32 },
    { name: 'SYN-H4', tag: 'S', from: 40, to: 45 },
    { name: 'SYN-H5', tag: 'S', from: 50, to: 55 },
  ];
  return p;
}

describe('sample rows and drafts', () => {
  it('groups maximal adjacent identities, preserving run order and counting distinct spots', () => {
    const rows = groupUnknowns([
      { name: 'A', tag: '', from: 40, to: 42 },
      { name: 'A', tag: '', from: 1, to: 30 },
      { name: 'A', tag: '', from: 35, to: 35 },
      { name: 'B', tag: '', from: 50, to: 52 },
      { name: 'A', tag: '', from: 60, to: 61 },
      { name: 'A', tag: 'S', from: 62, to: 63 },
    ]);
    expect(rows.map((r) => r.name)).toEqual(['A', 'B', 'A', 'A']);
    expect(rows[0]!.text).toBe('1–30, 35, 40–42');
    expect(rangeSpots(rows[0]!.ranges)).toHaveLength(34);
    expect(spotRuns(rangeSpots(rows[0]!.ranges))).toEqual([
      { from: 1, to: 30 },
      { from: 35, to: 35 },
      { from: 40, to: 42 },
    ]);
    expect(
      rangeSpots([
        { from: 0, to: 1 },
        { from: 9, to: 1 },
        { from: 1, to: 100001 },
      ]),
    ).toEqual([]);
  });
  it('uses drafts only for their matching project values, so external changes and undo are reflected', () => {
    const session = projectWithSamples().sessions[0]!;
    const rows = groupUnknowns(session.unknowns);
    rows[1]!.text = 'invalid';
    const state: UnknownsState = {
      sessions: { 1: { signature: JSON.stringify(session.unknowns), rows } },
      standards: { 'S513:pool': { text: 'bad', saved: '628–727' } },
    };
    expect(sampleRows(session, state)[1]!.text).toBe('invalid');
    expect(draftText(state, 'S513:pool', '628–727')).toBe('bad');
    expect(draftText(state, 'S513:pool', '700–710')).toBe('700–710');
    session.unknowns[1]!.to = 46;
    expect(sampleRows(session, state)[1]!.text).toBe('40–46');
  });
});

describe('sample paste', () => {
  it.each([
    'SYN-H3, S, 1-30, 35, 40-42',
    'SYN-H3 S 1-30 35 40-42',
    'SYN-H3 S 1-30, 35, 40-42',
    'SYN-H3\tS\t1-30;35;40-42',
  ])('adds non-contiguous sample %s', (text) => {
    const parsed = parseSamplePaste(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      name: 'SYN-H3',
      tag: 'S',
      text: '1–30, 35, 40–42',
    });
  });
  it('retains legacy formats, headers and empty tags, and reports original line numbers', () => {
    const parsed = parseSamplePaste(
      'Name,Tag,From,To\r\nHH3,S,1,30\nX 31-35\nY\t\t40\t42\n\nbad\nZ S 30-1\nQ S 1-100001',
    );
    expect(parsed.rows.map((r) => [r.name, r.tag, r.text])).toEqual([
      ['SYN-H3', 'S', '1–30'],
      ['X', '', '31–35'],
      ['Y', '', '40–42'],
    ]);
    expect(parsed.errors.map((e) => e.line)).toEqual([6, 7, 8]);
    expect(parseSamplePaste('X 1-3 6').rows[0]!.text).toBe('1–3, 6');
    expect(parseSamplePaste('')).toEqual({ rows: [], errors: [] });
  });
});

describe('step 2 validation', () => {
  it('accepts the fixtures and only warns for empty open sessions', () => {
    const p = exampleProject();
    expect(validateUnknowns(p)).toEqual({ errors: [], warnings: [] });
    p.sessions.push({ number: 4, fixed: false, unknowns: [], rows: [] });
    expect(validateUnknowns(p)).toEqual({
      errors: [],
      warnings: [
        {
          message: 'Session 4 has no unknowns.',
          session: 4,
          field: 'unknowns',
        },
      ],
    });
  });
  it('requires open unknowns, names and positive ascending spots', () => {
    const p = projectWithSamples();
    p.sessions[0]!.fixed = true;
    expect(validateUnknowns(p).errors[0]!.message).toBe(
      'Add unknowns to an open session',
    );
    p.sessions[0]!.fixed = false;
    p.sessions[0]!.unknowns[0]!.name = '';
    expect(validateUnknowns(p).errors[0]).toMatchObject({
      session: 1,
      row: 1,
      field: 'name',
      message: 'Row 1, unnamed: add a name.',
    });
    p.sessions[0]!.unknowns[0]!.from = 33;
    expect(validateUnknowns(p).errors.some((e) => e.field === 'spots')).toBe(
      true,
    );
  });
  it('blocks duplicate identities in a session, but permits different tags and identities across sessions', () => {
    const p = projectWithSamples();
    p.sessions[0]!.unknowns[2]!.name = 'SYN-H3';
    expect(validateUnknowns(p).errors[0]).toMatchObject({
      row: 3,
      field: 'name',
      message: 'Row 3, SYN-H3: this name and tag are also in row 1.',
    });
    p.sessions[0]!.unknowns[2]!.tag = 'L';
    expect(validateUnknowns(p).errors).toEqual([]);
    p.sessions.push({
      number: 2,
      fixed: false,
      unknowns: [{ name: 'SYN-H3', tag: 'S', from: 60, to: 65 }],
      rows: [],
    });
    expect(validateUnknowns(p).errors).toEqual([]);
  });
  it('names every overlapping spot, row and session, including fixed unknowns', () => {
    const p = projectWithSamples();
    p.sessions[0]!.unknowns[2]!.from = 31;
    expect(validateUnknowns(p).errors).toContainEqual({
      message: 'Row 3, SYN-H5: spots 31–32 are also in row 1, SYN-H3.',
      session: 1,
      row: 3,
      field: 'spots',
    });
    p.sessions[0]!.fixed = true;
    p.sessions.push({
      number: 2,
      fixed: false,
      unknowns: [{ name: 'X', tag: '', from: 1, to: 1 }],
      rows: [],
    });
    expect(validateUnknowns(p).errors).toContainEqual({
      message: 'Row 1, X: spot 1 is also in session 1, row 1, SYN-H3.',
      session: 2,
      row: 1,
      field: 'spots',
    });
  });
  it('blocks unknowns in pools, empty pools and overlapping pools with exact spots', () => {
    const p = projectWithSamples();
    p.standards[0]!.ranges = [{ from: 55, to: 70 }];
    expect(validateUnknowns(p).errors[0]).toEqual({
      message: 'Row 3, SYN-H5: spot 55 is in the S513 pool.',
      session: 1,
      row: 3,
      field: 'spots',
    });
    p.standards[0]!.ranges = [];
    expect(validateUnknowns(p).errors[0]).toEqual({
      message: 'Add a pool for S513',
      session: null,
      standard: 'S513',
      field: 'pool',
    });
    p.standards[0]!.ranges = [{ from: 100, to: 110 }];
    p.standards.push({
      name: 'R',
      role: 'reference',
      ranges: [{ from: 109, to: 120 }],
      used: [],
      spare: 0,
    });
    expect(validateUnknowns(p).errors[0]!.message).toBe(
      'R and S513 pools overlap at 109–110.',
    );
  });
  it('reports all draft errors while keeping the last valid ranges and only warns for used outside pools', () => {
    const p = projectWithSamples();
    const rows = groupUnknowns(p.sessions[0]!.unknowns);
    rows[0]!.text = '30-1';
    const saved = formatSpots(rangeSpots(p.standards[0]!.ranges));
    const state: UnknownsState = {
      sessions: {
        1: { signature: JSON.stringify(p.sessions[0]!.unknowns), rows },
      },
      standards: { 'S513:pool': { text: '0', saved } },
    };
    expect(validateUnknowns(p, state).errors.map((p) => p.field)).toEqual([
      'spots',
      'pool',
    ]);
    expect(p.sessions[0]!.unknowns[0]!.to).toBe(32);
    p.standards[0]!.used = [1, 2];
    expect(validateUnknowns(p).errors).toEqual([]);
    expect(validateUnknowns(p).warnings[0]!.message).toBe(
      'S513: used spots 1–2 outside its pool.',
    );
  });
});
