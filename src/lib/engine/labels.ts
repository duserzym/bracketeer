import type { Standard, StandardRole } from './types';

export type ParsedLabel =
  | { kind: StandardRole; name: string; tag: ''; spot: number | null }
  | { kind: 'unknown'; name: string; tag: string; spot: number }
  | { kind: 'unrecognized'; name: string; tag: ''; spot: null };

/** Standard names take precedence; otherwise only the last name part is a tag. */
export function parseLabel(
  label: string,
  standards: readonly Standard[],
): ParsedLabel {
  for (const standard of standards) {
    const prefix = `${standard.name}_`;
    if (!label.startsWith(prefix)) continue;
    const suffix = label.slice(prefix.length);
    const spot = Number(suffix);
    if (
      suffix === '?' ||
      (/^\d+$/u.test(suffix) && Number.isSafeInteger(spot) && spot > 0)
    )
      return {
        kind: standard.role,
        name: standard.name,
        tag: '',
        spot: suffix === '?' ? null : spot,
      };
  }
  const parts = label.split('_');
  const suffix = parts.pop() ?? '';
  const spot = Number(suffix);
  const tag = parts.length >= 2 ? parts.pop()! : '';
  const name = parts.join('_');
  if (name && /^\d+$/u.test(suffix) && Number.isSafeInteger(spot) && spot > 0)
    return { kind: 'unknown', name, tag, spot };
  return { kind: 'unrecognized', name: label, tag: '', spot: null };
}
