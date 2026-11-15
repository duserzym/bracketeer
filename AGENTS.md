# AGENTS.md — bracketeer

`bracketeer` turns a list of unknowns and standards (with their laser spot ranges)
into a standard-bracketed LA-ICP-MS run sequence for the Thermo Qtegra LabBook,
lets the user edit it in a grid, and exports it. It runs on the Windows PC at
the instrument (a small fast `bracketeer.exe`) and on macOS (a normal app);
both are shipped. The `.xls` export (BIFF8) is the default, because that is
what Qtegra on the Windows PC reads; `.xlsx`, `.csv` and the clipboard copy
are the others. Development is on macOS.

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
  `dist/`, plus `dist/bracketeer.html` single file from milestone 4),
  `make desktop` (Tauri build, milestone 4), `make e2e` (Playwright only).
- Engine (`src/lib/engine/`): pure functions, no DOM, no Svelte, no I/O
  except the file-format helpers taking/returning bytes or strings.
  `plan.ts` (chunking, budget, bracket layout), `pools.ts` (pools, used
  spots, draw), `sequence.ts` (rows, labels, validation/warnings),
  `parse.ts` (pasted text), `export.ts` (TSV/CSV/XLSX/XLS bytes),
  `import.ts` (read a sequence workbook back, milestone 2). Every exported
  function has unit tests next to it (`*.test.ts`).

## UX conventions (shared with grainatlas, UPbDB, UPb Studio)

- Light theme by default; a three-way **Light / Dark / System** switch;
  nothing stored means light; the choice lives in
  `localStorage['bracketeer.theme']`, never in a project file. Tokens: light is
  the base in `:root`, `[data-theme='dark']` overrides.
- One click for a good result (Generate), every control still visible and
  editable, an explicit Reset to defaults.
- Fits a 14-inch laptop: checked at 1440×900 and 1280×800 CSS px; nothing
  clipped, panels scroll inside, the left column folds to a strip (» / «).
  Layout (folded column, splitter) in `localStorage['bracketeer.layout']`, with
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

A project is one experiment with several **sessions** (one sequence sheet
each). Each session has its unknowns (rows `name, tag, from, to` in run
order, inclusive, ascending spots) and its rows. A session is either
**planned** (rows come from Generate) or **fixed** (imported from an earlier
sequence, or marked as run): fixed sessions are never regenerated and their
standard spots count as used. Standards: `name, role, ranges[], used[],
spare` with role `primary` (exactly one), `secondary` (several, rotated in
table order; today Seiland, 91500, PL, LTSE), `reference` (only in the
opening, mid and closing blocks). `used` holds spots typed in by hand; the
spots in fixed sessions are added to it automatically. `spare` (default 0)
is how many spots of that standard to leave unused ("keep N spare").

