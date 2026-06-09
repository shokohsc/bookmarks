# bookmark-search

Build a searchable index from your browser bookmarks, served through a dark-themed web UI with real-time client-side filtering.

## Prerequisites

- Node.js 18+

## Setup

```bash
npm install
```

Export your bookmarks from your browser as `bookmarks.html` in the project root. Most browsers provide this option via Bookmarks Manager -> Export Bookmarks to HTML.

## Usage

### Build (production)

```bash
npm run build
```

Runs the data pipeline to generate the search index, then builds the Vite frontend. Output is written to `docs/` (index.html, index.json, and assets bundle).

### Development

```bash
npm run dev
```

Generates the search index and starts the Vite dev server on [http://localhost:8001](http://localhost:8001) with hot module replacement. The dev server serves `index.json` from `docs/index.json` via a custom middleware.

## Data Pipeline

`build.js` orchestrates the following:

1. Parses `bookmarks.html` and extracts all `<a>` elements (up to 5000 bookmarks).
2. Validates each URL for safety (see Security below).
3. Fetches the URL with a 20-second timeout and 1 MB response limit.
4. Extracts readable text content via `@mozilla/readability`.
5. Generates keyword tags and a category via `tagger.js`, which performs frequency analysis (filters stopwords and words shorter than 4 characters, returns the top 10 terms).
6. Writes the combined index to `docs/index.json`.

## Frontend

The Vite-powered UI lives in `src/`:

- **`src/main.js`** - Fetches `index.json` on load, provides a debounced search input (150 ms) that filters results in real time by matching against title, URL, tags, and content text.
- **`src/style.css`** - Dark theme with a navy/deep-blue palette (#1a1a2e background, #16213e cards, #e94560 accent).

The entry point is `index.html`. The Vite dev server runs on port 8001 with `host: true` (accessible on the network).

## Project Structure

```
bookmarks.html        Browser bookmarks export (place in project root)
build.js              Data pipeline: parse, validate, fetch, extract, index
tagger.js             Keyword extraction and categorization (frequency-based)

src/
  main.js             Frontend entry: search UI with client-side filtering
  style.css           Dark-theme styles

index.html            Vite entry HTML template
vite.config.js        Vite configuration (port 8001, dev server, static build to docs/)
vitest.config.js      Vitest test runner configuration

functional.test.js    Integration tests (serves pages via Vite dev server)
build.test.js         Unit tests for URL validation, bookmark parsing, content extraction
tagger.test.js        Unit tests for tag generation and categorization

docs/
  index.html          Built frontend (static, ready for hosting)
  index.json          Generated search index
  assets/             Built JS and CSS bundles
```

## Testing

- `npm test` - Run all tests with vitest (70+ tests across unit and integration suites).
- `npm run test:coverage` - Run tests with coverage reporting (via `@vitest/coverage-v8`).
- `npm run test:watch` - Run tests in watch mode.

## GitHub Pages

The repository includes a GitHub Actions workflow (`.github/workflows/build.yml`) that automatically builds and deploys to GitHub Pages on every push that changes source files (`bookmarks.html`, `src/`, `build.js`, `tagger.js`, `vite.config.js`, `index.html`).

### Setup

1. Push the repo to GitHub.
2. In the repo Settings → **Pages** → **Source**, select **GitHub Actions**.
3. The workflow is triggered automatically on relevant pushes. A "github-pages" environment will appear in the repo Settings → **Environments** after the first successful run.

### Manual trigger

Go to the repo Actions tab, select the "Build and Deploy to GitHub Pages" workflow, and click **Run workflow**.

## Security

`build.js` validates every URL before fetching:

- Only `http:` and `https:` protocols are permitted.
- URLs with embedded credentials (username or password) are rejected.
- Requests to private or internal networks are blocked:
  - Hostnames: `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `[::]`
  - IPv4 ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`
  - IPv6 ranges: `fc00::/7` (unique-local), `fd00::/7`, `fe80::/10` (link-local)
- Redirect targets are re-validated against the same rules before following.
- Non-HTML content types are skipped.
- Responses exceeding 1 MB are truncated.
