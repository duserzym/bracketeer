# bracket — plan (2026-11-04)

A small, fast app that turns a list of unknowns and standards with their laser
spot ranges into a bracketed LA-ICP-MS run sequence, lets the user edit the
result in a table, and exports a sheet that pastes straight into the Qtegra
LabBook sample list.

Fifth app of the lab workflow (grainatlas, laicpmsdb, UPb Studio, UPbRPy
Studio). House style: one lowercase word, light theme by default, fits a
14-inch laptop, same UX conventions as the others
(`~/Github/grainatlas/docs/ux-conventions.md`, rules 1, 3, 7 apply here).

## 1. Who runs it, where

- **Windows first.** It runs on the instrument PC next to Qtegra as a
  lightweight, fast executable. Developed on the Mac; the Mac build is a
  convenience.
- Zero install if possible: a single `bracket.exe` (portable, no installer)
  that opens in under a second; an NSIS installer is optional.
- Also usable as a static web page (same code), for a quick check in a browser.

## 2. Input (what the user types)

- **Experiment**: name (used for the file name, e.g. `Zircon_04Nov26_Synthetic`),
  session number, defaults for the sheet columns (duration 30 s, laser output
  46 %, sample type `UNKNOWN`, comment `<Comment>`, identifier `<Identifier>`,
  evaluate 1, dilution 1).
- **Unknowns**: a list of rows `name, size tag (optional: S / L / xs / anything), spot from, spot to`
  in run order. Example: `SYN-H3, S, 1, 30`. Rows can be reordered; a
  paste-from-clipboard box accepts lines like `SYN-H3 S 1-30` (the format Yiming
  writes by hand) and fills the table.
- **Standards**: rows `name, role, spot from, spot to` with roles
  **primary** (one; e.g. S513), **secondary** (several, rotated; 91500,
  Seiland, PL, LTSE), **reference** (NIST610, NIST612: opening, mid and
  closing blocks only). A standard's pool can be several ranges
  (NIST610 848–856 and 866–874).
- **Used spots**: each standard shows the spots already consumed, either
  typed in or taken from an **imported** earlier sequence (`.xls`/`.xlsx`
  of the same column layout, or paste). This is how session 2 knows what
  session 1 used.
