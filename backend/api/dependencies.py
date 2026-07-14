from fastapi import Depends
from core.database import get_db_connection
from repositories.profile_repository import ProfileRepository
from repositories.resume_repository import ResumeRepository
from repositories.job_repository import JobRepository
from repositories.tailoring_repository import TailoringRepository
from repositories.audit_repository import AuditRepository
from services.ai.groq_service import GroqService
from services.storage.file_service import FileService
from services.resume.tailoring_service import TailoringService

# Re-declare to use direct postgres connection instead of Supabase client

from core.security import verify_supabase_jwt

def get_user_db_connection(
    user = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    with conn.cursor() as cur:
        cur.execute("SET request.jwt.claim.sub = %s", (user["id"],))
    return conn

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

def get_ai_service() -> GroqService:
    return GroqService()

def get_storage_service() -> FileService:
    from services.storage.local_storage import LocalStorageService
    return LocalStorageService("local_uploads")

def get_tailoring_service(
    tailor_repo: TailoringRepository = Depends(get_tailoring_repository),
    resume_repo: ResumeRepository = Depends(get_resume_repository),
    job_repo: JobRepository = Depends(get_job_repository),
    profile_repo: ProfileRepository = Depends(get_profile_repository),
    audit_repo: AuditRepository = Depends(get_audit_repository),
    ai_service: GroqService = Depends(get_ai_service)
) -> TailoringService:
    return TailoringService(
        tailor_repo=tailor_repo,
        resume_repo=resume_repo,
        job_repo=job_repo,
        profile_repo=profile_repo,
        audit_repo=audit_repo,
        ai_service=ai_service
    )
