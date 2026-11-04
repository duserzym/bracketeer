# Bracketing rules: zircon U-Pb, 2026-11-04, sessions 2 and 3

These rules generated four files from the session-1 sample list `~/Downloads/Zircon_04Nov26_Synthetic.xls`:

- `Zircon_04Nov26_Synthetic_2.xls` and `_3.xls`
- an `.xlsx` and a `.csv` copy of each

Two scripts check the result:

- `make_sessions.py` implements the rules and asserts every number below.
- `verify.py` re-reads all three workbooks independently. Its output is in `verify.txt`.

The two workbooks also serve as golden test fixtures for the `bracket` app.

**Goal for this run (set by Yiming): leave no spare standards.** After session 3, every registered spot on the standard mounts is used.

## Row format (Qtegra sample list)

The sheet is named `Sheet1`. It has one header row, then one row per spot. The table lists the 13 columns in order and with their exact spelling.

**Cell types are copied from the session-1 file, cell for cell.** Fixture tests must check the types as well as the values.

| # | Column | Value | Cell type |
|---|---|---|---|
| 0 | Label | see below | text |
| 1 | Status | — | **empty (blank) cell** |
| 2 | Duration [s] | 30 | number |
| 3 | Comment | `<Comment>` | text |
| 4 | Evaluate | TRUE | **boolean**, not the number 1 |
| 5 | Sample Type | `UNKNOWN`, for standards too | text |
| 6 | Standard | "" | **empty-string text** cell, not a blank cell |
| 7 | Dilution Factor | 1 | number |
| 8 | Amount | "" | **empty-string text** |
| 9 | Final Quantity | "" | **empty-string text** |
| 10 | Identifier | `<Identifier>` | text |
| 11 | Laser Scan Position Number | spot number | number |
| 12 | Laser Output Setting [%] | 46 | number |

Labels:

| Row type | Format | Examples |
|---|---|---|
| Unknown with a size tag | `<sample>_<tag>_<spot>` | `HH3_S_1`, `SYN-K2_S_182`, `SYN-A1_xs_488` |
| Unknown without a size tag | `<sample>_<spot>` | `SYN-V1_384` |
| Standard | `<standard>_<spot>` | `S513_650`, `91500_728` |

The `.xlsx` copy holds the same values, with `None` in Status. The `.csv` copy writes Evaluate as `TRUE` and leaves the empty cells empty.

Formatting follows the template:

- 8 pt Microsoft Sans Serif
- grey header row with white text
- the template's column widths

## Standard pools and availability

A spot is available if it is in its standard's pool and session 1 did not use it. The session-1 usage is read from the template file, not entered by hand.

| Standard | Role | Pool | Used by session 1 | Available for sessions 2–3 |
|---|---|---|---|---|
| S513 | primary | 628–727 | 628–649 (22) | 650–727 (78) |
| 91500 | secondary | 728–757 | 738–747 (10) | 728–737, 748–757 (20) |
| Seiland | secondary | 758–787 | 768–777 (10) | 758–767, 778–787 (20) |
| LTSE | secondary | 788–817 | 798–807 (10) | 788–797, 808–817 (20) |
| PL | secondary | 818–847 | 828–837 (10) | 818–827, 838–847 (20) |
| NIST610 | glass | 848–874 | 857–865 (9) | 848–856, 866–874 (18) |
| NIST612 | glass | 875–901 | 893–901 (9) | 875–892 (18) |

## Recipe: no spare standards (the app's default)

### Session layout

Each session runs in this order:

1. **Opening block:** NIST612 ×3, NIST610 ×3, S513 ×2.
2. **Chunks and brackets:** k chunks of unknowns, each followed by a bracket. There is a bracket after every chunk, the last one included. A bracket is one or two **secondary pairs** followed by **S513 ×2**.
3. **Mid block:** bracket m = floor((k + 1) / 2) also carries NIST610 ×3 then NIST612 ×3, placed before its secondary pair(s).
4. **Closing block:** NIST612 ×3, NIST610 ×3, after the last bracket.

The NIST blocks use 9 NIST610 and 9 NIST612 spots per session, so two sessions use up the 18 of each exactly.

### How many brackets

The S513 supply sets the bracket count. Each session spends 2 S513 on the opening and 2 on each bracket, so across all sessions:

> **K = (available S513 − 2 × sessions) / 2** = (78 − 4) / 2 = **37 brackets**

The 37 brackets are shared between the sessions in proportion to their unknowns, using the largest-remainder method. A tie goes to the earlier session.

> 37 × 234/462 = 18.74 and 37 × 228/462 = 18.26, so session 2 gets **k = 19** and session 3 gets **k = 18**.

### Chunk sizes

Each session's unknowns are joined in run order and split into k chunks. Sizes are equal to within 1, with the larger chunks first. Chunks ignore sample boundaries. A sanity check requires that no chunk exceeds 18.

### Secondary pairs

There are **P = 80 / 2 = 40 pairs** in total: 20 free spots in each of the four secondary pools, divided by 2.

