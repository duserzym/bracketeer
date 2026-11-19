import { countStandards } from '../engine/count';
import { checkSpots } from '../engine/checks';
import { mineralGroup } from '../engine/groups';
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

/** Numbered-entry validation for the design wizard; pools are checked in step 3. */
export function designProblem(
  project: Project,
  standards = false,
): Problem | null {
  if (!standards) {
    if (!project.sessions.some((s) => !s.fixed && s.unknowns.length))
      return {
        message: 'Add unknowns to an open session',
        label: 'Paste unknowns',
      };
    for (const session of project.sessions) {
      const names = new Map<string, number>();
      for (const [i, row] of session.unknowns.entries()) {
        const at = { session: session.number, label: `Unknown ${i + 1} name` };
        if (!row.name.trim())
          return { ...at, message: `Row ${i + 1}, unnamed: add a name.` };
        const identity = JSON.stringify([row.name.trim(), row.tag.trim()]);
        const previous = session.unknowns[i - 1];
        if (
          names.has(identity) &&
          !(
            previous?.name.trim() === row.name.trim() &&
            previous.tag.trim() === row.tag.trim()
          )
        )
          return {
            ...at,
            message: `Row ${i + 1}, ${row.name}: this name and tag are also in row ${names.get(identity)! + 1}.`,
          };
        names.set(identity, i);
      }
    }
  }
  const issue = checkSpots(project).find(
    (i) =>
      i.severity === 'error' &&
      (standards ||
        (i.target.kind === 'unknown' && !i.message.includes(' pool.'))),
  );
  if (issue) {
    const target = issue.target;
    return target.kind === 'unknown'
      ? {
          message: issue.message,
          session: target.session,
          label: `Unknown ${target.index + 1} ${issue.message.includes('end') ? 'end' : 'begin'}`,
        }
      : {
          message: issue.message,
          label: `${target.name} ${target.index ? `range ${target.index + 1} ` : ''}${issue.message.includes('end') ? 'end' : 'begin'}`,
        };
  }
  if (standards) {
    const openGroups = new Set(
      project.sessions
        .filter((s) => !s.fixed && s.unknowns.length)
        .map((s) => mineralGroup(project, s.mineral)),
    );
    let counts: ReturnType<typeof countStandards> = [];
    try {
      counts = countStandards(project);
    } catch {
      /* The recipe reports the planning error. */
    }
    const missing = project.standards.find(
      (s) =>
        (s.role === 'reference' ||
          openGroups.has(mineralGroup(project, s.mineral))) &&
        !s.ranges.some(
          (r) => r.to >= r.from || (r.auto?.to && r.to === r.from - 1),
        ) &&
        (project.recipe.chunking.mode === 'budget' ||
          counts.find((c) => c.name === s.name)?.needed !== 0),
    );
    if (missing)
      return {
        message: `Add a pool for ${missing.name}`,
        label: `${missing.name} begin`,
      };
  }
  return null;
}
