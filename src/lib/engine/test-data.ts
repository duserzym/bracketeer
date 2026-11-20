// Small, explicit synthetic acceptance inputs from docs/PLAN.md §6 and AGENTS.md.
// Used spots follow RULES.md revision 3; the fixture script reads them from XLS.
import {
  DEFAULT_EXPERIMENT,
  DEFAULT_RECIPE,
  type Standard,
  type Unknown,
} from './types';

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

export const SESSION_2_UNKNOWNS: Unknown[] = [
  { name: 'SYN-1', tag: 'S', from: 1, to: 30 },
  { name: 'SYN-2', tag: 'S', from: 31, to: 55 },
  { name: 'SYN-3', tag: 'S', from: 56, to: 83 },
  { name: 'SYN-4', tag: 'S', from: 84, to: 90 },
  { name: 'SYN-5', tag: 'S', from: 91, to: 116 },
  { name: 'SYN-6', tag: 'S', from: 117, to: 119 },
  { name: 'SYN-7', tag: 'S', from: 120, to: 131 },
  { name: 'SYN-8-pg', tag: 'S', from: 132, to: 142 },
  { name: 'SYN-9', tag: 'S', from: 143, to: 167 },
  { name: 'SYN-10', tag: 'S', from: 168, to: 181 },
  { name: 'SYN-11.7', tag: 'S', from: 182, to: 192 },
  { name: 'SYN-12', tag: 'S', from: 193, to: 234 },
];

export const SESSION_3_UNKNOWNS: Unknown[] = [
  { name: 'SYN-13-gc1', tag: 'xs', from: 235, to: 252 },
  { name: 'SYN-14-mafic', tag: 'xs', from: 253, to: 302 },
  { name: 'SYN-15-felsic', tag: 'xs', from: 303, to: 322 },
  { name: 'SYN-16-gc1', tag: 'xs', from: 488, to: 627 },
];

// Secondary table order is deliberately different from numeric pool order.
export const SESSION_2_STANDARDS: Standard[] = [
  {
    name: 'S513',
    spare: 0,
    role: 'primary',
    ranges: [{ from: 628, to: 727 }],
    used: range(628, 649),
  },
  {
    name: 'Seiland',
    spare: 0,
    role: 'secondary',
    ranges: [{ from: 758, to: 787 }],
    used: range(768, 777),
  },
  {
    name: '91500',
    spare: 0,
    role: 'secondary',
    ranges: [{ from: 728, to: 757 }],
    used: range(738, 747),
  },
  {
    name: 'PL',
    spare: 0,
    role: 'secondary',
    ranges: [{ from: 818, to: 847 }],
    used: range(828, 837),
  },
  {
    name: 'LTSE',
    spare: 0,
    role: 'secondary',
    ranges: [{ from: 788, to: 817 }],
    used: range(798, 807),
  },
  {
    name: 'NIST610',
    spare: 0,
    role: 'reference',
    ranges: [{ from: 848, to: 874 }],
    used: range(857, 865),
  },
  {
    name: 'NIST612',
    spare: 0,
    role: 'reference',
    ranges: [{ from: 875, to: 901 }],
    used: range(893, 901),
  },
];

export const TEST_PROJECT: import('./types').Project = {
  version: 1,
  experiment: { ...DEFAULT_EXPERIMENT, name: 'synthetic-zircon-2026-11-04' },
  standards: SESSION_2_STANDARDS,
  recipe: { ...DEFAULT_RECIPE, chunking: { mode: 'budget' } },
  sessions: [
    { number: 2, unknowns: SESSION_2_UNKNOWNS, rows: [], fixed: false },
    { number: 3, unknowns: SESSION_3_UNKNOWNS, rows: [], fixed: false },
  ],
};
