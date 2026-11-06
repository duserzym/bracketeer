/** Pure update policy; storage is injected so this module needs no browser. */
export const STABLE_ENDPOINT =
  'https://github.com/duserzym/bracketeer/releases/latest/download/latest.json';
export type Channel = 'stable' | 'beta';
export interface Release {
  draft: boolean;
  prerelease: boolean;
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
}

export function compareVersions(a: string, b: string): number {
  const split = (v: string) => {
    const [core = '', pre] = v.replace(/^v/, '').split('+')[0]!.split(/-(.*)/s);
    return { core: core.split('.').map(Number), pre: pre?.split('.') };
  };
  const left = split(a);
  const right = split(b);
  for (let i = 0; i < Math.max(left.core.length, right.core.length); i++) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  if (!left.pre || !right.pre) return left.pre ? -1 : right.pre ? 1 : 0;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    if (l === r) continue;
    const ln = /^\d+$/.test(l);
    const rn = /^\d+$/.test(r);
    if (ln && rn) return Math.sign(Number(l) - Number(r));
    if (ln !== rn) return ln ? -1 : 1;
    return l < r ? -1 : 1;
  }
  return 0;
}

export function pickEndpoint(channel: Channel, releases: Release[]): string {
  if (channel === 'stable') return STABLE_ENDPOINT;
  const newest = releases
    .filter((release) => !release.draft)
    .sort((a, b) => compareVersions(b.tag_name, a.tag_name))[0];
  return (
    newest?.assets.find((asset) => asset.name === 'latest.json')
      ?.browser_download_url ?? STABLE_ENDPOINT
  );
}

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes: string | null;
  date: string | null;
  ready: boolean;
}
export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'none'; checkedAt: number }
  | { kind: 'available'; info: UpdateInfo }
  | { kind: 'downloading'; info: UpdateInfo; pct: number | null }
  | { kind: 'ready'; info: UpdateInfo }
  | { kind: 'installing'; info: UpdateInfo }
  | { kind: 'error'; message: string }
  | { kind: 'unsupported'; reason: string; info?: UpdateInfo };

export type UpdateEvent =
  | { type: 'check'; manual: boolean }
  | { type: 'result'; info: UpdateInfo | null; checkedAt: number }
  | { type: 'download' }
  | { type: 'progress'; pct: number | null }
  | { type: 'downloaded'; info: UpdateInfo }
  | { type: 'install' }
  | { type: 'failure'; message: string }
  | { type: 'unsupported'; reason: string; info?: UpdateInfo };

export function transition(
  status: UpdateStatus,
  event: UpdateEvent,
): UpdateStatus {
  switch (event.type) {
    case 'check':
      if (
        ['checking', 'downloading', 'installing'].includes(status.kind) ||
        (status.kind === 'ready' && !event.manual)
      )
        return status;
      return { kind: 'checking' };
    case 'result':
      if (status.kind !== 'checking') return status;
      return event.info
        ? { kind: event.info.ready ? 'ready' : 'available', info: event.info }
        : { kind: 'none', checkedAt: event.checkedAt };
    case 'download':
      return status.kind === 'available'
        ? { kind: 'downloading', info: status.info, pct: 0 }
        : status;
    case 'progress':
      return status.kind === 'downloading'
        ? { ...status, pct: event.pct }
        : status;
    case 'downloaded':
      return status.kind === 'downloading'
        ? { kind: 'ready', info: event.info }
        : status;
    case 'install':
      return status.kind === 'ready'
        ? { kind: 'installing', info: status.info }
        : status;
    case 'failure':
      return ['checking', 'downloading', 'installing'].includes(status.kind)
        ? { kind: 'error', message: event.message }
        : status;
    case 'unsupported':
      return ['idle', 'checking', 'none', 'available', 'ready'].includes(
        status.kind,
      )
        ? {
            kind: 'unsupported',
            reason: event.reason,
            ...(event.info ? { info: event.info } : {}),
          }
        : status;
  }
}

export interface UpdatePrefs {
  channel: Channel;
  autoDownload: boolean;
  lastCheck: number | null;
  lastResult: string | null;
}
interface PrefStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const PREF_KEY = 'bracketeer.updates';
export function loadPrefs(storage: PrefStorage): UpdatePrefs {
  const defaults: UpdatePrefs = {
    channel: 'stable',
    autoDownload: true,
    lastCheck: null,
    lastResult: null,
  };
  try {
    const value = JSON.parse(storage.getItem(PREF_KEY) ?? '{}');
    return {
      channel: value.channel === 'beta' ? 'beta' : 'stable',
      autoDownload:
        typeof value.autoDownload === 'boolean' ? value.autoDownload : true,
      lastCheck:
        typeof value.lastCheck === 'number' && Number.isFinite(value.lastCheck)
          ? value.lastCheck
          : null,
      lastResult:
        typeof value.lastResult === 'string' ? value.lastResult : null,
    };
  } catch {
    return defaults;
  }
}
export function savePrefs(storage: PrefStorage, prefs: UpdatePrefs): void {
  try {
    storage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* Storage is optional. */
  }
}
