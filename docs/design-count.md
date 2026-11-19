# bracketeer: count from the design, start and end spots (2026-11-18)

Yiming's request: take over the flexibility of Boise's Ablation Station
(`docs/ablation-station-comparison.md`), above all that it **counts how many
standard spots a design needs**, and make the details smarter: spot numbers
that continue by themselves as rows are added, and standard spot numbers that
fill in and update as a begin or end is typed. Follow its structure and keep
bracketeer's mineral catalogues, now with **several minerals in one run**.

Nothing here may change the exports for the same input. Sessions 2 and 3 of
the example project must still equal `fixtures/session-2.xls` and
`fixtures/session-3.xls` cell for cell, and the exported bytes must equal
those of commit `eb5c6c3` (SHA-256 below). Old project files open unchanged:
no value in them is ever moved by the new automatic numbering.

## 1. Engine

### 1.1 Data model (project file stays `version: 1`; every new field optional)

```ts
/** Which of from/to follow automatically. Anything not marked auto was typed and is kept. */
interface Auto { from?: true; to?: true }

interface Unknown extends SpotRange { name; tag; auto?: Auto }
interface PoolRange extends SpotRange { auto?: Auto }   // Standard.ranges: PoolRange[]

interface Standard {
  …as today;
  mineral?: string;            // catalogue id (e.g. 'apatite'); absent = the main mineral
  perBracket?: number;         // cadence mode: spots per bracket (default recipe.spotsPerSecondary)
  cadence?: 'every' | 'odd' | 'even';   // cadence mode (default 'every')
}
interface Session { …as today; mineral?: string }  // absent = the main mineral
interface Recipe {
  …as today;
  secondaries?: 'rotate' | 'cadence';    // absent = 'rotate' (today)
  openingBracket?: boolean;              // absent = false (today)
  rotationStarts?: Record<string, number>; // other minerals' rotation start; main uses rotationStart
}
interface Project { …as today; grainatlas?: { file: string; spots: SpotRange[] } }
```

- **Auto is opt-in.** Values without an `auto` flag are hand values and never
  move. Every existing project therefore keeps every number. New rows made in
  the app carry `auto` flags.
- `serializeProject` omits absent and default fields, so the example project
  serializes as before. `parseProject` validates each new field (types,
  positive integers, known enums; an `auto.to` range may be empty,
  `to = from − 1`, nothing else may have `to < from`).
- An empty auto range (`to = from − 1`) holds no spots. Every helper that
  walks ranges (`availableSpots`, `rangeSpots`, pool checks) treats it as
  empty.

### 1.2 Several minerals in one run

- The **main mineral** is `project.wizard?.mineral`. A standard or session
  whose `mineral` is absent or equals the main mineral belongs to the main
  group; otherwise to the group of its mineral.
- **References** (role `reference`) are shared by every group; their
  `mineral` is ignored.
- A session uses the references plus the primary and secondaries of its group.
  `@primary` in a block means that group's primary. Secondaries rotate in
  table order within the group.
- Each group with an open session needs exactly one primary. Standard names
  stay unique across the project.
- **Auto from budget** budgets each group on its own (the existing algorithm on
  that group's planned sessions, primary and secondaries; brackets numbered
  `j = 1 … K` within the group). References are drawn in run order across all
  sessions, as today.
- Rotation: the main group starts at `recipe.rotationStart`, another group at
  `recipe.rotationStarts[mineral] ?? 0`. Mark as run moves the start of the
  session's own group.
- A project with one mineral takes exactly today's code path.

### 1.3 Ablation Station-style brackets (Chunk target and Chunk count only)

- **Opening bracket** (`openingBracket`): after the opening block entries, a
  full bracket (its secondaries, then primary × `primaryPerBracket`) before
  chunk 1. It is bracket 1 of the session; the bracket after chunk `i` is then
  bracket `i + 1`. The mid block stays in the bracket after chunk
  `floor((k + 1) / 2)`.
- **Cadence secondaries** (`secondaries: 'cadence'`): no rotation and no pairs.
  Bracket `b` (1-based within the session) draws, for each secondary of the
  group in table order, `perBracket` spots when its cadence is `every`, or
  `odd` and `b` is odd, or `even` and `b` is even; then the primary.
  `secondaryPairsPerBracket` and the rotation are not used.
