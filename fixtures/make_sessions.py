#!/usr/bin/env python3
"""Generate Qtegra sample lists for sessions 2 and 3 of the 2026-11-04 zircon
U-Pb LA-ICP-MS experiment (Analyst A / Analyst B), using only the standard spots
that session 1 did not consume, and leaving no standard spot spare.

Deterministic: same template in -> byte-identical .xls/.xlsx/.csv out. The recipe is
documented in RULES.md next to this file.

Usage:  .venv/bin/python make_sessions.py [path/to/session1.xls]
"""
from __future__ import annotations

import csv
import io
import os
import re
import sys
import zipfile

import openpyxl
import xlrd
import xlwt
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from xlwt.Cell import StrCell

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.expanduser("~/Downloads/Zircon_04Nov26_Synthetic.xls")
OUT_STEM = "Zircon_04Nov26_Synthetic"
SHEET = "Sheet1"

HEADER = [
    "Label", "Status", "Duration [s]", "Comment", "Evaluate", "Sample Type",
    "Standard", "Dilution Factor", "Amount", "Final Quantity", "Identifier",
    "Laser Scan Position Number", "Laser Output Setting [%]",
]

# Laser positions registered on the standard mounts (inclusive ranges).
POOLS = {
    "S513": (628, 727),
    "91500": (728, 757),
    "Seiland": (758, 787),
    "LTSE": (788, 817),
    "PL": (818, 847),
    "NIST610": (848, 874),
    "NIST612": (875, 901),
}

# Recipe parameters (the app's default recipe).
# "No spare standards": the bracket count is set by the S513 supply, and the
# secondary pairs are spread over all brackets, so every free spot is used.
MAX_CHUNK = 18             # sanity cap: never more than 18 unknowns between brackets
OPENING = [("NIST612", 3), ("NIST610", 3), ("S513", 2)]
MID_BLOCK = [("NIST610", 3), ("NIST612", 3)]   # inserted in bracket mid_at(n_chunks)
CLOSING = [("NIST612", 3), ("NIST610", 3)]
ROTATION = ["Seiland", "91500", "PL", "LTSE"]  # secondary pairs, in this order
ROTATION_START = "Seiland"                     # first pair of session 2
PRIMARY_PER_BRACKET = ("S513", 2)
SECONDARY_PER_BRACKET = 2

# Unknowns, in run order: (sample, size tag, first spot, last spot).
SESSIONS = {
    2: [
        ("SYN-H3", "S", 1, 30), ("SYN-H4", "S", 31, 55), ("SYN-H5", "S", 56, 83),
        ("SYN-H11", "S", 84, 90), ("SYN-T1", "S", 91, 116), ("SYN-T2", "S", 117, 119),
        ("DKR1", "S", 120, 131), ("SYN-W2", "S", 132, 142),
        ("SYN-S2", "S", 143, 167), ("SYN-S12", "S", 168, 181),
        ("SYN-K2", "S", 182, 192), ("SYN-W1", "S", 193, 234),
    ],
    3: [
        ("SYN-J1", "xs", 235, 252), ("SYN-M1", "xs", 253, 302),
        ("SYN-F1", "xs", 303, 322), ("SYN-A1", "xs", 488, 627),
    ],
}

# Expectations asserted at the end (from the brief / RULES.md).
EXPECT_SESSION1_USED = {
    "S513": list(range(628, 650)), "91500": list(range(738, 748)),
    "Seiland": list(range(768, 778)), "LTSE": list(range(798, 808)),
    "PL": list(range(828, 838)), "NIST610": list(range(857, 866)),
    "NIST612": list(range(893, 902)),
}
EXPECT_FREE_BEFORE = {"S513": 78, "91500": 20, "Seiland": 20, "LTSE": 20, "PL": 20,
                      "NIST610": 18, "NIST612": 18}
