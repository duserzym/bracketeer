import { afterEach, describe, expect, it } from 'vitest';
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, releaseFeed, verifyArtifact } from './release-feed.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

// Synthetic minisign writer used only in tests. No lab signing key is read.
function signer() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const id = randomBytes(8);
  const rawKey = publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(-32);
  const pub = Buffer.concat([Buffer.from('Ed'), id, rawKey]).toString('base64');
  const pubkey = Buffer.from(
    `untrusted comment: minisign public key: TEST\n${pub}\n`,
  ).toString('base64');
  return {
    pubkey,
    signature(bytes, alg = 'ED') {
      const sig = sign(
        null,
        alg === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes,
        privateKey,
      );
      const trusted = 'timestamp:1234567890\tfile:synthetic.app.tar.gz';
      const packet = Buffer.concat([Buffer.from(alg), id, sig]).toString(
        'base64',
      );
      const global = sign(
        null,
        Buffer.concat([sig, Buffer.from(trusted)]),
        privateKey,
      ).toString('base64');
      return Buffer.from(
        `untrusted comment: signature\n${packet}\ntrusted comment: ${trusted}\n${global}\n`,
      ).toString('base64');
    },
  };
}
function mutate(signature, change) {
  const lines = Buffer.from(signature, 'base64')
    .toString()
    .trimEnd()
    .split('\n');
  change(lines);
  return Buffer.from(`${lines.join('\n')}\n`).toString('base64');
}
function packetChange(lines, offset, value) {
  const packet = Buffer.from(lines[1], 'base64');
  if (value) packet.write(value, offset, 'ascii');
  else packet[offset] ^= 1;
  lines[1] = packet.toString('base64');
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bracketeer-feed-'));
  roots.push(root);
  mkdirSync(join(root, 'src-tauri'));
  mkdirSync(join(root, 'release-notes'));
  const key = signer();
  writeFileSync(
    join(root, 'src-tauri/tauri.conf.json'),
    JSON.stringify({
      version: '0.1.1',
      plugins: { updater: { pubkey: key.pubkey } },
    }),
  );
  writeFileSync(
    join(root, 'release-notes/0.1.1.md'),
    '- Print sheets fit A4 and Letter.\n',
  );
  const bytes = Buffer.from('small synthetic update bytes');
  for (const file of ['bracketeer.app.tar.gz', 'bracketeer-setup.exe']) {
    writeFileSync(join(root, file), bytes);
    writeFileSync(join(root, `${file}.sig`), key.signature(bytes));
  }
  return {
    root,
    key,
    bytes,
    options: {
      root,
      darwinAarch64: 'bracketeer.app.tar.gz',
      out: 'latest.json',
      now: new Date('2026-11-20T12:00:00Z'),
    },
  };
}

describe('minisign verification', () => {
  it.each(['ED', 'Ed'])(
    'verifies %s artifacts and their trusted comments',
    (alg) => {
      const key = signer();
      const bytes = Buffer.from('synthetic update');
      expect(() =>
        verifyArtifact(bytes, key.signature(bytes, alg), key.pubkey),
      ).not.toThrow();
    },
  );
  it.each([
    ['artifact signature', (lines) => packetChange(lines, 10)],
    ['key ids', (lines) => packetChange(lines, 2)],
    ['signature packet', (lines) => packetChange(lines, 0, 'XX')],
    [
      'Global signature',
      (lines) => {
        lines[2] += ' changed';
      },
    ],
    [
      'Global signature',
      (lines) => {
        const sig = Buffer.from(lines[3], 'base64');
        sig[0] ^= 1;
        lines[3] = sig.toString('base64');
      },
    ],
    [
      'signature file',
      (lines) => {
        lines.pop();
      },
    ],
    [
      'signature packet',
      (lines) => {
        lines[1] = Buffer.alloc(10).toString('base64');
      },
    ],
  ])('rejects damaged %s', (message, change) => {
    const key = signer();
    const bytes = Buffer.from('synthetic update');
    expect(() =>
      verifyArtifact(bytes, mutate(key.signature(bytes), change), key.pubkey),
    ).toThrow(new RegExp(message, 'i'));
  });
  it('rejects changed artifacts, an unrelated key and malformed or empty encodings', () => {
    const key = signer();
    const bytes = Buffer.from('synthetic update');
    const signature = key.signature(bytes);
    expect(() =>
      verifyArtifact(Buffer.from('changed'), signature, key.pubkey),
    ).toThrow('Artifact signature');
    expect(() => verifyArtifact(bytes, signature, signer().pubkey)).toThrow(
      'key ids',
    );
    for (const invalid of [
      '',
      'not base64',
      `${key.pubkey}!`,
      Buffer.from('bad public key').toString('base64'),
    ])
      expect(() => verifyArtifact(bytes, signature, invalid)).toThrow();
    expect(() => verifyArtifact(bytes, 'bad signature', key.pubkey)).toThrow();
    const pubLines = Buffer.from(key.pubkey, 'base64')
      .toString()
      .trimEnd()
      .split('\n');
    pubLines[1] = Buffer.alloc(42).toString('base64');
    expect(() =>
      verifyArtifact(
        bytes,
        signature,
        Buffer.from(pubLines.join('\n')).toString('base64'),
      ),
    ).toThrow('public key');
  });
});

