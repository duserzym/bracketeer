import type { ProjectPlan } from '../engine/sequence';

/** Split the literal clipboard text without trimming empty cells or the final column. */
export function splitTSV(text: string): string[][] {
  if (!text) return [];
  const data = text.endsWith('\r\n') ? text.slice(0, -2) : text;
  return data.split('\r\n').map((row) => row.split('\t'));
}

export function compactChunks(chunks: readonly number[]): string {
  const counts = new Map<number, number>();
  for (const size of chunks) counts.set(size, (counts.get(size) ?? 0) + 1);
  return [...counts].map(([size, count]) => `${count} × ${size}`).join(', ');
}

/** Run numbering includes only the open sessions, just like the shared budget. */
export function doubledBrackets(plan: ProjectPlan): number[] {
  return plan.sessions
    .filter((s) => !s.fixed)
    .flatMap((s) => s.pairsPerBracket)
    .flatMap((pairs, i) => (pairs > 1 ? [i + 1] : []));
}
