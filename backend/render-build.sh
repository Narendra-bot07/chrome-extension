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
