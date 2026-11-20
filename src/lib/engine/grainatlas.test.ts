import { describe, expect, it } from 'vitest';
import { parseGrainAtlasSpots } from './grainatlas';

describe('GrainAtlas positions', () => {
  it('reads generic laser CSV with quoted commas, escaped quotes, size tags, lines and rasters', () => {
    expect(
      parseGrainAtlasSpots(
        '\uFEFFname,x_stage,y_stage,kind,grain,sample\r\n"SYN-1_S_1",1,2,spot,1,SYN-1\r\n"a,b_2",3,4,line,2,"a,b"\r\n"a""b_3",5,6,raster,3,"a""b"\r\n',
      ),
    ).toEqual({ spots: [1, 2, 3], errors: [] });
  });
  it('reads a plain list, taking only the integer after the last underscore', () => {
    expect(
      parseGrainAtlasSpots(
        '\nSYN-1_S_31\rSYN-1_L_32\r\nA_lot_of_parts_4\nSYN-1_S_31\n',
      ),
    ).toEqual({ spots: [4, 31, 32], errors: [] });
    expect(parseGrainAtlasSpots(' \n')).toEqual({ spots: [], errors: [] });
  });
  it('reports every bad line with its original text and physical line number', () => {
    const result = parseGrainAtlasSpots(
      'ok_1\n\nno-number\nX_1.5\nX_0\nX_-2\nX_9007199254740992\nok_3',
    );
    expect(result.spots).toEqual([1, 3]);
    expect(result.errors.map((e) => [e.line, e.text])).toEqual([
      [3, 'no-number'],
      [4, 'X_1.5'],
      [5, 'X_0'],
      [6, 'X_-2'],
      [7, 'X_9007199254740992'],
    ]);
    expect(result.errors.every((e) => e.reason.length > 0)).toBe(true);
  });
  it('requires a CSV header and validates record fields and quotes', () => {
    expect(parseGrainAtlasSpots('X_1,1,2\nX_2,3,4').errors[0]).toMatchObject({
      line: 1,
      reason: 'Expected a GrainAtlas CSV header with name and x_stage columns.',
    });
    const result = parseGrainAtlasSpots(
      'name,x_stage,kind\nX_1,1,spot\nX_2,2\n"X_3"bad,3,line\nX_4,4,raster\n"X_5,5,spot',
    );
    expect(result.spots).toEqual([1, 4]);
    expect(result.errors.map((e) => e.line)).toEqual([3, 4, 6]);
  });
  it('accepts reordered header columns and multiline quoted fields', () => {
    expect(
      parseGrainAtlasSpots(
        '\nkind,name,x_stage,sample\nspot,X_7,3,"a\nb"\nline,X_8,4,sample',
      ),
    ).toEqual({ spots: [7, 8], errors: [] });
  });
});
