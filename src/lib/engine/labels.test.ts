import { describe, expect, it } from 'vitest';
import { parseLabel } from './labels';
import { SESSION_2_STANDARDS } from './test-data';

describe('sequence labels', () => {
  it.each([
    ['SYN-K2_S_182', 'SYN-K2', 'S', 182],
    ['SYN-V1_384', 'SYN-V1', '', 384],
    ['SYN-K1_S_323', 'SYN-K1', 'S', 323],
    ['SYN-A1_xs_488', 'SYN-A1', 'xs', 488],
    ['name_with_parts_tag_4', 'name_with_parts', 'tag', 4],
  ])('parses %s', (label, name, tag, spot) => {
    expect(parseLabel(label, SESSION_2_STANDARDS)).toEqual({
      kind: 'unknown',
      name,
      tag,
      spot,
    });
  });
  it('recognizes only exact standard names, including an exhausted row', () => {
    expect(parseLabel('91500_728', SESSION_2_STANDARDS)).toEqual({
      kind: 'secondary',
      name: '91500',
      tag: '',
      spot: 728,
    });
    expect(parseLabel('S513_?', SESSION_2_STANDARDS)).toEqual({
      kind: 'primary',
      name: 'S513',
      tag: '',
      spot: null,
    });
    expect(parseLabel('S513x_1', SESSION_2_STANDARDS).kind).toBe('unknown');
    expect(parseLabel('S513_S_1', SESSION_2_STANDARDS).kind).toBe('unknown');
    const standards = [
      { ...SESSION_2_STANDARDS[0]!, name: 'standard_with_parts' },
    ];
    expect(parseLabel('standard_with_parts_4', standards).name).toBe(
      'standard_with_parts',
    );
  });
  it.each([
    '',
    'unknown',
    'X_0',
    'X_-1',
    'X_1.5',
    'X_9007199254740992',
    '_1',
    'X_?',
  ])('keeps malformed label %s recognizable as an issue', (label) => {
    expect(parseLabel(label, SESSION_2_STANDARDS).kind).toBe('unrecognized');
  });
});