Blocks (defaults = today's template):

- opening: NIST612 × 3, NIST610 × 3, primary × 2
- after **every** chunk of unknowns, the last one included, a **bracket**:
  its secondary pairs (each pair = 2 consecutive draws of the next secondary
  in the rotation), then primary × 2
- mid block: NIST610 × 3, NIST612 × 3, in bracket m = floor((k + 1) / 2)
  of a session with k chunks, before that bracket's secondary pairs; none
  when k < 2
- closing: NIST612 × 3, NIST610 × 3, after the last bracket
- session = opening, chunk 1, bracket 1, …, chunk k, bracket k, closing

Chunking modes (`recipe.chunking`):

1. **`budget`** ("Auto from budget", the default): plan all planned
   sessions of the project together so that the standards last exactly.
   - S = number of planned sessions; n_i = unknowns of session i.
   - available_s = pool_s − used_s − spare_s, where used_s includes all
     fixed sessions.
   - Fixed use per session: f_s = count of s in opening + mid + closing.
   - K = floor((available_primary − S·f_primary) / primaryPerBracket),
     capped at the pair budget P below (every bracket has at least one
     pair) and at Σ n_i.
   - P = the largest number of pairs such that drawing P pairs in rotation
     from `rotationStart` never takes more than floor(available_s /
     spotsPerSecondary) pairs of any secondary s; then P = min(P,
     maxPairsPerBracket · K) (maxPairsPerBracket default 2).
   - Split K over the sessions in proportion to n_i by the largest-remainder
     method (floors first, the leftover brackets to the largest fractional
     parts, ties to the earlier session); every session gets ≥ 1.
   - Number the brackets of the whole run j = 1 … K in session order.
     Bracket j gets floor(j·P/K) − floor((j−1)·P/K) pairs.
   - Warn when a reference standard cannot cover S·f_s, or when K < S.
2. **`size`** (target unknowns per chunk, e.g. 18): per session
   k = ceil(n / size); every bracket gets `secondaryPairsPerBracket` pairs
   (default 1).
3. **`count`**: k given per session; `secondaryPairsPerBracket` pairs.

In every mode: chunks within a session are equal ±1, the larger first
(q = floor(n / k), r = n mod k, the first r chunks get q + 1); chunks run
across sample boundaries unless `bracketAtSampleBoundaries` is on (then each
sample is chunked on its own, its share of k by largest remainder, ≥ 1 per
sample). The rotation continues across sessions in run order
(`rotationStart`, default 0 = the first secondary in table order, is where
the first planned session starts; imported sessions do not change it, because
hand-made sessions need not follow the rotation; when a planned session is
marked as run, the app sets `rotationStart` to the secondary after its last
pair).

Draw: each standard takes its available spots in ascending order across its
ranges (several ranges allowed, e.g. NIST610 848–856 and 866–874), skipping
used spots and spots already drawn, in run order across the planned
sessions. An exhausted pool still emits the row, label `<name>_?`, empty
position, plus a warning.

Warnings (computed from rows, so they also apply after manual edits):
pool exhausted; duplicate position number (within a session and across the
project's sessions); a standard row outside that standard's pool; a
standard row on a spot already used (typed-in used list or a fixed
session); an unknown row outside its sample range. Each names the row(s).

### Today's acceptance case (`fixtures/RULES.md`, revision 3)

Session 1 is fixed (imported from `fixtures/session-1.xls`); sessions 2
and 3 are planned together in budget mode with spare 0: S513 has 78
available → K = (78 − 2·2) / 2 = 37; each secondary has 20 → P = 40
(rotation from Seiland, rotationStart 0); split 37 by 234 : 228
→ 19 and 18 brackets; doubled run brackets 13, 25, 37 (session 2 bracket 13;
session 3 brackets 6 and 18); mid block at bracket 10 and 9; 332 and 324
rows; every pool fully used. The generated rows must equal
`fixtures/session-2.xls` and `fixtures/session-3.xls` cell for cell (value
and cell type).

## Fixtures

- `fixtures/session-1.xls`: the hand-made template for session 1 (245 rows).
  Its standard draw order was by hand, so it is checked only structurally
  (chunk sizes, bracket composition, used spots per standard).
- `fixtures/session-2.xls`, `fixtures/session-3.xls`: sessions 2 and 3,
  generated independently by `fixtures/make_sessions.py` following
  `fixtures/RULES.md` (revision 3, final); `fixtures/verify.txt` is the
  independent check. Golden tests compare labels, positions, values and cell
  types against them; never fonts, fills or column widths (the app writes
  no formatting).
- Excel I/O: SheetJS only (`xlsx` from the official tarball). `.xls` is
  written with `bookType: 'biff8'`, `.xlsx` with `'xlsx'`, both unstyled.
  Cell types: Status a truly blank cell (no cell), Evaluate a boolean,
  Standard/Amount/Final Quantity empty-string text cells, the four numeric
  columns numbers.

## After a major update

Rust and PyInstaller builds fill the disk quickly. Once the work is pushed and
any app built from it is installed in `/Applications` and smoke-tested:

1. Note free space (`df -h /`).
2. Run `make clean-build`. It removes `src-tauri/target/` (Rust, Tauri and Windows cross builds), after copying a newer `bracketeer.exe` to `dist/windows/`. It keeps `dist/` (web page, `dist/windows/bracketeer.exe`, `dist/macos`) and `node_modules`. It stops if a build
   is still writing there, and prints free space before and after.
3. Remove the worktrees and build checkouts you created for this work
   (`git worktree remove`, then `git branch -d` for merged branches).
4. Keep installed apps and review artifacts (screenshots, previews, print
   files, COMMIT notes in `~/Github/lab-builds`). Never touch another
   session's worktree, scratchpad or running build, project data or
   databases.
5. Report free space before and after.
