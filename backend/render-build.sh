#!/usr/bin/env bash
# Render Build Command. Keep the service Root Directory blank (repository
# root), then use `bash backend/render-build.sh` as the Build Command.
set -o errexit

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"
RENDERER_DIST_DIR="$SCRIPT_DIR/pdf_renderer_dist"

if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
  echo "ERROR: frontend/package.json is unavailable. Clear Render's Root Directory so the complete repository is available during the build." >&2
  exit 1
fi

# PDF generation renders the same React print route used by the live preview.
# Build it into the backend artifact so runtime rendering does not depend on
# Vercel or on a sibling directory surviving Render's packaging.
(
  cd "$FRONTEND_DIR"
  # frontend/.env is correctly git-ignored and therefore is unavailable on
  # Render. Bridge the backend service's Sentry variables into the VITE_*
  # names that must exist at frontend compile time. Explicit VITE_* settings
  # still take precedence when configured in the Render dashboard.
  export VITE_SENTRY_DSN="${VITE_SENTRY_DSN:-${SENTRY_FRONTEND_DSN:-}}"
  SENTRY_DSN_CONFIGURED=false
  if [[ -n "$VITE_SENTRY_DSN" ]]; then
    SENTRY_DSN_CONFIGURED=true
    export VITE_SENTRY_ENABLED="${VITE_SENTRY_ENABLED:-true}"
    export VITE_ENABLE_ERROR_MONITORING="${VITE_ENABLE_ERROR_MONITORING:-true}"
  fi
  echo "PDF renderer Sentry build config: enabled=${VITE_SENTRY_ENABLED:-false}, dsn_configured=$SENTRY_DSN_CONFIGURED"
  npm ci
  npm run build -- --outDir "$RENDERER_DIST_DIR"
)

if [[ ! -f "$RENDERER_DIST_DIR/index.html" ]]; then
  echo "ERROR: PDF renderer build did not create $RENDERER_DIST_DIR/index.html" >&2
  exit 1
fi

pip install -r "$SCRIPT_DIR/requirements.txt"

# Render's native runtime is non-root, so do not use `--with-deps` here.
playwright install chromium