- In **Auto from budget** both options are unavailable; `planProject`
  reports an input problem ("Every, odd or even secondaries and the opening
  bracket need Chunk target or Chunk count") instead of planning.

With `opening = [NIST610 × 3, NIST612 × 3]`, `openingBracket`, cadence, mid
and closing NIST blocks of 3, and Chunk target `g`, a session gives the same
standard counts and row total as an Ablation Station experiment with group
size `g` and opening, middle and closing blocks on (see the reference table in
the comparison).

### 1.4 The count (`src/lib/engine/count.ts`)

```ts
interface CountTerm { count: number; each: number; label: string } // "37 brackets × 2"
interface StandardCount {
  name: string; role: StandardRole; mineral: string;   // group id, '' for main
  needed: number;        // spots the planned sessions draw from this standard
  spare: number;
  placed: number;        // unique spots in its ranges
  available: number;     // placed − used (typed + fixed sessions) − spare, ≥ 0
  short: number;         // max(0, needed − available)
  perSession: { session: number; needed: number }[];
  terms: CountTerm[];
  formula: string;       // e.g. "2 openings × 2 + 37 brackets × 2 = 78"
}
countStandards(project: Project): StandardCount[]   // table order
```

- `needed` must equal the number of rows of that standard that
  `planProject` emits for the planned sessions, `<name>_?` rows included, in
  every mode. A unit test checks this on every fixture and design below.
- Terms (zero terms dropped, singular when the count is 1):
  - entries in opening, mid, closing blocks: `N openings × c`, `N mids × c`,
    `N closings × c` (N = sessions with that block);
  - primary in brackets: `N brackets × primaryPerBracket` (opening brackets
    included);
  - rotating secondary: `N pairs × spotsPerSecondary`;
  - cadence secondary: `N brackets × perBracket`, label `every`, `odd` or
    `even` brackets (`15 odd brackets × 2`).
- `formula` is the terms joined by `+`, then ` = needed`; `0` when there
  are no terms.
- Golden example (budget, sessions 2 and 3): S513
  `2 openings × 2 + 37 brackets × 2 = 78`; Seiland `10 pairs × 2 = 20`;
  NIST610 `2 openings × 3 + 2 mids × 3 + 2 closings × 3 = 18`.

### 1.5 Automatic numbering (`src/lib/engine/numbering.ts`)

Two chains, each walked in order; an auto value is computed from the one before
it, a hand value stays and the chain continues from it.

- **Unknowns chain**: every session in number order, its unknown entries in
  order. Auto `from` = previous entry's `to` + 1 (1 for the first entry).
  Auto `to` keeps the entry's count: `to = from + (old to − old from)`.
  Fixed sessions are never changed but are part of the chain.
- **Standards chain**: standards in table order, their ranges in order. It
  starts after the highest unknown spot of the project. Auto `from` = the
  previous range's `to` + 1 (an empty range passes its `from − 1` on). Only
  the **last** range of a standard can have an auto `to`. In Chunk target and
  Chunk count it is set so the standard's available spots (skipping used
  spots: typed and fixed sessions) reach `needed + spare`; when earlier ranges
  already cover it the range becomes empty. In Auto from budget an auto `to`
  is left as it is (the pools are what the budget reads).
- A standard with **no ranges** in Chunk target or Chunk count gets one fully
  auto range when it needs spots. A range with both values auto that needs no
  spots and is the standard's only range is removed again.
- `resolveAuto(project): Project` runs the unknowns chain, then
  `countStandards`, then the standards chain. It returns the **same object**
  when nothing changes, is idempotent, and leaves a project without auto
  flags deep-equal (unit test on the example project).

Edits (pure functions returning a resolved project; the UI calls these):

