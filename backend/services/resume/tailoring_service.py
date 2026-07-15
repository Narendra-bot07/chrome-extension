from typing import List, Dict, Any, Optional
import time
from repositories.tailoring_repository import TailoringRepository
from repositories.resume_repository import ResumeRepository
from repositories.job_repository import JobRepository
from repositories.profile_repository import ProfileRepository
from repositories.audit_repository import AuditRepository
from services.ai.llm_service import LLMService
from core.exceptions import CreditsExhaustedError, RecordNotFoundError
from schemas.resume import ResumeStructure

class TailoringService:
    def __init__(
        self,
        tailor_repo: TailoringRepository,
        resume_repo: ResumeRepository,
        job_repo: JobRepository,
        profile_repo: ProfileRepository,
        audit_repo: AuditRepository,
        ai_service: LLMService
    ):
        self.tailor_repo = tailor_repo
        self.resume_repo = resume_repo
        self.job_repo = job_repo
        self.profile_repo = profile_repo
        self.audit_repo = audit_repo
        self.ai_service = ai_service

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
            raise CreditsExhaustedError()

        # Retrieve entities
        resume = self.resume_repo.get_by_id(resume_id, user_id)
        job = self.job_repo.get_by_id(job_id, user_id)
        if not resume or not job:
            raise RecordNotFoundError("Resume or Job description record not found.")

        # Map to Pydantic objects
        resume_obj = ResumeStructure(**resume["parsed_content"])

        # AI Tailoring Process
        start_time = time.time()
        
        from app.services.agents import orchestrate_multi_agent_flow
        agent_res = orchestrate_multi_agent_flow(
            original_resume=resume_obj,
            jd_text=job["raw_text"]
        )
        tailored_resume_obj = ResumeStructure(**agent_res["tailored_content"])
        latency = int((time.time() - start_time) * 1000)

        # Retrieve ATS score from agent feedback evaluations
        ats_score = float(agent_res["ats_score"])

        # Log AI Generation stats
        self.audit_repo.log_ai_generation(
            user_id=user_id,
            prompt_version="2.0.0",
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
