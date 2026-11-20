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
  downloaded quietly and the chip turns into "Update ready, restart". With it
  off, the chip says "Update available" and the panel offers Download.
- Channels: **Stable** reads `https://github.com/<owner>/<repo>/releases/latest/download/latest.json`,
  which GitHub resolves to the newest published, non-pre-release release.
  **Beta** lists the repository's releases through the GitHub API, skips
  drafts, and takes `latest.json` from the newest release, pre-releases
  included. A tag like `v0.4.0-beta.1` becomes a pre-release and only the Beta
  channel receives it.
- Hosted inside UPb Studio (the `@lab/bridge` transport is `tauri` or
  `postMessage`), a module never runs its own updater: the shell updates
  itself and the modules it pins in `modules.lock.json`. The chip is hidden
  there; the shell's own Updates panel lists the module versions.
- The static web build (no Tauri) shows the version chip but cannot update
  itself; the panel says so and links to the releases page.

## What the user sees

- **Version chip**: a small pill in the bottom-right corner of the window on
  every screen: `v1.2.3`. It becomes `Update available` or
  `Update ready, restart` with a dot when there is something to do, shows a
  spinner while checking or downloading, and `Check failed` after an error.
  Clicking it opens Settings > Updates.
- **Settings > Updates**: current version, the last check time and result,
  **Check now**, **Download** (when automatic downloads are off), **Restart to
  update** (when the download is done), "Download updates automatically",
  the channel (Stable / Beta), and a link to the release notes.
- Nothing is sent anywhere: the check is one GET of `latest.json` (and the
  releases list on Beta). No telemetry.

## Release flow

1. Bump the version (the three copies must agree; see the repository section),
   commit and push.
2. Tag `vX.Y.Z` (or `vX.Y.Z-beta.N` for the Beta channel) and push the tag.
3. The release workflow (`v*` tags and manual dispatch only, never on push)
   builds the installers, signs the update bundles with the private key from
   the `TAURI_SIGNING_PRIVATE_KEY` secret, and creates a draft GitHub Release with
   the installers, the signed bundles (`.app.tar.gz` + `.sig` on macOS,
   `.exe`/`.msi` + `.sig` on Windows) and `latest.json`.
4. Publish the draft on GitHub. Installed copies see the new version at their next check.

A manual run (`gh workflow run <name>`) builds the same artifacts and keeps
them as workflow artifacts without publishing a release; it is the dry run.

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

- Unit tests cover version comparison, channel selection and the update state
  machine (`updates.test.*`).
- A browser test renders the chip and the panel in every state at
  1440 x 900 and 1280 x 800, light and dark, using the `?update-preview=`
  query (`ready`, `available`, `downloading`, `error`, `none`) that the page
  honours outside Tauri.
- `SCREENSHOTS=1 pnpm e2e --project=chromium updates.spec.ts` writes chip and panel screenshots with synthetic samples to `docs/screenshots/synthetic-updates-*.png`.

## bracketeer specifics

- Tauri project: `src-tauri/`. Updater code: `src-tauri/src/updater.rs`; page
  side `src/lib/updates/updates.ts` (pure version and channel logic plus the
  state machine, unit-tested in `src/lib/updates/updates.test.ts`),
  `src/lib/updates/updater.svelte.ts` (scheduler and Tauri calls),
  `src/lib/updates/VersionChip.svelte` (right end of the wizard footer, on every step) and
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
- Settings: `localStorage['bracketeer.updates']` holds the channel, the
  automatic-download switch and the last check (per computer, never in a
  project file).
