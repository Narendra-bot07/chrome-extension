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
import threading

from playwright.sync_api import sync_playwright

# No timeout previously existed on the .result() call below at all. Every
# call already has its own bounded budget internally (page.goto capped at
# 5s, networkidle wait capped at 0.5s), so a normal call finishes well
# under this; this exists purely as a ceiling against a genuine hang
# (browser/driver-level, outside any single Playwright call's own timeout --
# e.g. page.close() itself hanging) -- which, with max_workers=1, would
# otherwise block JD extraction for every user of the entire product
# indefinitely, not just the one request that triggered it.
_POOL_CALL_TIMEOUT_SECONDS = 30.0

_executor_lock = threading.Lock()
_executor = concurrent.futures.ThreadPoolExecutor(
    max_workers=1, thread_name_prefix="jd-scrape-browser"
)
_pool_admission = threading.BoundedSemaphore(1)
_thread_state = threading.local()


class BrowserPoolBusyError(RuntimeError):
    """The recovery browser is already serving another extraction.

    This is intentionally distinct from an execution timeout.  Callers can
    continue with extension evidence instead of queueing behind a slow page.
    """


# Confirmed directly (production-matching repro against a real, public,
# WAF-protected careers site returning a genuine 403): default Playwright
# Chromium is trivially fingerprinted as a bot -- navigator.webdriver is
# true and the default UA string literally contains "HeadlessChrome" --
# and common WAFs (AWS WAF, Akamai, PerimeterX, etc.) block on sight before
# the page ever renders. The exact same URL, same network path, returns 200
# with the full posting once these are masked. This targets only automation
# fingerprinting, not authentication or paywalls -- a real visitor's browser
# already sees this exact public page.
_SCRAPE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
_WEBDRIVER_MASK_SCRIPT = "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"


def _get_context_on_pool_thread():
    browser = getattr(_thread_state, "browser", None)
    context = getattr(_thread_state, "context", None)
    playwright = getattr(_thread_state, "playwright", None)
    if browser is not None:
        try:
            if not browser.is_connected():
                raise RuntimeError("browser disconnected")
        except Exception:
            try:
                browser.close()
            except Exception:
                pass
            browser = None
            context = None
    if browser is None:
        if playwright is None:
            playwright = sync_playwright().start()
            _thread_state.playwright = playwright
        browser = playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
        )
        _thread_state.browser = browser
        context = None
    if context is None:
        context = browser.new_context(
            user_agent=_SCRAPE_USER_AGENT,
            viewport={"width": 1366, "height": 900},
            locale="en-US",
        )
        context.add_init_script(_WEBDRIVER_MASK_SCRIPT)
        _thread_state.context = context
    return context


def _reset_pool_after_timeout():
    """A timed-out call's worker thread is presumed permanently stuck --
    Python threads cannot be forcibly killed, and with max_workers=1 the
    single worker never becomes free again on its own. Waiting longer
    wouldn't help, so instead of leaving every future call queued forever
    behind a hang that will never resolve, abandon that executor/thread
    entirely and start a fresh one. The old browser/playwright instances
    are owned by the now-abandoned thread and are deliberately NOT closed
    here -- Playwright's sync API raises if touched from a different
    thread than the one that started it; they're simply dropped."""
    global _executor
    with _executor_lock:
        old_executor = _executor
        _executor = concurrent.futures.ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="jd-scrape-browser"
        )
    old_executor.shutdown(wait=False)


def run_on_browser_pool(fn, *args, **kwargs):
    """Runs fn(context, *args, **kwargs) on the dedicated pool thread, where
    `context` is the shared, persistent BrowserContext. fn gets a fresh Page
    from that context (`context.new_page()`) and must close it when done --
    the context and browser themselves are never closed here, only reused."""
    # ThreadPoolExecutor starts a Future's timeout while it is still queued.
    # With one worker, a second extraction therefore used to hit the 30s
    # ceiling and reset the shared pool even though its own task had never
    # started.  Admit only one caller and fail fast as a recovery-source miss;
    # the main pipeline can still use the extension's rendered DOM evidence.
    if not _pool_admission.acquire(timeout=1.0):
        raise BrowserPoolBusyError("JD recovery browser is busy")
    try:
        def _call():
            context = _get_context_on_pool_thread()
            return fn(context, *args, **kwargs)
        with _executor_lock:
            executor = _executor
        future = executor.submit(_call)
        try:
            return future.result(timeout=_POOL_CALL_TIMEOUT_SECONDS)
        except concurrent.futures.TimeoutError:
            future.cancel()
            _reset_pool_after_timeout()
            raise
    finally:
        _pool_admission.release()


def _shutdown_on_pool_thread():
    context = getattr(_thread_state, "context", None)
    browser = getattr(_thread_state, "browser", None)
    playwright = getattr(_thread_state, "playwright", None)
    if context is not None:
        try:
            context.close()
        except Exception:
            pass
        _thread_state.context = None
    if browser is not None:
        try:
            browser.close()
        except Exception:
            pass
        _thread_state.browser = None
    if playwright is not None:
        try:
            playwright.stop()
        except Exception:
            pass
        _thread_state.playwright = None


def shutdown_browser_pool():
    """Public entry point for app shutdown hooks (see main.py's lifespan)."""
    _executor.submit(_shutdown_on_pool_thread).result()
    _executor.shutdown(wait=False)
