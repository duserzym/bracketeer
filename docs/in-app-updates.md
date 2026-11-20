# In-app updates

Every app of the lab workflow updates itself the way repohub and CodexBar do:
a quiet check in the background, a download when allowed, and one "Update
ready, restart now" action. The version is always visible in a corner of the
canvas, and a click there opens the Updates panel. This page is the same in
every repository; the last section is the part specific to this one.

## Mechanism (Tauri apps)

- `tauri-plugin-updater` 2 reads a `latest.json` from GitHub Releases, compares
  the version with the running build, downloads the signed update bundle and
  verifies its minisign signature against the public key compiled into
  `tauri.conf.json` (`plugins.updater.pubkey`). An update that does not verify
  is refused.
- The app's own Rust commands (`update_check`, `update_download`,
  `update_install`, `update_status`) wrap the plugin, so the web page never
  needs the plugin's JavaScript permissions. `update_install` installs the
  downloaded bytes and restarts the app.
- The page checks 8 seconds after launch and every 6 hours. With
  "Download updates automatically" on (the default), an available update is
  downloaded quietly and the button gains a badge when ready. With it
  off, the popover says "Update available: vX.Y.Z" and offers Download.
- Every app follows the latest stable public release from
  `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`.
  Old channel preferences migrate silently to stable. No channel selector or
  release-list request remains.
- Hosted inside UPb Studio (the `@lab/bridge` transport is `tauri` or
  `postMessage`), a module never runs its own updater: the shell updates
  itself and the modules it pins in `modules.lock.json`. The chip is hidden
  there; the shell's own Updates panel lists the module versions.
- The static web build (no Tauri) shows the version chip but cannot update
  itself; the panel says so and links to the releases page.

## What the user sees

- **Check for updates**: a circular-arrows button beside the always-visible
  `vX.Y.Z` chip. Its icon rotates while busy and carries a badge for an update.
  Clicking it checks and opens a popover; **Update settings…** opens the panel.
- **Updates panel**: current version, canonical update state, last check time
  and result, **Check now**, **Download** (when automatic downloads are off),
  **Restart to update** and **Download updates automatically**.
- Available and ready states show the manifest's plain-text notes, clamped to
  four lines, and **Release notes** opens that version's GitHub release in the
  system browser. The native opener permits only this repository's HTTPS
  release-tag URLs.
- After an upgrade, **What's new in vX.Y.Z** appears once beside the check
  button. Dismiss with the close button or Esc; **What's new** in the popover
  opens it again. First installs only record their version. Notes bundled at
  build time cover manual reinstalls too; saved manifest notes are the fallback,
  followed by `Updated to vX.Y.Z.` when neither source has notes.
- No telemetry is sent. A check requests only the stable `latest.json` feed.

## Releasing

1. Write `release-notes/X.Y.Z.md`: plain text or at most five short `- ` bullets,
   no headings, at most 600 characters. Describe changes for lab users. The
   running version's file is bundled into the app; commit the notes with the
   release's version changes (all three version copies must agree).
2. Build with the signing key available:

   ```bash
   TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/bracketeer-updater.key)" cargo tauri build --config src-tauri/tauri.release.conf.json
   ```

   Build the optional Windows installer with the same release config and key.
   Keep the `.sig` files beside their artifacts.

3. Create the stable feed (version defaults to `src-tauri/tauri.conf.json`):

   ```bash
   node scripts/release-feed.mjs --darwin-aarch64 src-tauri/target/release/bundle/macos/bracketeer.app.tar.gz --out latest.json
   ```

   Add `--windows-x86_64 <path-to-setup.exe>` when available, and `--version X.Y.Z`
   only when needed. The script refuses missing, empty or overlong notes, an
   empty/invalid public key, missing signatures, mismatched key IDs or either
   failed minisign signature. It verifies every artifact before writing.

4. Upload the `.dmg`, `.app.tar.gz`, its `.sig` and `latest.json` to the public
   stable GitHub release tagged `vX.Y.Z`. Also upload the Windows installer and
   its `.sig` when included in the feed. Publish the release so installed copies
   can find it at their next check. Existing release workflows are unchanged.

## One-time setup per repository (the owner does this)

1. Generate the signing key and write the public key into `tauri.conf.json`:

   ```bash
   node scripts/setup-updater.mjs
   ```

   The private key lands in `~/.tauri/<app>-updater.key` (back it up: losing
   it means installed copies cannot verify future updates). The script writes
   the public key into `src-tauri/tauri.conf.json`; commit that change.

2. Store the private key as the repository secret `TAURI_SIGNING_PRIVATE_KEY`
   (the script does it with `gh secret set` when `gh` is signed in; otherwise
   paste the file's contents in GitHub > Settings > Secrets and variables >
   Actions). The key has no password, so `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
   stays unset.
3. Nothing else: GitHub Releases is the only hosting the updater needs, and
   the default `GITHUB_TOKEN` can publish releases in the same repository.

## Checks in the repository

- Unit tests cover version comparison, stable preference migration, release-note fallbacks
  and the update state machine (`updates.test.*`).
- `scripts/release-feed.test.mjs` generates synthetic Ed25519 keys and verifies
  raw/prehashed signatures, trusted comments, tampering and feed validation.
- A browser test renders the chip and the panel in every state at
  1440 x 900 and 1280 x 800, light and dark, using the `?update-preview=`
  query (`ready`, `available`, `downloading`, `error`, `none`) that the page
  honours outside Tauri.
- `SCREENSHOTS=1 pnpm e2e --project=chromium updates.spec.ts` writes chip and panel screenshots with synthetic samples to `docs/screenshots/synthetic-updates-*.png`.

## bracketeer specifics

- Tauri project: `src-tauri/`. Updater code: `src-tauri/src/updater.rs`; page
  side `src/lib/updates/updates.ts` (pure version, preference and notes logic plus the
  state machine, unit-tested in `src/lib/updates/updates.test.ts`),
  `src/lib/updates/updater.svelte.ts` (scheduler and Tauri calls),
  `src/lib/updates/VersionChip.svelte` (in the top bar, on every step) and
  `src/lib/updates/UpdatesPanel.svelte` (a dialog opened from the chip; there
  is no Settings screen in bracketeer).
- Version copies that must agree: `package.json`, `src-tauri/tauri.conf.json`
  and `src-tauri/Cargo.toml`; the release workflow refuses a tag that does not
  match them.
- Signing key: `~/.tauri/bracketeer-updater.key`; setup script
  `scripts/setup-updater.mjs` (Node 22 and `cargo tauri` 2, run from the repository root).
- Release workflow: `.github/workflows/release.yml` (macOS arm64 `.app` and
  `.dmg`, Windows NSIS installer, plus the portable `bracketeer-portable.exe`
  for the instrument PC). The release is a draft; publish it on GitHub and the
  updater endpoint starts serving it. A manual run keeps the files as workflow
  artifacts.
- Windows: only a copy installed with the installer can update itself. The
  portable exe shows the version, skips scheduled checks, and offers **Check now**;
  when an update is available it shows "Update available" and offers the download page instead (the app knows it is portable when no `uninstall.exe`
  sits next to it).
- Update endpoint: `https://github.com/duserzym/bracketeer/releases/latest/download/latest.json`.
- Settings: `localStorage['bracketeer.updates']` holds the automatic-download
  switch, last check, `lastSeenVersion` and saved manifest notes (per computer,
  never in a project file).
