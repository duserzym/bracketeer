# AGENTS.md — bracket

`bracket` turns a list of unknowns and standards (with their laser spot ranges)
into a standard-bracketed LA-ICP-MS run sequence for the Thermo Qtegra LabBook,
lets the user edit it in a grid, and exports it. It runs mainly on the Windows
PC at the instrument, as a small fast executable; development is on macOS.

The spec is `docs/PLAN.md`. Read it before any change. Where this file is more
precise than the plan, this file wins. The supervisor (a Claude session) gives
each milestone as a separate prompt; do only that milestone.

## House rules

- **No git.** Never run `git commit`, `git add`, `git push`, `git reset`,
  `git checkout`, `git stash` or anything that changes the index or history.
  `git status` and `git diff` are fine. The supervisor reviews and commits.
- **Tests must pass** before you stop: `make test` (lint, type check, unit
  tests; from milestone 3 also Playwright). Never skip, delete or loosen a
  test to make it pass; if a test is wrong, say so in your final message.
- **Network**: only the npm registry through pnpm (and crates.io through
  cargo in milestone 4). One exception: SheetJS is installed from its
  official tarball, `pnpm add https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
  (the `xlsx` on the npm registry is a stale 0.18.5). No other downloads,
  no telemetry, no CDN links in the app; the built app works offline.
- **Data**: never commit or create large data. `fixtures/` holds only the
  small acceptance workbooks and project files. Generated outputs go to
  `test-results/` or a temp dir, never into `fixtures/`.
- Keep dependencies few. No UI component libraries; plain Svelte + CSS.
- Finish with a short final message: what you did, what is not done, any
  doubt about the spec, and the output of the last `make test`.

## Stack

- pnpm, Svelte 5 (runes), TypeScript (strict), Vite, Vitest, Playwright,
  ESLint (flat config) + Prettier. A single package at the repo root:
  `src/` (app), `src/lib/engine/` (pure logic), `tests/` (Playwright),
  `src-tauri/` (desktop, milestone 4).
- `Makefile`: `make dev` (Vite dev server), `make test` (lint + `svelte-check`
  + Vitest, and Playwright once it exists), `make build` (web build into
  `dist/`, plus `dist/bracket.html` single file from milestone 4),
  `make desktop` (Tauri build, milestone 4), `make e2e` (Playwright only).
- Engine (`src/lib/engine/`): pure functions, no DOM, no Svelte, no I/O
  except the file-format helpers taking/returning bytes or strings.
  `plan.ts` (chunking, budget, bracket layout), `pools.ts` (pools, used
  spots, draw), `sequence.ts` (rows, labels, validation/warnings),
  `parse.ts` (pasted text), `export.ts` (TSV/CSV/XLSX/XLS bytes),
  `import.ts` (read a sequence workbook back, milestone 2). Every exported
  function has unit tests next to it (`*.test.ts`).

## UX conventions (shared with grainatlas, laicpmsdb, UPb Studio)

- Light theme by default; a three-way **Light / Dark / System** switch;
  nothing stored means light; the choice lives in
  `localStorage['bracket.theme']`, never in a project file. Tokens: light is
  the base in `:root`, `[data-theme='dark']` overrides.
- One click for a good result (Generate), every control still visible and
  editable, an explicit Reset to defaults.
- Fits a 14-inch laptop: checked at 1440×900 and 1280×800 CSS px; nothing
  clipped, panels scroll inside, the left column folds to a strip (» / «).
  Layout (folded column, splitter) in `localStorage['bracket.layout']`, with
  a Reset layout action. Desktop window opens at 1280×800 centred, never
  below 1024×640, geometry remembered in the config folder.
- Plain, short English in the UI; no exclamation marks, no emoji.

## The Qtegra sheet (exact)

Columns, in this order and spelling (one header row, sheet name `Sheet1`):

```
Label | Status | Duration [s] | Comment | Evaluate | Sample Type | Standard | Dilution Factor | Amount | Final Quantity | Identifier | Laser Scan Position Number | Laser Output Setting [%]
```

Cell values per row, as in the template `fixtures/session-1.xls`:

| Column | Value | Cell type |
| --- | --- | --- |
| Label | `<name>_<tag>_<spot>` for unknowns (`HH3_S_1`), `<name>_<spot>` when the tag is empty (`SYN-V1_384`) and for standards (`S513_650`) | text |
| Status | empty | blank |
| Duration [s] | 30 (experiment default) | number |
| Comment | `<Comment>` (default) | text |
| Evaluate | TRUE | boolean |
| Sample Type | `UNKNOWN` (default, also for standards) | text |
| Standard | empty string | text |
| Dilution Factor | 1 | number |
| Amount | empty string | text |
| Final Quantity | empty string | text |
| Identifier | `<Identifier>` (default) | text |
| Laser Scan Position Number | the spot number | number |
| Laser Output Setting [%] | 46 (default) | number |

Spot numbers are global on the mount: unknowns and standards never share a
number. "Copy for Qtegra" is the same rows as tab-separated text, no header,
CRLF line ends, booleans as `TRUE`, numbers without trailing `.0`.

## The recipe (engine semantics)

Inputs: experiment (name, session number, column defaults), unknowns (rows
`name, tag, from, to` in run order, inclusive ranges, ascending spots),
standards (`name, role, ranges[], used[]`; role `primary` (exactly one),
`secondary` (several, rotated in table order), `reference` (only in the
opening, mid and closing blocks)), recipe.

Recipe defaults (today's template):

- opening: NIST612 × 3, NIST610 × 3, primary × 2
- after every chunk of unknowns, a **bracket**: `secondaryPairsPerBracket`
  (default 1) pairs, each pair = 2 consecutive draws of the next secondary in
  rotation, then primary × 2
- mid block: NIST610 × 3, NIST612 × 3, inserted at the start of the bracket
  nearest the midpoint (before that bracket's secondaries); nearest = the
  bracket whose cumulative unknown count is closest to half of all unknowns,
  ties to the earlier; no mid block with fewer than 2 chunks
- closing: NIST612 × 3, NIST610 × 3, after the last bracket
- sequence = opening, chunk 1, bracket 1, chunk 2, bracket 2, …, chunk C,
  bracket C, closing
- chunking: `auto` (the largest bracket count the budget allows), `size`
  (target unknowns per chunk: C = ceil(N / size)) or `count` (C given).
  Chunks are equal ±1, the larger ones first: q = floor(N / C), r = N mod C,
  the first r chunks get q + 1. Chunks run across sample boundaries unless
  `bracketAtSampleBoundaries` is on; then each sample is chunked on its own
  with the same target size (size mode: the size; other modes: ceil(N / C)).
- budget: remaining_s = pool_s − used_s. With `sessionsLeft` (default 1,
  this session included), the share for this session is
  floor(remaining_s / sessionsLeft). Bmax = the largest C (≤ N) for which
  every standard's demand (opening + mid + closing + its bracket draws for C
  brackets, simulating the rotation exactly) fits its share. Auto uses
  C = Bmax; size/count modes warn when C > Bmax.
- draw: each standard takes its unused spots in ascending order across its
  ranges (several ranges allowed, e.g. NIST610 848–856 and 866–874),
  skipping `used` and spots already drawn. An exhausted pool still emits the
  row, with label `<name>_?` and an empty position, plus a warning.
- rotation: `rotationStart` (index into the secondaries) is where this
  session starts; the result reports `nextRotation` and the spots used per
  standard, so the next session continues where this one stopped.
- warnings (computed from rows, so they also apply after manual edits):
  pool exhausted; duplicate position number; a standard row whose spot is
  outside that standard's pool; a standard row whose spot was already used
  in an earlier session; an unknown row whose spot is outside its sample
  range. Each warning names the row(s).

`docs/PLAN.md` §6 and `fixtures/RULES.md` (when present) give today's
acceptance case; the generated sessions 2 and 3 must match
`fixtures/session-2.xls` and `fixtures/session-3.xls` cell for cell.
If `fixtures/RULES.md` disagrees with this section, RULES.md wins for
the defaults; say so in your final message.

## Fixtures

- `fixtures/session-1.xls`: the hand-made template for session 1 (245 rows).
  Its standard draw order was by hand, so it is checked only structurally
  (chunk sizes, bracket composition, used spots per standard).
- `fixtures/session-2.xls`, `fixtures/session-3.xls`, `fixtures/RULES.md`:
  sessions 2 and 3 generated independently from the recipe (added in
  milestone 2 when available).
