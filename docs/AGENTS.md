# AGENTS.md — techandsociety.ai site content (`docs/`)

Guidance for people and agents editing the deployed site. Repo-wide workflow
rules (branch/PR scoping, local dev server) live in the root
[`AGENTS.md`](../AGENTS.md) — read that first. Note that this file is itself
deployed and publicly readable.

## What this directory is

The deployed source of **techandsociety.ai** — hand-written static HTML, no
build step, no framework. It is **not** a single file; the tree is:

- `index.html` — home page, and the only page a visitor is meant to enter by
- `report-*.html` — five standalone survey reports
- `work/` — "AI & Work" report series (13 numbered entries, an index, and a
  reference page)
- `school/` — "AI & School" report series (8 numbered entries — entry 06 is
  intentionally absent — and an index)
- `test-status/` — machine-generated test dashboard, overwritten by CI from the
  `mcp-server` repo. **Never hand-edit it**; changes will be clobbered by the
  next bot commit.
- `404.html` — not-found page, styled to match `index.html`
- `assets/` — the shared report design system (`report.css`, `report.js`),
  extracted chart images (`img/<page>/`), the favicon set, and the Open
  Graph card (`og-card.png`)
- `CNAME`, `_config.yml` — Pages plumbing

## The MCP server

The MCP server is a separate repo:
[`techandsociety-ai/mcp-server`](https://github.com/techandsociety-ai/mcp-server).
This site only documents it.

- **Live URL**: `https://ai.techandsociety.ai/mcp` — the Northeastern 2026 AI
  survey server (Cloud Run service `chip50-ai-mcp-vanity`). This is the only
  address the site publishes. The older `*.run.app` addresses still answer but
  are being retired (2026-09-22); do not publish them.
- **Transport**: remote MCP over HTTPS (not stdio)
- **Auth**: Google OAuth; access is managed — unauthorized users request access
  at the auth screen. Users connect via Settings → Connectors → Add custom
  connector in Claude.
- **Backend**: Google Cloud Run + BigQuery.
- **Tools**: don't hardcode tool counts or lists in site copy — they drift.
  The server documents itself: connect and call `introduce_mcp` (or
  `get_available_variables`) for the current inventory, and describe tools on
  the site in terms of what they let a reader do.

## Design status

- `index.html` and `404.html`: dark navy (`#091525`) with teal `#2DC4B6`
  accent, Cormorant Garamond display + Inter / Inter Tight. Google Fonts is
  the only external dependency. Note this look is an **explicit placeholder**
  pending the branding decision — see the open branding issue before treating
  any of its values as settled.
- **All report pages** (`report-*.html`, `work/`, `school/`) share one design
  system: `assets/report.css` + `assets/report.js`. Warm-paper light/dark
  theme (system serif/sans stacks, no webfonts), sticky masthead with scroll
  progress, sidebar TOC with scroll-spy, and inline-SVG charts using the
  `svg.cv` class vocabulary (`.cs1/.cs2/.cs3` map to the series-color tokens).
  Per-family accents come from a body class — `series-work` (blue),
  `series-school` (amber), `series-standalone` (teal) — defined in the token
  block at the bottom of `report.css`. **A rebrand or new family is a token
  edit in that one file**; never reintroduce per-page inline styles.
  The dark-mode toggle persists via the `localStorage` key `chip50-theme` —
  don't rename it.
- New report pages: copy the skeleton of any `work/` entry (masthead → sidebar
  TOC → hero → prose → foot), link the shared assets with the correct relative
  path, and set the family body class.
- Known debt: chart images on the five standalone reports are extracted PNGs
  under `assets/img/` (restyle to `svg.cv` opportunistically), and
  `work/01`/`work/13` embed matplotlib SVGs that ignore the design tokens
  (wrong colors in dark mode until re-rendered).
- `index.html` carries a client-side password gate (SHA-256 check,
  `sessionStorage` session). No other page does. Whether that is the right
  posture is an open question with its own issue; don't change it here.

## Deployment (corrected — read this)

`docs/` deploys via `.github/workflows/pages.yml`: a push to `main` that
touches `docs/**` publishes the whole directory to GitHub Pages (custom domain
`techandsociety.ai`) within a couple of minutes. There is no separate build
step and no "Pages serves the branch root" config.

**Do not commit or push to `main` directly** — every merge is a production
deploy. Work on a branch, open a PR, and let a human merge it. Preview locally
first: `uv run serve.py` from the repo root (see root `AGENTS.md`).

## Things to preserve

- The Connect section is oriented toward **end users connecting to the
  existing server**, not self-hosting. Don't revert it to deployment
  instructions.
- The server URL in that section is the real production URL, not a
  placeholder.
- The password gate on `index.html` is intentional; don't remove it as
  "cleanup".
- Favicon, canonical, and Open Graph tags sit in the head of every page. A new
  page copies that block and edits the title, description, URL, and the
  relative depth of the asset paths.
