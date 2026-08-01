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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from core.config import settings
from core.exceptions import global_exception_handler
from core.middleware import RequestLoggingMiddleware
from contextlib import asynccontextmanager
from core.observability import langsmith_status
from core.database import get_db_pool, close_db_pool
from api.router import api_router
from api.v1.health import router as health_router, start_health_ticker
from app.routers.api import router as legacy_api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    get_db_pool()
    start_health_ticker()
    yield
    close_db_pool()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="3.0.0",
    description="Enterprise production-grade clean architecture for AI Resume Tailoring engine.",
    lifespan=lifespan
)

# Custom exception handler
app.add_exception_handler(Exception, global_exception_handler)

# Middlewares
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
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

# Serve the production React build to Playwright. PDF generation must not
# depend on a separately running Vite development server.
frontend_dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.isfile(os.path.join(frontend_dist_dir, "index.html")):
    app.mount("/__pdf_renderer", StaticFiles(directory=frontend_dist_dir, html=True), name="pdf-renderer")

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
