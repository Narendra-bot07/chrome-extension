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
#
# NOTE: deliberately NOT using `--with-deps` here. That flag shells out to
# apt-get via sudo/su to install missing system libraries, which requires
# root. Render's native (non-Docker) build environment runs as a non-root
# user with no passwordless sudo, so `--with-deps` fails the build with
# "su: Authentication failure" before the browser is ever downloaded.
set -o errexit

pip install -r requirements.txt
playwright install chromium
