# Tailr4U - Backend Architecture & Engine Specification

This document provides a comprehensive technical breakdown of the **Tailr4U Backend Engine (`v3.0.0`)**, its 4-Layer Clean Architecture, database connection pool management, resilient multi-model AI pipeline, Playwright PDF rendering engine, and middleware stack.

---

## 1. Backend Architecture & Design Philosophy

The Tailr4U backend is an enterprise-grade, asynchronous REST API engine built with **Python 3.12** and **FastAPI**. It enforces a strict **4-Layer Clean Architecture** pattern to guarantee total separation of concerns, high testability, and decoupled maintainability.

```mermaid
graph TD
    subgraph Client Layer
        CLIENT["Web Dashboard / Chrome Extension"]
    end

    subgraph Layer 1: API Router Layer (api/v1/)
        ROUTERS["HTTP Controllers & Request Validation<br/>(auth.py, resume.py, tailoring.py, etc.)"]
        DEPENDENCIES["Dependency Injection<br/>(get_current_user, get_db_connection)"]
    end

    subgraph Layer 2: Business Service Layer (services/ & app/)
        SERVICES["Business Logic & Workflow Services<br/>(TailoringService, JobService)"]
        AI_WRAPPER["ResilientLLMWrapper<br/>(Groq Llama-3.3-70b ↔ Gemini 2.0 Failover)"]
        PLAYWRIGHT_ENGINE["Playwright PDF Rendering Engine<br/>(Headless Chromium Vector PDF Pipeline)"]
    end

    subgraph Layer 3: Repository Access Layer (repositories/)
        REPOS["Abstracted Data Repositories<br/>(ProfileRepo, ResumeRepo, ApplicationRepo)"]
    end

    subgraph Layer 4: System Engine Core (core/)
        DB_POOL["ThreadedConnectionPool Singleton<br/>(minconn=10, maxconn=50)"]
        MIDDLEWARE["RequestLoggingMiddleware<br/>& Global Exception Handlers"]
        OBSERVABILITY["LangSmith Tracing & Sentry Engine"]
    end

    %% Flow
    CLIENT -->|"HTTP REST + Bearer JWT"| ROUTERS
    ROUTERS --> DEPENDENCIES
    DEPENDENCIES --> SERVICES
    SERVICES --> AI_WRAPPER
    SERVICES --> PLAYWRIGHT_ENGINE
    SERVICES --> REPOS
    REPOS --> DB_POOL
    ROUTERS --> MIDDLEWARE
    SERVICES --> OBSERVABILITY
```

---

## 2. Directory Structure Breakdown

```
backend/
├── api/                                 # Layer 1: HTTP Controllers & Route Gateways
│   ├── dependencies.py                  # JWT Auth & DB connection injection providers
│   ├── router.py                        # Master APIRouter registry aggregating all v1 sub-routers
│   └── v1/                              # Versioned Endpoint Routers
│       ├── admin_abuse.py               # Anti-abuse & rate limit audit routes
│       ├── admin_subscriptions.py       # Plan management & user tier overrides
│       ├── analytics.py                 # Usage dashboard & ATS analytics endpoints
│       ├── applications.py              # Application tracker CRUD endpoints
│       ├── auth.py                      # Login, Signup, Session Refresh & Profile routes
│       ├── health.py                    # Root /live, /ready, /health liveness probes
│       ├── job_preferences.py           # User target position & salary preferences
│       ├── jobs.py                      # Job Description parsing & extraction engine
│       ├── notifications.py             # User notification & interview reminder queues
│       ├── profile.py                   # Profile update & avatar upload endpoints
│       ├── resume.py                    # Master resume upload, parsing & listing
│       ├── support.py                   # Helpdesk ticket submission & resolution
│       ├── tailoring.py                 # AI Resume tailoring & Cover Letter generation
│       ├── usage.py                     # Monthly quota check & API usage counters
│       └── workflows.py                 # Multi-step resume tailoring orchestration
├── app/                                 # Business Logic Engines & Provider Adapters
│   ├── ai_service.py                    # Primary AI orchestration & DeepSeekProvider
│   ├── llm/                             # Provider-neutral LLM client abstractions (deepseek_provider.py)
│   ├── playwright_pdf.py                # Headless Chromium PDF compilation pipeline
│   ├── schemas.py                       # Pydantic v2 data models & structured schemas
│   └── template_engine.py               # Jinja2 / React static template interpolator
├── core/                                # Layer 4: System Engine Core & Config
│   ├── config.py                        # Pydantic BaseSettings loading system env vars
│   ├── database.py                      # ThreadedConnectionPool management & checkout
│   ├── exceptions.py                    # BaseAppException & global exception handlers
│   ├── logging.py                       # Structured logger configuration
│   ├── middleware.py                    # RequestLoggingMiddleware with duration timing
│   └── observability.py                 # LangSmith prompt tracing setup & status
├── repositories/                        # Layer 3: Abstracted PostgreSQL Repositories
├── services/                            # Layer 2: Business Logic Services
├── templates/                           # Render templates for HTML-to-PDF compilation
├── main.py                              # Application entry point, CORS & lifespan setup
└── requirements.txt                     # Backend dependencies
```

---

## 3. Database Connection Pool Architecture (`core/database.py`)

To prevent database connection overhead and eliminate connection pool exhaustion under high concurrency, Tailr4U implements a global thread-safe `ThreadedConnectionPool` singleton.

