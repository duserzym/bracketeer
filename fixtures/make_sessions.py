#!/usr/bin/env python3
"""Generate synthetic Qtegra fixtures from scratch, never from lab workbooks.

Fixed seed 20261104 randomizes the fixed session's standard draw order.
Sessions 2 and 3 use an independent Python implementation of RULES.md.
SheetJS handles workbook I/O through scripts/synthetic-workbook-io.mjs.
Run from the repository root: pnpm fixtures:synthetic
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
import random
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TWINS = ROOT / "test-results" / "synthetic-fixtures"
IO = ROOT / "scripts" / "synthetic-workbook-io.mjs"
SEED = 20261104
SHEET = "Sheet1"

HEADER = [
    "Label", "Status", "Duration [s]", "Comment", "Evaluate", "Sample Type",
    "Standard", "Dilution Factor", "Amount", "Final Quantity", "Identifier",
    "Laser Scan Position Number", "Laser Output Setting [%]",
]

# Invented laser positions on the synthetic standard mounts (inclusive ranges).
POOLS = {
    "S513": (628, 727),
    "91500": (728, 757),
    "Seiland": (758, 787),
    "LTSE": (788, 817),
    "PL": (818, 847),
    "NIST610": (848, 874),
    "NIST612": (875, 901),
}

# Recipe parameters (the synthetic budget acceptance case).
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
        ("SYN-1", "S", 1, 30), ("SYN-2", "S", 31, 55), ("SYN-3", "S", 56, 83),
        ("SYN-4", "S", 84, 90), ("SYN-5", "S", 91, 116), ("SYN-6", "S", 117, 119),
        ("SYN-7", "S", 120, 131), ("SYN-8-pg", "S", 132, 142),
        ("SYN-9", "S", 143, 167), ("SYN-10", "S", 168, 181),
        ("SYN-11.7", "S", 182, 192), ("SYN-12", "S", 193, 234),
    ],
    3: [
        ("SYN-13-gc1", "xs", 235, 252), ("SYN-14-mafic", "xs", 253, 302),
        ("SYN-15-felsic", "xs", 303, 322), ("SYN-16-gc1", "xs", 488, 627),
    ],
}

# Exact synthetic expectations asserted at the end (RULES.md).
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


def fixed_session():
    """Invent a non-rotating fixed session with 165 unknowns and 80 standards.

    Shuffle consecutive standard pairs/triples as units, preserving used sets
    and the structural edge cases of a manually assembled imported session.
    """
    rng = random.Random(SEED)
    units = {}
    for name, spots in EXPECT_SESSION1_USED.items():
        width = 3 if name.startswith("NIST") else 2
        units[name] = [spots[i:i + width] for i in range(0, len(spots), width)]
        rng.shuffle(units[name])
    pairs = [("Seiland", "91500"), ("PL", "LTSE")] * 5
    rng.shuffle(pairs)
    unknowns = [("SYN-17.7R-02", "", 323, 383), ("SYN-18", "", 384, 487)]
    seq = [(name, spot) for name, _, lo, hi in unknowns for spot in range(lo, hi + 1)]
    rows = []

    def std(name):
        for spot in units[name].pop():
            rows.append(dict(label=f"{name}_{spot}", spot=spot, kind="standard", std=name))

    for name in ("NIST612", "NIST610", "S513"):
        std(name)
    offset = 0
    sizes = [15, 15, 15, 16, 20, 19, 20, 15, 15, 15]
    for bracket, size in enumerate(sizes, 1):
        for name, spot in seq[offset:offset + size]:
            rows.append(dict(label=f"{name}_{spot}", spot=spot, kind="unknown", std=None))
        offset += size
        if bracket == 5:
            std("NIST610")
            std("NIST612")
        pair = list(pairs[bracket - 1])
        rng.shuffle(pair)
        for name in pair:
            std(name)
        std("S513")
    std("NIST612")
    std("NIST610")
    assert offset == 165 and len(rows) == 245
    assert all(not left for left in units.values())
    return rows


def values(row):
    return [row["label"], None, 30, "<Comment>", True, "UNKNOWN", "", 1,
            "", "", "<Identifier>", row["spot"], 46]


def main():
    results = {1: fixed_session()}
    draw = Draw(EXPECT_SESSION1_USED)
    assert {k: len(v) for k, v in draw.free.items()} == EXPECT_FREE_BEFORE
    counts = [sum(hi - lo + 1 for _, _, lo, hi in u) for u in SESSIONS.values()]
    ks, pairs_all = plan_brackets(draw.free, counts)
    rot = 0
    for (sess, unknowns), k, pairs in zip(SESSIONS.items(), ks, pairs_all):
        rows, sizes, rotation, mid, rot = build_session(unknowns, k, pairs, draw, rot)
        assert len(rows) == EXPECT_ROWS[sess]
        assert k == EXPECT_BRACKETS[sess] and sizes == EXPECT_CHUNKS[sess]
        assert max(sizes) <= MAX_CHUNK and max(sizes) - min(sizes) <= 1
        assert mid == EXPECT_MID_AT[sess] and pairs == EXPECT_PAIRS[sess]
        assert rotation == EXPECT_ROTATION[sess]
        for name in POOLS:
            spots = [r["spot"] for r in rows if r["std"] == name]
            assert spots == sorted(spots)
        results[sess] = rows
    all_spots = [r["spot"] for rows in results.values() for r in rows]
    assert len(all_spots) == len(set(all_spots)) == 901
    for name in POOLS:
        assert draw.remaining(name) == EXPECT_SPARE[name]
        lo, hi = POOLS[name]
        used = sorted(r["spot"] for rows in results.values() for r in rows if r["std"] == name)
        assert used == list(range(lo, hi + 1))
    TWINS.mkdir(parents=True, exist_ok=True)
    payload = []
    for sess, rows in results.items():
        table = [HEADER] + [values(r) for r in rows]
        stem = f"synthetic-session-{sess}"
        payload.append(dict(path=str(HERE / f"{stem}.xls"), table=table))
        if sess != 1:
            payload.append(dict(path=str(TWINS / f"{stem}.xlsx"), table=table))
            with (TWINS / f"{stem}.csv").open("w", newline="", encoding="utf-8") as fh:
                writer = csv.writer(fh, lineterminator="\r\n")
                writer.writerow(HEADER)
                writer.writerows([["TRUE" if v is True else v for v in values(r)] for r in rows])
        print(f"synthetic session {sess}: {len(rows)} rows")
    subprocess.run(["node", str(IO), "write"], input=json.dumps(payload), text=True, check=True)
    print(f"Fixed seed {SEED}; all generator self-checks passed")


if __name__ == "__main__":
    main()
