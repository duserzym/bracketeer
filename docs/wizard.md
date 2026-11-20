# bracketeer: the four-step wizard (2026-11-06)

The app has four steps. Sessions 2 and 3 of the example still equal the
fixtures cell for cell, including cell types.

Changed 2026-11-18: design counts, automatic Begin / End / Count, standard spots in step 3, cadence, an opening bracket, several minerals and GrainAtlas checks.

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
  `Row 3, SYN-2: spots 31–32 are also in row 1, SYN-1.` Clicking the text
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

  Drag a row's grip to reorder within a group (the Secondaries order sets the
  rotation) or move it between groups. A lifted row and insertion line show
  the destination; empty groups are drop zones. Each mineral's list is its
  own drop area: dragging between minerals cancels. Pointer dragging works
  with a mouse, trackpad or touch, and scrolls the panel near its edges.
  Escape cancels. A click on a grip does nothing; each drop is one Undo step.

  Moving from Secondaries or Reference glasses into **Primary** ticks that
  standard. The previous primary stays in Primary as an unticked candidate;
  nothing else moves. Reordering within Primary keeps every ticked state as
  it was. Moving the ticked primary out keeps it ticked in its new group and
  requires a replacement primary before Next. Moving between Secondaries and
  Reference glasses keeps the ticked state.

  **Move to…** opens a menu of the other groups, with their full names. Arrow
  keys choose, Enter moves, and Escape closes; focus returns to Move to….
  On a grip, Space or Enter picks up, ↑/↓ chooses positions across groups,
  Space or Enter drops, and Escape cancels. A live region announces the name,
  group and position. Names grow to fit and tools wrap below them in narrow
  cards. Each entry can also be renamed inline, removed (×), or moved up or
  down (↑ ↓). An `Add standard` field per group takes a name.

- **Catalogue per mineral**: the seeds and the lab's defaults are below. The
  user's edits to a catalogue (added, renamed, removed, reordered or regrouped
  entries) are saved per mineral in `localStorage['bracketeer.minerals']`, in
  the web build and in the Tauri webview alike, so no store plugin is needed.
  `Restore list` puts back that mineral's seeds. A project never depends on the
  catalogue: the standards it uses are copied into `project.standards`.
- **Another mineral in this run** adds a second standards list with its own
  primary and secondaries, rename, reorder and remove controls, and
  `Remove <mineral>`. References appear only in the main list and are shared.
  Step 2 lets each session choose its mineral.
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
- **Next is enabled when** a mineral is chosen, exactly one primary per mineral is checked,
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

- **Session strip**: one tab per session. Imported and run sessions are marked
  and read-only. `+ Session` adds an empty planned session. All open sessions
  are planned together in step 3, within their mineral groups.
- **Unknowns table**: `Row`, `Name`, optional `Tag`, `Begin`, `End`, editable
  `Count`, and ↑ ↓ ×. Each range has its own row. Consecutive entries with the
  same name and tag show `↳ continued` and count as one sample for sample
  boundaries.
- **Add sample** starts a row with automatic Begin (previous End + 1) and
  count 1, then focuses Name. Type Count to fill End. The unknown chain
  continues across sessions in number order; fixed sessions keep their
  values and pass their End to the next entry.
- **Hand values** have an accent bar and the tooltip
  `Typed by hand; kept when rows above change.` Focus or hover to show
  `Auto`, which returns that endpoint to automatic numbering. Typing Begin
  keeps an automatic End at the same count; typing End makes it hand;
  typing Count makes End automatic again. Later automatic values follow,
  while hand values stay. A legend explains the mark.
- **Mineral** appears in the session header when the project has several
  mineral groups. A fixed session's mineral cannot be changed.
- **Paste unknowns** accepts `SYN-1 S 1-30`,
  `SYN-1, S, 1-30, 35, 40-42`, or `name, tag, from, to`. Parsed ranges are
  sorted and deduplicated within a pasted sample. Each range becomes an
  entry; pasted endpoints are hand values. The session total is shown below.
- **Import sequence…** reads an earlier sheet (`.xls`, `.xlsx`, `.csv` or
  paste) as a fixed session or used spots only.
- **Load GrainAtlas spots…** reads a laser CSV or a text list of names.
  The status shows the file name and unique spot count, with `Remove`.
  It checks the project's unknown and standard ranges against those spots;
  missing positions and an excessive total are warnings, and do not block
  Next. It does not import sample rows.
