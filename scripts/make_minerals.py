#!/usr/bin/env python3
"""Render the mineral tiles of the welcome step as small static SVGs.

Source: the representative crystal of each mineral in Yiming Zhang's
mineral-habit-matrix (https://github.com/duserzym/mineral-habit-matrix,
live at https://duserzym.github.io/mineral-habit-matrix/), file
`site/data/atlas.json`: the same geometry, face-form colours and default view
(tilt, turn) as the site's atlas cards. The habit matrix computes each crystal
from its lattice and face forms; here the precomputed convex solid is only
projected and shaded, with no three.js at run time.

Usage (stdlib only):

    git clone --depth 1 https://github.com/duserzym/mineral-habit-matrix.git /tmp/mhm
    python3 -I scripts/make_minerals.py /tmp/mhm

Writes src/assets/minerals/<id>-light.svg and <id>-dark.svg.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

# Tile id -> habit-matrix mineral, plus optional colour, cell and view overrides.
# Without a cell, the atlas representative (the site's mineral card) is used.
TILES = {
    "zircon": {"mineral": "zircon"},
    "apatite": {"mineral": "apatite"},
    "rutile": {"mineral": "rutile"},
    # The atlas slab reads as a box at tile size; the envelope cell C2M3 seen
    # from above shows the wedge.
    "titanite": {"mineral": "titanite", "cell": "C2M3", "view": {"tilt": 35, "turn": 20}},
    "garnet": {"mineral": "garnet"},
    "monazite": {"mineral": "monazite"},
    "xenotime": {"mineral": "xenotime"},
    "carbonate": {"mineral": "calcite"},
    # A neutral, unnamed prism for "other": quartz's representative in grey.
    "other": {"mineral": "quartz", "colour": "#a7adb4"},
}

SIZE = 96  # viewBox edge, CSS px at 1x
PAD = 6


def unit(v):
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def apply(m, v):
    return [sum(m[i][k] * v[k] for k in range(3)) for i in range(3)]


def rx(deg):
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    return [[1, 0, 0], [0, c, -s], [0, s, c]]


def ry(deg):
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    return [[c, 0, s], [0, 1, 0], [-s, 0, c]]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def sub(a, b):
    return [a[i] - b[i] for i in range(3)]


def hex_rgb(h):
    h = h.lstrip("#")
    return [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]


def rgb_hex(c):
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02x}" for x in c)


# Lights as in the site's views.js (three.js frame: y up, camera on +z).
KEY = (unit([2.5, 4, 5]), 1.0)
RIM = (unit([-4, 1, -3]), 0.35)
FILL = (unit([-2, -1, 4]), 0.25)


def shade(base, n, dark):
    lit = 0.42 if not dark else 0.34
    for direction, weight in (KEY, RIM, FILL):
        lit += weight * max(0.0, sum(direction[i] * n[i] for i in range(3)))
    # Soft clear-coat highlight on faces facing the key light's half vector.
    half = unit([KEY[0][0], KEY[0][1], KEY[0][2] + 1])
    spec = max(0.0, sum(half[i] * n[i] for i in range(3))) ** 24 * 0.35
    lit = min(lit, 1.25)
    return rgb_hex([c * lit * (0.9 if dark else 1.0) + spec for c in base])


def render(entry, colour, dark):
    forms = {f["key"]: f.get("color") for f in entry["forms"]}
    view = entry.get("view") or {}
    tilt, turn = view.get("tilt", 12), view.get("turn", -24)
    # Crystal frame (c = +z) -> three.js frame (c = +y), then the card's Euler XYZ.
    m = matmul(matmul(rx(tilt), ry(turn)), rx(-90))
    verts = [apply(m, v) for v in entry["geometry"]["vertices"]]
    xs = [v[0] for v in verts]
    ys = [v[1] for v in verts]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    scale = (SIZE - 2 * PAD) / span
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2

    def xy(v):
        return (SIZE / 2 + (v[0] - cx) * scale, SIZE / 2 - (v[1] - cy) * scale)

    edge = "#2b2118" if not dark else "#f2eadf"
    edge_opacity = "0.55" if not dark else "0.45"
    polys = []
    for face in entry["geometry"]["faces"]:
        loop = [verts[i] for i in face["loop"]]
        n = unit(cross(sub(loop[1], loop[0]), sub(loop[2], loop[0])))
        centroid = [sum(p[i] for p in loop) / len(loop) for i in range(3)]
        if sum(n[i] * centroid[i] for i in range(3)) < 0:
            n = [-x for x in n]  # outward normal of a convex solid about the origin
        if n[2] <= 1e-6:
            continue  # back face: a convex solid needs no depth sort
        base = hex_rgb(colour or forms.get(face["form"]) or "#999999")
        points = " ".join(f"{x:.1f},{y:.1f}" for x, y in map(xy, loop))
        polys.append(f'<polygon points="{points}" fill="{shade(base, n, dark)}"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}" '
        f'width="{SIZE}" height="{SIZE}">'
        f'<g stroke="{edge}" stroke-opacity="{edge_opacity}" stroke-width="0.8" '
        f'stroke-linejoin="round">{"".join(polys)}</g></svg>\n'
    )


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    data = Path(sys.argv[1]) / "site/data"
    atlas = json.loads((data / "atlas.json").read_text())
    out = Path(__file__).resolve().parent.parent / "src/assets/minerals"
    out.mkdir(parents=True, exist_ok=True)
    for tile, spec in TILES.items():
        mineral = spec["mineral"]
        entry = atlas[mineral]
        if "cell" in spec:
            full = json.loads((data / f"{mineral}.json").read_text())
            cell = next(c for c in full["cells"] if c["id"] == spec["cell"])
            entry = {"id": cell["id"], "forms": full["forms"], "geometry": cell["geometry"]}
        entry = {**entry, "view": spec.get("view", entry.get("view"))}
        for dark in (False, True):
            path = out / f"{tile}-{'dark' if dark else 'light'}.svg"
            path.write_text(render(entry, spec.get("colour"), dark))
            print(f"{path.name}: {path.stat().st_size} bytes ({mineral} {entry['id']})")


if __name__ == "__main__":
    main()
