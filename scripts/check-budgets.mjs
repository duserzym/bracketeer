import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

for (const directory of ['dist', 'dist/tauri']) {
  const html = join(directory, 'index.html');
  if (!existsSync(html)) continue;
  const entry = readFileSync(html, 'utf8').match(
    /<script\b[^>]*\bsrc="\.\/(assets\/index-[^"]+\.js)"/,
  )?.[1];
  assert(entry, `${html}: missing entry JS chunk`);
  const entries = readdirSync(join(directory, 'assets')).filter((name) =>
    /^index-.*\.js$/.test(name),
  );
  assert.deepEqual(
    entries,
    [entry.slice('assets/'.length)],
    `${directory}/assets: stale index JS chunks`,
  );
  const bytes = statSync(join(directory, entry)).size;
  assert(bytes < 250_000, `${directory}/${entry}: ${bytes} B exceeds 250 KB`);
  console.log(
    `Budget OK: ${directory}/${entry} = ${bytes} B; no stale entry chunks`,
  );
}

for (const binary of [
  'dist/windows/bracketeer.exe',
  'dist/macos/bracketeer.app/Contents/MacOS/bracketeer',
]) {
  if (!existsSync(binary)) continue;
  const bytes = statSync(binary).size;
  assert(bytes < 50_000_000, `${binary}: ${bytes} B exceeds 50 MB`);
  console.log(`Budget OK: ${binary} = ${bytes} B`);
}
