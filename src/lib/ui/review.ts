import type { Project } from '../engine/types';
import { countText } from '../text';
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

/** Budget allocation details apply only when the pools determine the brackets. */
export function bracketingSummary(
  project: Pick<Project, 'recipe'>,
  plan: ProjectPlan,
): string {
  const brackets = countText(plan.budget.K, 'bracket');
  const pairs = countText(plan.budget.P, 'secondary pair');
  if (project.recipe.chunking.mode !== 'budget')
    return `${brackets}${project.recipe.secondaries === 'cadence' ? '' : `, ${pairs}`}.`;
  const sessions = plan.sessions.filter((s) => !s.fixed && s.chunks.length);
  return `${brackets} for ${countText(sessions.length, 'session')} (${sessions.map((s) => s.chunks.length).join(' + ') || '0'}), ${pairs}. Doubled brackets: ${doubledBrackets(plan).join(', ') || 'none'}.`;
}
