import type { Project, Recipe, Standard } from './types';

/** The main mineral has the stable group id '', including explicit main ids. */
export function mineralGroup(project: Project, mineral?: string): string {
  return !mineral || mineral === project.wizard?.mineral ? '' : mineral;
}

/** References are shared; all other standards belong to one mineral group. */
export function groupStandards(
  project: Project,
  group: string,
  standards: readonly Standard[] = project.standards,
): Standard[] {
  return standards.filter(
    (s) => s.role === 'reference' || mineralGroup(project, s.mineral) === group,
  );
}

/** Resolve a group's independent rotation without changing the stored recipe. */
export function groupRecipe(project: Project, group: string): Recipe {
  return group
    ? {
        ...project.recipe,
        rotationStart: project.recipe.rotationStarts?.[group] ?? 0,
      }
    : project.recipe;
}
