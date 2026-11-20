import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  friendlyUpdateError,
  updateErrorDetails,
  UNSUPPORTED_FOLDER_REASON,
  checkButtonView,
  transition,
  loadPrefs,
  whatsNew,
  releaseNotesUrl,
  savePrefs,
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
describe('friendlyUpdateError', () => {
  it.each([
    'PUBKEY missing',
    'invalid public key',
    'Updater pubkey is empty',
    'not configured',
  ])('explains configuration errors: %s', (raw) => {
    expect(friendlyUpdateError(raw)).toBe(
      'Updates are not configured for this build yet.',
    );
  });
  it.each([
    '404',
    'HTTP 404 Not Found',
    'release JSON invalid',
    'Could not fetch a valid release',
    'Not Found',
    'no assets',
  ])('explains missing releases: %s', (raw) => {
    expect(friendlyUpdateError(raw)).toBe(
      'No public release of bracketeer has been published.',
    );
  });
  it.each([
    'error sending request',
    'DNS lookup',
    'connect refused',
    'timed out',
    'TIMEOUT',
    'offline',
    'Network error',
    'Failed to fetch',
    'ENOTFOUND',
    'URLError',
  ])('explains network errors: %s', (raw) => {
    expect(friendlyUpdateError(raw)).toBe(
      'No internet connection, or github.com did not answer.',
    );
  });
  it.each([
    'certificate verify failed',
    'CERTIFICATE_VERIFY_FAILED',
    'invalid peer certificate: UnknownIssuer',
    'error sending request: invalid peer certificate: UnknownIssuer',
  ])('explains certificate errors before network errors: %s', (raw) => {
    expect(friendlyUpdateError(raw)).toBe(
      'Could not verify the secure connection to github.com.',
    );
  });
  it.each([
    'the signature could not be verified',
    'minisign verification failed',
    'Verify error',
    'signature error: base64 decode failed',
  ])('explains updater signature errors: %s', (raw) => {
    expect(friendlyUpdateError(raw)).toBe(
      "The update's signature did not match. Nothing was installed.",
    );
  });
  it.each([
    'install folder not writable',
    'Read-only file system',
    'Permission denied (os error 13)',
    'Access is denied. (os error 5)',
  ])('explains unwritable installs: %s', (raw) => {
    expect(friendlyUpdateError(raw)).toBe(UNSUPPORTED_FOLDER_REASON);
    expect(friendlyUpdateError(raw)).toBe(
      'bracketeer cannot replace itself in this folder. Download the new version from GitHub.',
    );
  });
  it.each([
    [
      'public key certificate signature 404 network not writable',
      'Updates are not configured for this build yet.',
    ],
    [
      'certificate Verify 404 network not writable',
      'Could not verify the secure connection to github.com.',
    ],
    [
      'signature 404 network not writable',
      "The update's signature did not match. Nothing was installed.",
    ],
    [
      'HTTP 404 network not writable',
      'No public release of bracketeer has been published.',
    ],
    [
      'network not writable',
      'No internet connection, or github.com did not answer.',
    ],
  ])('uses canonical classification order for %s', (raw, expected) => {
    expect(friendlyUpdateError(raw)).toBe(expected);
  });
  it('prioritizes configuration and release errors over network wording', () => {
    expect(friendlyUpdateError('Network: public key not configured')).toBe(
      'Updates are not configured for this build yet.',
    );
    expect(friendlyUpdateError('error sending request: 404 not found')).toBe(
      'No public release of bracketeer has been published.',
    );
  });
  it('trims unknown errors and caps the raw detail at 120 characters', () => {
    expect(friendlyUpdateError('decode failed')).toBe(
      'The update check failed: decode failed',
    );
    expect(friendlyUpdateError('  Unexpected response  ')).toBe(
      'The update check failed: Unexpected response',
    );
    expect(friendlyUpdateError('x'.repeat(200))).toBe(
      `The update check failed: ${'x'.repeat(119)}…`,
    );
  });
});

describe('updateErrorDetails', () => {
  it('keeps raw errors selectable in the view, trims and limits them to 120 characters', () => {
    expect(
      updateErrorDetails('  invalid peer certificate: UnknownIssuer  '),
    ).toBe('invalid peer certificate: UnknownIssuer');
    const details = updateErrorDetails('x'.repeat(200));
    expect(details).toBe(`${'x'.repeat(119)}…`);
    expect(details).toHaveLength(120);
    expect(
      checkButtonView({ kind: 'error', message: 'x'.repeat(200) }, '0.1.0')
        .details,
    ).toBe(details);
    expect(updateErrorDetails('x'.repeat(120))).toBe('x'.repeat(120));
  });
});

