# bracketeer: the four-step wizard (2026-11-06)

Yiming's request, in their words: "make it more navigatable and more idiot
proof … a stepwise manner". The single page with the inputs column and the grid
becomes four steps. The engine, the recipe, the exports and the project file
keep working as before. Sessions 2 and 3 must still equal `fixtures/` cell for
cell when they are generated through the wizard. One engine change is allowed,
in boundary mode only (see "Non-contiguous spots").

```
┌ bracketeer ── (1 Mineral)─(2 Unknowns)─(3 Bracketing)─(4 Review) ── Theme  Menu ┐
│                                                                               │
│                         the current step, scrolling inside                    │
│                                                                               │
└ Back                    <why Next is disabled, pointing at the row>     Next ┘
```

## Frame (all steps)

- **Top bar**: `bracketeer`, the experiment title (editable, as today), the
  step indicator, Theme, and a Menu (Open project, Save project, Import
  sequence, New project, Reset recipe, Reset layout). Undo and Redo work on
  every step (Ctrl/Cmd+Z, Shift for redo), as today.
- **Step indicator**: four numbered pills: `1 Mineral`, `2 Unknowns`,
  `3 Bracketing`, `4 Review`. The current step is filled. Pills for earlier
  steps are always clickable. A later step is clickable only when every step
  before it validates. Then a click works like pressing Next that many times,
  so going to 4 runs Generate. Steps that cannot be reached are greyed out and
  have a tooltip that says why.
- **Bottom bar**: Back (hidden on step 1) and Next. The Next label says what
  it does: `Next: unknowns`, `Next: bracketing`, `Generate and review`. Step 4
  has no Next. When Next is disabled, the text beside it gives the first
  blocking problem in plain words and names the row, e.g.
  `Row 3, SYN-H4: spots 31–32 are also in row 1, SYN-H3.` Clicking the text
  focuses that input. All other problems are listed inline in the step.
- **Keyboard**: Ctrl/Cmd+Enter is Next and Alt+← is Back, except while a text
  area has focus.
- **Back never loses input.** Every value lives in the project (`$state`)
  from the moment it is typed or committed, not in step-local copies. Paste
  boxes that are not yet applied are also kept per step while the app runs.
  Going back and then forward again shows exactly what was there.
- **Fit**: every step fits 1440 × 900 and 1280 × 800 with nothing clipped.
  Long lists scroll inside their panel, never the page.

## Step 1: Mineral

On launch the app shows a large welcome panel: a rounded rectangle in the
glass style, centred, at most 1180 px wide.

- **Header**: `bracketeer` and one sentence: "Plan a standard-bracketed
  LA-ICP-MS run for the Qtegra LabBook."
- **Mineral tiles**: Zircon, Apatite, Rutile, Titanite, Garnet, Monazite,
  Xenotime, Carbonate, Other, as a single row (two rows when narrow). Each tile
  shows its crystal image and name, and works as a radio button
  (`role="radiogroup"`, arrow keys move the choice).
- **Standards list**: appears under the tiles once a mineral is chosen. It has
  three groups, which are the role:
  - **Primary**: radio buttons, so exactly one is in use.
  - **Secondaries**: checkboxes. Their order is the rotation order, shown as
    "1, 2, 3 …" next to the checked ones.
  - **Reference glasses**: checkboxes. NIST610 and NIST612 are in every
    system.

  Each entry can be renamed inline, removed (×), moved up or down (↑ ↓, which
  also sets the rotation), and moved to another group (a small role menu). An
  `Add standard` field per group takes a name.

- **Catalogue per mineral**: the seeds and the lab's defaults are below. The
  user's edits to a catalogue (added, renamed, removed, reordered or regrouped
  entries) are saved per mineral in `localStorage['bracketeer.minerals']`, in
  the web build and in the Tauri webview alike, so no store plugin is needed.
  `Restore list` puts back that mineral's seeds. A project never depends on the
  catalogue: the standards it uses are copied into `project.standards`.
- **Recent projects** (right-hand column of the panel):
  - `Continue: <name>, step N` for the project that was open when the app was
    last closed. This is the old autosave, so nothing is lost.
  - Up to six recent projects, each with its name, mineral, step and the date
    it was last saved or opened.
  - `Open project…`.

  Entries are snapshots (the serialized project) kept in
  `localStorage['bracketeer.recent']`, at most 6 entries and 3 MB, oldest
  dropped first. In the desktop app they are labelled "as saved on <date>".

- **Choosing a tile** on the launch panel starts a new project with that
  mineral and its preselected standards. On a project that is already open
  (reached with Back), choosing another mineral asks "Switch to Apatite?
  Unknowns are kept; the standards list changes." Standards that keep the same
  name keep their pools and used spots.
- **Next is enabled when** a mineral is chosen, exactly one primary is checked,
  and every checked name is non-empty and unique. Otherwise the bottom bar says
  "Choose a mineral" or "Add your primary standard".