### 3.1 Pool Characteristics
- **Pool Size**: `minconn = 10`, `maxconn = 50` persistent connections.
- **Thread Safety**: Initialized inside a thread lock (`_pool_lock = threading.Lock()`).
- **Pre-Warming**: Pre-warms connections during application startup in `main.py` lifespan context manager.

### 3.2 Connection Checkout & Automatic Retry Provider

```python
def get_db_connection():
    pool = get_db_pool()
    conn = None
    start_time = time.time()
    
    # Retry checkout for up to 5.0 seconds if pool is temporarily saturated
    while conn is None:
        try:
            conn = pool.getconn()
        except psycopg2.pool.PoolError:
            if time.time() - start_time > 5.0:
                raise
            time.sleep(0.05)

    try:
        # Check connection health; replace if closed
        if conn.closed != 0:
            pool.putconn(conn, close=True)
            conn = pool.getconn()
        yield conn
    except Exception:
        if conn and conn.closed == 0:
            conn.rollback()
        raise
    finally:
        if conn and conn.closed == 0:
            pool.putconn(conn)
```

---

## 4. Resilient AI Engine & DeepSeek Integration (`app/ai_service.py`)

Tailr4U features a provider-neutral AI engine encapsulated in `DeepSeekProvider` and `ResilientLLMWrapper` (`app/ai_service.py`).

```mermaid
sequenceDiagram
    autonumber
    actor Service as TailoringService
    participant Provider as DeepSeekProvider (app/ai_service.py)
    participant Lock as Single AI Request Lock
    participant Cache as Redis Prompt Cache
    participant Flash as DeepSeek Flash (deepseek-v4-flash)
    participant Pro as DeepSeek Pro (deepseek-v4-pro)

    Service->>Provider: invoke_structured(prompt, schema_cls)
    Provider->>Cache: Check SHA-256 Hash
    alt Cache Hit
        Cache-->>Provider: Return Cached Response JSON
    else Cache Miss
        Provider->>Lock: Acquire Request Lock (Min 1.5s Spacing)
        
        alt 1. Primary Invocations
            Provider->>Flash: Invoke DeepSeek Flash API (response_format={"type": "json_object"})
            Flash-->>Provider: Success Response
        else 2. Escalation on Schema Validation Failure
            Flash--xProvider: Validation Failure / Retries Exceeded
            Provider->>Pro: Escalate to DeepSeek Pro (deepseek-v4-pro)
            Pro-->>Provider: Success Response
        end
        
        Provider->>Cache: Store Result in Redis (TTL: 24 Hours)
        Provider->>Lock: Release Request Lock
    end
    Provider-->>Service: Structured Pydantic Output
```

### 4.1 Anti-Rate-Limit & Concurrency Protection
- **Request Lock**: `_SINGLE_AI_REQUEST_LOCK = threading.Lock()` guarantees that concurrent background requests are queued with a minimum spacing of `1.5` seconds.
- **Content Hashing**: Prompt keys are hashed using `SHA-256` (`prefix:sha256(content)`) and cached in Redis with a 24-hour TTL.

---

## 5. Playwright Chromium Vector PDF Engine (`app/playwright_pdf.py`)

Rather than relying on client-side canvas renderers, Tailr4U runs a headless Chromium browser instance on the backend to render pixel-perfect, ATS-scannable PDFs.

### 5.1 Compilation Workflow
1. The backend mounts the frontend static build assets at `/__pdf_renderer`.
2. `playwright_pdf.py` boots a headless Chromium browser context:
   ```python
   browser = await playwright.chromium.launch(headless=True)
   page = await browser.new_page(viewport={"width": 1200, "height": 1600})
   ```
3. Injects tailored JSON data into the DOM page.
4. Generates a letter-sized vector PDF buffer using print media controls (`@media print`):
   ```python
   pdf_bytes = await page.pdf(
       format="Letter",
       print_background=True,
       margin={"top": "0in", "bottom": "0in", "left": "0in", "right": "0in"}
   )
   ```
5. Saves PDF artifact to Supabase Storage bucket (`generated-resumes`) and returns the public download URL.

---

## 6. Middleware Stack & Error Architecture

### 6.1 Request Logging Middleware (`core/middleware.py`)
- Intercepts all incoming requests and measures execution duration (in milliseconds).
- Logs client IP, HTTP Method, Path, Query string, and Status Code.
- Automatically masks sensitive HTTP `Authorization` headers (`Bearer ***`).

### 6.2 Standard Error Response Payload
All unhandled or application exceptions are formatted into uniform JSON structures:

```json
{
  "status": "error",
  "detail": "Descriptive error message",
  "error_code": "RESOURCE_NOT_FOUND",
  "timestamp": "2026-08-01T22:45:00Z"
}
```

---

## 7. Authentication & Dependency Injection (`api/dependencies.py`)

Every protected endpoint uses FastAPI's `Depends()` mechanism:

```python
async def get_current_user(authorization: str = Header(...)) -> Dict[str, Any]:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token header format.")
    token = authorization.split(" ")[1]
    
    # Verify JWT signature against Supabase JWT Secret / Public Key
    payload = decode_supabase_jwt(token)
    return payload
```

---

## 8. Backend Coding Standards

1. **Explicit Type Annotations**: All function signatures must include parameter and return types.
2. **Pydantic Validation**: Use Pydantic v2 schemas for all incoming HTTP bodies and outgoing HTTP responses.
3. **No Direct SQL in Routers**: HTTP controllers must delegate database operations to Repositories.
4. **Resilient Exception Handling**: Avoid bare `except:` blocks; always catch specific exceptions and log stack traces.
