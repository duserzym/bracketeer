# The recipe

A project is one experiment with several sessions. **Generate** plans all open sessions together. Imported sessions and sessions marked as run are fixed: their rows stay as they are, and their standard spots count as used.

Each mineral group needs one primary. Secondaries either rotate in table order or follow an Every / Odd / Even rule. Reference standards appear in the opening, mid and closing blocks of the default recipe. Edit the blocks and counts under **Recipe**; **Reset recipe** restores the defaults, including **Chunk target 18**. Old projects keep their saved mode.

## Count first, then place spots

In step 3, **Standard spots** shows Begin, End, Placed / needed, Used and Spare, with each standard's arithmetic underneath. In Chunk target and Chunk count, the count comes from the design before any standard spot is placed. Automatic standard ranges fill to that count. Use Auto from budget when the spots are already placed.

The engine counts only planned sessions. Fixed sessions contribute used spots, not new demand. A missing spot still counts as needed: generation keeps its `<name>_?` row and empty position.

- **Placed** is the number of unique positions in a standard's ranges.
- **Available** is placed minus used positions in those ranges (typed and fixed, counted once), minus spare, with a minimum of zero. The UI's **Placed / needed** cell shows this available count on the left.
- **Needed** is the number of rows that standard will have in the planned sessions. **Short** is `max(0, needed − available)`.
- Each formula term is `count × spots each`: openings, mids and closings count sessions with that block; brackets count primary draws, including an opening bracket; pairs count rotating secondary draws. Cadence terms count every, odd or even brackets for that secondary. Zero terms are left out; no demand shows `0`.

The count uses the same layouts as Generate, so it includes edited blocks, extra pairs and opening brackets.

## Blocks and chunks

With the default recipe, each nonempty session runs in this order:

1. **Opening:** NIST612 × 3, NIST610 × 3, primary × 2.
2. **Chunks and brackets:** each chunk of unknowns is followed by a bracket, including the last chunk. Each bracket draws its secondary pairs, then primary × 2. A pair is two successive draws from the next secondary in the rotation.
3. **Mid:** in bracket `floor((k + 1) / 2)` of a session with `k` chunks, draw NIST610 × 3, then NIST612 × 3, before that bracket's secondary pairs. Brackets are numbered from 1. There is no mid block when `k < 2`.
4. **Closing:** NIST612 × 3, then NIST610 × 3, after the last bracket.

Thus the default order is opening, chunk 1, bracket 1, …, chunk k, bracket k, closing; the mid block sits inside its bracket.

In Chunk target and Chunk count, **Opening bracket** adds a full bracket after the opening block, before chunk 1. It draws the selected secondaries, then the primary. It is bracket 1; the bracket after chunk 1 becomes bracket 2. The mid block still goes after chunk `floor((k + 1) / 2)`, and is absent with fewer than two chunks. The opening bracket adds to any primary already in the opening block. Remove that opening-block primary entry if the full bracket should replace it.

Unknowns keep their input order and ascending spots within each range. A session's `n` unknowns are divided into `k` nonempty chunks, equal to within one spot, with the larger chunks first: `q = floor(n / k)`, `r = n mod k`, so the first `r` chunks have `q + 1` spots and the rest have `q`.

## Three chunking modes

| Mode                       | Rule                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto from budget**       | Derive the bracket and pair counts from the shared standard supply, then share brackets among planned sessions by their unknown counts. **Max pairs per bracket** defaults to 2. |
| **Chunk target** (default) | For each session, `k = ceil(n / target)`. The default target is 18. Chunks are still balanced, rather than filling each chunk to the target in turn.                             |
| **Chunk count**            | Use **Chunks per session**, capped at the number of unknowns. The same setting applies to every planned session.                                                                 |

Chunk target and Chunk count do not reduce the requested counts to fit the standard supply; shortages produce warnings. Empty sessions emit no rows.

## Secondaries: rotation or cadence

**Rotate pairs** is the default. Each bracket uses **Pairs per bracket** (default 1), taking the next secondary in table order for each pair. A pair uses **Spots per secondary** (default 2). Rotation continues across planned sessions of the same mineral group.

