# Performance audit

The executable limit is 50,000,000 bytes on each platform, following the
owner's 2026-11-06 update. The entry JavaScript retains its
250 KB budget in `scripts/check-budgets.mjs`; SheetJS remains a lazy chunk.

The 2026-11-18 design-count build increased the entry to 253,416 bytes.
Splitting the later wizard steps reduced it to **165,080 bytes** in both
`dist/` and `dist/tauri/`, with the 250,000-byte limit unchanged. Including
statically preloaded shared chunks, initial JavaScript totals 221,562 bytes.

Steps 2, 3 and 4 now load on demand: Unknowns (including the GrainAtlas
parser), Step3Bracketing and StandardSpots, and the sequence grid and
review/export controls. Shared planning and numbering code stays available
to the app shell. Workbook import/export, SheetJS and Qtegra paste retain
their existing lazy boundaries. Prefetch waits for the window load event
(or an already-complete document), then the current step's paint and idle
time to load the next step (starting with step 2 after Mineral); WebViews
without idle callbacks use a timer fallback. Prefetch does not mount the
panels. Project data and wizard navigation update synchronously; only rendering
waits for the requested module, keeping the current panel painted. Later
navigation replaces the pending view without discarding project changes.
An in-flight prefetch is shared, and a failed visible load shows an error
with Retry. Visited input panels stay mounted to preserve drafts and
validation when going back.

`make check` passed formatting, lint, Svelte checks, 454 unit tests and four
Rust tests. `pnpm build`, `pnpm build:desktop`, `make web` and the unchanged
budget checker passed. For the single-file build, vite-plugin-singlefile
sets Rolldown's `codeSplitting: false`, inlining these dynamic imports just
like SheetJS. The emitted 806,957-byte `dist/bracketeer.html` has one inline
script and no external scripts, styles, module preloads or runtime imports.
Offline browser/export smoke tests and the added delayed-chunk navigation
tests remain for the supervisor; Playwright was not run in this sandbox.
The navigation regression opens the example, immediately returns to Mineral
and proceeds to Unknowns while the step-3 chunk is stalled, checking that
the example data survives and a late chunk cannot change the chosen step.

The final Windows executable measured 5,324,800 bytes and the macOS executable
5,063,200 bytes, both below 50 MB. The earlier entry JavaScript measured 222,069 bytes; the 484,106-byte SheetJS chunk
loads when workbook I/O is requested. Export and import still work offline.
Desktop builds retain the standard Tauri features and updater TLS dependency.
The accepted 50 MB limit avoids changing runtime dependencies just to meet
the superseded 4 MB executable target.

`make test` passed lint, formatting, Svelte checks, 304 unit tests, four Rust
tests, bundle budgets and 84 Chromium/WebKit browser tests, including offline
workbook export. Both desktop artifacts built successfully. The budget check
also passed after the executable limit changed to 50 MB.

The earlier desktop baseline was a 205–249 ms first window and 89–93 MB idle
footprint. One isolated run of the final macOS build measured a 436 ms first window,
94.5 MiB idle physical footprint and 0.0 percent idle CPU. This does not
establish the earlier 300 ms startup target; concurrent audit workloads may
affect timing. A live updater download was not exercised. Further executable-size tuning is not a
priority under the accepted 50 MB limit.

After other browser jobs finished, a quiet final run measured a 254 ms first
window, 87.3 MiB idle footprint and 0.05 percent CPU over 20 seconds. Three
short repeated launches measured 252–294 ms and 88.3–88.5 MiB at six seconds.
The short CPU samples during those launches are unsuitable for an idle claim
because they overlap the initial update check and other WebKit work.
