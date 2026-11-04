#!/usr/bin/env python3
"""Independent re-read of session 1 (template) and sessions 2 and 3.

Shares no code with make_sessions.py. Classifies rows purely from the Label
column, then prints per-standard spot usage, unknown chunk sizes and the
composition of every standard block, and checks them against RULES.md.

Usage:  .venv/bin/python verify.py > verify.txt
"""
import csv
import os
import re
import sys

import openpyxl
import xlrd

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = {
    1: os.path.expanduser("~/Downloads/Zircon_04Nov26_Synthetic.xls"),
    2: os.path.join(HERE, "Zircon_04Nov26_Synthetic_2.xls"),
    3: os.path.join(HERE, "Zircon_04Nov26_Synthetic_3.xls"),
}
STANDARDS = ["S513", "91500", "Seiland", "LTSE", "PL", "NIST610", "NIST612"]
POOL = {"S513": (628, 727), "91500": (728, 757), "Seiland": (758, 787),
        "LTSE": (788, 817), "PL": (818, 847), "NIST610": (848, 874),
        "NIST612": (875, 901)}
HEADER = ["Label", "Status", "Duration [s]", "Comment", "Evaluate", "Sample Type",
          "Standard", "Dilution Factor", "Amount", "Final Quantity", "Identifier",
          "Laser Scan Position Number", "Laser Output Setting [%]"]
B, T, N, BO = xlrd.XL_CELL_BLANK, xlrd.XL_CELL_TEXT, xlrd.XL_CELL_NUMBER, xlrd.XL_CELL_BOOLEAN
# (type, value) per column except Label (0) and spot (11): as in the template
CONST = {1: (B, ""), 2: (N, 30.0), 3: (T, "<Comment>"), 4: (BO, 1), 5: (T, "UNKNOWN"),
         6: (T, ""), 7: (N, 1.0), 8: (T, ""), 9: (T, ""), 10: (T, "<Identifier>"),
         12: (N, 46.0)}

failures = []


def check(cond, msg):
    print(("  PASS  " if cond else "  FAIL  ") + msg)
    if not cond:
        failures.append(msg)


def rng(xs):
    xs = sorted(xs)
    if not xs:
        return "-"
    out, a = [], xs[0]
    for p, q in zip(xs, xs[1:] + [None]):
        if q != p + 1:
            out.append(str(a) if a == p else f"{a}-{p}")
            a = q
    return ", ".join(out)


def load(path):
    bk = xlrd.open_workbook(path, formatting_info=True, logfile=open(os.devnull, "w"))
    sh = bk.sheet_by_name("Sheet1")
    rows = []
    types_ok = [sh.cell_value(0, c) for c in range(sh.ncols)] == HEADER
    for r in range(1, sh.nrows):
        label, spot = sh.cell_value(r, 0), sh.cell_value(r, 11)
        for c, (t, v) in CONST.items():
            if sh.cell_type(r, c) != t or sh.cell_value(r, c) != v:
                types_ok = False
        if sh.cell_type(r, 0) != T or sh.cell_type(r, 11) != N:
            types_ok = False
        name, s = re.fullmatch(r"(.+)_(\d+)", label).groups()
        assert int(s) == spot, (label, spot)
        if name in STANDARDS:
            rows.append(("std", name, int(spot), label))
        else:
            m = re.fullmatch(r"(.+?)(?:_(S|xs))?", name)
            rows.append(("unk", m.group(1), int(spot), label))
    return rows, types_ok


def segments(rows):
    """Split into alternating runs of unknowns and standard blocks."""
    segs = []
    for kind, name, spot, label in rows:
        if segs and segs[-1][0] == kind:
            segs[-1][1].append((name, spot))
        else:
            segs.append((kind, [(name, spot)]))
    # The last bracket and the closing block are adjacent standard runs; split
    # the closing block (the final 6 standards) off so it is reported alone.
    if segs and segs[-1][0] == "std" and len(segs[-1][1]) > 6:
        last = segs.pop()[1]
        segs += [("std", last[:-6]), ("std", last[-6:])]
    return segs


def compose(block):
    out = []
    for name, _ in block:
        if out and out[-1][0] == name:
            out[-1][1] += 1
        else:
            out.append([name, 1])
    return " + ".join(f"{n}x{c}" for n, c in out)


