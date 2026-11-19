# bracketeer — plan (2026-11-04)

## Status (2026-11-18)

The design-count update is built (milestones 1–4; see [design-count.md](design-count.md)).
New projects and Reset recipe start with Chunk target 18. Step 2 has
Begin / End / Count, automatic numbering, hand marks and GrainAtlas spot
checks. Step 3 holds Standard spots, Placed / needed and each standard's
arithmetic. Chunk target and Chunk count support every/odd/even secondaries
and an opening bracket. A run can have several mineral groups, with shared
references and separate primary budgets and rotations.

Verified here: formatting, lint, type checks, 446 unit tests and 4 Rust tests.
The unit tests reproduce the four saved Ablation Station designs' counts and
row totals, numbering and hand values, mineral groups, and GrainAtlas parsing
and warnings. The example still matches sessions 2 and 3 cell for cell;
export hashes for CSV, TSV, XLS and XLSX match the earlier version. The
regenerated screenshots show the current steps. Browser tests cover the wizard
at 1440 × 900 and 1280 × 800 in Chromium and WebKit.

The docs-only check found that `make test` stops at the existing JavaScript
budget: 253,416 bytes, above the 250,000-byte limit. A separate Playwright run
could not start because the sandbox denied Vite's local listener at
`127.0.0.1:4173`. Browser tests were not rerun here; no code or test limit was
changed.

Not yet verified: the exe on the instrument PC, and a real GrainAtlas export
from the lab's mount. GrainAtlas tests use small test inputs.

## Status (2026-11-06)

Milestones 1–5 are done (2026-11-04). On 2026-11-06 the single page became
a four-step wizard (1 Mineral, 2 Unknowns, 3 Bracketing, 4 Review), specified
in `docs/wizard.md`, at Yiming's request to make the app easier to navigate
and harder to get wrong. Unknowns, pools and used spots now take
non-contiguous lists (`1-30, 35, 40-42`); a project stores its mineral and
the step it was left on. Golden tests verify generated sessions 2 and 3 cell
for cell, including values and cell types, from the example project and typed
through the wizard. Playwright runs in Chromium and WebKit and checks every
step at 1440 × 900 and 1280 × 800, plus the offline single-file build.

Not yet verified: the executable on the instrument PC, and native file
dialogs and clipboard access clicked by hand.

A small, fast app that turns a list of unknowns and standards with their laser
spot ranges into a bracketed LA-ICP-MS run sequence, lets the user edit the
result in a table, and exports a sheet that pastes straight into the Qtegra
LabBook sample list.

Fifth app of the lab workflow (grainatlas, UPbDB, UPb Studio, UPbRPy
Studio). House style: one lowercase word, light theme by default, fits a
14-inch laptop, same UX conventions as the others
(`~/Github/grainatlas/docs/ux-conventions.md`, rules 1, 3, 7 apply here).

## 1. Who runs it, where

- **Windows and macOS.** It runs on the instrument PC next to Qtegra as a
  lightweight, fast executable, and on the Mac as a normal app (both are
  shipped; revised 2026-11-04 by Yiming). The `.xls` export is what goes to
  the Windows instrument PC.
- Zero install if possible: a single `bracketeer.exe` (portable, no installer)
  that opens in under a second; an NSIS installer is optional.
- Also usable as a static web page (same code), for a quick check in a browser.

## 2. Input (what the user types)

- **Experiment**: name (used for the file name, e.g. `Zircon_04Nov26_Synthetic`),
  session number, defaults for the sheet columns (duration 30 s, laser output
  46 %, sample type `UNKNOWN`, comment `<Comment>`, identifier `<Identifier>`,
  evaluate TRUE (a boolean cell, as in the template), dilution 1).
- **Unknowns**: a list of rows `name, size tag (optional: S / L / xs / anything), spot from, spot to`
  in run order. Step 2 shows Begin, End and editable Count. New rows number
  automatically across sessions; typed endpoints stay, marked with an accent
  bar, until Auto is chosen. Example: `SYN-H3, S, 1, 30`. Rows can be reordered; a
  paste-from-clipboard box accepts lines like `SYN-H3 S 1-30` (the format Yiming
  writes by hand) and fills the table.
- **Standards**: rows `name, role, spot from, spot to` with roles
  **primary** (one per mineral group; e.g. S513), **secondary** (rotating pairs or every/odd/even; 91500,
  Seiland, PL, LTSE), **reference** (NIST610, NIST612: opening, mid and
  closing blocks only). A standard's pool can be several ranges
  (NIST610 848–856 and 866–874). Step 3 holds the Standard spots table:
  Begin, End, Placed / needed (available after used and spare), Used, Spare
  and + range, with the formula under each standard. In design modes,
  automatic standard ranges follow the unknowns and fill to the count.
- **Several minerals**: add another mineral in step 1; choose each session's
  mineral in step 2. Each group has its own primary, secondaries, budget and
  rotation. Reference glasses are shared; the recipe applies to every group.
- **GrainAtlas**: Load GrainAtlas spots in step 2 reads its laser CSV or a
  list of names. It warns about unplaced positions and the total distinct
  spot count across unknowns and standard ranges.
- **Used spots**: each standard shows the spots already consumed, either
  typed in or taken from an **imported** earlier sequence (`.xls`/`.xlsx`
  of the same column layout, or paste). This is how session 2 knows what
  session 1 used.