Choose **Every, odd or even** to use cadence instead. In Standard spots, set each secondary's **Per bracket** count and **Every / Odd / Even**. On each bracket, all active secondaries are drawn in table order, then the primary. Pair counts and rotation do not apply. Without a stored override, a secondary uses Every and the recipe's Spots per secondary count.

Cadence restarts at bracket 1 for each session. With `B` brackets, Every runs `B` times, Odd runs `ceil(B / 2)` times, and Even runs `floor(B / 2)` times. An opening bracket is included in `B` and starts on Odd. With no opening bracket, the first bracket is after chunk 1.

Cadence and the opening bracket require Chunk target or Chunk count. Choosing **Auto from budget** in the UI clears both options; files that combine them with budget mode report a planning problem.

## Auto from budget, step by step

Let `S` be the number of nonempty planned sessions in one mineral group and `n_i` the unknown count of each. Each group is budgeted separately. Fixed sessions have already spent their spots.

1. **Available spots.** For each standard, count the unique spots in its pool, subtract used spots within that pool and subtract **Keep spare**, stopping at zero. Used spots combine the typed used list and all fixed sessions without counting a spot twice.
2. **Primary budget.** Let `f_primary` be the primary count in opening + mid + closing, and `b` be **Primary per bracket**. Start with `K = floor((available_primary − S × f_primary) / b)`, with a minimum of zero. The defaults have `f_primary = 2` and `b = 2`.
3. **Secondary pair budget.** Each secondary can supply `floor(available / spotsPerSecondary)` pairs. Starting at **Rotation start**, count how many pairs can be drawn in table order before the next secondary lacks a full pair. Call this count `R`; the rotation stops at that shortage even if other secondaries have spots left. Cap `K` at both `R` and the total unknown count. Then set `P = min(R, maxPairsPerBracket × K)`. This gives at least one pair per budgeted bracket, with at most two by default.
4. **Split the brackets.** Share `K` in proportion to `n_i` by the largest-remainder method: take the floors of the shares, then give the leftover brackets to the largest fractional parts. Ties go to the earlier session. Each nonempty session gets at least one bracket.
5. **Spread pairs across the run.** Number all planned brackets `j = 1 … K` in session order. Bracket `j` gets `floor(j × P / K) − floor((j − 1) × P / K)` pairs. The spacing continues across session boundaries.
6. **Rotate secondaries.** Each pair takes the next secondary, starting at **Rotation start** (default 0, the first secondary in table order). Rotation continues across planned sessions. Imported sessions do not move it, since their order may have been chosen by hand. **Mark as run** moves that group’s rotation to the secondary after the session’s last pair; **Start another session** does the same when it fixes a planned session.
7. **Draw spots.** Draw each standard's available spots in ascending order across all its ranges, skipping used spots and spots already drawn. Draws continue across planned sessions in their run order. For example, available 91500 spots 728–737 and 748–757 are drawn in that order.

Reference supply is checked against the required opening, mid and closing draws; it does not set `K`. If the budget cannot give every session a bracket, the app warns and still emits at least one per session, with one secondary pair each. Pool shortages keep the row, with label `<name>_?` and an empty position, so the missing spots remain visible.

The budget uses the supply allowed by these limits. Depending on pool sizes, rotation and unknown counts, some standards can remain unused.

## Keep spare and sample boundaries

**Keep spare** defaults to 0 for each standard. Setting it to `N` reserves the highest `N` unused spots from that standard's pool before generation. It reduces available supply in every mode and can reduce the bracket and pair counts in budget mode. **Placed / needed** uses the available supply after spare has been excluded; the arithmetic shows the planned use.

**Bracket at sample boundaries** is off by default, so a chunk may cross from one sample into the next. When it is on, each sample gets a share of the session's chunks by largest remainder, with at least one per sample. Each sample is then split into balanced chunks of its own. This can increase the chunk count to the number of samples; budget mode warns if the available brackets cannot cover that minimum.

## Several minerals

