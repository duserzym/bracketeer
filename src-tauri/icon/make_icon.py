"""Generate the shared light tile and a simple bracketed laser-spot motif.

Run with python3 -I src-tauri/icon/make_icon.py. Standard library only.
The tile, gradient and shadow follow grainatlas/tauri/icon/zircons.py HEAD.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

HEAD = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">bracketeer icon</title>
  <desc id="desc">A row of red, green and blue laser spots grouped by blue square brackets, on a softly shaded light tile.</desc>
  <defs>
    <linearGradient id="tile" x2="0.8" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#e9eef5"/></linearGradient>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="9" stdDeviation="10" flood-color="#0f1b2d" flood-opacity="0.25"/></filter>
  </defs>
  <rect x="36" y="36" width="440" height="440" rx="88" fill="url(#tile)"/>
  <rect x="36" y="36" width="440" height="440" rx="88" fill="none" stroke="#d9e1ec" stroke-width="10"/>
'''

MOTIF = '''  <g filter="url(#shadow)">
    <path d="M156 160 H116 V352 H156 M356 160 H396 V352 H356" fill="none" stroke="#4063d8" stroke-width="28" stroke-linejoin="round" stroke-linecap="square"/>
    <circle cx="184" cy="256" r="24" fill="#cb3c33"/>
    <circle cx="256" cy="256" r="24" fill="#389826"/>
    <circle cx="328" cy="256" r="24" fill="#4063d8"/>
  </g>
</svg>
'''

svg = HEAD + MOTIF
(ROOT / "src-tauri/assets-icon.svg").write_text(svg, encoding="utf-8")
(ROOT / "public").mkdir(exist_ok=True)
(ROOT / "public/favicon.svg").write_text(
    svg.replace('viewBox="0 0 512 512"', 'viewBox="36 36 440 440"'),
    encoding="utf-8",
)
