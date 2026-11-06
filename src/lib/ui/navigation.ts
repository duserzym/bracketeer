import type { Project } from '../engine/types';
import { validateUnknowns, type InputProblem } from './unknowns';

export type Problem = { message: string; label: string; session?: number };

export function problemLabel(problem: InputProblem): string {
  if (problem.standard)
    return `${problem.standard} ${problem.field === 'pool' ? 'ranges' : 'used'}`;
  if (problem.row) return `Unknown ${problem.row} ${problem.field}`;
  return 'Paste unknowns';
}

export function unknownsProblem(project: Project): Problem | null {
  const problem = validateUnknowns(project).errors[0];
  return problem
    ? {
        message: problem.message,
        label: problemLabel(problem),
        ...(problem.session === null ? {} : { session: problem.session }),
      }
    : null;
}
