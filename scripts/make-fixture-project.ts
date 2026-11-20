// Only this development script does I/O; the engine takes and returns bytes/text.
import { readFileSync, writeFileSync } from 'node:fs';
import { importWorkbook, deriveSession } from '../src/lib/engine/import';
import { serializeProject } from '../src/lib/engine/project';
import {
  SESSION_2_STANDARDS,
  SESSION_2_UNKNOWNS,
  SESSION_3_UNKNOWNS,
} from '../src/lib/engine/test-data';
import {
  DEFAULT_EXPERIMENT,
  DEFAULT_RECIPE,
  type Project,
} from '../src/lib/engine/types';

const standards = SESSION_2_STANDARDS.map((s) => ({
  ...s,
  used: [],
  spare: 0,
}));
const imported = importWorkbook(
  readFileSync(new URL('../fixtures/synthetic-session-1.xls', import.meta.url)),
  standards,
);
const derived = deriveSession(imported.rows, standards);
if (imported.issues.length || derived.issues.length)
  throw new Error('Session 1 has unrecognized rows.');
const project: Project = {
  version: 1,
  experiment: { ...DEFAULT_EXPERIMENT, name: 'synthetic-zircon-2026-11-04' },
  standards,
  recipe: { ...structuredClone(DEFAULT_RECIPE), chunking: { mode: 'budget' } },
  sessions: [
    {
      number: 1,
      unknowns: derived.unknowns,
      rows: imported.rows,
      fixed: true,
      source: 'synthetic-session-1.xls',
    },
    { number: 2, unknowns: SESSION_2_UNKNOWNS, rows: [], fixed: false },
    { number: 3, unknowns: SESSION_3_UNKNOWNS, rows: [], fixed: false },
  ],
};
writeFileSync(
  new URL('../fixtures/synthetic-session-1.bracketeer.json', import.meta.url),
  serializeProject(project),
);
console.log(
  `Wrote fixture project with ${imported.rows.length} fixed rows and two planned sessions.`,
);