data = {}
for sess, path in FILES.items():
    data[sess], types_ok = load(path)
    rows = data[sess]
    print(f"=== Session {sess}: {os.path.basename(path)}")
    n_unk = sum(1 for r in rows if r[0] == "unk")
    print(f"rows: {len(rows)}  (unknowns {n_unk}, standards {len(rows) - n_unk})")
    print("standard spots used (run order -> ranges):")
    for s in STANDARDS:
        sp = [r[2] for r in rows if r[1] == s and r[0] == "std"]
        print(f"  {s:8s} n={len(sp):2d}  {rng(sp)}")
    segs = segments(rows)
    chunks = [len(b) for k, b in segs if k == "unk"]
    print(f"unknown chunks ({len(chunks)}): {chunks}")
    print("unknown samples in order: " + ", ".join(
        f"{n} {rng([s for m, s in ((r[1], r[2]) for r in rows if r[0] == 'unk') if m == n])}"
        for n in dict.fromkeys(r[1] for r in rows if r[0] == "unk")))
    print("standard blocks:")
    for i, (k, b) in enumerate(x for x in segs if x[0] == "std"):
        print(f"  [{i:2d}] {compose(b):45s} spots {', '.join(str(s) for _, s in b)}")
    print("checks:")
    check(types_ok, "header and per-column cell types/values match the template")
    for s in STANDARDS:
        lo, hi = POOL[s]
        check(all(lo <= r[2] <= hi for r in rows if r[1] == s and r[0] == "std"),
              f"{s} spots inside pool {lo}-{hi}")
    if sess == 1:
        print()
        continue
    std_blocks = [compose(b) for k, b in segs if k == "std"]
    exp_rows = {2: 332, 3: 324}[sess]
    exp_chunks = {2: [13] * 6 + [12] * 13, 3: [13] * 12 + [12] * 6}[sess]
    nb = len(exp_chunks)                       # one bracket after every chunk
    rot = ["Seiland", "91500", "PL", "LTSE"]
    doubled = {2: [13], 3: [6, 18]}[sess]      # brackets with two secondary pairs
    mid = {2: 10, 3: 9}[sess]
    start = {2: 0, 3: 20}[sess]                # session 2 used 20 pairs
    check(len(rows) == exp_rows, f"row count {len(rows)} == {exp_rows}")
    check(chunks == exp_chunks, f"chunk sizes {exp_chunks}")
    check(len(std_blocks) == nb + 2, f"{nb + 2} standard blocks (opening + {nb} brackets + closing)")
    check(std_blocks[0] == "NIST612x3 + NIST610x3 + S513x2", "opening = NIST612x3 + NIST610x3 + S513x2")
    check(std_blocks[-1] == "NIST612x3 + NIST610x3", "closing = NIST612x3 + NIST610x3")
    exp_br, q = [], start
    for b in range(1, nb + 1):
        secs = []
        for _ in range(2 if b in doubled else 1):
            secs.append(f"{rot[q % 4]}x2")
            q += 1
        exp_br.append(("NIST610x3 + NIST612x3 + " if b == mid else "")
                      + " + ".join(secs) + " + S513x2")
    check(std_blocks[1:nb + 1] == exp_br,
          f"{nb} brackets = secondary pair(s) + S513x2; two pairs in bracket(s) {doubled}; "
          f"rotation from {rot[start % 4]}; NIST610x3 + NIST612x3 first in bracket {mid}")
    for s in STANDARDS:
        sp = [r[2] for r in rows if r[1] == s and r[0] == "std"]
        check(sp == sorted(sp), f"{s} drawn in ascending order")
    print()

print("=== Cross-session")
all_spots = [r[2] for s in data.values() for r in s]
dups = sorted({x for x in all_spots if all_spots.count(x) > 1})
check(not dups, f"no laser position used twice across sessions 1-3 {dups or ''}")
used = {s: sorted(r[2] for d in data.values() for r in d if r[0] == "std" and r[1] == s)
        for s in STANDARDS}
print("cumulative standard usage after session 3 / spare within pool:")
for s in STANDARDS:
    lo, hi = POOL[s]
    spare = [x for x in range(lo, hi + 1) if x not in used[s]]
    print(f"  {s:8s} used {rng(used[s]):30s} not used {rng(spare)}")
for s in STANDARDS:
    lo, hi = POOL[s]
    check(used[s] == list(range(lo, hi + 1)),
          f"{s} pool {lo}-{hi} fully used across sessions 1-3 (no spare)")
for s, n in {"S513": 78, "91500": 20, "Seiland": 20, "LTSE": 20, "PL": 20,
             "NIST610": 18, "NIST612": 18}.items():
    got = [r[2] for k in (2, 3) for r in data[k] if r[1] == s and r[0] == "std"]
    check(len(got) == n, f"{s}: {n} spots used by sessions 2-3")

print("\n=== Twins (.xlsx, .csv) match the .xls")
for sess in (2, 3):
    xls = [r[3] for r in data[sess]]
    ws = openpyxl.load_workbook(os.path.join(HERE, f"Zircon_04Nov26_Synthetic_{sess}.xlsx")).active
    xl = list(ws.iter_rows(values_only=True))
    ok = (list(xl[0]) == HEADER and [r[0] for r in xl[1:]] == xls
          and all(r[11] == int(l.rsplit("_", 1)[1]) and r[4] is True and r[1] is None
                  and r[2] == 30 and r[12] == 46 for r, l in zip(xl[1:], xls)))
    check(ok, f"session {sess} .xlsx labels/spots/constants identical ({len(xl) - 1} rows)")
    with open(os.path.join(HERE, f"session-{sess}.csv"), newline="") as fh:
        cv = list(csv.reader(fh))
    ok = (cv[0] == HEADER and [r[0] for r in cv[1:]] == xls
          and all(r[11] == l.rsplit("_", 1)[1] for r, l in zip(cv[1:], xls)))
    check(ok, f"session {sess} .csv labels/spots identical ({len(cv) - 1} rows)")

print(f"\nRESULT: {'ALL CHECKS PASSED' if not failures else f'{len(failures)} FAILED'}")
sys.exit(1 if failures else 0)