- **Recipe** (defaults = today's template):
  - opening block: NIST612 × 3, NIST610 × 3, primary × 2;
  - bracket after every chunk of unknowns: one secondary pair (2 spots of the
    next secondary in rotation) then primary × 2;
  - mid block: NIST610 × 3, NIST612 × 3 at the bracket nearest the midpoint
    (before that bracket's secondaries);
  - closing block after the last bracket: NIST612 × 3, NIST610 × 3;
  - chunk target (unknowns between brackets): a number, or **Auto from
    budget**: the largest number of brackets the remaining pools allow
    (min over standards of floor(remaining − opening/mid/closing use) / per-bracket use),
    then chunks of equal size (±1, the larger ones first), never above the
    target when a number is given;
  - option *bracket at sample boundaries* (off by default; on, each sample is
    chunked on its own like today's template);
  - secondaries per bracket (1 pair default; template day 1 used 2 pairs).
- Draw order from a pool: ascending through the unused spots; the user can
  edit any cell afterwards.

## 3. Output

- **Sequence table** (editable grid): the Qtegra columns in this exact
  order and spelling:
  `Label | Status | Duration [s] | Comment | Evaluate | Sample Type | Standard | Dilution Factor | Amount | Final Quantity | Identifier | Laser Scan Position Number | Laser Output Setting [%]`.
  Label = `<name>_<tag>_<spot>` (tag omitted when empty: `SYN-V1_384`),
  standards `<name>_<spot>` (`S513_650`). Rows can be edited, inserted,
  deleted, moved; a status strip shows counts (unknowns, each standard used /
  remaining) and warnings (pool exhausted, duplicate spot, spot outside a
  pool).
- **Export**: `.xlsx` (and `.xls` BIFF8 if the library allows), `.csv`,
  and **Copy for Qtegra** (tab-separated, no header, straight into the
  LabBook sheet). Sheet name `Sheet1`, no formatting, numbers as numbers.
- **Project file** `<experiment>.bracket.json` with everything above, so a
  multi-session experiment is one file; "New session from this one" carries
  the pools and used spots forward.

## 4. Stack

- Svelte 5 + TypeScript + Vite, pnpm, Vitest for the engine, Playwright for
  the UI incl. the 1440 × 900 and 1280 × 800 size check.
- Engine in `src/lib/engine/` as pure functions (`plan.ts`, `pools.ts`,
  `sequence.ts`, `export.ts`): inputs → rows; no DOM. This is what tests hit.
- Excel: `xlsx` (SheetJS) for read (`.xls` BIFF8 and `.xlsx`) and write;
  if `.xls` writing is not available, `.xlsx` only.
- Desktop: Tauri 2, one window, light theme default with Light/Dark/System
  switch, window geometry remembered in the config folder, opens at
  1280 × 800 and never below 1024 × 640; file dialogs via the Tauri dialog
  plugin, clipboard via the clipboard plugin. Icon in the shared light-tile
  style (generator in `~/Github/grainatlas/tauri/icon/`, Julia palette).
- No server, no accounts, no `@lab/bridge` yet (standalone; hosting in UPb
  Studio can come later).

## 5. Windows build

- Try first: cross-compile from the Mac with `cargo-xwin`
  (`cargo tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc`),
  NSIS from Homebrew for the optional installer. Target the portable
  exe; WebView2 is present on Windows 10/11 (the installer, if built,
  bundles the bootstrapper).
- Fallback: GitHub Actions `windows-latest` job on `workflow_dispatch` and
  `v*` tags only (CI stays quiet until release, as in the other repos), which
  uploads `bracket.exe` as an artifact.
- Also build the web version as a single HTML file (`vite-plugin-singlefile`)
  that opens in Edge with no install: the zero-risk way to test on the
  instrument PC.
- Done for Windows = a `bracket.exe` that opens, loads
  `fixtures/session-1.bracket.json`, regenerates sessions 2 and 3 identical
  to the fixtures, exports `.xlsx`, and copies TSV.

## 6. Acceptance fixtures (today's experiment)

Template session 1: `~/Downloads/Zircon_04Nov26_Synthetic.xls`
(245 rows). Sessions 2 and 3 are generated by a separate Opus session into
`~/Downloads/bracket-sessions-2026-11-04/` with the recipe
above (one secondary pair per bracket, 10 chunks per session, mid NIST block
at bracket 5). The app must reproduce them exactly from the inputs:

- unknowns session 2: SYN-H3 S 1–30, SYN-H4 S 31–55, SYN-H5 S 56–83, SYN-H11 S 84–90,
  SYN-T1 S 91–116, SYN-T2 S 117–119, DKR1 S 120–131, SYN-W2 S 132–142,
  SYN-S2 S 143–167, SYN-S12 S 168–181, SYN-K2 S 182–192, SYN-W1 S 193–234;
- unknowns session 3: SYN-J1 xs 235–252, SYN-M1 xs 253–302,
  SYN-F1 xs 303–322, SYN-A1 xs 488–627;
- pools: S513 628–727, 91500 728–757, Seiland 758–787, LTSE 788–817,
  PL 818–847, NIST610 848–874, NIST612 875–901; used by session 1:
  S513 628–649, 91500 738–747, Seiland 768–777, LTSE 798–807, PL 828–837,
  NIST610 857–865, NIST612 893–901.

Tests: engine unit tests (chunking, budget, rotation across sessions,
pool exhaustion warnings), golden tests against the three fixtures (session 1
only structurally: chunk sizes and bracket composition, since its standard
draw order was by hand), Playwright smoke incl. sizes.

## 7. Build procedure (Codex, monitored by Opus)

Codex CLI 0.166 with model `gpt-6.1-sol` builds the repo in milestones; the
Opus session writes `AGENTS.md` and `docs/PLAN.md` (this file), runs each
milestone as `codex exec` in the background, reviews the diff and the tests,
commits, pushes, and moves to the next:

1. scaffold (pnpm, Svelte 5, Vite, Vitest, Playwright, lint, `make`
   targets, README, MIT), engine with unit tests;
2. importer (`.xls`/`.xlsx`/paste) and golden tests against the fixtures;
3. UI: inputs, pools with used/remaining, recipe, generate, editable grid,
   warnings, export, project file; theme switch; size check;
4. Tauri 2 desktop, icon, geometry; Windows build (cross or CI) and the
   single-file web build;
5. docs: `README.md` (use at the instrument in five steps), `docs/recipe.md`.
