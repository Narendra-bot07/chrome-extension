from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
load_dotenv()

import sys
import asyncio
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import logging
logging.getLogger("httpx").setLevel(logging.WARNING)

from core.observability import configure_langsmith

# Must run before importing routers/services that construct LangChain models.
configure_langsmith()

# Initialize Observability (Logging, Sentry, Tracing)
from observability import setup_observability_logging, setup_sentry
from observability.tracing import setup_tracing
setup_observability_logging()
setup_sentry()

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from core.config import settings
from core.exceptions import global_exception_handler
from observability import CorrelationAndLoggingMiddleware
from contextlib import asynccontextmanager
from core.observability import langsmith_status
from core.database import get_db_pool, close_db_pool
from api.router import api_router
from api.v1.health import router as health_router, start_health_ticker
from app.routers.api import router as legacy_api_router
from services.notifications import start_notification_ticker

_startup_logger = logging.getLogger("main")


class ImmutableCachedStaticFiles(StaticFiles):
    """StaticFiles that marks every served file as permanently cacheable.
    Only ever mount this over a directory of content-hashed, never-reused
    filenames (e.g. a Vite build's assets/ folder) -- see the /__pdf_renderer
    mount below for why."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response

def _ensure_playwright_chromium() -> None:
    """
    Render's native (non-Docker) runtime does not reliably carry Playwright's
    browser cache from the build machine into the actual deployed instance —
    `playwright install` succeeding at build time doesn't guarantee the
    running container has it. `playwright install chromium` is idempotent
    (a fast no-op if a matching browser is already cached), so running it
    unconditionally on every startup self-heals that gap cheaply.
    """
    import subprocess
    try:
        subprocess.run(["playwright", "install", "chromium"], check=True, timeout=300)
    except Exception as exc:
        _startup_logger.error(f"[PLAYWRIGHT] Startup Chromium install failed: {exc}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    get_db_pool()
    start_health_ticker()
    start_notification_ticker()
    await asyncio.to_thread(_ensure_playwright_chromium)
    yield
    close_db_pool()
    from app.playwright_pdf import shutdown_playwright
    await asyncio.to_thread(shutdown_playwright)
    from services.job_extraction.browser_pool import shutdown_browser_pool
    await asyncio.to_thread(shutdown_browser_pool)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="3.0.0",
    description="Enterprise production-grade clean architecture for AI Resume Tailoring engine.",
    lifespan=lifespan
)

# Wire OTEL tracing — must happen after the app object is created
setup_tracing(app)

# Custom exception handler
app.add_exception_handler(Exception, global_exception_handler)

# Middlewares
app.add_middleware(CorrelationAndLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    # settings.FRONTEND_URL is a single canonical URL (used elsewhere for
    # constructing absolute links -- password reset emails, the email
    # branding logo, etc.) and was the ONLY production origin CORS ever
    # allowed. It's set to the Vercel deployment URL, but the app is also
    # served from the tailr4u.com custom domain -- every API call from
    # there was being CORS-blocked (no 'Access-Control-Allow-Origin'
    # header), breaking the dashboard and everything else for anyone
    # visiting the custom domain. allow_origins needs every real production
    # origin listed explicitly (CORSMiddleware requires exact matches, no
    # wildcard subdomains), not just the one FRONTEND_URL happens to be.
    allow_origins=[
        settings.FRONTEND_URL,
        "https://tailr4u.com",
        "https://www.tailr4u.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"^chrome-extension://.+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register root health routes (/live, /ready, /health)
app.include_router(health_router)

# Register v1 routes
app.include_router(api_router, prefix=settings.API_V1_STR)

# Register legacy route for backward compatibility with existing frontends
app.include_router(legacy_api_router)

# Mount templates directory for static preview images
templates_dir = os.path.join(os.path.dirname(__file__), "templates")
os.makedirs(templates_dir, exist_ok=True)
app.mount("/templates", StaticFiles(directory=templates_dir), name="templates")

# Serve the production React build to Playwright. Render's build script places
# the bundle inside the backend artifact. Keep frontend/dist as a local-dev
# fallback, but never silently hide a missing production renderer.
_renderer_dist_candidates = [
    os.environ.get("PDF_RENDERER_DIST_DIR", ""),
    os.path.join(BASE_DIR, "pdf_renderer_dist"),
    os.path.abspath(os.path.join(BASE_DIR, "..", "frontend", "dist")),
]
frontend_dist_dir = next(
    (
        os.path.abspath(candidate)
        for candidate in _renderer_dist_candidates
        if candidate and os.path.isfile(os.path.join(candidate, "index.html"))
    ),
    None,
)
if frontend_dist_dir:
    assets_subdir = os.path.join(frontend_dist_dir, "assets")
    if os.path.isdir(assets_subdir):
        # Vite content-hashes every file under assets/ (e.g. index-CCCVkh_Y.js)
        # -- a given filename's content never changes, only the filename
        # itself changes on rebuild. Without an explicit Cache-Control,
        # Starlette's StaticFiles only supports conditional revalidation
        # (If-None-Match/304), so Playwright's renderer was still round-tripping
        # to fetch every JS/CSS chunk on every single render (confirmed
        # directly from production logs: identical asset requests repeating
        # for every /api/render-unified-pdf call). Mounted before the general
        # /__pdf_renderer mount below so this more specific path wins.
        app.mount(
            "/__pdf_renderer/assets",
            ImmutableCachedStaticFiles(directory=assets_subdir),
            name="pdf-renderer-assets",
        )
    app.mount(
        "/__pdf_renderer",
        StaticFiles(directory=frontend_dist_dir, html=True),
        name="pdf-renderer",
    )
    _startup_logger.info("[PDF-RENDERER] Mounted static renderer from %s", frontend_dist_dir)
else:
    _startup_logger.error(
        "[PDF-RENDERER] Static renderer is missing; PDF downloads will fail. "
        "Run backend/render-build.sh from a Render service whose Root Directory is blank."
    )

@app.get("/")
async def root():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": "3.0.0",
        "layer": "Enterprise Clean Architecture"
    }


@app.get("/api/observability/status")
async def observability_status():
    """Expose configuration health without returning credentials."""
    return langsmith_status()

@app.get(settings.METRICS_PATH)
async def metrics_endpoint(request: Request):
    """Expose Prometheus/OpenMetrics formatted endpoint protected by Bearer Token."""
    import hmac
    from fastapi import Response, status
    from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
    from observability.metrics import registry

    if not settings.METRICS_ENABLED:
        return Response(
            status_code=status.HTTP_404_NOT_FOUND,
            content="Metrics are disabled.",
            media_type="text/plain"
        )

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return Response(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content="Missing or invalid credentials.",
            media_type="text/plain"
        )

    token = auth_header.split(" ")[1].strip()
    expected_token = (settings.METRICS_BEARER_TOKEN or "").strip()

    # Constant-time token verification to secure metrics from timing attacks
    if not expected_token or not hmac.compare_digest(token, expected_token):
        return Response(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content="Missing or invalid credentials.",
            media_type="text/plain"
        )

    try:
        metrics_data = generate_latest(registry)
        return Response(
            content=metrics_data,
            media_type=CONTENT_TYPE_LATEST
        )
    except Exception as gather_err:
        return Response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=f"Error collecting metrics: {gather_err}",
            media_type="text/plain"
        )

if __name__ == "__main__":
    import uvicorn
    # reload=True runs a file-watcher that restarts the whole server on any
    # detected file change under the working directory — including writes the
    # app makes to itself at runtime (resume uploads to local_uploads/,
    # Playwright temp/cache files, logs). A restart mid-request kills every
    # in-flight connection, not just the one that triggered it. Never enable
    # this outside local development. Render (and most PaaS hosts) also inject
    # the port to bind via $PORT — hardcoding 8000 only works by coincidence
    # of platform configuration.
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=bool(os.environ.get("UVICORN_RELOAD")),
    )
