"""
Persistent, thread-affine Chromium pool for JD-page scraping (browser_agent
in agents.py), mirroring the pattern in backend/app/playwright_pdf.py -- but
kept as its OWN independent pool rather than sharing that one.

Why a separate pool instead of reusing playwright_pdf.py's: JD scraping and
PDF rendering are unrelated pipeline stages with very different timing
profiles (a slow/stuck job-board scrape must never queue behind, or be
queued behind by, a user's PDF download). Confirmed via investigation that
today they don't contend with each other at all; sharing one pool would
introduce exactly that cross-stage queueing where none exists now.

Why a pool is needed at all: browser_agent previously did
`with sync_playwright() as playwright: browser = playwright.chromium.launch()`
fresh on every single call, then tore it down -- a cold Chromium launch this
project's own code already documents as costing 5-15s (see graph.py). The
whole JD-extraction graph runs via `asyncio.to_thread(...)` in api/v1/jobs.py,
which uses Python's default thread pool (an arbitrary worker thread per
call, not a fixed one) -- so a persistent Playwright browser/context can't
just be cached at module level and reused directly from browser_agent, since
Playwright's sync API binds to whichever OS thread started it and touching
it from a different thread raises a greenlet/threading error. Routing the
actual Playwright work through one dedicated single-worker executor (like
_serialize_pdf_render does) gives every call the same consistent thread
regardless of which asyncio.to_thread worker happened to invoke browser_agent.
"""
import concurrent.futures

from playwright.sync_api import sync_playwright

_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=1, thread_name_prefix="jd-scrape-browser"
)

_playwright_instance = None
_browser_instance = None
_context_instance = None


def _get_context_on_pool_thread():
    global _playwright_instance, _browser_instance, _context_instance
    if _browser_instance is not None:
        try:
            if not _browser_instance.is_connected():
                raise RuntimeError("browser disconnected")
        except Exception:
            try:
                _browser_instance.close()
            except Exception:
                pass
            _browser_instance = None
            _context_instance = None
    if _browser_instance is None:
        if _playwright_instance is None:
            _playwright_instance = sync_playwright().start()
        _browser_instance = _playwright_instance.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        )
        _context_instance = None
    if _context_instance is None:
        _context_instance = _browser_instance.new_context()
    return _context_instance


def run_on_browser_pool(fn, *args, **kwargs):
    """Runs fn(context, *args, **kwargs) on the dedicated pool thread, where
    `context` is the shared, persistent BrowserContext. fn gets a fresh Page
    from that context (`context.new_page()`) and must close it when done --
    the context and browser themselves are never closed here, only reused."""
    def _call():
        context = _get_context_on_pool_thread()
        return fn(context, *args, **kwargs)
    return _executor.submit(_call).result()


def _shutdown_on_pool_thread():
    global _playwright_instance, _browser_instance, _context_instance
    if _context_instance is not None:
        try:
            _context_instance.close()
        except Exception:
            pass
        _context_instance = None
    if _browser_instance is not None:
        try:
            _browser_instance.close()
        except Exception:
            pass
        _browser_instance = None
    if _playwright_instance is not None:
        try:
            _playwright_instance.stop()
        except Exception:
            pass
        _playwright_instance = None


def shutdown_browser_pool():
    """Public entry point for app shutdown hooks (see main.py's lifespan)."""
    _executor.submit(_shutdown_on_pool_thread).result()
    _executor.shutdown(wait=False)
