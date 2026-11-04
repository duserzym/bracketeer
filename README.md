# bracketeer

bracketeer turns unknowns and standard spot ranges into a standard-bracketed LA-ICP-MS run sequence for the Thermo Qtegra LabBook. You can edit the rows, share standard pools across sessions, save a project, and export `.xls` (BIFF8, the default), `.xlsx`, CSV or Qtegra clipboard text. It runs offline as a Windows executable, a Mac app or a single HTML file.

## At the instrument in five steps

1. Open bracketeer: on Windows, double-click `bracketeer.exe`; on Mac, open the app; or open `bracketeer.html` in Edge.
2. Type the unknowns into the table, or paste one sample per line into **Paste unknowns**, then click **Add pasted unknowns**:

   ```text
   SYN-H3 S 1-30
   SYN-H4 S 31-55
   ```

   The tag (`S` here) is optional. Spot ranges include both ends.

3. Check the standards: pool ranges, used spots and **Keep spare**. Use **Import sequence** for an earlier session to bring in its used standard spots. Choose **Used standard spots for this experiment** to fill the used lists, or keep it as **A new fixed session** to retain its rows too.
4. Click **Generate**, then edit rows if needed. Check the warnings below the grid; click a warning to select its rows.
5. Click **Export .xls**, or **Copy for Qtegra** and paste into the LabBook sample list. The copy has no header. `.xlsx` and `.csv` are also available.

## Projects and sessions

**Save project** writes `<experiment>.bracketeer.json`; **Open project** restores it. One project holds the experiment defaults, standards, recipe and all sessions. Each session has its own unknowns and sequence sheet; exports use the selected session. The app also autosaves on this computer. Save a project file to move it to another computer.

**Generate** plans all open (planned) sessions together. If any have manual edits, it asks before replacing them. Imported sessions are fixed. **Mark as run** fixes the current rows and moves the secondary rotation past their last pair. Fixed sessions count their standard spots as used and are not regenerated. **Unlock** makes a fixed session editable again.

Click **+** beside the session tabs to mark the current session as run and add an empty next session. The standards, used spots and recipe remain shared.

## Recipe

The default recipe opens with reference standards and the primary, then follows every chunk of unknowns with secondary pairs and the primary, adding a mid block and a closing block. **Auto from budget** shares the available standards across planned sessions; **Chunk target** and **Chunk count** let you choose the spacing instead (see [the recipe](docs/recipe.md)).

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

## Development

Use Node.js 22.18+ or 24+ and pnpm 10 (the package pins pnpm 10.33.0). Run `make setup`, then `make dev`. The app uses Svelte 5, strict TypeScript and Vite; the pure engine is in `src/lib/engine/`. Excel import and export use SheetJS 0.20.3 from its official tarball.

Run `make check` for Prettier (including Markdown), ESLint, `svelte-check`, Vitest and host Rust checks. These checks need Rust, `cargo tauri` 2 and Xcode Command Line Tools on the Mac; they generate icons if needed. Run `pnpm format` to apply formatting.

Run `make test` before finishing a change. It also runs Playwright, which needs the Chromium build for Playwright **1.64.1** (revision 1248) available locally. `make setup` does not download browsers. Tests compare generated sessions 2 and 3 with the golden workbooks cell for cell, including cell types, and check the UI at 1440 × 900 and 1280 × 800. The standalone HTML is tested offline through `file://`.

## Licence

[MIT](LICENSE).