- **Next** needs unknowns in at least one open session, names, valid whole
  endpoints and no overlap between unknown entries across the project.
  The same name and tag may continue on adjacent rows, but cannot reappear
  later as a separate sample. Standard-pool problems are handled in step 3.
  Blocking problems appear on their rows and the first is in the bottom bar.

### Non-contiguous spots in the project file

A sample with `1–30, 35, 40–42` is stored as consecutive Unknown entries with
that name and tag. The table now shows each entry separately. Labels and
warnings work per entry. In bracket-at-sample-boundaries mode, consecutive
entries with the same name and tag share one sample's chunk allocation.
The project format stays at version 1; optional auto flags record which
endpoints may move. Old files have no such flags, so their numbers stay.

## Step 3: Bracketing

- **Recipe**: new projects and Reset recipe use Chunk target 18. Chunk count
  sets the number per session. Auto from budget reads placed pools instead;
  the example keeps that saved mode. The panel also holds primary and
  secondary counts, sample boundaries, each group's rotation start, and
  opening, mid and closing blocks. Sheet defaults are under `Sheet columns`.
- **Secondaries**: Rotate pairs, or Every, odd or even. In cadence mode,
  each secondary's Per bracket and Every / Odd / Even controls appear in the
  Standard spots table. Cadence starts at 1 in each session; rotation and
  pair counts are not used.
- **Opening bracket**: after the opening block, before the first unknown,
  draw secondaries then primary. It is bracket 1 and adds to any primary in
  the opening block. The mid block stays after chunk floor((k + 1) / 2).
  Choosing Auto from budget clears cadence and the opening bracket, disables
  both controls and shows why they need a design mode.
- **Live summary**: session counts, chunk sizes, brackets, mid-block bracket,
  and, in rotation mode, secondary pairs and doubled brackets. It updates
  with committed inputs and shows planning problems and advisories.
- **Standard spots**: one row per standard range, with Standard, Begin, End,
  Placed / needed, Used, Spare and + range. Each standard shows its arithmetic
  underneath, plus fixed-session use. Placed / needed is available after
  used spots and spare, compared with the planned demand; shortages are red.
  Extra ranges show `↳`; several minerals show the group beside the role.
- **Automatic ranges** start after the highest unknown spot, then follow the
  previous standard range in table order. In design modes, the last auto End
  fills to needed plus spare, skipping used spots. In budget mode, Ends stay
  as entered. Hand marks and Auto work as in step 2. + range keeps the old
  End as hand, drops an empty auto last range, and adds a new hand Begin above
  the highest known mount spot, with an automatic End. See
  [the recipe](recipe.md#automatic-numbering) for the two chains.
- Values commit on blur, Enter, or 300 ms after typing. Incomplete designs
  keep numbering and spot checks working while the planning problem is shown.
- **Generate and review** needs valid inputs, a computable plan, no blocking
  spot checks, and ranges for standards used by open groups. A standard with
  zero demand in a design mode needs no range. Shortages and GrainAtlas
  warnings do not block generation.
- With no manual edits in step 4, Generate replaces the planned rows and
  opens step 4. With edits, it asks: `Keep my edits` (open step 4 without
  regenerating), `Regenerate`, or `Cancel`.

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

## Project file: step and mineral

`Project` has the optional field `wizard: { step: 1 | 2 | 3 | 4, mineral:
string }`. The format stays at version 1, and old files load as before.
Optional mineral fields on sessions and standards record extra groups;
references are shared.
Auto flags and loaded GrainAtlas spots also live in the project, as described
in [design-count.md](design-count.md).

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

Before is c111a1a (2026-11-04); after is the wizard (2026-11-06). Both were
built on the same Mac. The start times are medians of six warm launches,
measured from process start to the first on-screen window (the window opens
only after the page is set up). The time to the app shell is from navigation
to the first `<h1>`, the median of seven `file://` loads at 1280 × 800.

|                                     | Before      | After                |
| ----------------------------------- | ----------- | -------------------- |
| `dist/windows/bracketeer.exe`       | 3,709,440 B | 3,726,848 B (+17 KB) |
| `dist/bracketeer.html`              | 688,323 B   | 742,720 B (+54 KB)   |
| macOS app, launch to window         | 245 ms      | 254 ms               |
| Single file, to app shell, Chromium | 36 ms       | 39 ms                |
| Single file, to app shell, WebKit   | 45 ms       | 49 ms                |

The exe could not be timed on Windows from this Mac. Its Chromium-based
WebView2 loads the same page, which reaches the app shell in about 40 ms in
Chromium.