- **Applying the selection** (on Next): `project.standards` becomes the checked
  entries in the order Primary, Secondaries, References. An existing
  standard's `ranges`, `used` and `spare` are kept when its name matches.
  Recipe block entries that name a standard no longer in use are dropped, and
  Reset recipe adds back only what is present.

### Seeds (from UPbRPy's reference library; ✓ = preselected)

| Mineral                           | Primary                | Secondaries (rotation order)                                              | Reference            |
| --------------------------------- | ---------------------- | ------------------------------------------------------------------------- | -------------------- |
| Zircon                            | S513 ✓, GJ1, Plešovice | Seiland ✓, 91500 ✓, PL ✓, LTSE ✓, FC1, R33, OG1, Temora, AUSz2, Maniitsoq | NIST610 ✓, NIST612 ✓ |
| Apatite                           | MAD ✓, MADUCSB         | McClure, Durango, BR5, OL2, AFB1                                          | NIST610 ✓, NIST612 ✓ |
| Rutile                            | R632 ✓                 | KNW                                                                       | NIST610 ✓, NIST612 ✓ |
| Titanite                          | MKED ✓                 | BLR, Kahn, OLT, Elmuerto                                                  | NIST610 ✓, NIST612 ✓ |
| Carbonate                         | WC_1 ✓                 | MMC                                                                       | NIST610 ✓, NIST612 ✓ |
| Garnet, Monazite, Xenotime, Other | (none; add by name)    | (none)                                                                    | NIST610 ✓, NIST612 ✓ |

The zircon secondaries keep the order of today's template and fixtures
(Seiland, 91500, PL, LTSE). That order is the rotation, so the example and
the golden test stay unchanged. Outside zircon only the primary and the glasses
are preselected. The lab's usual secondaries for the other systems are an open
question for Yiming.

## Step 2: Unknowns

