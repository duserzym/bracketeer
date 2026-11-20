#!/usr/bin/env node
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));

function decodeBase64(text, label) {
  if (
    !text ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      text,
    )
  )
    throw new Error(`Invalid ${label} base64`);
  const bytes = Buffer.from(text, 'base64');
  if (bytes.toString('base64') !== text)
    throw new Error(`Invalid ${label} base64`);
  return bytes;
}

/** Verify both minisign signatures before an artifact can enter the feed. */
export function verifyArtifact(bytes, signature, pubkey) {
  const pubLines = decodeBase64(pubkey.trim(), 'pubkey')
    .toString('utf8')
    .trimEnd()
    .split(/\r?\n/);
  if (pubLines.length !== 2 || !pubLines[0].startsWith('untrusted comment: '))
    throw new Error('Invalid pubkey file');
  const pub = decodeBase64(pubLines[1], 'public key');
  if (pub.length !== 42 || pub.subarray(0, 2).toString('ascii') !== 'Ed')
    throw new Error('Invalid minisign public key');
  const lines = decodeBase64(signature.trim(), 'signature')
    .toString('utf8')
    .trimEnd()
    .split(/\r?\n/);
  if (
    lines.length !== 4 ||
    !lines[0].startsWith('untrusted comment: ') ||
    !lines[2].startsWith('trusted comment: ')
  )
    throw new Error('Invalid minisign signature file');
  const packet = decodeBase64(lines[1], 'signature packet');
  const global = decodeBase64(lines[3], 'global signature');
  const alg = packet.subarray(0, 2).toString('ascii');
  if (
    packet.length !== 74 ||
    !['Ed', 'ED'].includes(alg) ||
    global.length !== 64
  )
    throw new Error('Invalid minisign signature packet');
  if (!pub.subarray(2, 10).equals(packet.subarray(2, 10)))
    throw new Error('Minisign key ids do not match');
  const key = createPublicKey({
    key: Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      pub.subarray(10),
    ]),
    format: 'der',
    type: 'spki',
  });
  const sig = packet.subarray(10);
  const message =
    alg === 'ED' ? createHash('blake2b512').update(bytes).digest() : bytes;
  if (!verify(null, message, key, sig))
    throw new Error('Artifact signature did not verify');
  const trusted = Buffer.from(
    lines[2].slice('trusted comment: '.length),
    'utf8',
  );
  if (!verify(null, Buffer.concat([sig, trusted]), key, global))
    throw new Error('Global signature did not verify');
}

export function releaseFeed({
  root = repoRoot,
  version,
  darwinAarch64,
  windowsX86_64,
  out = 'latest.json',
  now = new Date(),
}) {
  const config = JSON.parse(
    readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'),
  );
  version ??= config.version;
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('A stable version X.Y.Z is required');
  const pubkey = config.plugins?.updater?.pubkey;
  if (typeof pubkey !== 'string' || !pubkey.trim())
    throw new Error('Updater pubkey is empty');
  const notesPath = resolve(root, 'release-notes', `${version}.md`);
  const rawNotes = readFileSync(notesPath, 'utf8');
  const notes = rawNotes.trim();
  if (!notes || [...rawNotes].length > 600)
    throw new Error('Release notes must contain 1–600 characters');
  if (!darwinAarch64) throw new Error('--darwin-aarch64 is required');
  const platforms = {};
  for (const [platform, path] of [
    ['darwin-aarch64', darwinAarch64],
    ['windows-x86_64', windowsX86_64],
  ]) {
    if (!path) continue;
    const artifact = resolve(root, path);
    const signature = readFileSync(`${artifact}.sig`, 'utf8').trim();
    verifyArtifact(readFileSync(artifact), signature, pubkey);
    platforms[platform] = {
      url: `https://github.com/duserzym/bracketeer/releases/download/v${version}/${encodeURIComponent(basename(artifact))}`,
      signature,
    };
  }
  const feed = { version, notes, pub_date: now.toISOString(), platforms };
  // No output is written until every supplied artifact and signature verifies.
  writeFileSync(resolve(root, out), `${JSON.stringify(feed, null, 2)}\n`);
  return feed;
}

export function main(argv) {
  const flags = {
    '--version': 'version',
    '--darwin-aarch64': 'darwinAarch64',
    '--windows-x86_64': 'windowsX86_64',
    '--out': 'out',
  };
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = flags[argv[i]];
    const value = argv[i + 1];
    if (!flag || !value || value.startsWith('--') || flag in options)
      throw new Error(
        'Usage: node scripts/release-feed.mjs [--version X.Y.Z] --darwin-aarch64 <app.tar.gz> [--windows-x86_64 <setup.exe>] --out latest.json',
      );
    options[flag] = value;
  }
  return releaseFeed(options);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
