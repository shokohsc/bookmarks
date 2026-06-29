# bookmark-search

Build a searchable index from your browser bookmarks, served through a dark-themed web UI with real-time client-side filtering.

## Prerequisites

- Node.js 22+

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
6. Incremental: reuses existing entries from a prior `docs/index.json` — only new or changed URLs are fetched. Entries removed from `bookmarks.html` are dropped from the index. Existing entries have their titles updated from the bookmarks file.
7. Writes the combined index to `docs/index.json`.
8. If any URLs failed to fetch, prints a summary and writes details to `docs/failures.json`.

## Frontend

The Vite-powered UI lives in `src/`:

- **`src/main.js`** - Fetches `index.json` on load, provides a debounced search input (150 ms) that filters results in real time by matching against title, URL, tags, and content text. All user-controlled data (titles, URLs, tags) is HTML-escaped before rendering to prevent XSS.
- **`src/style.css`** - Dark theme with a navy/deep-blue palette (#1a1a2e background, #16213e cards, #e94560 accent).

The entry point is `index.html`. The Vite dev server runs on port 8001 with `host: true` (accessible on the network).

## GitHub Stars Export

`stars.js` is a CLI tool that exports a GitHub user's starred repositories to a `stars.txt` file using the GitHub API.

```bash
# Set your GitHub personal access token
export GITHUB_TOKEN=ghp_...

# Export starred repos for a user
node stars.js <github-username>
```

The tool:
- Uses `GITHUB_TOKEN` environment variable for authentication (required).
- Paginates through all starred repos (100 per page).
- Writes each repo as `https://github.com/<owner>/<repo>` to `stars.txt`.
- Accepts an optional `fetch` function as a second parameter for testing via dependency injection.

## Docker

### Production build

`Dockerfile` uses a multi-stage build:

1. **Build stage**: `node:22-alpine` installs dependencies and runs `npm run build`.
2. **Runtime stage**: `nginx:stable-alpine` serves the built `docs/` directory on port 80.

```bash
docker build -t bookmark-search .
docker run -p 8080:80 bookmark-search
```

### Development

`Dockerfile.dev` runs the dev server directly:

- Based on `node:22-alpine`.
- Creates a non-root `bookmarks` user for security.
- Exposes port 8001 (the Vite dev server).
- Runs `npm run dev` on container start.

```bash
docker build -f Dockerfile.dev -t bookmark-search-dev .
docker run -p 8001:8001 bookmark-search-dev
```

## Project Structure

```
bookmarks.html        Browser bookmarks export (place in project root)
build.js              Data pipeline: parse, validate, fetch, extract, index
tagger.js             Keyword extraction and categorization (frequency-based)
stars.js              CLI tool to export GitHub starred repos to stars.txt

src/
  main.js             Frontend entry: search UI with client-side filtering
  style.css           Dark-theme styles

index.html            Vite entry HTML template
vite.config.js        Vite configuration (port 8001, host: true, base: ./,
                      emptyOutDir: false, custom middleware for /index.json
                      with query string support via split("?")[0])
vitest.config.js      Vitest test runner configuration

build.test.js         Unit tests for URL validation, bookmark parsing,
                      content extraction, and build orchestration (53 tests)
stars.test.js         Unit tests for GitHub stars export CLI (9 tests)
tagger.test.js        Unit tests for tag generation and categorization (20 tests)
functional.test.js    Integration tests serving pages via Vite dev server (4 tests)

docs/
  index.html          Built frontend (static, ready for hosting)
  index.json          Generated search index
  failures.json       Failure report (written when any URLs fail to fetch)
  assets/             Built JS and CSS bundles
```

## Testing

- `npm test` - Run all tests with vitest (86 tests across 4 suites).
- `npm run test:coverage` - Run tests with coverage reporting (via `@vitest/coverage-v8`).
- `npm run test:watch` - Run tests in watch mode.

| Test file | Tests | Scope |
|-----------|-------|-------|
| `build.test.js` | 53 | URL validation, bookmark parsing, content extraction, build orchestration |
| `stars.test.js` | 9 | CLI args, token validation, pagination, HTTP/net errors |
| `tagger.test.js` | 20 | Tag generation, categorization, stopword filtering |
| `functional.test.js` | 4 | Dev server page serving, asset resolution |

## GitHub Pages

The repository includes a GitHub Actions workflow (`.github/workflows/build.yml`) that automatically builds and deploys to GitHub Pages on every push that changes source files (`bookmarks.html`, `urls.txt`, `src/`, `build.js`, `tagger.js`, `vite.config.js`, `index.html`).

### Setup

1. Push the repo to GitHub.
2. In the repo Settings → **Pages** → **Source**, select **GitHub Actions**.
3. The workflow is triggered automatically on relevant pushes. A "github-pages" environment will appear in the repo Settings → **Environments** after the first successful run.

### Manual trigger

Go to the repo Actions tab, select the "Build and Deploy to GitHub Pages" workflow, and click **Run workflow**.

## Security

### URL validation (`build.js`)

Validates every URL before fetching:

- Only `http:` and `https:` protocols are permitted.
- URLs with embedded credentials (username or password) are rejected.
- Requests to private or internal networks are blocked:
  - Hostnames: `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, `[::]`
  - IPv4 ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`
  - IPv6 ranges: `fc00::/7` (unique-local), `fd00::/7`, `fe80::/10` (link-local)
- IPv6 addresses are stripped of bracket notation (`[::1]` → `::1`) before checking, preventing SSRF bypasses via bracketed IPv6 literals.
- Redirect targets are re-validated against the same rules before following.
- A maximum redirect depth of 5 (`MAX_REDIRECTS=5`) prevents infinite redirect loops.
- Non-HTML content types (based on `Content-Type` header) are skipped.
- Responses exceeding 1 MB are truncated.

### XSS prevention (`src/main.js`)

All user-controlled data rendered into the DOM (titles, URLs, tags) is passed through an `escapeHtml()` function that escapes `&`, `<`, `>`, and `"` characters before insertion via `innerHTML`.

### Container security (`Dockerfile.dev`)

- Runs as a non-root `bookmarks` user instead of root.
- Uses multi-stage builds in production to minimize the runtime image footprint.