- **Order.** Pairs are drawn in the rotation **Seiland → 91500 → PL → LTSE**. The rotation continues across sessions. Session 2 starts at Seiland. Session 3 also starts at Seiland, because session 2 used 20 pairs.
- **Doubled brackets.** Number the 37 brackets of the whole run j = 1 to 37. Bracket j gets floor(j·P/K) − floor((j−1)·P/K) pairs. That is one pair each, plus two pairs in **3 evenly spaced brackets**: run brackets 13, 25 and 37.
  - In session 2, that is bracket 13.
  - In session 3, it is brackets 6 and 18, the last bracket of the run.
  - A doubled bracket holds two consecutive pairs from the rotation, the way session 1's brackets did.
- **Rotation balance.** 40 pairs over a 4-standard rotation gives exactly 10 pairs (20 spots) of each secondary.

### Drawing spots

Each standard takes its spots in ascending order from its available spots, in run order. Used spots are skipped, so 91500 runs 728–737 and then 748–757. The draw continues from session 2 into session 3.

### Rows per session

Rows = n + 8 (opening) + 2k (S513 in brackets) + 2 × pairs + 6 (mid block) + 6 (closing).

## Sessions

### Session 2

Unknowns (n = 234, size tag `S`), in run order: SYN-H3 1–30, SYN-H4 31–55, SYN-H5 56–83, SYN-H11 84–90, SYN-T1 91–116, SYN-T2 117–119, DKR1 120–131, SYN-W2 132–142, SYN-S2 143–167, SYN-S12 168–181, SYN-K2 182–192, SYN-W1 193–234.

| Item | Value |
|---|---|
| Chunks | k = 19: six of 13, then thirteen of 12 |
| Mid block | bracket 10 |
| Doubled bracket | 13 (Seiland + 91500) |
| Secondary pairs | 20 |
| Rows | 234 + 8 + 38 + 40 + 6 + 6 = **332** |

| Standard | Spots used | Count |
|---|---|---|
| S513 | 650–689 | 40 |
| 91500 | 728–737 | 10 |
| Seiland | 758–767 | 10 |
| PL | 818–827 | 10 |
| LTSE | 788–797 | 10 |
| NIST610 | 848–856 | 9 |
| NIST612 | 875–883 | 9 |

### Session 3

Unknowns (n = 228, size tag `xs`), in run order: SYN-J1 235–252, SYN-M1 253–302, SYN-F1 303–322, SYN-A1 488–627.

| Item | Value |
|---|---|
| Chunks | k = 18: twelve of 13, then six of 12 |
| Mid block | bracket 9 |
| Doubled brackets | 6 (91500 + PL) and 18 (PL + LTSE) |
| Secondary pairs | 20 |
| Rows | 228 + 8 + 36 + 40 + 6 + 6 = **324** |

| Standard | Spots used | Count |
|---|---|---|
| S513 | 690–727 | 38 |
| 91500 | 748–757 | 10 |
| Seiland | 778–787 | 10 |
| PL | 838–847 | 10 |
| LTSE | 808–817 | 10 |
| NIST610 | 866–874 | 9 |
| NIST612 | 884–892 | 9 |

### Worked example: session 3 standard blocks

```
opening   NIST612 884-886, NIST610 866-868, S513 690-691
b1        Seiland 778-779, S513 692-693
b2        91500 748-749,   S513 694-695
b3        PL 838-839,      S513 696-697
b4        LTSE 808-809,    S513 698-699
b5        Seiland 780-781, S513 700-701
b6        91500 750-751, PL 840-841, S513 702-703          (doubled)
b7        LTSE 810-811,    S513 704-705
b8        Seiland 782-783, S513 706-707
b9        NIST610 869-871, NIST612 887-889, 91500 752-753, S513 708-709
b10       PL 842-843,      S513 710-711
b11       LTSE 812-813,    S513 712-713
b12       Seiland 784-785, S513 714-715
b13       91500 754-755,   S513 716-717
b14       PL 844-845,      S513 718-719
b15       LTSE 814-815,    S513 720-721
b16       Seiland 786-787, S513 722-723
b17       91500 756-757,   S513 724-725
b18       PL 846-847, LTSE 816-817, S513 726-727           (doubled)
closing   NIST612 890-892, NIST610 872-874
```

## State after session 3 (asserted)

- No laser position is used twice across sessions 1–3, unknowns included.
- Every standard spot is inside its own pool.
- **Every pool is fully used:** S513 628–727, 91500 728–757, Seiland 758–787, LTSE 788–817, PL 818–847, NIST610 848–874, NIST612 875–901.
- **No standard spots are left for reruns.** A rerun would need newly registered positions.

## Revision history

1. **Superseded.** 10 fixed chunks, and the lower 10 spots of each secondary pool treated as unavailable.
2. **Superseded.** Those lower spots confirmed fresh. Chunks of at most 18, giving 13 brackets per session and 306 + 300 rows. This left 22 S513 and 28 secondary spots spare.
3. **This version.** No spare standards. The bracket count comes from the S513 supply, giving 37 brackets of 12–13 unknowns. The 40 secondary pairs are spread over those brackets, with 3 evenly spaced doubled brackets. The result is 332 + 324 rows.

## Reproduce

```
python3 -m venv .venv && .venv/bin/pip install xlrd xlwt openpyxl
.venv/bin/python make_sessions.py      # writes outputs, runs self-checks
.venv/bin/python verify.py > verify.txt
```

Reruns produce byte-identical files. The `.xlsx` timestamps are fixed at 2026-11-04 so that this holds.
