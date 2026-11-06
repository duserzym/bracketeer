import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  pickEndpoint,
  transition,
  loadPrefs,
  savePrefs,
  STABLE_ENDPOINT,
  type Release,
  type UpdateInfo,
  type UpdateStatus,
  type UpdateEvent,
} from './updates';

const info: UpdateInfo = {
  version: '0.2.0',
  currentVersion: '0.1.0',
  notes: 'Changes',
  date: null,
  ready: false,
};
const ready = { ...info, ready: true };
describe('compareVersions', () => {
  it.each([
    ['0.10.0', '0.9.9', 1],
    ['0.2.0-beta.1', '0.2.0', -1],
    ['0.2.0', '0.2.0-beta.1', 1],
    ['1.0.0', '1.0.0', 0],
    ['v1.2.3', '1.2.3', 0],
    ['1.2.3+build.2', '1.2.3+build.1', 0],
    ['1.0.0-beta.10', '1.0.0-beta.2', 1],
    ['1.0.0-alpha', '1.0.0-beta', -1],
    ['1.0.0-alpha', '1.0.0-alpha.1', -1],
    ['1.0.0-1', '1.0.0-alpha', -1],
    ['2.0.0', '1.99.99', 1],
    ['1.2.10', '1.2.9', 1],
    ['1.0.0-beta.2', '1.0.0-beta.10', -1],
  ])('%s vs %s', (a, b, expected) =>
    expect(compareVersions(a, b)).toBe(expected),
  );
});
function release(version: string, draft = false, asset = true): Release {
  return {
    tag_name: `v${version}`,
    draft,
    prerelease: version.includes('-'),
    assets: asset
      ? [
          {
            name: 'latest.json',
            browser_download_url: `https://example.test/${version}/latest.json`,
          },
        ]
      : [],
  };
}
describe('pickEndpoint', () => {
  it('stable ignores the list and pre-releases', () => {
    expect(pickEndpoint('stable', [release('9.0.0-beta.1')])).toBe(
      STABLE_ENDPOINT,
    );
    expect(pickEndpoint('stable', [])).toBe(STABLE_ENDPOINT);
  });
  it('beta selects the newest version, including pre-releases, regardless of list order', () => {
    expect(
      pickEndpoint('beta', [release('0.9.9'), release('0.10.0-beta.1')]),
    ).toContain('/0.10.0-beta.1/');
    expect(
      pickEndpoint('beta', [release('0.2.0-beta.1'), release('0.2.0')]),
    ).toContain('/0.2.0/');
  });
  it('skips drafts', () =>
    expect(
      pickEndpoint('beta', [release('3.0.0', true), release('2.0.0')]),
    ).toContain('/2.0.0/'));
  it('falls back if the newest release has no updater asset, or no release exists', () => {
    expect(
      pickEndpoint('beta', [release('3.0.0', false, false), release('2.0.0')]),
    ).toBe(STABLE_ENDPOINT);
    expect(pickEndpoint('beta', [])).toBe(STABLE_ENDPOINT);
  });
});

const states: UpdateStatus[] = [
  { kind: 'idle' },
  { kind: 'checking' },
  { kind: 'none', checkedAt: 1 },
  { kind: 'available', info },
  { kind: 'downloading', info, pct: 0 },
  { kind: 'ready', info: ready },
  { kind: 'installing', info: ready },
  { kind: 'error', message: 'Offline' },
  { kind: 'unsupported', reason: 'Portable' },
];
const events: UpdateEvent[] = [
  { type: 'check', manual: false },
  { type: 'check', manual: true },
  { type: 'result', info: null, checkedAt: 2 },
  { type: 'result', info, checkedAt: 2 },
  { type: 'result', info: ready, checkedAt: 2 },
  { type: 'download' },
  { type: 'progress', pct: 43 },
  { type: 'downloaded', info: ready },
  { type: 'install' },
  { type: 'failure', message: 'Offline' },
  { type: 'unsupported', reason: 'Portable', info },
];
// One entry per event: every state/event pair is checked, including illegal ones.
const legal: UpdateStatus['kind'][][] = [
  ['idle', 'none', 'available', 'error', 'unsupported'],
  ['idle', 'none', 'available', 'ready', 'error', 'unsupported'],
  ['checking'],
  ['checking'],
  ['checking'],
  ['available'],
  ['downloading'],
  ['downloading'],
  ['ready'],
  ['checking', 'downloading', 'installing'],
  ['idle', 'checking', 'none', 'available', 'ready'],
];
const expected: UpdateStatus[] = [
  { kind: 'checking' },
  { kind: 'checking' },
  { kind: 'none', checkedAt: 2 },
  { kind: 'available', info },
  { kind: 'ready', info: ready },
  { kind: 'downloading', info, pct: 0 },
  { kind: 'downloading', info, pct: 43 },
  { kind: 'ready', info: ready },
  { kind: 'installing', info: ready },
  { kind: 'error', message: 'Offline' },
  { kind: 'unsupported', reason: 'Portable', info },
];
describe('transition', () => {
  for (const state of states) {
    events.forEach((event, index) => {
      it(`${state.kind} + ${event.type} ${index}`, () => {
        const result = transition(state, event);
        if (legal[index]!.includes(state.kind))
          expect(result).toEqual(expected[index]);
        else expect(result).toBe(state);
      });
    });
  }
  it('allows indeterminate download progress', () => {
    expect(
      transition(
        { kind: 'downloading', info, pct: 1 },
        { type: 'progress', pct: null },
      ),
    ).toEqual({ kind: 'downloading', info, pct: null });
  });
  it('allows unsupported without an available update', () => {
    expect(
      transition({ kind: 'idle' }, { type: 'unsupported', reason: 'Browser' }),
    ).toEqual({ kind: 'unsupported', reason: 'Browser' });
  });
});
describe('preferences', () => {
  it('defaults to stable and automatic downloads, including invalid storage', () => {
    for (const raw of [
      null,
      '{',
      'null',
      '{"channel":"nightly","autoDownload":1,"lastCheck":"bad","lastResult":7}',
    ]) {
      expect(loadPrefs({ getItem: () => raw, setItem() {} })).toEqual({
        channel: 'stable',
        autoDownload: true,
        lastCheck: null,
        lastResult: null,
      });
    }
  });
  it('round trips preferences under the app key', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const prefs = {
      channel: 'beta' as const,
      autoDownload: false,
      lastCheck: 123,
      lastResult: 'Up to date',
    };
    savePrefs(storage, prefs);
    expect(values.has('bracketeer.updates')).toBe(true);
    expect(loadPrefs(storage)).toEqual(prefs);
  });
  it('tolerates blocked storage', () => {
    const storage = {
      getItem(): string | null {
        throw new Error('Blocked');
      },
      setItem() {
        throw new Error('Blocked');
      },
    };
    expect(loadPrefs(storage).autoDownload).toBe(true);
    expect(() => savePrefs(storage, loadPrefs(storage))).not.toThrow();
  });
});