describe('release feed', () => {
  it('writes the stable macOS feed with the configured version, notes and signature', () => {
    const { root, options } = fixture();
    const feed = releaseFeed(options);
    expect(JSON.parse(readFileSync(join(root, 'latest.json'), 'utf8'))).toEqual(
      {
        version: '0.1.1',
        notes: '- Print sheets fit A4 and Letter.',
        pub_date: '2026-11-20T12:00:00.000Z',
        platforms: {
          'darwin-aarch64': {
            url: 'https://github.com/duserzym/bracketeer/releases/download/v0.1.1/bracketeer.app.tar.gz',
            signature: readFileSync(
              join(root, 'bracketeer.app.tar.gz.sig'),
              'utf8',
            ),
          },
        },
      },
    );
    expect(Object.keys(feed.platforms)).toEqual(['darwin-aarch64']);
  });
  it('accepts an explicit version and the optional signed Windows installer', () => {
    const { root, options } = fixture();
    writeFileSync(join(root, 'release-notes/0.1.2.md'), 'Updated printing.');
    const feed = releaseFeed({
      ...options,
      version: '0.1.2',
      windowsX86_64: 'bracketeer-setup.exe',
    });
    expect(feed.version).toBe('0.1.2');
    expect(feed.platforms['windows-x86_64'].url).toBe(
      'https://github.com/duserzym/bracketeer/releases/download/v0.1.2/bracketeer-setup.exe',
    );
    expect(Object.keys(feed.platforms)).toHaveLength(2);
  });
  it.each([null, '', ' \n ', 'x'.repeat(601)])(
    'refuses missing, empty or overlong notes (%s)',
    (notes) => {
      const { root, options } = fixture();
      const path = join(root, 'release-notes/0.1.1.md');
      if (notes === null) rmSync(path);
      else writeFileSync(path, notes);
      expect(() => releaseFeed(options)).toThrow();
      expect(existsSync(join(root, 'latest.json'))).toBe(false);
    },
  );
  it('accepts exactly 600 characters', () => {
    const { root, options } = fixture();
    writeFileSync(join(root, 'release-notes/0.1.1.md'), 'x'.repeat(600));
    expect(releaseFeed(options).notes).toHaveLength(600);
  });
  it.each([
    'bracketeer.app.tar.gz',
    'bracketeer.app.tar.gz.sig',
    'bracketeer-setup.exe',
    'bracketeer-setup.exe.sig',
  ])('refuses missing %s without replacing an existing feed', (file) => {
    const { root, options } = fixture();
    writeFileSync(join(root, 'latest.json'), 'previous feed');
    rmSync(join(root, file));
    expect(() =>
      releaseFeed({ ...options, windowsX86_64: 'bracketeer-setup.exe' }),
    ).toThrow();
    expect(readFileSync(join(root, 'latest.json'), 'utf8')).toBe(
      'previous feed',
    );
  });
  it('verifies every platform before writing', () => {
    const { root, options } = fixture();
    writeFileSync(join(root, 'bracketeer-setup.exe'), 'tampered');
    expect(() =>
      releaseFeed({ ...options, windowsX86_64: 'bracketeer-setup.exe' }),
    ).toThrow('signature');
    expect(existsSync(join(root, 'latest.json'))).toBe(false);
  });
  it.each(['', 'invalid'])(
    'refuses an invalid configured pubkey (%s)',
    (pubkey) => {
      const { root, options } = fixture();
      writeFileSync(
        join(root, 'src-tauri/tauri.conf.json'),
        JSON.stringify({ version: '0.1.1', plugins: { updater: { pubkey } } }),
      );
      expect(() => releaseFeed(options)).toThrow(/pubkey/);
      expect(existsSync(join(root, 'latest.json'))).toBe(false);
    },
  );
  it('rejects missing required artifacts, prereleases and unknown or incomplete CLI flags', () => {
    const { options } = fixture();
    expect(() => releaseFeed({ ...options, darwinAarch64: undefined })).toThrow(
      '--darwin-aarch64',
    );
    for (const version of ['../bad', '0.1.1-beta.1', 'bad'])
      expect(() => releaseFeed({ ...options, version })).toThrow(
        'stable version',
      );
    for (const argv of [
      ['--other', 'value'],
      ['--version'],
      ['--version', '--out'],
      ['--version', '0.1.1', '--version', '0.1.2'],
    ])
      expect(() => main(argv)).toThrow('Usage');
  });
});
