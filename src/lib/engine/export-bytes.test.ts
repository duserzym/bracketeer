import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { exportWorkbook, toCSV, toTSV } from './export';
import { parseProject } from './project';
import { planProject } from './sequence';

const project = parseProject(
  readFileSync(
    new URL('../../../fixtures/session-1.bracketeer.json', import.meta.url),
    'utf8',
  ),
);
const sessions = planProject(project).sessions;
const hashes = {
  csv: [
    '3466dacf6cba66736f6ac1e4f09a0f471e8a25c54caa05e326f41cc8317869c1',
    'dfdd6d8e215da9ba2ff67d1c260c8c9939ba1937cf4d0c7bb1874cb746c07c29',
  ],
  tsv: [
    'ee0255ed55aa6339adf5b3a4720d0dde2911fc74c31f9a2cc2b2d6fb046eddb4',
    'c70746c6785d93d0bc5e3137f826c3f7592b60c5faadd219712afd0d51859f71',
  ],
  xls: [
    '073658bb60fd49c613d16c18a5f89e2df579b69f391fba9ccec12aad204f2bb9',
    'a04f0c18625d86abe643e4e2d2eff2529c42434eac1b13baa2785878e1ca728e',
  ],
  xlsx: [
    'be518318517e7573654f28777b181d6ecd3bba3188c73f9669ef8ce79e819be8',
    'ccf34901900d48938b80d50fc47464a2126d01a3fd5700adf7c8fe5c00f41ea0',
  ],
};

it.each(['csv', 'tsv', 'xls', 'xlsx'] as const)(
  'preserves the example %s export bytes from eb5c6c3',
  (format) => {
    for (const [i, n] of [2, 3].entries()) {
      const rows = sessions.find((s) => s.number === n)!.rows;
      const data =
        format === 'csv'
          ? toCSV(rows)
          : format === 'tsv'
            ? toTSV(rows)
            : exportWorkbook(rows, format);
      expect(
        createHash('sha256').update(data).digest('hex'),
        `session ${n}`,
      ).toBe(hashes[format][i]);
    }
  },
);