Use **Another mineral in this run** in step 1, then choose the mineral of each session in step 2. A session uses its group's primary and secondaries, plus the shared reference glasses. The main group is the project's chosen mineral; standards and sessions without a mineral field belong to it. Reference standards ignore the mineral field. Standard names must stay unique across the project.

The recipe is shared. **Primary** in a block means the session group's primary. Keep block entries that apply to every group, such as shared references and Primary. Each group has its own budget and secondary rotation; Auto from budget shares brackets only among that group's planned sessions. The main group uses **Rotation start**; extra groups have their own Rotation start control. Mark as run advances only that group's rotation, and cadence does not advance a rotation. Reference spots are drawn once from their shared pools, in session run order across all groups.

## Automatic numbering

Two chains run after an edit. Only values marked automatic move. Typed and pasted numbers, and numbers in old project files without auto flags, stay as they are. The accent bar marks a hand value; focus or hover it to show **Auto**.

1. **Unknowns:** sessions in number order, then entries in table order. Automatic Begin is the previous End + 1, starting at 1. Automatic End keeps the row's count when Begin moves: `End = Begin + Count − 1`. Fixed sessions stay unchanged and still pass their End to the next entry. Add sample starts an automatic row with count 1; type Count to set its length. Typing Begin makes Begin hand; typing End makes End hand; typing Count makes End automatic again.
2. **Standards:** table order, then each standard's ranges in order, starting after the highest unknown spot in the project. Automatic Begin is the previous range's End + 1. In Chunk target and Chunk count, only the last range can have an automatic End. It fills until the standard has `needed + spare` unused positions across its ranges, skipping typed and fixed-session use. It becomes empty when earlier ranges already cover the count. Auto from budget keeps the End as it is, because it reads the placed supply.

A standard with no ranges gets an automatic range when it needs spots or spare. A sole fully automatic range is removed when it needs neither. An empty automatic range has End = Begin − 1 and contains no spots.

**+ range** starts a new range above the highest position known on the mount, including used spots, existing rows and loaded GrainAtlas spots. Its Begin is hand and its End automatic. The previous last End becomes hand at its current value; an empty automatic last range is dropped before adding the new one. Type the new Begin if the extra spots are elsewhere.

When an incomplete recipe cannot be counted, numbering still resolves unknowns and automatic Begins, keeps standard Ends, and leaves the planning problem visible. Spot checks still run.

**Load GrainAtlas spots…** in step 2 reads a laser CSV with `name` and `x_stage` headers, or one spot name per line. The number is taken after the last underscore (`SYN-1_S_31` means position 31). Lines and rasters count as one position each. The app checks all unknown and standard ranges against those positions and warns about missing spots or a larger distinct total. These warnings do not block Next.

## Warnings

Warnings are computed from the current rows, so they also apply after manual edits. They name the affected rows; click a warning below the grid to select them. Cross-session duplicate warnings also link to the other session.

- A standard row has no spot available (pool exhausted).
- A position is repeated within a session or across project sessions, including unknowns.
- A standard row's position is outside its pool.
- A standard row uses a spot in its typed used list or in another fixed session.
- An unknown row's position is outside its sample range.
- A row label is not recognized.

The Recipe panel also reports shortages, including reference supply below the required block counts, too few budgeted brackets and a spare request larger than the unused pool.

## Today's worked example

This is [fixtures/RULES.md, revision 3](../fixtures/RULES.md). Synthetic session 1 simulates hand entry and is imported from `fixtures/synthetic-session-1.xls`, not regenerated. Its 245 rows stay fixed. Sessions 2 and 3 are planned together in **Auto from budget**, with spare 0 and sample boundaries off.

After session 1, S513 has **78 available** spots. Each of Seiland, 91500, PL and LTSE has 20 available spots; NIST610 and NIST612 each have 18.

