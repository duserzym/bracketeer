import { parseProject, serializeProject } from '../engine/project';
import type { Project } from '../engine/types';
import { deriveStep, guessMineral, type Step } from './catalogue';

export type Recent = {
  name: string;
  mineral: string;
  step: Step;
  savedAt: string;
  project: string;
};
const key = 'bracketeer.recent';
const continueKey = 'bracketeer.recent.continue';
const limit = 3 * 1024 * 1024;

function valid(value: unknown): value is Recent {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Recent;
  if (
    typeof entry.name !== 'string' ||
    typeof entry.mineral !== 'string' ||
    ![1, 2, 3, 4].includes(entry.step) ||
    typeof entry.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(entry.savedAt)) ||
    typeof entry.project !== 'string'
  )
    return false;
  try {
    parseProject(entry.project);
    return true;
  } catch {
    return false;
  }
}

export function readRecent(): Recent[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    return bounded(
      value.filter(valid).sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    );
  } catch {
    return [];
  }
}

function bounded(entries: Recent[]): Recent[] {
  const names = new Set<string>();
  const result = entries
    .filter((e) => {
      if (names.has(e.name)) return false;
      names.add(e.name);
      return true;
    })
    .slice(0, 6);
  while (new TextEncoder().encode(JSON.stringify(result)).byteLength > limit)
    result.pop();
  return result;
}

function snapshot(project: Project, now: Date): Recent {
  return {
    name: project.experiment.name,
    mineral: project.wizard?.mineral ?? guessMineral(project),
    step: project.wizard?.step ?? deriveStep(project),
    savedAt: now.toISOString(),
    project: serializeProject(project),
  };
}

export function recordRecent(project: Project, now = new Date()): Recent[] {
  try {
    const entry = snapshot(project, now);
    const entries = bounded(
      [entry, ...readRecent().filter((e) => e.name !== entry.name)].sort(
        (a, b) => b.savedAt.localeCompare(a.savedAt),
      ),
    );
    localStorage.setItem(key, JSON.stringify(entries));
    return entries;
  } catch {
    return readRecent();
  }
}

export function nonemptyProject(project: Project): boolean {
  return (
    project.sessions.some((s) => s.unknowns.length || s.rows.length) ||
    project.standards.some((s) => s.ranges.length)
  );
}

/** Move the previous autosave into a separate Continue snapshot before starting blank. */
export function launchContinue(): Recent | null {
  try {
    const autosave = localStorage.getItem('bracketeer.project');
    if (autosave) {
      try {
        const project = parseProject(autosave);
        if (nonemptyProject(project)) {
          const entry = snapshot(project, new Date());
          try {
            localStorage.setItem(continueKey, JSON.stringify(entry));
          } catch {
            /* Offer it in memory too. */
          }
          return entry;
        }
      } catch {
        /* An invalid autosave must not hide an earlier Continue entry. */
      }
    }
    const entry: unknown = JSON.parse(
      localStorage.getItem(continueKey) ?? 'null',
    );
    return valid(entry) ? entry : null;
  } catch {
    return null;
  }
}
