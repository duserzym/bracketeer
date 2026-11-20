import type { Project, StandardRole } from '../engine/types';
import zirconLight from '../../assets/minerals/zircon-light.svg?url';
import zirconDark from '../../assets/minerals/zircon-dark.svg?url';
import apatiteLight from '../../assets/minerals/apatite-light.svg?url';
import apatiteDark from '../../assets/minerals/apatite-dark.svg?url';
import rutileLight from '../../assets/minerals/rutile-light.svg?url';
import rutileDark from '../../assets/minerals/rutile-dark.svg?url';
import titaniteLight from '../../assets/minerals/titanite-light.svg?url';
import titaniteDark from '../../assets/minerals/titanite-dark.svg?url';
import garnetLight from '../../assets/minerals/garnet-light.svg?url';
import garnetDark from '../../assets/minerals/garnet-dark.svg?url';
import monaziteLight from '../../assets/minerals/monazite-light.svg?url';
import monaziteDark from '../../assets/minerals/monazite-dark.svg?url';
import xenotimeLight from '../../assets/minerals/xenotime-light.svg?url';
import xenotimeDark from '../../assets/minerals/xenotime-dark.svg?url';
import carbonateLight from '../../assets/minerals/carbonate-light.svg?url';
import carbonateDark from '../../assets/minerals/carbonate-dark.svg?url';
import otherLight from '../../assets/minerals/other-light.svg?url';
import otherDark from '../../assets/minerals/other-dark.svg?url';

export type Step = 1 | 2 | 3 | 4;
export type Entry = { name: string; role: StandardRole; checked: boolean };
export const minerals = [
  { id: 'zircon', name: 'Zircon', light: zirconLight, dark: zirconDark },
  { id: 'apatite', name: 'Apatite', light: apatiteLight, dark: apatiteDark },
  { id: 'rutile', name: 'Rutile', light: rutileLight, dark: rutileDark },
  {
    id: 'titanite',
    name: 'Titanite',
    light: titaniteLight,
    dark: titaniteDark,
  },
  { id: 'garnet', name: 'Garnet', light: garnetLight, dark: garnetDark },
  {
    id: 'monazite',
    name: 'Monazite',
    light: monaziteLight,
    dark: monaziteDark,
  },
  {
    id: 'xenotime',
    name: 'Xenotime',
    light: xenotimeLight,
    dark: xenotimeDark,
  },
  {
    id: 'carbonate',
    name: 'Carbonate',
    light: carbonateLight,
    dark: carbonateDark,
  },
  { id: 'other', name: 'Other', light: otherLight, dark: otherDark },
];
export const roles: StandardRole[] = ['primary', 'secondary', 'reference'];

/** Position is zero-based within the destination group, after removing the source.
 * The caller supplies one mineral's entries, so a drop cannot cross minerals. */
export function applyDrop(
  entries: readonly Entry[],
  from: number,
  group: StandardRole,
  position: number,
): Entry[] {
  const source = entries[from];
  if (!source || !roles.includes(group)) return entries.slice();
  const remaining = entries.filter((_, i) => i !== from).map((e) => ({ ...e }));
  const destinations = remaining
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.role === group);
  const slot = Math.max(0, Math.min(Math.trunc(position), destinations.length));
  const at =
    destinations[slot]?.index ??
    (destinations.length ? destinations.at(-1)!.index + 1 : remaining.length);
  const enteringPrimary = group === 'primary' && source.role !== 'primary';
  if (enteringPrimary)
    for (const entry of remaining)
      if (entry.role === 'primary') entry.checked = false;
  remaining.splice(at, 0, {
    ...source,
    role: group,
    checked: enteringPrimary ? true : source.checked,
  });
  return remaining;
}
const key = 'bracketeer.minerals';
const seedNames: Record<string, [string[], string[]]> = {
  zircon: [
    ['S513', 'GJ1', 'Plešovice'],
    [
      'Seiland',
      '91500',
      'PL',
      'LTSE',
      'FC1',
      'R33',
      'OG1',
      'Temora',
      'AUSz2',
      'Maniitsoq',
    ],
  ],
  apatite: [
    ['MAD', 'MADUCSB'],
    ['McClure', 'Durango', 'BR5', 'OL2', 'AFB1'],
  ],
  rutile: [['R632'], ['KNW']],
  titanite: [['MKED'], ['BLR', 'Kahn', 'OLT', 'Elmuerto']],
  carbonate: [['WC_1'], ['MMC']],
};

