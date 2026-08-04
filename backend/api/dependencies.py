from contextlib import contextmanager
from fastapi import Depends
from core.database import get_db_connection
from repositories.profile_repository import ProfileRepository
from repositories.resume_repository import ResumeRepository
from repositories.job_repository import JobRepository
from repositories.tailoring_repository import TailoringRepository
from repositories.audit_repository import AuditRepository
from repositories.application_repository import ApplicationRepository
from repositories.ats_repository import ATSRepository
from services.ai.ai_service import AIService
from services.storage.file_service import FileService
from services.resume.tailoring_service import TailoringService
from core.security import verify_supabase_jwt

def get_user_db_connection(
    user = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    with conn.cursor() as cur:
        cur.execute("SET request.jwt.claim.sub = %s", (user["id"],))
    return conn

_db_context = contextmanager(get_db_connection)

@contextmanager
def user_scoped_db_context(user_id: str):
    """Short-lived, RLS-scoped connection for use OUTSIDE FastAPI's request-scoped
    Depends() DI graph. FastAPI caches Depends(get_db_connection) per-request, so
    any route that resolves repos via the Depends() chain above holds ONE pooled
    connection for the entire request -- fine for a quick read/write, but a real
    problem for a route that also does slow synchronous LLM/Playwright work in
    between (see docs/KNOWN_ISSUES.md ISSUE-005). Routes doing that should instead
    open one of these around just the DB read, run the slow work with no
    connection held at all, then open a fresh one around the DB write. Mirrors
    get_user_db_connection's RLS claim setup exactly."""
    with _db_context() as conn:
        with conn.cursor() as cur:
            cur.execute("SET request.jwt.claim.sub = %s", (user_id,))
        yield conn

def get_profile_repository(db = Depends(get_user_db_connection)) -> ProfileRepository:
    return ProfileRepository(db)

def get_resume_repository(db = Depends(get_user_db_connection)) -> ResumeRepository:
    return ResumeRepository(db)

def get_job_repository(db = Depends(get_user_db_connection)) -> JobRepository:
    return JobRepository(db)

def get_tailoring_repository(db = Depends(get_user_db_connection)) -> TailoringRepository:
    return TailoringRepository(db)

def get_audit_repository(db = Depends(get_user_db_connection)) -> AuditRepository:
    return AuditRepository(db)

def get_application_repository(db = Depends(get_user_db_connection)) -> ApplicationRepository:
    return ApplicationRepository(db)

def get_ats_repository(db = Depends(get_user_db_connection)) -> ATSRepository:
    return ATSRepository(db)


def get_ai_service() -> AIService:
    return AIService()

def get_storage_service() -> FileService:
    from core.supabase_client import get_supabase_client
    supabase_client = get_supabase_client()
    if supabase_client is not None:
        from services.storage.supabase_storage import SupabaseStorageService
        return SupabaseStorageService(supabase_client)

    # Only reached when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY aren't
    # configured (e.g. local dev without cloud credentials). Files saved
    # here live on local disk and will NOT survive a redeploy/restart on an
    # ephemeral host — this must not be what production is running on.
    from core.config import BASE_DIR
    from services.storage.local_storage import LocalStorageService
    return LocalStorageService(str(BASE_DIR / "local_uploads"))

def get_tailoring_service(
    tailor_repo: TailoringRepository = Depends(get_tailoring_repository),
    resume_repo: ResumeRepository = Depends(get_resume_repository),
    job_repo: JobRepository = Depends(get_job_repository),
    profile_repo: ProfileRepository = Depends(get_profile_repository),
    audit_repo: AuditRepository = Depends(get_audit_repository),
    ai_service: AIService = Depends(get_ai_service)
) -> TailoringService:
    return TailoringService(
        tailor_repo=tailor_repo,
        resume_repo=resume_repo,
        job_repo=job_repo,
        profile_repo=profile_repo,
        audit_repo=audit_repo,
        ai_service=ai_service
    )

def build_tailoring_service(conn) -> TailoringService:
    """Construct a TailoringService bound to a caller-supplied connection,
    for routes that manage connection lifetime manually via
    user_scoped_db_context() instead of FastAPI's Depends() graph."""
    return TailoringService(
        tailor_repo=TailoringRepository(conn),
        resume_repo=ResumeRepository(conn),
        job_repo=JobRepository(conn),
        profile_repo=ProfileRepository(conn),
        audit_repo=AuditRepository(conn),
        ai_service=AIService()
    )
