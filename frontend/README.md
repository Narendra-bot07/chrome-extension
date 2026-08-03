# Tailr4U frontend

React 18 and Vite application used by both the Tailr4U web experience and the Chrome Manifest V3 side panel.

## Local development

1. Copy `.env.example` to `.env.local` and fill in browser-safe values.
2. Install with `npm ci`.
3. Start with `npm run dev`.

## Release checks

Run `npm run check`. This executes every Node-based unit test and creates the production build in `dist/`.

## Vercel deployment

Use `frontend/` as the Vercel project root. `vercel.json` configures `npm ci`, the Vite build, immutable asset caching, and baseline security headers.

Configure these production variables in Vercel:

- `VITE_API_BASE_URL` — public HTTPS backend origin, without a trailing slash.
- `VITE_GOOGLE_CLIENT_ID` — Google OAuth web client ID with the deployed origin registered.
- `VITE_APP_ENV=production`
- `VITE_APP_RELEASE` — immutable release identifier or commit SHA.
- `VITE_SENTRY_DSN`, `VITE_SENTRY_ENABLED=true`, and `VITE_SENTRY_TRACES_SAMPLE_RATE` when monitoring is enabled.
- `VITE_ENABLE_ERROR_MONITORING=true`
- `VITE_ENABLE_GOOGLE_PROFILE_ENRICHMENT` only when the corresponding Google scopes are approved.

Do not place JWT secrets, service-role keys, payment secrets, SMTP credentials, or LLM keys in any `VITE_*` variable. Vite embeds these values into the public browser bundle.

After deploying, register the exact HTTPS origin and redirect URI in Google Cloud, set the backend `FRONTEND_URL` to this origin, verify CORS, and smoke-test login, resume upload, tailoring, AI editing, deterministic ATS rescoring, payments, and PDF download.

## Chrome extension package

Run `npm run build`, then load or package `dist/`. Reload the unpacked extension after every build. Review `public/manifest.json` permissions and bump both the package and manifest versions before a store release.
