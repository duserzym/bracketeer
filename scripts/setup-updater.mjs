// Owner-only setup: pnpm updater:setup. Never run this as part of a build.
// The private key stays in ~/.tauri; only the public key goes in the config.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dir = join(homedir(), '.tauri');
const key = join(dir, 'bracketeer-updater.key');
mkdirSync(dir, { recursive: true });
if (!existsSync(key)) {
  execFileSync(
    'cargo',
    ['tauri', 'signer', 'generate', '-w', key, '-p', '', '--ci'],
    {
      stdio: 'inherit',
    },
  );
} else {
  console.log(`Using existing key ${key}`);
}
const pub = readFileSync(`${key}.pub`, 'utf8').trim();
const confPath = new URL('../src-tauri/tauri.conf.json', import.meta.url);
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
conf.plugins.updater.pubkey = pub;
writeFileSync(confPath, JSON.stringify(conf, null, 2) + '\n');
console.log(
  'Public key written to src-tauri/tauri.conf.json. Commit this change.',
);
try {
  execFileSync(
    'gh',
    [
      'secret',
      'set',
      'TAURI_SIGNING_PRIVATE_KEY',
      '--repo',
      'duserzym/bracketeer',
    ],
    {
      input: readFileSync(key),
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
  console.log('GitHub secret TAURI_SIGNING_PRIVATE_KEY set.');
} catch {
  console.log(
    `Add the contents of ${key} as the repository secret TAURI_SIGNING_PRIVATE_KEY.`,
  );
}
console.log(
  'Back up the private key. Installed copies need it to verify future updates.',
);
