import { mineralGroup } from './groups';
import { projectLayouts } from './plan';
import { availableSpots } from './pools';
import type { Project, StandardRole } from './types';

export interface CountTerm {
  count: number;
  each: number;
  label: string;
}

export interface StandardCount {
  name: string;
  role: StandardRole;
  mineral: string;
  needed: number;
  spare: number;
  placed: number;
  available: number;
  short: number;
  perSession: { session: number; needed: number }[];
  terms: CountTerm[];
  formula: string;
}

/** Count planned draws from the actual layouts, independently of pool exhaustion. */
export function countStandards(project: Project): StandardCount[] {
  const plan = projectLayouts(project);
  const planned = project.sessions.filter((s) => !s.fixed);
  return project.standards.map((standard) => {
    const terms: CountTerm[] = [];
    const perSession = planned.map((s) => ({ session: s.number, needed: 0 }));
    const add = (i: number, each: number, label: string) => {
      if (!each) return;
      perSession[i]!.needed += each;
      const existing = terms.find((t) => t.each === each && t.label === label);
      if (existing) existing.count++;
      else terms.push({ count: 1, each, label });
    };
    for (const block of ['opening', 'mid', 'closing'] as const)
      plan.layouts.forEach((layout, i) => {
        const entries =
          block === 'mid'
            ? layout.brackets.flatMap((b) => b.mid)
            : layout[block];
        const each = entries
          .filter((e) => e.standard === standard.name)
          .reduce((n, e) => n + e.count, 0);
        add(i, each, block === 'mid' ? 'mids' : `${block}s`);
      });
    plan.layouts.forEach((layout, i) => {
      const brackets = [
        ...(layout.openingBracket ? [layout.openingBracket] : []),
        ...layout.brackets,
      ];
      for (const b of brackets) {
        if (b.primary.standard === standard.name)
          add(i, b.primary.count, 'brackets');
        for (const e of b.secondaries)
          if (e.standard === standard.name)
            add(
              i,
              e.count,
              project.recipe.secondaries === 'cadence'
                ? `${standard.cadence ?? 'every'} brackets`
                : 'pairs',
            );
      }
    });
    for (const term of terms)
      if (term.count === 1) term.label = term.label.slice(0, -1);
    const needed = perSession.reduce((n, s) => n + s.needed, 0);
    const placed = availableSpots({ ...standard, used: [], spare: 0 }).length;
    const available = plan.budget.perStandard[standard.name]!.available;
    return {
      name: standard.name,
      role: standard.role,
      mineral:
        standard.role === 'reference'
          ? ''
          : mineralGroup(project, standard.mineral),
      needed,
      spare: standard.spare,
      placed,
      available,
      short: Math.max(0, needed - available),
      perSession,
      terms,
      formula: terms.length
        ? `${terms.map((t) => `${t.count} ${t.label} × ${t.each}`).join(' + ')} = ${needed}`
        : '0',
    };
  });
}