- **Recipe** (defaults = today's template; exact semantics in `AGENTS.md`
  and `fixtures/RULES.md`, revision 3, which supersede this list):
  - opening block: NIST612 × 3, NIST610 × 3, primary × 2;
  - a bracket after every chunk of unknowns, the last included: one
    secondary pair (2 spots of the next secondary in rotation) then
    primary × 2; some brackets get two pairs when the budget spreads more
    pairs than brackets;
  - mid block: NIST610 × 3, NIST612 × 3 in bracket floor((k + 1) / 2)
    (before that bracket's secondaries);
  - closing block after the last bracket: NIST612 × 3, NIST610 × 3;
  - **Auto from budget** (when spots are already placed): plan each mineral
    group’s remaining sessions together: bracket count from the primary supply,
    shared between sessions by their unknowns, secondary pairs spread
    evenly over the brackets; "keep N spare" per standard (default 0);
  - **Chunk target 18** is the default for new projects and Reset recipe;
    **Chunk count** sets the chunks per session. Both show needed counts
    before spots are placed and keep chunks balanced;
  - in either design mode, choose rotating pairs or **Every, odd or even**
    with a count per secondary. Cadence starts at bracket 1 in each session;
  - optional **Opening bracket**: a full bracket after the opening block,
    before unknowns, counted as bracket 1. It adds to the opening block's
    primary draws. Both cadence and the opening bracket are unavailable in
    Auto from budget;
  - option *bracket at sample boundaries* (off by default; on, each sample is
    chunked on its own like today's template).
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
- **Export**: `.xls` (BIFF8, the default, for Qtegra on the Windows PC),
  `.xlsx`, `.csv`,
  and **Copy for Qtegra** (tab-separated, no header, straight into the
  LabBook sheet). Sheet name `Sheet1`, no formatting, numbers as numbers,
  cell types as in the template (Evaluate a boolean, Status blank,
  Standard/Amount/Final Quantity empty strings).
- **Project file** `<experiment>.bracketeer.json` with everything above, so a
  multi-session experiment is one file; "New session from this one" carries
  the pools and used spots forward.

## 4. Stack

- Svelte 5 + TypeScript + Vite, pnpm, Vitest for the engine, Playwright for
  the UI incl. the 1440 × 900 and 1280 × 800 size check.
- Engine in `src/lib/engine/` as pure functions (`plan.ts`, `pools.ts`,
  `sequence.ts`, `export.ts`, `count.ts`, `numbering.ts`, `checks.ts`,
  `grainatlas.ts`, `groups.ts`): inputs → counts and rows; no DOM. This is
  what tests hit.
- Excel: SheetJS 0.20.3 from its official tarball reads and writes `.xls`
  (BIFF8) and `.xlsx`. `.xls` is the default export.
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
  uploads `bracketeer.exe` as an artifact.
- Also build the web version as a single HTML file (`vite-plugin-singlefile`)
  that opens in Edge with no install: the zero-risk way to test on the
  instrument PC.
- Done for Windows = a `bracketeer.exe` that opens, loads
  `fixtures/session-1.bracketeer.json`, regenerates sessions 2 and 3 identical
  to the fixtures, exports `.xls`, and copies TSV. The Mac build does the same.

## 6. Acceptance fixtures (today's experiment)

Template session 1: `fixtures/session-1.xls` (245 rows, by hand). Sessions
2 and 3 were generated by a separate session (`fixtures/RULES.md`,
revision 3, final; `fixtures/make_sessions.py`, `fixtures/verify.py`,
`fixtures/verify.txt`) into `fixtures/session-2.xls` and
`fixtures/session-3.xls`. Goal set by Yiming: leave no spare standards.
The app must reproduce them exactly (labels, positions, values and cell
types; never fonts or widths) from:

- unknowns session 2: SYN-H3 S 1–30, SYN-H4 S 31–55, SYN-H5 S 56–83, SYN-H11 S 84–90,
  SYN-T1 S 91–116, SYN-T2 S 117–119, DKR1 S 120–131, SYN-W2 S 132–142,
  SYN-S2 S 143–167, SYN-S12 S 168–181, SYN-K2 S 182–192, SYN-W1 S 193–234;
- unknowns session 3: SYN-J1 xs 235–252, SYN-M1 xs 253–302,
  SYN-F1 xs 303–322, SYN-A1 xs 488–627;
- pools: S513 628–727, 91500 728–757, Seiland 758–787, LTSE 788–817,
  PL 818–847, NIST610 848–874, NIST612 875–901; used by session 1 (read
  from the template): S513 628–649, 91500 738–747, Seiland 768–777,
  LTSE 798–807, PL 828–837, NIST610 857–865, NIST612 893–901; everything
  else is free (20 per secondary);
- sessions 2 and 3 planned together, Auto from budget, spare 0:
  K = (78 − 2 × 2) / 2 = 37 brackets, split 19 / 18 by 234 : 228; 40
  secondary pairs in the rotation Seiland, 91500, PL, LTSE, doubled in run
  brackets 13, 25, 37; 332 and 324 rows; every pool used up.

Tests: engine unit tests (chunking, budget, rotation across sessions,
pool exhaustion warnings), golden tests against the three fixtures (session 1
only structurally: chunk sizes and bracket composition, since its standard
draw order was by hand), Playwright smoke incl. sizes.

## 7. Build procedure (Codex, supervised by Claude)

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
5. docs: `README.md` (use at the instrument in four steps), `docs/recipe.md`.
