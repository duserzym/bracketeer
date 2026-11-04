# The recipe

A project is one experiment with several sessions. **Generate** plans all open sessions together. Imported sessions and sessions marked as run are fixed: their rows stay as they are, and their standard spots count as used.

There must be exactly one primary standard. Secondary standards rotate in table order. Reference standards appear in the opening, mid and closing blocks of the default recipe. All block contents and counts can be edited under **Recipe**; **Menu → Reset recipe** restores the defaults.

## Blocks and chunks

With the default recipe, each nonempty session runs in this order:

1. **Opening:** NIST612 × 3, NIST610 × 3, primary × 2.
2. **Chunks and brackets:** each chunk of unknowns is followed by a bracket, including the last chunk. Each bracket draws its secondary pairs, then primary × 2. A pair is two successive draws from the next secondary in the rotation.
3. **Mid:** in bracket `floor((k + 1) / 2)` of a session with `k` chunks, draw NIST610 × 3, then NIST612 × 3, before that bracket's secondary pairs. Brackets are numbered from 1. There is no mid block when `k < 2`.
4. **Closing:** NIST612 × 3, then NIST610 × 3, after the last bracket.

Thus the order is opening, chunk 1, bracket 1, …, chunk k, bracket k, closing; the mid block sits inside its bracket.

Unknowns keep their input order and ascending spots within each range. A session's `n` unknowns are divided into `k` nonempty chunks, equal to within one spot, with the larger chunks first: `q = floor(n / k)`, `r = n mod k`, so the first `r` chunks have `q + 1` spots and the rest have `q`.

## Three chunking modes

| Mode                           | Rule                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auto from budget** (default) | Derive the bracket and pair counts from the shared standard supply, then share brackets among planned sessions by their unknown counts. **Max pairs per bracket** defaults to 2. |
| **Chunk target**               | For each session, `k = ceil(n / target)`. The default target is 18. Chunks are still balanced, rather than filling each chunk to the target in turn.                             |
| **Chunk count**                | Use **Chunks per session**, capped at the number of unknowns. The same setting applies to every planned session.                                                                 |

Chunk target and Chunk count use **Pairs per bracket**, default 1, for every bracket. They do not reduce the requested counts to fit the standard supply; shortages produce warnings. Empty sessions emit no rows.

## Auto from budget, step by step

Let `S` be the number of nonempty planned sessions and `n_i` the unknown count of each. Fixed sessions have already spent their spots.

1. **Available spots.** For each standard, count the unique spots in its pool, subtract used spots within that pool and subtract **Keep spare**, stopping at zero. Used spots combine the typed used list and all fixed sessions without counting a spot twice.
2. **Primary budget.** Let `f_primary` be the primary count in opening + mid + closing, and `b` be **Primary per bracket**. Start with `K = floor((available_primary − S × f_primary) / b)`, with a minimum of zero. The defaults have `f_primary = 2` and `b = 2`.
3. **Secondary pair budget.** Each secondary can supply `floor(available / spotsPerSecondary)` pairs. Starting at **Rotation start**, count how many pairs can be drawn in table order before the next secondary lacks a full pair. Call this count `R`; the rotation stops at that shortage even if other secondaries have spots left. Cap `K` at both `R` and the total unknown count. Then set `P = min(R, maxPairsPerBracket × K)`. This gives at least one pair per budgeted bracket, with at most two by default.
4. **Split the brackets.** Share `K` in proportion to `n_i` by the largest-remainder method: take the floors of the shares, then give the leftover brackets to the largest fractional parts. Ties go to the earlier session. Each nonempty session gets at least one bracket.
5. **Spread pairs across the run.** Number all planned brackets `j = 1 … K` in session order. Bracket `j` gets `floor(j × P / K) − floor((j − 1) × P / K)` pairs. The spacing continues across session boundaries.
6. **Rotate secondaries.** Each pair takes the next secondary, starting at **Rotation start** (default 0, the first secondary in table order). Rotation continues across planned sessions. Imported sessions do not move it, since their order may have been chosen by hand. **Mark as run** moves it to the secondary after that session's last pair; **+** does the same when it fixes a planned session.
7. **Draw spots.** Draw each standard's available spots in ascending order across all its ranges, skipping used spots and spots already drawn. Draws continue across planned sessions in their run order. For example, available 91500 spots 728–737 and 748–757 are drawn in that order.

Reference supply is checked against the required opening, mid and closing draws; it does not set `K`. If the budget cannot give every session a bracket, the app warns and still emits at least one per session, with one secondary pair each. Pool shortages keep the row, with label `<name>_?` and an empty position, so the missing spots remain visible.

The budget uses the supply allowed by these limits. Depending on pool sizes, rotation and unknown counts, some standards can remain unused.

## Keep spare and sample boundaries

**Keep spare** defaults to 0 for each standard. Setting it to `N` reserves the highest `N` unused spots from that standard's pool before generation. It reduces available supply in every mode and can reduce the bracket and pair counts in budget mode. **Left after** shows what remains from the available supply after planned use; the reserved spare has already been excluded.

**Bracket at sample boundaries** is off by default, so a chunk may cross from one sample into the next. When it is on, each sample gets a share of the session's chunks by largest remainder, with at least one per sample. Each sample is then split into balanced chunks of its own. This can increase the chunk count to the number of samples; budget mode warns if the available brackets cannot cover that minimum.

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

This is [fixtures/RULES.md, revision 3](../fixtures/RULES.md). Session 1 was hand-made and is imported from `fixtures/session-1.xls`, not regenerated. Its 245 rows stay fixed. Sessions 2 and 3 are planned together with spare 0 and sample boundaries off.

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

With the default blocks, rows = `n + 8 + 2k + 2 × pairs + 6 + 6`. That is `234 + 8 + 38 + 40 + 6 + 6 = 332` and `228 + 8 + 36 + 40 + 6 + 6 = 324`. Each session uses nine of each NIST standard. Each uses 20 secondary pairs, so session 3 starts at Seiland too.

Across sessions 1–3, **every standard pool is fully used**. The generated sessions match `fixtures/session-2.xls` and `fixtures/session-3.xls` cell for cell in values and types; the app exports unstyled workbooks.

With **Chunk target 18** and one pair per bracket instead, both sessions have **13 brackets**, with the mid block at bracket 7. They have **306 + 300 rows** and leave **22 S513 spots and 28 secondary spots** unused. The NIST pools are still fully used.