- The two openings use 4 S513, leaving `K = (78 − 4) / 2 = 37` brackets.
- Split 37 by the unknown counts **234 : 228**. The shares are about 18.74 and 18.26, so largest remainder gives **19 + 18** brackets.
- The four secondary pools supply `P = (4 × 20) / 2 = 40` pairs, below the cap of `2 × 37`. The rotation is **Seiland → 91500 → PL → LTSE**.
- The run-wide pair formula gives two pairs in brackets **13, 25 and 37**. These are session 2 bracket 13, and session 3 brackets 6 and 18. All other brackets get one pair.

| Item                       | Session 2                      | Session 3                    |
| -------------------------- | ------------------------------ | ---------------------------- |
| Unknowns                   | 234                            | 228                          |
| Chunks / brackets          | 19                             | 18                           |
| Chunk sizes                | Six of 13, then thirteen of 12 | Twelve of 13, then six of 12 |
| Mid block                  | Bracket 10                     | Bracket 9                    |
| Secondary pairs            | 20                             | 20                           |
| Rows, excluding the header | 332                            | 324                          |

The Standard spots table gives these formulas for the planned sessions:

- S513: `2 openings × 2 + 37 brackets × 2 = 78`.
- Seiland: `10 pairs × 2 = 20` (the same count for each secondary).
- NIST610: `2 openings × 3 + 2 mids × 3 + 2 closings × 3 = 18` (also NIST612).

With the default blocks, rows = `n + 8 + 2k + 2 × pairs + 6 + 6`. That is `234 + 8 + 38 + 40 + 6 + 6 = 332` and `228 + 8 + 36 + 40 + 6 + 6 = 324`. Each session uses nine of each NIST standard. Each uses 20 secondary pairs, so session 3 starts at Seiland too.

Across sessions 1–3, **every standard pool is fully used**. The generated sessions match `fixtures/synthetic-session-2.xls` and `fixtures/synthetic-session-3.xls` cell for cell in values and types; the app exports unstyled workbooks.

With **Chunk target 18** and one pair per bracket instead, both sessions have **13 brackets**, with the mid block at bracket 7. They have **306 + 300 rows** and leave **22 S513 spots and 28 secondary spots** unused. The NIST pools are still fully used.

## Ablation Station-style example: design A, 2026-11-10

This is the first saved design in [the comparison](ablation-station-comparison.md). Set two zircon sessions with **194** and **168** unknowns, **Chunk target 14**, sample boundaries off and spare 0. Use S513 as primary; keep LTSE, Seiland and 91500 as secondaries, in that order, with PL unchecked.

- Set **Primary per bracket** to 2 and **Secondaries** to Every, odd or even.
- Set LTSE and Seiland to **2, Odd**, and 91500 to **2, Even**.
- Turn on **Opening bracket**.
- Set opening, mid and closing blocks to **NIST610 × 3, NIST612 × 3**. Remove the default Primary entry from the opening block, since the opening bracket supplies it.

The sessions have `ceil(194 / 14) = 14` and `ceil(168 / 14) = 12` balanced chunks. With the opening bracket, they have **15 and 13 brackets**. Parity restarts each session: Odd has `8 + 7 = 15` brackets and Even has `7 + 6 = 13`.

| Standard | Needed across both sessions | Formula                                             |
| -------- | --------------------------- | --------------------------------------------------- |
| S513     | 56                          | `28 brackets × 2 = 56`                              |
| LTSE     | 30                          | `15 odd brackets × 2 = 30`                          |
| Seiland  | 30                          | `15 odd brackets × 2 = 30`                          |
| 91500    | 26                          | `13 even brackets × 2 = 26`                         |
| NIST610  | 18                          | `2 openings × 3 + 2 mids × 3 + 2 closings × 3 = 18` |
| NIST612  | 18                          | `2 openings × 3 + 2 mids × 3 + 2 closings × 3 = 18` |

The row totals are **288 and 252**, matching Ablation Station. Its saved ranges were NIST610 363–380, NIST612 381–398, S513 399–454, LTSE 455–484, Seiland 485–514 and 91500 515–540. Enter those as hand endpoints to keep that mount layout; automatic ranges can instead propose a layout from the count. bracketeer balances the chunks and draws secondaries before the primary, so the individual row order differs from Ablation Station.
