# bracketeer

bracketeer turns unknowns and standard spot ranges into a standard-bracketed LA-ICP-MS run sequence for the Thermo Qtegra LabBook. You can edit the rows, share standard pools across sessions, save a project, and export `.xls` (BIFF8, the default), `.xlsx`, CSV or Qtegra clipboard text. It runs offline as a Windows executable, a Mac app or a single HTML file.

## At the instrument in four steps

Open bracketeer: on Windows, double-click `bracketeer.exe`; on Mac, open the app; or open `bracketeer.html` in Edge. The step bar at the top shows where you are (**1 Mineral, 2 Unknowns, 3 Bracketing, 4 Review**). **Back** never loses what you typed, and **Next** stays disabled until the step is complete, with the reason shown beside it.

1. **Mineral.** Click the mineral you are dating. Its primary, secondaries and reference glasses appear below. Zircon starts with S513 as primary, Seiland, 91500, PL and LTSE as secondaries, and NIST610 and NIST612. Tick, rename, reorder or add standards; your list is remembered for that mineral. **Continue**, **Recent projects** and **Open project** are on the same panel.

   ![Step 1: choose a mineral and its standards](docs/screenshots/wizard-1440-1-mineral.png)

   Use **Another mineral in this run → Add** for a second group of standards. Each mineral has its own primary and secondaries; the reference glasses are shared. Choose each session's mineral in step 2.

   ![Step 1: apatite added to a zircon run](docs/screenshots/wizard-1440-1-two-minerals.png)

2. **Unknowns.** Use **Add sample**, enter a name and optional tag, then **Count**. **Begin** follows the previous **End**, across sessions too; Count fills End. Type Begin or End to keep a hand value. The accent bar marks it; **Auto** lets it follow again. Later automatic values move when a row changes, while hand values stay. You can also paste `SYN-H3 S 1-30, 35, 40-42`; each range becomes a row, with pasted numbers kept as hand values. **Import sequence** brings in an earlier fixed session.

   ![Step 2: automatic numbering and hand marks](docs/screenshots/wizard-1440-2-numbering.png)

   **Load GrainAtlas spots…** reads a laser CSV or a text list of spot names. It checks the whole project's unknown and standard ranges against the placed spots, and warns about missing positions or too many spots. It does not fill the unknowns table.

   ![Step 2: loaded GrainAtlas spots and mount warnings](docs/screenshots/wizard-1440-2-grainatlas.png)