describe('checkButtonView', () => {
  const cases: [
    UpdateStatus,
    string,
    'download' | 'install' | 'link' | null,
    boolean,
    boolean,
  ][] = [
    [{ kind: 'idle' }, 'Current version: v0.1.0', null, false, false],
    [{ kind: 'checking' }, 'Checking for updates…', null, false, true],
    [{ kind: 'none', checkedAt: 1 }, 'Up to date (v0.1.0)', null, false, false],
    [
      { kind: 'available', info },
      'Update available: v0.2.0',
      'download',
      true,
      false,
    ],
    [
      { kind: 'downloading', info, pct: 43 },
      'Downloading v0.2.0… 43%',
      null,
      false,
      true,
    ],
    [
      { kind: 'downloading', info, pct: null },
      'Downloading v0.2.0…',
      null,
      false,
      true,
    ],
    [{ kind: 'ready', info: ready }, 'v0.2.0 is ready', 'install', true, false],
    [
      { kind: 'installing', info: ready },
      'Installing v0.2.0 and restarting…',
      null,
      false,
      true,
    ],
    [
      { kind: 'error', message: 'offline' },
      'No internet connection, or github.com did not answer.',
      null,
      false,
      false,
    ],
    [
      { kind: 'unsupported', reason: 'Browser build' },
      'Browser build',
      null,
      false,
      false,
    ],
    [
      { kind: 'unsupported', reason: UNSUPPORTED_FOLDER_REASON, info },
      UNSUPPORTED_FOLDER_REASON,
      'link',
      true,
      false,
    ],
  ];
  it.each(cases)('renders %j', (status, text, action, badge, busy) => {
    expect(checkButtonView(status, '0.1.0', false)).toEqual({
      text,
      secondaryText:
        status.kind === 'available' ? 'Current version: v0.1.0' : null,
      details: status.kind === 'error' ? status.message : null,
      action,
      badge,
      busy,
    });
  });
  it('leaves automatic downloads to the shared updater', () => {
    expect(
      checkButtonView({ kind: 'available', info }, '0.1.0').action,
    ).toBeNull();
  });
});
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
        autoDownload: true,
        lastCheck: null,
        lastResult: null,
        lastSeenVersion: null,
        pendingNotes: null,
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
      autoDownload: false,
      lastCheck: 123,
      lastResult: 'Up to date',
      lastSeenVersion: '0.1.0',
      pendingNotes: { version: '0.1.1', notes: 'New printing.' },
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

describe('stable preference migration', () => {
  it.each(['beta', 'stable'])(
    'removes a saved %s channel and preserves other settings',
    (channel) => {
      let raw = JSON.stringify({
        channel,
        autoDownload: false,
        lastCheck: 123,
        lastResult: 'Previous result',
        lastSeenVersion: '0.1.0',
      });
      const storage = {
        getItem: () => raw,
        setItem: (_key: string, value: string) => {
          raw = value;
        },
      };
      const prefs = loadPrefs(storage);
      expect(prefs).toMatchObject({
        autoDownload: false,
        lastCheck: 123,
        lastResult: 'Previous result',
        lastSeenVersion: '0.1.0',
      });
      expect(prefs).not.toHaveProperty('channel');
      expect(JSON.parse(raw)).not.toHaveProperty('channel');
    },
  );
});

describe("what's new policy", () => {
  const prefs = loadPrefs({ getItem: () => null, setItem() {} });
  it('records a first install without showing a card', () => {
    const result = whatsNew('0.1.0', prefs, 'First release.');
    expect(result.show).toBe(false);
    expect(result.prefs.lastSeenVersion).toBe('0.1.0');
    expect(result.notes).toBe('First release.');
  });
  it('shows a newer running version once, including manual reinstalls', () => {
    const result = whatsNew(
      '0.1.1',
      { ...prefs, lastSeenVersion: '0.1.0' },
      'New printing.',
    );
    expect(result.show).toBe(true);
    expect(whatsNew('0.1.1', result.prefs, 'New printing.').show).toBe(false);
    expect(whatsNew('0.1.0', result.prefs, 'First release.').show).toBe(false);
  });
  it('prefers bundled notes to saved manifest notes', () => {
    const result = whatsNew(
      '0.1.1',
      {
        ...prefs,
        lastSeenVersion: '0.1.0',
        pendingNotes: { version: '0.1.1', notes: 'Manifest notes' },
      },
      'Bundled notes',
    );
    expect(result.notes).toBe('Bundled notes');
    expect(result.prefs.pendingNotes?.notes).toBe('Manifest notes');
  });
  it('uses saved notes for the matching version when bundled notes are absent or blank', () => {
    for (const bundled of [undefined, '  ']) {
      const result = whatsNew(
        '9.9.9',
        {
          ...prefs,
          lastSeenVersion: '0.1.0',
          pendingNotes: { version: '9.9.9', notes: 'Manifest notes' },
        },
        bundled,
      );
      expect(result.notes).toBe('Manifest notes');
      expect(result.show).toBe(true);
      expect(whatsNew('9.9.9', result.prefs, undefined).notes).toBe(
        'Manifest notes',
      );
    }
  });
  it('falls back to the running version and retains notes for a future version', () => {
    const result = whatsNew(
      '9.9.9',
      {
        ...prefs,
        lastSeenVersion: '0.1.0',
        pendingNotes: { version: '10.0.0', notes: 'Future notes' },
      },
      undefined,
    );
    expect(result.notes).toBe('Updated to v9.9.9.');
    expect(result.prefs.pendingNotes?.version).toBe('10.0.0');
    expect(whatsNew('9.9.9', prefs, undefined).notes).toBe(
      'Updated to v9.9.9.',
    );
  });
});

describe('release note links', () => {
  it('links to this repository and the exact release tag', () => {
    expect(releaseNotesUrl('0.1.1')).toBe(
      'https://github.com/duserzym/bracketeer/releases/tag/v0.1.1',
    );
  });
  it.each([
    '',
    '../evil',
    '0.1.1?evil',
    '0.1.1#evil',
    '0.1.1/../../settings',
    'https://evil.test',
    '0.1.1\n',
  ])('rejects unsafe version %j', (version) => {
    expect(() => releaseNotesUrl(version)).toThrow('Invalid release version');
  });
});
