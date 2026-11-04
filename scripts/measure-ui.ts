// Local CPU baseline; Playwright also records browser render timings.
// Run with: pnpm exec tsx scripts/measure-ui.ts
import { performance } from 'node:perf_hooks';
import { deriveSession } from '../src/lib/engine/import';
import { planProject, validate } from '../src/lib/engine/sequence';
import { editCell, exampleProject } from '../src/lib/ui/model';

const project = exampleProject();
const generated = planProject(project);
project.sessions.forEach((s, i) => {
  s.rows = generated.sessions[i]!.rows;
});
const session = project.sessions[1]!;
const others = project.sessions.filter((s) => s.number !== session.number);

function measure(label: string, task: () => void) {
  for (let i = 0; i < 20; i++) task();
  const samples = Array.from({ length: 100 }, () => {
    const start = performance.now();
    task();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  process.stdout.write(
    `${label}: median ${samples[50]!.toFixed(2)} ms, p95 ${samples[95]!.toFixed(2)} ms\n`,
  );
}

measure('Plan 3 sessions / 901 rows', () => {
  planProject(project);
});
measure('Clone + edit + validate + counts for 332 rows', () => {
  const next = structuredClone(project);
  const current = next.sessions[1]!;
  current.rows[0] = editCell(
    current.rows[0]!,
    'Laser Scan Position Number',
    '876',
    next,
  );
  validate(
    current.rows,
    next.standards,
    current.unknowns,
    others,
    current.number,
  );
  deriveSession(current.rows, next.standards);
});
