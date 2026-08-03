#!/usr/bin/env bash
# Render Build Command — set this file as the Build Command in the Render
# dashboard (e.g. `bash backend/render-build.sh` with Root Directory=backend,
# or `bash render-build.sh` if Root Directory is already the repo root).
#
# `pip install` alone only gets Playwright's Python bindings — it does NOT
# download the actual Chromium binary. Without the explicit `playwright
# install` step below, BrowserType.launch() fails at runtime with
# "Executable doesn't exist at .../chrome-headless-shell", which is exactly
# what was happening before this script existed.
set -o errexit

pip install -r requirements.txt
playwright install --with-deps chromium
