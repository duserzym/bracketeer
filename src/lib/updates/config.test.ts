import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkButtonView, STABLE_ENDPOINT } from './updates';

const config = JSON.parse(
  readFileSync(
    new URL('../../../src-tauri/tauri.conf.json', import.meta.url),
    'utf8',
  ),
);
const releaseConfig = JSON.parse(
  readFileSync(
    new URL('../../../src-tauri/tauri.release.conf.json', import.meta.url),
    'utf8',
  ),
);

function validMinisignPublicKey(value: string): boolean {
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) return false;
  const lines = decoded.toString('utf8').trimEnd().split(/\r?\n/);
  if (
    lines.length !== 2 ||
    !/^untrusted comment: minisign public key: .+$/.test(lines[0]!) ||
    !/^RW[A-Za-z0-9+/]+={0,2}$/.test(lines[1]!)
  )
    return false;
  const key = Buffer.from(lines[1]!, 'base64');
  return (
    key.toString('base64') === lines[1] &&
    key.length === 42 &&
    key.subarray(0, 2).toString('ascii') === 'Ed'
  );
}

describe('updater configuration', () => {
  it('uses only the canonical stable feed', () => {
    const endpoint =
      'https://github.com/duserzym/bracketeer/releases/latest/download/latest.json';
    expect(config.plugins.updater.endpoints).toEqual([endpoint]);
    expect(STABLE_ENDPOINT).toBe(endpoint);
  });

  it('creates signed updater artifacts in release builds', () => {
    expect(releaseConfig.bundle.createUpdaterArtifacts).toBe(true);
  });

  it('has an empty key with a clear UI message, or a valid minisign public key', () => {
    const key: unknown = config.plugins.updater.pubkey;
    expect(typeof key).toBe('string');
    if (key === '') {
      // update_check returns this raw error for the empty configured key.
      expect(
        checkButtonView(
          { kind: 'error', message: 'Updater pubkey is empty' },
          config.version,
        ).text,
      ).toBe('Updates are not configured for this build yet.');
    } else {
      expect(validMinisignPublicKey(key as string)).toBe(true);
    }
  });

  it('validates both layers of minisign public-key encoding', () => {
    // Synthetic public bytes, used only to exercise the nonempty-key check.
    const key = Buffer.concat([Buffer.from('Ed'), Buffer.alloc(40)]).toString(
      'base64',
    );
    const encode = (text: string) => Buffer.from(text).toString('base64');
    const comment = 'untrusted comment: minisign public key: TEST';
    expect(validMinisignPublicKey(encode(`${comment}\n${key}\n`))).toBe(true);
    for (const invalid of [
      '',
      'not base64',
      `${encode(`${comment}\n${key}`)}!`,
      encode(`wrong comment\n${key}`),
      encode(`${comment}\n${key}!`),
      encode(`${comment}\n${Buffer.from('Ed').toString('base64')}`),
      encode(`${comment}\n${Buffer.alloc(42).toString('base64')}`),
    ])
      expect(validMinisignPublicKey(invalid)).toBe(false);
  });
});

describe('bundled release notes', () => {
  const directory = new URL('../../../release-notes/', import.meta.url);
  it('includes the running version', () => {
    expect(readdirSync(directory)).toContain(`${config.version}.md`);
  });
  it('keeps every notes file short and user-facing, without headings', () => {
    for (const file of readdirSync(directory).filter((file) =>
      file.endsWith('.md'),
    )) {
      const notes = readFileSync(new URL(file, directory), 'utf8');
      expect(notes.trim(), file).not.toBe('');
      expect([...notes].length, file).toBeLessThanOrEqual(600);
      expect(notes, file).not.toMatch(/^\s*#/m);
      expect(notes.match(/^- /gm)?.length ?? 0, file).toBeLessThanOrEqual(5);
    }
  });
});
