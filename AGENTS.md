# bookmark-search AGENTS.md

## Build pipeline (two phases)

1. `node build.js` — reads `bookmarks.html`, parses `<a>` links, fetches each URL (20s timeout, 1MB limit), extracts readable content via `@mozilla/readability`, generates tags via `tagger.js`, writes `docs/index.json`
2. `vite build` — bundles `src/main.js` + `src/style.css` into `docs/` with `base: "./"` for relative asset paths

`npm run build` runs both phases in sequence.

## Required before any build

`bookmarks.html` must exist at project root. It's in `.gitignore` — do not commit personal bookmarks.

## Dev server quirks

- `npm run dev` runs data generation then Vite on **port 8001** (not default 5173), `host: true`
- Custom middleware in `vite.config.js` intercepts `/index.json` and reads from `docs/index.json`
- `npm run dev:ui` starts Vite only (skip data gen), useful when iterating on frontend after data exists

## Vite config gotchas

- `emptyOutDir: false` — preserves `docs/index.json` during Vite builds (data is generated separately)
- `base: "./"` — ensures built asset paths work from subdirectories and file://

## Testing

- `npm test` — vitest, runs all 3 test files (76 tests). Functional tests start a real Vite dev server.
- `npm run test:coverage` — covers only `build.js` and `tagger.js` (excludes built assets and src/)
- Functional tests (`functional.test.js`) use 30s hook timeout — Vite `createServer` startup is slow
- Unit tests mock `fs`, `node-fetch`, `cheerio`, `jsdom`, `@mozilla/readability` via `vi.mock`

## Key project files

| File | Role |
|------|------|
| `build.js` | Data pipeline: parse bookmarks.html, fetch URLs, extract content, write index.json |
| `tagger.js` | Frequency-based keyword extraction (top 10 terms, filters stopwords + words <4 chars) |
| `src/main.js` | Frontend entry: fetches index.json, 150ms debounced search against title/url/tags/content |
| `src/style.css` | Dark theme (#1a1a2e bg, #16213e cards, #e94560 accent) |
| `index.html` | Vite entry HTML template |
| `vite.config.js` | Vite config: port 8001, host: true, base: ./, output to docs/, custom index.json middleware |
| `vitest.config.js` | Vitest: 30s test/hook timeout |

## CI / GitHub Pages

- `.github/workflows/build.yml` triggers on pushes to `main` touching: `bookmarks.html`, `src/**`, `build.js`, `tagger.js`, `vite.config.js`, `index.html`
- Full `npm run build` then deploy `docs/` via `actions/upload-pages-artifact` + `actions/deploy-pages`
- Repo Settings → Pages → Source must be set to **GitHub Actions**

## Security (build.js)

URL validation (`validateUrl` + `isPrivateIP`) enforces:
- Only `http:` / `https:` protocols
- No embedded credentials
- Private/internal IP blocks (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, localhost, IPv6 fc/fd/fe80)
- Redirect targets re-validated before following
- Non-HTML content types skipped
- Responses >1MB truncated

## Node version

Node 18+. `jsdom` is pinned to v24.x for Node 18 ESM compatibility.