3. **Bracketing.** New projects start with **Chunk target 18**: set the design, read the count, then place the standard spots. The **Standard spots** table is here, with **Begin**, **End**, **Placed / needed**, **Used**, **Spare** and **+ range**. Each standard shows its arithmetic underneath. Placed / needed uses the available count after used spots and spare. Automatic standard ranges follow the unknowns and fill to the needed count; type a Begin to move a range and its automatic End follows.

   ![Step 3: count from the design and automatic standard ranges](docs/screenshots/wizard-1440-3-design.png)

   Choose **Chunk count** for a set number of chunks. With either design mode, **Secondaries → Every, odd or even** gives each secondary its own spots per bracket and cadence. **Opening bracket** adds secondaries and primary after the opening block, before the first unknown. It counts as bracket 1 for cadence.

   When the spots are already placed, choose **Auto from budget** and enter the ranges. It derives the bracket count from the available supply and rotates secondary pairs. The summary updates as values change. Click **Generate and review**.

   ![Step 3: Auto from budget with the example's placed pools](docs/screenshots/wizard-1440-3-bracketing.png)

4. **Review.** Edit rows if needed and check the warnings below the grid (click one to select its rows). Then click **Export .xls**, or **Copy for Qtegra** and paste into the LabBook sample list. **Qtegra paste** shows exactly the rows that are copied (no header). **Start another session** marks this one as run and takes you to step 2 for the next.

   ![Step 4](docs/screenshots/wizard-1440-4-paste.png)

## Projects and sessions

**Save project** writes `<experiment>.bracketeer.json`; **Open project** restores it. One project holds the experiment defaults, standards, recipe and all sessions. Each session has its own unknowns and sequence sheet; exports use the selected session. The app also autosaves on this computer. Save a project file to move it to another computer.

**Generate** plans all open (planned) sessions together. If any have manual edits, it asks before replacing them. Imported sessions are fixed. **Mark as run** fixes the current rows and moves the secondary rotation past their last pair. Fixed sessions count their standard spots as used and are not regenerated. **Unlock** makes a fixed session editable again.

**Start another session** (step 4) marks the current session as run and adds an empty next session; **+ Session** (step 2) adds an open session that is planned together with the others. The recipe is shared; each session uses its mineral group’s standards and the shared references. A saved project remembers its minerals and the step it was left on, and opens there.

## Recipe

The default recipe uses **Chunk target 18**. It opens with reference standards and the primary, follows every chunk with rotating secondary pairs and the primary, and adds mid and closing reference blocks. Chunk target and Chunk count also support every/odd/even secondaries and an opening bracket. **Auto from budget** plans from the placed supply (see [the recipe](docs/recipe.md)).

**Coming from Ablation Station.** Set the chunk target, each secondary's count and Every / Odd / Even rule, and the opening bracket, then read each standard's count before placing spots. bracketeer keeps balanced chunks and exports the full Qtegra sheet. See [the comparison](docs/ablation-station-comparison.md) and its saved designs.

## Downloads and builds

The files to copy are `dist/windows/bracketeer.exe`, `dist/macos/bracketeer.app` (also supplied as a `.dmg`) or `dist/bracketeer.html`. The Windows executable is one file with no installer. See [Windows and Mac setup](docs/windows.md) for the runtime, unsigned-app prompts and build requirements.

| Command           | Purpose                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `make setup`      | Install dependencies with pnpm                                                   |
| `make dev`        | Start the Vite development server                                                |
| `make check`      | Check formatting, lint, types, unit tests and host Rust checks                   |
| `make rust-check` | Generate icons if needed; check Rust formatting, Clippy and Rust tests           |
| `make test`       | Run `make check`, build the standalone HTML and run all Playwright tests         |
| `make e2e`        | Run Playwright; the standalone-file test needs `make web` first                  |
| `make build`      | Build the regular web app into `dist/`                                           |
| `make web`        | Build the offline, single-file `dist/bracketeer.html`                            |
| `make icons`      | Generate PNG, ICO and ICNS icons from the SVG                                    |
| `make desktop`    | Build the Tauri frontend in `dist/tauri/` and Mac bundles in `src-tauri/target/` |
| `make windows`    | Cross-build the portable exe into `dist/windows/bracketeer.exe`                  |
| `make mac-app`    | Run `make desktop` and copy the `.app` and `.dmg` to `dist/macos/`               |

## Updates

The version chip is at the bottom-right on every step. Click it to open Updates.
Use **Check now** for an explicit check; a dot marks an available or ready update.
Automatic downloads are on by default; use **Restart to update** when ready.
Choose **Stable** or **Beta (pre-releases)** in the panel.
Installed Windows copies and macOS update in place; the portable exe is replaced by hand.
The browser build links to GitHub releases and does not update itself.
See [in-app updates](docs/in-app-updates.md) for the release flow.
Owner setup: run `pnpm updater:setup` once with `cargo tauri` 2 and `gh` available,
back up `~/.tauri/bracketeer-updater.key`, and commit the public-key config change.
The script sets `TAURI_SIGNING_PRIVATE_KEY`, or prints how to add it by hand.

## Development

Use Node.js 22.18+ or 24+ and pnpm 10 (the package pins pnpm 10.33.0). Run `make setup`, then `make dev`. The app uses Svelte 5, strict TypeScript and Vite; the pure engine is in `src/lib/engine/`. Excel import and export use SheetJS 0.20.3 from its official tarball. The wizard is described in [docs/wizard.md](docs/wizard.md). The mineral tiles are static SVGs rendered by `scripts/make_minerals.py` from [mineral-habit-matrix](https://github.com/duserzym/mineral-habit-matrix).

Run `make check` for Prettier (including Markdown), ESLint, `svelte-check`, Vitest and host Rust checks. These checks need Rust, `cargo tauri` 2 and Xcode Command Line Tools on the Mac; they generate icons if needed. Run `pnpm format` to apply formatting.

Run `make test` before finishing a change. It also runs Playwright in Chromium and WebKit, which needs the Playwright **1.64.1** browser builds available locally. `make setup` does not download browsers. Tests compare generated sessions 2 and 3 with the golden workbooks cell for cell, including cell types, both from the example project and typed from scratch through the four steps, and check every step at 1440 × 900 and 1280 × 800. The standalone HTML is tested offline through `file://`.

## Licence

[MIT](LICENSE).
