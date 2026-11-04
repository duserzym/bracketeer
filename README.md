# bracketeer

bracketeer builds standard-bracketed LA-ICP-MS run sequences for the Thermo Qtegra LabBook. It includes an editable grid, shared standard pools across sessions, project files, `.xls` (BIFF8, the default), `.xlsx`, CSV and Qtegra clipboard export. It runs as a Tauri 2 desktop app on macOS and Windows, a regular web app, or a standalone HTML file. All app assets and the example project run locally without a network connection.

| Command           | Purpose                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `make setup`      | Install dependencies with pnpm                                                                   |
| `make dev`        | Start the Vite development server                                                                |
| `make check`      | Check formatting, lint, types, unit tests, and host Rust checks                                  |
| `make rust-check` | Generate icons, check Rust formatting, run host Clippy with warnings denied, and Rust tests      |
| `make test`       | Run `make check`, build the standalone HTML, and run all Playwright tests                        |
| `make e2e`        | Run Playwright, including viewport checks and the file:// test when its build exists             |
| `make build`      | Build the regular web app into `dist/`                                                           |
| `make web`        | Build the offline, single-file `dist/bracketeer.html`                                            |
| `make icons`      | Generate PNG, ICO and ICNS from the SVG; discard Android and iOS outputs                         |
| `make desktop`    | Build the Tauri frontend in `dist/tauri/` and the macOS `.app` and `.dmg` in `src-tauri/target/` |
| `make windows`    | Cross-build the portable Windows exe and copy it to `dist/windows/bracketeer.exe`                |
| `make mac-app`    | Run `make desktop` and copy the `.app` and `.dmg` to `dist/macos/`                               |

Development needs Node.js 22.18+ (or 24+) and pnpm 10. Desktop builds also need Rust, `cargo tauri` 2, and Xcode Command Line Tools on macOS. The Windows cross-build uses `cargo-xwin` 0.23, the `x86_64-pc-windows-msvc` Rust target and a primed Windows SDK/CRT cache. `make windows` adds Homebrew LLVM (`/opt/homebrew/opt/llvm/bin`) and lld (`/opt/homebrew/opt/lld/bin`) to PATH. Cargo dependencies are locked in `src-tauri/Cargo.lock`.

The Windows deliverable is the portable exe; run it on a PC with WebView2 installed. NSIS is configured as an optional installer, but `make windows` does not build or download an installer. macOS bundles are local unsigned/ad-hoc builds, with no signing identity or notarization configured. This Mac can build Windows binaries but cannot verify their behavior on Windows.

Open `dist/bracketeer.html` directly in Edge to use the standalone web build, with no server or network. Its favicon, scripts, styles and example are inlined. `make e2e` reports a clear skip for this test when the file is missing; `make test` builds it first. The regular web build preserves the standalone file and platform deliverables. The Tauri frontend lives in its own clean directory so release binaries are never embedded in the app.

The desktop app uses native open/save dialogs and clipboard access. Window geometry lives in the app config folder as `window.json`, is restored only on a connected monitor, and is clamped to its work area. Reset layout also restores the centred 1280 × 800 window. Theme and panel layout stay in local storage, outside project files.

`python3 -I src-tauri/icon/make_icon.py` regenerates the shared light-tile SVG and cropped `public/favicon.svg` using only Python's standard library. `make icons` rebuilds the ignored binary icons when the source SVG is newer.

Playwright is pinned to 1.64.1 to use the existing cached Chromium revision 1248. Setup does not download browsers.
