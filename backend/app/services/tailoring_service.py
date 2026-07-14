from typing import List, Dict, Any, Optional
import time
from app.repositories.tailor_repo import TailorRepository
from app.repositories.resume_repo import ResumeRepository
from app.repositories.job_repo import JobRepository
from app.repositories.profile_repo import ProfileRepository
from app.repositories.audit_repo import AuditRepository
from app.services.ai_service import AIService
from app.services.pdf_service import PDFService
from app.services.storage_service import StorageService
from app.schemas import ResumeStructure

class TailoringService:
    def __init__(
        self,
        tailor_repo: TailorRepository,
        resume_repo: ResumeRepository,
        job_repo: JobRepository,
        profile_repo: ProfileRepository,
        audit_repo: AuditRepository,
        ai_service: AIService,
        pdf_service: PDFService,
        storage_service: StorageService
    ):
        self.tailor_repo = tailor_repo
        self.resume_repo = resume_repo
        self.job_repo = job_repo
        self.profile_repo = profile_repo
        self.audit_repo = audit_repo
        self.ai_service = ai_service
        self.pdf_service = pdf_service
        self.storage_service = storage_service

    def execute_tailoring_flow(
        self,
        user_id: str,
        resume_id: str,
        job_id: str,
        patch: Any
    ) -> Dict[str, Any]:
        # Validate credits
        credits = self.profile_repo.get_credits(user_id)
        if credits <= 0:
            raise ValueError("Insufficient credits remaining to execute tailoring operation.")

        # Retrieve entities
        resume = self.resume_repo.get_by_id(resume_id, user_id)
        job = self.job_repo.get_by_id(job_id, user_id)
        if not resume or not job:
            raise ValueError("Resume or Job description record not found.")

        # Map to Pydantic objects
        resume_obj = ResumeStructure(**resume["parsed_content"])

        # AI Tailoring Process
        start_time = time.time()
        from app.groq_service import apply_tailoring_patch
        tailored_resume_obj = apply_tailoring_patch(
            resume=resume_obj,
            patch=patch
        )
        latency = int((time.time() - start_time) * 1000)

        # Estimate ATS score improvement (mock scoring logic)
        ats_score = 85.0

        # Log AI Generation stats
        self.audit_repo.log_ai_generation(
            user_id=user_id,
            prompt_version="1.0.0",
            model="llama-3.3-70b-versatile",
            latency_ms=latency,
            input_tokens=1200,
            output_tokens=1500,
            cost=0.002,
            status="completed"
        )

        # Save to DB & Auto-Version
        tailored_record = self.tailor_repo.create_tailored(
            user_id=user_id,
            original_resume_id=resume_id,
            job_description_id=job_id,
            tailored_content=tailored_resume_obj.dict(),
            ats_score=ats_score
        )

        # Deduct user credits
        self.profile_repo.deduct_credits(user_id, 1)

        # Log usage activity
        self.audit_repo.log_activity(user_id, "tailor", {"tailored_resume_id": tailored_record["id"]})

        return tailored_record