EXPECT_BRACKETS = {2: 19, 3: 18}                     # 37 brackets: (78 - 2x2) / 2
EXPECT_ROWS = {2: 332, 3: 324}
EXPECT_CHUNKS = {2: [13] * 6 + [12] * 13, 3: [13] * 12 + [12] * 6}
EXPECT_MID_AT = {2: 10, 3: 9}
EXPECT_PAIRS = {2: [1] * 12 + [2] + [1] * 6,               # run bracket 13 doubled
                3: [1] * 5 + [2] + [1] * 11 + [2]}         # run brackets 25 and 37
_R = ["Seiland", "91500", "PL", "LTSE"]
EXPECT_ROTATION = {2: [_R[i % 4] for i in range(0, 20)],      # 20 pairs
                   3: [_R[i % 4] for i in range(20, 40)]}     # 20 pairs
# Unused spots per pool after session 3: none.
EXPECT_SPARE = {k: [] for k in POOLS}


# --------------------------------------------------------------------------
# Template
# --------------------------------------------------------------------------
LABEL_RE = re.compile(r"^(?P<name>.+)_(?P<spot>\d+)$")


def pool_of(spot: int) -> str | None:
    for name, (lo, hi) in POOLS.items():
        if lo <= spot <= hi:
            return name
    return None


def read_template(path: str):
    """Return (used standard spots per pool, all spots used, rows as label/spot)."""
    book = xlrd.open_workbook(path, formatting_info=True, logfile=open(os.devnull, "w"))
    sh = book.sheet_by_name(SHEET)
    header = [sh.cell_value(0, c) for c in range(sh.ncols)]
    assert header == HEADER, f"template header differs: {header}"
    used = {k: [] for k in POOLS}
    spots = []
    for r in range(1, sh.nrows):
        label = sh.cell_value(r, 0)
        spot = sh.cell_value(r, 11)
        assert sh.cell_type(r, 11) == xlrd.XL_CELL_NUMBER and spot == int(spot), (r, spot)
        spot = int(spot)
        m = LABEL_RE.match(label)
        assert m and int(m.group("spot")) == spot, f"row {r}: label {label!r} vs spot {spot}"
        name = m.group("name")
        spots.append(spot)
        if name in POOLS:
            assert pool_of(spot) == name, f"row {r}: {label} outside its pool"
            used[name].append(spot)
        else:
            assert pool_of(spot) is None, f"row {r}: unknown {label} sits on a standard pool"
    col_widths = {c: sh.colinfo_map[c].width for c in sh.colinfo_map}
    return {k: sorted(v) for k, v in used.items()}, spots, col_widths


# --------------------------------------------------------------------------
# Recipe
# --------------------------------------------------------------------------
def chunk_sizes(n: int, k: int) -> list[int]:
    """k chunks, sizes equal +-1, larger chunks first."""
    q, r = divmod(n, k)
    return [q + 1] * r + [q] * (k - r)


