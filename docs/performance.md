# Performance audit

The executable limit is 50,000,000 bytes on each platform, following the
owner's 2026-11-06 update. The entry JavaScript retains its
250 KB budget in `scripts/check-budgets.mjs`; SheetJS remains a lazy chunk.

The final Windows executable measured 5,324,800 bytes and the macOS executable
5,063,200 bytes, both below 50 MB. The entry JavaScript measured 222,069 bytes; the 484,106-byte SheetJS chunk
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
