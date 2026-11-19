import { expect, it } from 'vitest';
import { countText } from './text';

it.each(['session', 'bracket', 'secondary pair', 'spot', 'unknown', 'row'])(
  'formats zero, one and several %s counts',
  (noun) => {
    expect(countText(0, noun)).toBe(`0 ${noun}s`);
    expect(countText(1, noun)).toBe(`1 ${noun}`);
    expect(countText(5, noun)).toBe(`5 ${noun}s`);
  },
);