- **Session strip** (as today's session tabs): one tab per session. Imported
  and run sessions are marked and read-only. `+ Session` adds an empty open
  session. All open sessions are planned together in step 3.
- **Unknowns table** for the selected session, one row per sample: `Name`,
  `Tag` (optional), `Spots`, a read-only `Normalized` cell, `Count`, and
  ↑ ↓ ×. The `Spots` field takes any mix of ranges and single numbers:
  `1-30, 35, 40-42`, `1–30 35 40–42` or `40-42,1-30`. When the field is
  committed, the value is parsed, deduplicated and sorted. The Normalized cell
  then shows `1–30, 35, 40–42 · 34 spots`. Run order is the table order, and
  ascending spots within a sample.
- **Paste box**: lines like `SYN-H3 S 1-30`, `SYN-H3, S, 1-30, 35, 40-42`, or the
  4-column `name, tag, from, to`. It shows line errors as today and fills
  the table. The session total is shown under the table.
- **Standards' spots** for the standards chosen in step 1: one card each with
  `Pool` and `Used` (both non-contiguous lists, e.g. `848-856, 866-874`), the
  normalized list and count beside each, and the spots used by fixed sessions
  shown underneath as today.
- **Import sequence…** (from `.xls`, `.xlsx`, `.csv` or a paste, as today)
  sits here. It can import a new fixed session or add to the used spots only.
- **Next is enabled when** all of these hold:
  1. at least one open session has at least one unknown;
  2. every unknown row has a name and at least one spot, and its spot text
     parses;
  3. no two rows of a session have the same name and tag;
  4. no spot is in two unknown rows (across all sessions of the project);
  5. no unknown spot is in a standard's pool;
  6. every standard in use has a non-empty pool, and no two pools overlap.

  A used spot outside its pool, and an open session with no unknowns, are only
  warnings. Every blocking problem is shown on its row in red. The first one
  goes in the bottom bar, as in "Row 4, SYN-H5: spot 56 is in the S513 pool."

### Non-contiguous spots in the project file

The project format does not change for unknowns. A sample whose spots are
`1–30, 35, 40–42` is stored as consecutive `Unknown` entries with the same name
and tag (`{SYN-H3,S,1,30}`, `{SYN-H3,S,35,35}`, `{SYN-H3,S,40,42}`). The table shows
consecutive entries with the same name and tag as one row. Labels, warnings and
the draw already work per entry. The engine change is in
**bracket-at-sample-boundaries** mode only: consecutive entries with equal name
and tag count as one sample (in `planChunks` and the per-sample minimum of the
budget). This leaves every existing project unchanged, because none has
adjacent entries with the same name and tag. Unit tests cover this, and the
golden tests show that the fixtures still match.

## Step 3: Bracketing

- **Recipe** (the same controls as today): chunking mode (Auto from budget,
  Chunk target, Chunk count) with its number, max or fixed pairs per
  bracket, bracket at sample boundaries, the opening, mid and closing blocks,
  and Keep spare per standard. Sheet defaults (duration, laser output, sample
  type, dilution, comment, identifier, evaluate) are under a collapsed
  "Sheet columns" section.
- **Live summary** (right-hand column), recomputed by `planProject` on every
  change:
  - the number of sessions;
  - per session, the chunk sizes, brackets and mid-block bracket;
  - total brackets K and secondary pairs P, and which brackets are doubled;
  - a table per standard: available, needed, left after;
  - the engine's advisories and warnings.
- **Next ("Generate and review")** is enabled when `planProject` does not
  throw and every number input is valid. It runs Generate:
  - With no manual edits in step 4, it regenerates and goes to step 4.
  - With manual edits, it asks first, with three choices: `Keep my edits`
    (goes to 4 without regenerating), `Regenerate`, or `Cancel`.

## Step 4: Review and export

- **Session tabs**. Each session has the editable sequence grid, as today, with
  Insert, Delete, Move, Undo and Redo, Mark as run, Unlock, and the warnings
  list linked to the rows.
- **Export bar**: `Export .xls` (primary), `.xlsx`, `.csv`, `Copy for Qtegra`,
  `Save project`.
- **Paste preview**: a "Qtegra paste" toggle next to the grid. It shows the
  exact rows that Copy puts on the clipboard (`toTSV` split back into cells:
  no header, the 13 columns, TRUE and plain numbers), read-only, with the row
  count. After a copy, a status line says "Copied 332 rows. Paste into the
  LabBook sample list." It stays until the next action.
- **Start another session** marks the shown session as run (rotation carried
  forward, as `newSessionFrom` does) and adds an empty session. It then opens
  **step 2** on that new session, with pools and used spots carried forward.
  The request said step 3, but a new session has no unknowns, so step 3 could
  not generate it. Step 2 is the first step with something to fill in.

## Project file: step and mineral

`Project` gets one optional field, `wizard: { step: 1 | 2 | 3 | 4, mineral:
string }`. The format stays at version 1, and old files load as before.

- `parseProject` validates the field when it is present and keeps it;
  `serializeProject` writes it.
- The step is updated whenever the step changes.
- Opening a project goes to its `wizard.step`. Without the field, the step is
  worked out:
  - 4 when an open session has rows;
  - else 3 when an open session has unknowns and every standard has a pool;
  - else 2 when standards exist;
  - else 1.

  A missing mineral is the first catalogue whose primary seeds contain the
  project's primary (S513 → zircon). Otherwise it is "other".

- A step that no longer validates (a hand-edited file, say) moves back to the
  first step that does not validate, with its message shown.

## Mineral tiles: static SVG, not live three.js

- **Choice**: static SVG, made at build time by `scripts/make_minerals.py`
  (Python, stdlib only). It reads the representative crystal of each mineral
  from the habit matrix's `site/data/atlas.json`: the same precomputed convex
  solid, face-form colours and default view (tilt, turn) as the site's atlas
  cards. It projects the solid orthographically, drops back faces (the solid is
  convex, so no depth sort is needed), and shades each face from the site's
  key and rim lights. The result is one `<polygon>` per visible face, with
  edges.
- **Overrides**: titanite uses the envelope cell C2M3 (tilt 35°, turn 20°),
  because the atlas slab reads as a plain box at tile size. Carbonate is
  calcite's representative. Other is quartz's representative in neutral grey.
- **Output**: `src/assets/minerals/<id>-light.svg` and `<id>-dark.svg`.
  - Files are 400 B to 1.8 KB each, 18 files and 17.4 KB in total, far under
    the 30 KB per image limit.
  - They are imported with `?url`. The normal build ships them as files. The
    single-file build inlines them as data URIs, which is why they are not in
    `public/` (the brief's suggestion): `public/` files are not inlined into
    `dist/bracketeer.html`.
- **Why not three.js**: three.js is about 650 KB minified, plus the geometry
  data and a WebGL context. That breaks the 1 MB budget for the exe once it is
  combined with the existing 672 KB single file. It also delays first paint,
  which works against the one-second start. Nine fixed tiles gain nothing from
  live rotation.
- **Source**: Yiming Zhang, mineral-habit-matrix,
  https://github.com/duserzym/mineral-habit-matrix (commit c744553,
  2026-10-19), live at https://duserzym.github.io/mineral-habit-matrix/. To
  regenerate:
  `git clone --depth 1 https://github.com/duserzym/mineral-habit-matrix.git /tmp/mhm && python3 -I scripts/make_minerals.py /tmp/mhm`.
  `src/assets/minerals/README.md` records the same.

## Measurements

Filled in at milestone 6. These are the figures before and after the wizard:

|                                        | Before (c111a1a) | After |
| -------------------------------------- | ---------------- | ----- |
| `dist/windows/bracketeer.exe`          | 3,709,440 B      | —     |
| `dist/bracketeer.html`                 | 688,323 B        | —     |
| Cold start (macOS app, to first paint) | —                | —     |