def plan_brackets(free: dict[str, list[int]], n_unknowns: list[int]):
    """No-spare plan. Returns (brackets per session, secondary pairs per bracket).

    S513: every session spends 2 on the opening and 2 per bracket, so the
    total bracket count K = (free S513 - 2 * sessions) / 2. K is split over
    the sessions in proportion to their unknowns (largest remainder; ties go
    to the earlier session).
    Secondaries: P = free secondary spots / 2 pairs, drawn in rotation. Over the
    K brackets of the whole run, bracket j (1-based) gets
    floor(j*P/K) - floor((j-1)*P/K) pairs, i.e. as even as possible, with the
    doubled brackets evenly spaced and the last bracket of the run always full.
    """
    n_sess = len(n_unknowns)
    spare_s513 = len(free["S513"]) - 2 * n_sess
    assert spare_s513 > 0 and spare_s513 % 2 == 0, "S513 supply cannot be used up exactly"
    K = spare_s513 // 2
    total = sum(n_unknowns)
    quotas = [K * n / total for n in n_unknowns]
    ks = [int(q) for q in quotas]
    order = sorted(range(n_sess), key=lambda i: (-(quotas[i] - ks[i]), i))
    for i in order[:K - sum(ks)]:
        ks[i] += 1
    sec = sum(len(free[n]) for n in ROTATION)
    assert sec % 2 == 0
    P = sec // 2
    assert P >= K, "fewer secondary pairs than brackets"
    per = [(j * P) // K - ((j - 1) * P) // K for j in range(1, K + 1)]
    out, a = [], 0
    for k in ks:
        out.append(per[a:a + k])
        a += k
    return ks, out


def mid_at(n_chunks: int) -> int:
    """1-based bracket that carries the mid NIST block."""
    return (n_chunks + 1) // 2


class Draw:
    """Ascending draw through each pool's unused spots, shared across sessions."""

    def __init__(self, used_before: dict[str, list[int]]):
        self.free = {
            name: [s for s in range(lo, hi + 1) if s not in set(used_before[name])]
            for name, (lo, hi) in POOLS.items()
        }
        self.pos = {name: 0 for name in POOLS}

    def take(self, name: str, n: int) -> list[int]:
        i = self.pos[name]
        got = self.free[name][i:i + n]
        if len(got) != n:
            raise SystemExit(f"pool {name} exhausted: wanted {n}, {len(got)} left")
        self.pos[name] = i + n
        return got

    def remaining(self, name: str) -> list[int]:
        return self.free[name][self.pos[name]:]


def build_session(unknowns, n_brackets: int, pairs: list[int], draw: Draw, rot_index: int):
    """Return (rows, chunk sizes, secondary rotation, mid bracket, next rotation index).

    Each row: dict(label, spot, kind in {'unknown','standard'}, std, block).
    """
    rows = []

    def std(name, n, block):
        for s in draw.take(name, n):
            rows.append(dict(label=f"{name}_{s}", spot=s, kind="standard", std=name, block=block))

    seq = [(f"{smp}_{tag}_{s}" if tag else f"{smp}_{s}", s)
           for smp, tag, lo, hi in unknowns for s in range(lo, hi + 1)]
    sizes = chunk_sizes(len(seq), n_brackets)
    mid = mid_at(len(sizes))
    rotation = []

    for name, n in OPENING:
        std(name, n, "opening")
    i = 0
    for b, size in enumerate(sizes, start=1):
        for label, s in seq[i:i + size]:
            rows.append(dict(label=label, spot=s, kind="unknown", std=None, block=f"chunk{b}"))
        i += size
        if b == mid:
            for name, n in MID_BLOCK:
                std(name, n, f"bracket{b}")
        for _ in range(pairs[b - 1]):
            sec = ROTATION[rot_index % len(ROTATION)]
            rot_index += 1
            rotation.append(sec)
            std(sec, SECONDARY_PER_BRACKET, f"bracket{b}")
        std(*PRIMARY_PER_BRACKET, f"bracket{b}")
    assert i == len(seq)
    for name, n in CLOSING:
        std(name, n, "closing")
    return rows, sizes, rotation, mid, rot_index


# --------------------------------------------------------------------------
# Writers. Cell types mirror the template exactly:
#   Label text, Status BLANK cell, Duration number 30, Comment text,
#   Evaluate BOOLEAN TRUE, Sample Type text, Standard/Amount/Final Quantity
#   empty-string text cells, Dilution Factor number 1, Identifier text,
#   Laser Scan Position Number number, Laser Output number 46.
# --------------------------------------------------------------------------
BLANK = object()   # Status: blank cell
EMPTY = ""          # Standard / Amount / Final Quantity: empty text cell


def row_values(r):
    return [r["label"], BLANK, 30, "<Comment>", True, "UNKNOWN", EMPTY, 1,
            EMPTY, EMPTY, "<Identifier>", r["spot"], 46]


NUMERIC_COLS = {2, 7, 11, 12}


def write_xls(path, rows, col_widths):
    wb = xlwt.Workbook(encoding="utf-8")
    ws = wb.add_sheet(SHEET)
    font = "font: name Microsoft Sans Serif, height 160"
    grey = "top_colour grey50, bottom_colour grey50, left_colour grey50, right_colour grey50"
    st_head = xlwt.easyxf(
        f"{font}, colour white; align: horiz center, vert center;"
        " borders: top thin, left thin, right thin, top_colour white, left_colour white, right_colour white;"
        " pattern: pattern solid, fore_colour grey50")
    st_text = xlwt.easyxf(f"{font}; align: horiz left; borders: top thin, bottom thin, left thin, right thin, {grey};"
                          " pattern: pattern solid, fore_colour white")
    st_num = xlwt.easyxf(f"{font}; align: horiz right; borders: top thin, bottom thin, left thin, right thin, {grey};"
                         " pattern: pattern solid, fore_colour white")
    for c, h in enumerate(HEADER):
        ws.write(0, c, h, st_head)
    for c, w in col_widths.items():
        ws.col(c).width = w
    xf_text = wb.add_style(st_text)
    sst_empty = None
    for i, r in enumerate(rows, start=1):
        for c, v in enumerate(row_values(r)):
            style = st_num if c in NUMERIC_COLS else st_text
            if v is BLANK:
                ws.write(i, c, None, style)          # BLANK record
            elif v == EMPTY and isinstance(v, str):
                # xlwt turns "" into a BLANK; the template stores a real
                # empty string (LABELSST), so insert one explicitly.
                if sst_empty is None:
                    sst_empty = wb.add_str("")
                ws.row(i).insert_cell(c, StrCell(i, c, xf_text, sst_empty))
            else:
                ws.write(i, c, v, style)
    wb.save(path)


def write_xlsx(path, rows, col_widths):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = SHEET
    f = Font(name="Microsoft Sans Serif", size=8)
    thin = Side(style="thin", color="808080")
    border = Border(top=thin, bottom=thin, left=thin, right=thin)
    ws.append(HEADER)
    for cell in ws[1]:
        cell.font = Font(name="Microsoft Sans Serif", size=8, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="808080")
        cell.alignment = Alignment(horizontal="center", vertical="center")
    for r in rows:
        ws.append([None if v is BLANK else v for v in row_values(r)])
    for row in ws.iter_rows(min_row=2):
        for c, cell in enumerate(row):
            cell.font = f
            cell.border = border
            cell.alignment = Alignment(horizontal="right" if c in NUMERIC_COLS else "left")
    for c, w in col_widths.items():
        ws.column_dimensions[openpyxl.utils.get_column_letter(c + 1)].width = round(w / 256, 2)
    buf = io.BytesIO()
    wb.save(buf)
    _freeze_zip(buf.getvalue(), path)


FIXED_STAMP = "2026-11-04T00:00:00Z"


def _freeze_zip(data: bytes, path: str):
    """Rewrite the .xlsx with fixed document/zip timestamps so reruns are byte-identical."""
    src = zipfile.ZipFile(io.BytesIO(data))
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            body = src.read(info.filename)
            if info.filename == "docProps/core.xml":
                body = re.sub(rb"(<dcterms:(created|modified)[^>]*>)[^<]*",
                              rb"\g<1>" + FIXED_STAMP.encode(), body)
            zi = zipfile.ZipInfo(info.filename, date_time=(2026, 11, 4, 0, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            dst.writestr(zi, body)


def write_csv(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh, lineterminator="\n")
        w.writerow(HEADER)
        for r in rows:
            w.writerow(["" if v is BLANK else ("TRUE" if v is True else v) for v in row_values(r)])


# --------------------------------------------------------------------------
# Main + self-checks
# --------------------------------------------------------------------------
def ranges(xs):
    xs = sorted(xs)
    out, start, prev = [], None, None
    for x in xs:
        if start is None:
            start = prev = x
        elif x == prev + 1:
            prev = x
        else:
            out.append((start, prev))
            start = prev = x
    if start is not None:
        out.append((start, prev))
    return ", ".join(f"{a}" if a == b else f"{a}-{b}" for a, b in out) or "-"


def main(template=TEMPLATE):
    used1, spots1, col_widths = read_template(template)
    assert used1 == EXPECT_SESSION1_USED, f"session 1 usage differs from brief: {used1}"
    print(f"template: {len(spots1)} rows; session-1 standard spots:")
    for k in POOLS:
        print(f"  {k:8s} {ranges(used1[k])}")

    draw = Draw(used1)
    assert {k: len(v) for k, v in draw.free.items()} == EXPECT_FREE_BEFORE, draw.free
    print("available before session 2:")
    for k in POOLS:
        print(f"  {k:8s} {ranges(draw.free[k])}")
    n_unk_all = [sum(hi - lo + 1 for _, _, lo, hi in u) for u in SESSIONS.values()]
    ks, pairs_all = plan_brackets(draw.free, n_unk_all)
    print(f"no-spare plan: brackets per session {ks}, "
          f"{sum(map(sum, pairs_all))} secondary pairs over {sum(ks)} brackets")
    plan = dict(zip(SESSIONS, zip(ks, pairs_all)))
    rot = ROTATION.index(ROTATION_START)
    all_spots = list(spots1)
    results = {}
    for sess, unknowns in SESSIONS.items():
        k, pairs = plan[sess]
        rows, sizes, rotation, mid, rot = build_session(unknowns, k, pairs, draw, rot)
        results[sess] = rows
        n_unk = sum(hi - lo + 1 for _, _, lo, hi in unknowns)

        # --- self-checks per session
        assert len(rows) == EXPECT_ROWS[sess], (sess, len(rows))
        assert len(rows) == n_unk + 8 + len(sizes) * 2 + sum(pairs) * 2 + 6 + 6
        assert len(sizes) == k == EXPECT_BRACKETS[sess], (sess, k)
        assert sizes == EXPECT_CHUNKS[sess], (sess, sizes)
        assert max(sizes) <= MAX_CHUNK and max(sizes) - min(sizes) <= 1
        assert mid == EXPECT_MID_AT[sess], (sess, mid)
        assert pairs == EXPECT_PAIRS[sess], (sess, pairs)
        assert rotation == EXPECT_ROTATION[sess], (sess, rotation)
        for r in rows:
            if r["kind"] == "standard":
                lo, hi = POOLS[r["std"]]
                assert lo <= r["spot"] <= hi, r
            else:
                assert pool_of(r["spot"]) is None, r
        # standard spots ascending within each pool, in run order
        for k in POOLS:
            s = [r["spot"] for r in rows if r["std"] == k]
            assert s == sorted(s), (sess, k, s)
        all_spots += [r["spot"] for r in rows]

        stem = f"{OUT_STEM}_{sess}"
        write_xls(os.path.join(HERE, stem + ".xls"), rows, col_widths)
        write_xlsx(os.path.join(HERE, stem + ".xlsx"), rows, col_widths)
        write_csv(os.path.join(HERE, f"session-{sess}.csv"), rows)
        print(f"session {sess}: {len(rows)} rows, {len(sizes)} chunks {sizes}, "
              f"mid block in bracket {mid}, doubled brackets "
              f"{[i + 1 for i, p in enumerate(pairs) if p == 2]}, rotation {rotation}")

    # --- cross-session checks
    dup = sorted({s for s in all_spots if all_spots.count(s) > 1})
    assert not dup, f"spots used twice across sessions: {dup}"
    for k in POOLS:
        assert draw.remaining(k) == EXPECT_SPARE[k], (k, draw.remaining(k))
    print("after session 3, unused standard spots:")
    for k in POOLS:
        print(f"  {k:8s} {ranges(draw.remaining(k))}")

    # --- read-back of the written .xls against the in-memory rows
    for sess, rows in results.items():
        book = xlrd.open_workbook(os.path.join(HERE, f"{OUT_STEM}_{sess}.xls"))
        sh = book.sheet_by_name(SHEET)
        assert [sh.cell_value(0, c) for c in range(sh.ncols)] == HEADER
        assert sh.nrows == len(rows) + 1
        for i, r in enumerate(rows, start=1):
            assert sh.cell_value(i, 0) == r["label"]
            assert sh.cell_type(i, 11) == xlrd.XL_CELL_NUMBER and sh.cell_value(i, 11) == r["spot"]
    print("all self-checks passed")


if __name__ == "__main__":
    main(*sys.argv[1:])
