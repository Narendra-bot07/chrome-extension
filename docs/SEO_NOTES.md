# SEO Audit & Implementation Notes

Date: 2026-08-05. Scope: `frontend/` (Vite + React SPA), production domain `https://tailr4u.com`.

## The one fact that shapes everything else here

The app uses `react-router-dom`'s **`HashRouter`** (`frontend/src/App.jsx`). Every
in-app route — `/dashboard`, `/login`, `/job-tracker`, all of it — is addressed as
`https://tailr4u.com/#/whatever`. The `#/...` fragment is a browser-only construct;
it is **never sent to the server** and is not treated as a distinct URL by search
engines (Google deprecated hashbang-style crawling years ago; plain `#/path`
fragments are invisible to standard crawling/indexing).

Practical effect: **there is exactly one real, crawlable document on this site
today** — `https://tailr4u.com/`. Everything downstream of that (sitemap contents,
per-route canonical tags, per-route noindex, new "landing pages" for keyword
targeting, SSR/prerendering) is either moot or requires first solving this.

### Why it wasn't changed in this pass

`vercel.json` already has a catch-all rewrite (`"source": "/(.*)", "destination":
"/index.html"`) — the config needed for path-based routing (`BrowserRouter`) to work
on Vercel is already in place. Swapping `HashRouter` → `BrowserRouter` is the
correct long-term fix, but it's a genuinely cross-cutting change, not a small safe
one:

- Multiple call sites navigate via `window.location.hash = '#/...'` directly
  (e.g. post-login redirects) rather than through React Router's `navigate()`.
  These would silently stop working under `BrowserRouter` and need updating
  individually.
- The Chrome extension side panel loads via `chrome-extension://<id>/index.html`
  (`manifest.json`: `"side_panel": { "default_path": "index.html" }`). In-panel
  navigation via `history.pushState` should be safe (it never leaves the loaded
  document), but this needs deliberate verification, not an assumption, before
  shipping — a broken extension is a worse outcome than the current SEO gap.

**Recommendation:** treat this as its own follow-up task with its own testing pass
across both the web app and the extension, not bundled into this SEO pass.

## What this pass actually changed

| Area | Status |
|---|---|
| `index.html` metadata (title, description, canonical, robots, OG, Twitter, JSON-LD) | Done |
| `robots.txt` | Rewritten — allows `/`, defensively disallows known app paths, references sitemap |
| `sitemap.xml` | Added — one URL (`/`), honestly reflects what's actually crawlable |
| Google Search Console verification, GA4, Microsoft Clarity | Wired via env vars, no-op until configured, skipped entirely in the extension build |
| Reusable SEO utility (`src/utils/seo.js`) | Added — `applyPageMeta()`, `absoluteUrl()`, `breadcrumbListJsonLd()` for future per-page use |
| 404 handling | Added a catch-all route + `NotFoundPage` (previously: blank page, no 404 UI at all) |
| Analytics env placeholders | Added to `frontend/.env.example` |

See `docs/CHANGELOG.md` for the dated entry with full file-by-file detail.

## Findings not acted on (flagged, not fixed)

- **Footer "Help"/"Contact" links point to `/support/faq` and `/support/contact`,
  which are behind `ProtectedRoute`.** An anonymous visitor clicking either from
  the public landing page gets redirected straight to `/login` instead of seeing
  content. Confirmed `FAQPage.jsx`'s content is generic and not user-specific, so
  it *could* be made public — but doing so meaningfully (as a real indexable page)
  requires the same routing decision above, so it wasn't done here.
- **www vs non-www / HTTP→HTTPS canonicalization.** `index.html`'s canonical tag
  is hardcoded to `https://tailr4u.com/` regardless of how the page is actually
  requested, which prevents duplicate-content signals from query strings or
  trailing-slash variants. But if `https://www.tailr4u.com` or `http://tailr4u.com`
  are reachable at all without redirecting to the canonical host, that's a Vercel
  **Domains** dashboard setting, not something expressible in this repo. Manual
  action: confirm in Vercel that `tailr4u.com` is the primary domain and any
  other host/protocol variant redirects (301) to it.
- **`location-data` chunk is 8.6MB uncompressed** (`country-state-city` library,
  already split into its own chunk in `vite.config.js`). It's not lazy-loaded —
  everyone pays for it upfront regardless of whether they touch a location
  picker. Worth converting to a dynamic `import()` at its actual call site(s) as
  a follow-up; not done here since it's a performance change orthogonal to the
  SEO metadata/crawlability work and touches app code outside the public surface.
- **No dedicated OG/social-preview image exists.** `og:image`/`twitter:image`
  point at the existing square `application-logo.png` so previews aren't broken,
  but a real 1200×630 card image would look better on link shares. Manual
  action: design one, drop it at `frontend/public/og-image.png`, update the two
  meta tags in `index.html`.
- **New topic-specific landing pages** ("AI resume builder", "ATS-friendly resume
  builder", etc.) were not created. Under `HashRouter` they wouldn't be separate
  crawlable URLs regardless of how much unique content they contained, so writing
  them now would either be wasted effort or require inventing marketing copy not
  reflected in the actual product — both explicitly out of scope for this pass.