/** Fresh seeds, independent of the user's saved catalogue. */
export function seeds(mineral: string): Entry[] {
  const [primary, secondary] = Object.hasOwn(seedNames, mineral)
    ? seedNames[mineral]!
    : [[], []];
  return [
    ...primary.map((name, i) => ({
      name,
      role: 'primary' as const,
      checked: i === 0,
    })),
    ...secondary.map((name, i) => ({
      name,
      role: 'secondary' as const,
      checked: mineral === 'zircon' && i < 4,
    })),
    ...['NIST610', 'NIST612'].map((name) => ({
      name,
      role: 'reference' as const,
      checked: true,
    })),
  ];
}

function readCatalogues(): Record<string, Entry[]> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        ([, entries]) =>
          Array.isArray(entries) &&
          entries.every((e: unknown) => {
            if (!e || typeof e !== 'object') return false;
            const entry = e as Entry;
            return (
              typeof entry.name === 'string' &&
              roles.includes(entry.role) &&
              typeof entry.checked === 'boolean'
            );
          }),
      ),
    );
  } catch {
    return {};
  }
}

export function catalogue(mineral: string): Entry[] {
  const saved = readCatalogues();
  return structuredClone(
    Object.hasOwn(saved, mineral) ? saved[mineral]! : seeds(mineral),
  );
}

export function saveCatalogue(mineral: string, entries: Entry[]): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ ...readCatalogues(), [mineral]: entries }),
    );
  } catch {
    /* Catalogues still work without storage. */
  }
}

export function restoreSeeds(mineral: string): Entry[] {
  const entries = seeds(mineral);
  saveCatalogue(mineral, entries);
  return entries;
}

export function selectionProblem(
  mineral: string,
  entries: readonly Entry[],
): string {
  if (!mineral.trim()) return 'Choose a mineral';
  const checked = entries.filter((e) => e.checked);
  const primaries = checked.filter((e) => e.role === 'primary').length;
  if (!primaries) return 'Add your primary standard';
  if (primaries !== 1) return 'Choose one primary standard';
  const names = new Set<string>();
  for (const entry of checked) {
    const name = entry.name.trim();
    if (!name) return 'Give every checked standard a name';
    if (names.has(name)) return `Two standards are called ${name}`;
    if (name === '@primary') return 'Choose a name other than @primary';
    names.add(name);
  }
  return '';
}

export function applySelection(
  project: Project,
  mineral: string,
  entries: readonly Entry[],
): Project {
  const next = structuredClone(project);
  next.standards = roles.flatMap((role) =>
    entries
      .filter((e) => e.checked && e.role === role)
      .map((entry) => {
        const name = entry.name.trim();
        const existing = project.standards.find((s) => s.name === name);
        return {
          ...structuredClone(existing ?? {}),
          name,
          role,
          ranges: structuredClone(existing?.ranges ?? []),
          used: [...(existing?.used ?? [])],
          spare: existing?.spare ?? 0,
        };
      }),
  );
  const names = new Set(next.standards.map((s) => s.name));
  for (const block of ['opening', 'mid', 'closing'] as const)
    next.recipe[block] = next.recipe[block].filter(
      (e) => e.standard === '@primary' || names.has(e.standard),
    );
  next.wizard = { step: project.wizard?.step ?? 1, mineral };
  return next;
}

export function guessMineral(project: Project): string {
  const primary = project.standards.find((s) => s.role === 'primary')?.name;
  return (
    minerals.find((m) =>
      seeds(m.id).some((s) => s.role === 'primary' && s.name === primary),
    )?.id ?? 'other'
  );
}

export function deriveStep(project: Project): Step {
  const open = project.sessions.filter((s) => !s.fixed);
  if (open.some((s) => s.rows.length)) return 4;
  if (
    open.some((s) => s.unknowns.length) &&
    project.standards.every((s) => s.ranges.length)
  )
    return 3;
  return project.standards.length ? 2 : 1;
}

/** Project entries lead each group in project order; unused catalogue entries follow. */
export function selectionFromProject(
  project: Project,
  mineral: string,
): Entry[] {
  const names = new Set(project.standards.map((s) => s.name));
  return roles.flatMap((role) => [
    ...project.standards
      .filter((s) => s.role === role)
      .map((s) => ({ name: s.name, role, checked: true })),
    ...catalogue(mineral)
      .filter((e) => e.role === role && !names.has(e.name.trim()))
      .map((e) => ({ ...e, checked: false })),
  ]);
}
