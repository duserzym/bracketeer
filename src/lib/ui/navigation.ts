import type { Project } from '../engine/types';

export type Problem = { message: string; label: string; session?: number };

/** Current contiguous unknown editor validation; no change to engine spot semantics. */
export function unknownsProblem(project: Project): Problem | null {
  if (!project.sessions.some((s) => !s.fixed && s.unknowns.length))
    return {
      message: 'Add unknowns to an open session',
      label: 'Paste unknowns',
    };
  const samples: {
    from: number;
    to: number;
    name: string;
    row: number;
    session: number;
  }[] = [];
  for (const session of project.sessions) {
    const names = new Set<string>();
    for (const [i, u] of session.unknowns.entries()) {
      const at = { session: session.number, label: `Unknown ${i + 1} name` };
      const prefix = `Session ${session.number}, row ${i + 1}, ${u.name || 'unnamed'}`;
      if (!u.name.trim()) return { ...at, message: `${prefix}: add a name` };
      if (
        !Number.isSafeInteger(u.from) ||
        !Number.isSafeInteger(u.to) ||
        u.from < 1 ||
        u.to < u.from
      )
        return {
          ...at,
          label: `Unknown ${i + 1} from`,
          message: `${prefix}: enter an ascending spot range`,
        };
      const name = JSON.stringify([u.name, u.tag]);
      if (!session.fixed && names.has(name))
        return {
          ...at,
          message: `${prefix}: this name and tag are used twice`,
        };
      names.add(name);
      const overlap = samples.find((s) => u.from <= s.to && s.from <= u.to);
      if (overlap)
        return {
          ...at,
          label: `Unknown ${i + 1} from`,
          message: `${prefix}: spots overlap row ${overlap.row}, ${overlap.name}, in session ${overlap.session}`,
        };
      const standard = project.standards.find((s) =>
        s.ranges.some((r) => u.from <= r.to && r.from <= u.to),
      );
      if (standard)
        return {
          ...at,
          label: `Unknown ${i + 1} from`,
          message: `${prefix}: spots are in the ${standard.name} pool`,
        };
      samples.push({ ...u, row: i + 1, session: session.number });
    }
  }
  for (const [i, standard] of project.standards.entries()) {
    const at = { label: `${standard.name} ranges` };
    if (!standard.ranges.length)
      return { ...at, message: `Add a pool for ${standard.name}` };
    const other = project.standards
      .slice(0, i)
      .find((s) =>
        s.ranges.some((a) =>
          standard.ranges.some((b) => a.from <= b.to && b.from <= a.to),
        ),
      );
    if (other)
      return {
        ...at,
        message: `${standard.name} and ${other.name} pools overlap`,
      };
  }
  return null;
}
