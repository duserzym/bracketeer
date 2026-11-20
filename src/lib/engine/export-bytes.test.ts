import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { exportWorkbook, toCSV, toTSV } from './export';
import { parseProject } from './project';
import { planProject } from './sequence';

const project = parseProject(
  readFileSync(
    new URL(
      '../../../fixtures/synthetic-session-1.bracketeer.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const sessions = planProject(project).sessions;
const hashes = {
  csv: [
    '078a5fdcef69d7e2f91459a8123bb7aa491af109f24a989e708e4dc20b41d08b',
    'db0f0ede40de555d59129931c9140db9e62618679f471c420583a384a03dc72c',
  ],
  tsv: [
    'f30f91d2e246de92aa9fe78fba06701ea78c1887906ca83f22582c1942286a70',
    '72fdf179ae5bfe780dcc63bbda50feb5691c07620304739827f4a4c50a132f55',
  ],
  xls: [
    '32b640552366ad09a2b7293d5696cdb4e9d32fc98a649e45c63a67dba4cb3f35',
    '105006c2b603f399c1f56410cc45c940cb71ed43e4c73dc0d31c34b25853e139',
  ],
  xlsx: [
    '57ae61bbb330aea73a61d7f5b01e84dbcc5b5d19de96fcbc4207239002fbb90c',
    '0026b0aa9edece7402e3aa64d875d59ee9b0a094cdbcffcd0baf48a97da9777a',
  ],
};

it.each(['csv', 'tsv', 'xls', 'xlsx'] as const)(
  'preserves the synthetic example %s export bytes',
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
