# Ablation Station and bracketeer (2026-11-18)

IGL Ablation Station is Boise State's planning page for laser sessions
(Isotope Geology Laboratory; "designed by M. Mohr, A.I. assisted, based on
the IGL experiment maker workbook"). Yiming brought back the page and five
saved setups from the November 2026 visit. This note describes what it does
in our own words, so that bracketeer can take over what works. Its code is
not copied; the numbers below were obtained by running the page's own
calculation on Yiming's saved setups.

## What it is

One self-contained HTML file (about 220 KB, no server, no install) that runs
in a browser. The whole tool is one page with four cards, recalculated on
every keystroke:

1. **Run settings**: mineral (zircon, apatite, titanite, rutile, monazite),
   _unknowns between standard blocks_ (the group size, e.g. 14 or 15), the
   name delimiter (space or underscore) and which concentration blocks to
   run (any of start, middle, end).
2. **Unknowns**: one row per sample range: experiment ID, sample name, start
   spot, end spot, and a computed spot count. An experiment is one sequence
   (bracketeer's _session_).
3. **Concentration standards** (NIST610, NIST612; BHVO, BCR and BIR offered):
   material, spots per block, start, end, and **placed / needed**.
4. **Age standards**: material (from the mineral's list), spots when primary,
   spots when secondary, a secondary **frequency** (Every, Odd, Even block),
   start, end, which experiments use it (all by default), and **placed /
   needed**. A default primary for the run, with per-experiment overrides.

Every standard can have extra spot ranges ("+ Spot range"), used in order.
Setups are saved and loaded as JSON. Output is a tab per experiment with two
read-only columns (analysis name and spot number), copy buttons for each
column, and one CSV per experiment (`name,spot`, no header).

## The workflow it supports

Design first, then place: the user types the unknowns and the block rule,
reads off how many spots each standard needs, places exactly that many on
the mount, types each standard's start and end, and copies the lists. All
four of Yiming's saved designs placed exactly the counts the page computed
(table below), so this is how the page is used.

## How it counts standard spots

Per experiment with `n` unknown spots and group size `g`:

- groups `G = ceil(n / g)`; unknowns are cut into groups of `g` in table
  order, the last one shorter;
- age blocks `A = (G − 1) + opening + closing`, where opening and closing
  are 1 when the opening or closing age block is on (both on in every saved
  setup); one block between consecutive groups;
- concentration blocks `C = start + middle + end` (0 to 3);
- each age standard needs `spots × blocks`, where spots is its "spots when
  primary" if it is that experiment's primary, else "spots when secondary",
  and blocks is `A` for Every (always for the primary), `ceil(A / 2)` for
  Odd and `floor(A / 2)` for Even (blocks are numbered from 1 in run order);
- each concentration standard needs `per block × C`.

The needs are summed over the experiments that use the standard. "Placed" is
the size of its ranges; the page warns when needed exceeds placed. Spots are
drawn in ascending order from the start, through the extra ranges, continuing
across experiments in ID order. A spot beyond the ranges is still listed, as
`MISSING SPOT: <name> <n>` with a blank spot cell.

Row order of one experiment: opening concentration block, opening age block,
then group, age block, group, …, last group, closing age block, closing
concentration block. An age block is the primary first, then the active
secondaries in table order. The middle concentration block goes after the
age block whose count of unknowns before it is closest to half the
experiment.

Analysis names are `<sample><delimiter><spot>`. The page refuses to copy or
save while any analysis name or spot number appears twice across all
experiments, and lists the conflicts.

### The four saved designs (reference values for our tests)

| Setup               | Experiments: unknowns (g) | Age blocks | Rows          | S513 | LTSE | Seiland | 91500 | PL  | NIST610 | NIST612 |
| ------------------- | ------------------------- | ---------- | ------------- | ---- | ---- | ------- | ----- | --- | ------- | ------- |
| 2026-11-10          | 194, 168 (14)             | 15, 13     | 288, 252      | 56   | 30   | 30      | 26    |     | 18      | 18      |
| 2026-11-12          | 201 (15)                  | 15         | 309           | 30   | 15   | 15      | 15    | 15  | 9       | 9       |
| 2026-11-12, setup 2 | 175, 166 (14)             | 14, 13     | 263, 250      | 54   | 28   | 28      | 26    |     | 18      | 18      |
| 2026-11-17          | 156, 198, 184 (14)        | 13, 16, 15 | 240, 296, 278 | 88   | 46   | 46      | 42    |     | 27      | 27      |

Block rules: 2026-11-10, 11-12 setup 2 and 11-17 run S513 × 2 every block,
LTSE and Seiland × 2 on odd blocks, 91500 × 2 on even blocks; 2026-11-12
runs S513 × 2 and each of four secondaries × 1 on every block. All have
opening, middle and closing NIST blocks of 3 each. A fifth file
(2026-11-10_1) repeats 2026-11-10. In every setup "placed" equalled
"needed": Yiming placed exactly what the page asked for.

## Side by side

|                   | Ablation Station                                            | bracketeer before this update                                                        |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Runs as           | one HTML page in a browser                                  | desktop app (Windows exe, macOS), and the same page as a single HTML file            |
| Direction         | design → how many standard spots to place                   | placed pools → how many brackets they allow (Auto from budget), or a chunk target    |
| Shows the count   | placed / needed per standard, live                          | available / needed / left after, live, in step 3                                     |
| Unknown spots     | start, end per row                                          | a spot list per sample (`1-30, 35, 40-42`)                                           |
| Standard spots    | start, end, extra ranges                                    | a pool list and a used list per standard                                             |
| Group size        | fixed groups of `g`, the last shorter                       | balanced chunks (equal within one, larger first)                                     |
| Secondaries       | several per block, each Every / Odd / Even                  | one pair per bracket, rotating through the secondaries; budget may double some       |
| Opening age block | full block (primary and secondaries)                        | primary × 2 only                                                                     |
| Several minerals  | one mineral per setup; per-experiment primary and standards | one mineral per project; nine mineral catalogues with editable standard lists        |
| Earlier sessions  | none                                                        | imported or run sessions are fixed and their spots count as used                     |
| Output            | names and spot numbers, CSV per experiment                  | full 13-column Qtegra sheet: `.xls`, `.xlsx`, `.csv`, Copy for Qtegra; editable grid |
| Checks            | duplicate names or spots block export; shortage notice      | duplicate spot, outside pool, already used, outside sample, exhausted pool           |

## What bracketeer takes over

- The **count from the design** (placed / needed per standard, with the
  arithmetic), live, before any standard spot is placed.
- **Start and end** columns for unknowns and standards, with extra ranges.
- **Every / Odd / Even** secondaries with their own spots per block, and an
  opening block that can be a full age block, so Boise-style designs give the
  same counts and row totals as the page.
- **Per-session primary and standards**, which is how one run carries several
  minerals or recipes.
- Duplicate spot checks within a session and across sessions. With bracketeer’s generated labels, a duplicate label also means a duplicate spot.

## What bracketeer does not copy, and why

- **Fixed groups with a short last group.** bracketeer keeps balanced chunks;
  the count of brackets, and so of standard spots, is the same
  (`ceil(n / g)` either way), and the brackets come out more even.
- **Names with a space delimiter** and the two-column output. Qtegra needs
  the full sheet, and the lab's labels are `name_tag_spot`; bracketeer keeps
  its exports byte for byte.
- **`MISSING SPOT` labels with a guessed spot.** bracketeer keeps its
  `<name>_?` row with an empty position and a warning, so an unplaced spot is
  never given a number that could belong to something else.
- **A standard that is primary in one experiment and secondary in another**
  ("spots when primary / when secondary"). bracketeer gives each standard one
  role; a session can still choose its own primary.
- **Optional opening and closing age blocks.** bracketeer always brackets
  after the last chunk; the opening age block is an option.
- **Save folder through the browser's folder picker.** The desktop app has
  native file dialogs.
- **The fixed mineral lists.** bracketeer keeps its nine editable catalogues.
