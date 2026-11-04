# bracket

bracket builds standard-bracketed LA-ICP-MS run sequences for the Thermo Qtegra LabBook. Milestone 1 provides the pure TypeScript engine and a Svelte 5 app shell with Light / Dark / System themes. The sequence editor, workbook formats, and desktop build follow in later milestones. Use Node.js 22.18+ (or 24+) and pnpm 10; all app assets run locally without a network connection.

| Command        | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `make setup`   | Install dependencies with pnpm                       |
| `make dev`     | Start the Vite development server                    |
| `make test`    | Check formatting, lint, types, and engine unit tests |
| `make e2e`     | Run the Chromium page smoke test                     |
| `make build`   | Build the web app into `dist/`                       |
| `make desktop` | Placeholder; exits 1 until milestone 4               |

Playwright is pinned to 1.64.1 to use the existing cached Chromium revision 1248. Setup does not download browsers.