| Edit                      | Effect on that row                                                                                                            | Rows after it                 |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| type an unknown **begin** | `from` hand; `to` auto → `from + count − 1`, a hand `to` stays                                                                | auto values follow; hand stay |
| type an unknown **end**   | `to` hand; the count is `to − from + 1`                                                                                       | as above                      |
| type an unknown **count** | `to = from + count − 1`, `to` auto (it keeps the count when `from` moves)                                                     | as above                      |
| type a standard **begin** | `from` hand; an auto `to` fills from the count                                                                                | as above                      |
| type a standard **end**   | `to` hand; placed changes                                                                                                     | as above                      |
| **Auto** on a hand value  | that value auto again                                                                                                         | as above                      |
| **Add sample**            | new entry, `from` auto (previous `to` + 1), count from the user                                                               |                               |
| **+ range** on a standard | new last range: `from` = highest spot on the mount + 1 (hand), `to` auto; the old last range's `to` becomes hand at its value |                               |

### 1.6 Checks

`checkSpots(project): SpotIssue[]`, each `{ severity: 'error' | 'warning',
message, target }` where the target is an unknown entry (session, index) or a
standard range (name, index). Errors block Next; warnings do not.

- Errors, per material and per mount (the project is one laser scan list):
  two unknown entries share spots (today's message), two entries are the same
  range (`Rows 1 and 3, SYN-H3: the same spots 1–30.`), an unknown spot is in a
  standard range (today), two ranges of one standard overlap
  (`NIST610: ranges 1 and 2 overlap at 850–856.`), two standards' ranges
  overlap (today), a begin or end is missing or not a whole number.
- Warnings: a standard is short (`S513: needs 80, 78 available (2 short).`);
  a used spot outside its pool (today); GrainAtlas, below.

### 1.7 GrainAtlas spots

`parseGrainAtlasSpots(text): { spots: number[]; errors: ParseError[] }`
reads GrainAtlas's laser CSV (`name,x_stage,…,kind,grain,sample,…`, header
required, quoted fields allowed) or a plain list of names, one per line. The
spot number is the integer after the last `_` of the name (GrainAtlas names
spots `{sample}_{n}` or `{sample}_S_{n}`, `n` the laser scan number). Lines
and rasters count as one position each. Stored as
`project.grainatlas = { file, spots: runs }`. When present:

- warning when the project uses more distinct spots (all unknown entries and
  standard ranges) than GrainAtlas placed:
  `This run uses 662 spots; GrainAtlas placed 640 (mount.csv).`;
- warning listing spots the project uses that GrainAtlas did not place, by row
  (`Not placed in GrainAtlas: SYN-H3 31–32, S513 726–727.`, at most 8 items, then
  `and N more`).

### 1.8 Default for new projects

New projects (and Reset recipe) start in **Chunk target** (18), so the count
and the automatic standard spots work before any spot is placed. Auto from
budget stays one click away; the example project keeps its stored mode.

## 2. UI

The four steps stay. Rules from `AGENTS.md` (fit 1440 × 900 and 1280 × 800,
panels scroll inside, plain short English, no emoji, light default) apply.

### Step 1, Mineral

Under the standards list: `Another mineral in this run` with a mineral select
and `Add`. It adds a second standards list for that mineral, titled with its
name, with its own Primary (radio) and Secondaries (checkboxes), the same
rename, reorder and remove controls, and `Remove <mineral>`. References are
listed once, in the main list. Applying the selection stores the extra
mineral's standards with `mineral: '<id>'`. Next needs one primary per listed
mineral.

### Step 2, Unknowns

- Table per session: `Row | Name | Tag | Begin | End | Count | ↑ ↓ ×`. One row
  per entry; an entry with the same name and tag as the row above shows
  `↳ continued` under the name. The paste box stays (`SYN-H3 S 1-30, 35, 40-42`
  makes three entries; pasted numbers are hand values).
- **Add sample** appends a row whose Begin is filled (previous End + 1) and
  focuses Name; typing Count fills End.
- Hand values are marked: the input has a 3 px accent bar on its left and the
  tooltip `Typed by hand; kept when rows above change.` Focusing or hovering a
  hand value shows a small `Auto` button in the cell that makes it automatic
  again. One legend line under the table explains the mark.
- With more than one mineral in the project, the session header has a
  `Mineral` select.
- `Load GrainAtlas spots…` next to `Import sequence…` (file dialog; `.csv` or
  `.txt`). A status line shows `GrainAtlas: 640 spots from mount.csv` with
  `Remove`.
- The **Standards' spots** cards move to step 3. Next is enabled when the
  unknowns validate (today's rules 1–4 and the new unknown errors).

### Step 3, Bracketing

- Left, Recipe, as today, plus: `Secondaries: Rotate pairs | Every, odd or
even` and `Opening bracket (primary and secondaries after the opening
block)`. Both are disabled in Auto from budget with the reason beside them.
- Right, the live summary, then **Standard spots**, one row per standard range
  (replacing the Available / Needed / Left after table and the step-2 cards):

  `Standard (role; mineral when several) | Begin | End | Placed / needed | Used | Spare | + range`

  and in cadence mode also `Per bracket` and `Every / Odd / Even` for
  secondaries. Under each standard, in small muted text, its `formula`
  (`2 openings × 2 + 37 brackets × 2 = 78`). `Placed / needed` shows
  available / needed; a short standard is red with `N short`. Extra ranges sit
  under their standard with `↳`. Fixed-session use stays shown
  (`Session 1 used: 628–649`).

- Hand marks and `Auto` work as in step 2. Everything recomputes live on each
  committed value (blur, Enter, or 300 ms after the last keystroke).
- Next (`Generate and review`) additionally needs every standard of an open
  group to have a valid range and no blocking check.

### Step 4

Unchanged.

## 3. Tests

- Unit (`count.test.ts`): the golden example terms and formulas; `needed`
  equals emitted rows for every standard on the example project and on the
  designs below; the four Ablation Station designs reproduce its per-standard
  counts and per-experiment row totals (table in the comparison); multi-mineral
  (zircon + apatite sessions; each group its own primary, NIST shared; budget
  per group; a single-mineral project unchanged).
- Unit (`numbering.test.ts`): chains, the edit table above, hand values never
  move, empty ranges, budget mode leaves auto ends, idempotence, the example
  project unchanged.
- Unit (`checks.test.ts`) and GrainAtlas parsing (CSV with quotes, plain list,
  `{sample}_S_{n}`, bad lines).
- Export bytes (`export-bytes.test.ts`): SHA-256 of the example project's
  sessions 2 and 3 as `.csv`, TSV, `.xls`, `.xlsx`, equal to commit `eb5c6c3`:

  | File    | Session 2                                                          | Session 3                                                          |
  | ------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
  | `.csv`  | `3466dacf6cba66736f6ac1e4f09a0f471e8a25c54caa05e326f41cc8317869c1` | `dfdd6d8e215da9ba2ff67d1c260c8c9939ba1937cf4d0c7bb1874cb746c07c29` |
  | TSV     | `ee0255ed55aa6339adf5b3a4720d0dde2911fc74c31f9a2cc2b2d6fb046eddb4` | `c70746c6785d93d0bc5e3137f826c3f7592b60c5faadd219712afd0d51859f71` |
  | `.xls`  | `073658bb60fd49c613d16c18a5f89e2df579b69f391fba9ccec12aad204f2bb9` | `a04f0c18625d86abe643e4e2d2eff2529c42434eac1b13baa2785878e1ca728e` |
  | `.xlsx` | `be518318517e7573654f28777b181d6ecd3bba3188c73f9669ef8ce79e819be8` | `ccf34901900d48938b80d50fc47464a2126d01a3fd5700adf7c8fe5c00f41ea0` |

- Playwright: the wizard golden typed by hand through the new step 2 and
  step 3 tables (pools typed as begin/end, `+ range` for NIST610, Auto from
  budget chosen) still gives the fixtures; a design-first project: type
  unknowns, see the count and auto standard spots, type a begin and see the
  end follow, edit a row and see the rows after it move but not a hand value;
  multi-mineral; GrainAtlas warning; sizes at 1440 × 900 and 1280 × 800.

## 4. Milestones (Codex, supervised)

1. Engine: model fields, parse/serialize, minerals, opening bracket, cadence,
   `countStandards`, export-bytes test. No UI change beyond what type checks
   need.
2. Engine: numbering, edits, checks, GrainAtlas parsing, default mode.
3. UI: steps 1–3 as above; e2e and size tests.
4. Docs and screenshots.
