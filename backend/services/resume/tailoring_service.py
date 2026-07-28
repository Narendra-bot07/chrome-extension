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
from schemas.jobs import JobAnalysis

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
        
        job_payload = job.get("normalized_content") or job.get("parsed_content")
        if not isinstance(job_payload, dict):
            raise ValueError(
                "The extracted JD JSON is unavailable; tailoring cannot run "
                "without changing the JD extraction pipeline."
            )
        job_obj = JobAnalysis(**job_payload)
        tailoring_report = self.ai_service.generate_tailoring_patch(resume_obj, job_obj)
        from services.resume.merge_engine import FinalResumeMergeEngine
        user_options = patch if isinstance(patch, dict) else {}
        selected_sections = set(user_options.get("selected_sections") or [])
        if user_options.get("include_summary"):
            selected_sections.add("summary")
        merged_payload, merge_report = FinalResumeMergeEngine().merge(
            resume_obj,
            validated_patch=tailoring_report.patch,
            selected_sections=selected_sections,
            hidden_sections=set(user_options.get("hidden_sections") or []),
            generated_summary=user_options.get("generated_summary"),
            explicit_user_edits=user_options.get("explicit_user_edits") or {},
        )
        if not merge_report.valid:
            raise ValueError(
                "Resume merge preservation failed; tailoring stopped: "
                + " ".join(merge_report.violations)
            )
        tailored_resume_obj = ResumeStructure(**merged_payload)
        from services.resume.preservation import preserve_resume
        parsed_source = resume.get("parsed_content") or {}
        preservation = preserve_resume(
            resume_obj.model_dump(mode="json", exclude={"raw_text"}),
            tailored_resume_obj.model_dump(mode="json", exclude={"raw_text"}),
            candidate_evidence=[
                parsed_source.get("raw_text", "") if isinstance(parsed_source, dict) else ""
            ],
            auto_repair=True,
        )
        if not preservation.valid:
            blocking = [
                issue.message for issue in preservation.issues
                if issue.severity == "critical"
            ]
            raise ValueError(
                "Resume preservation validation failed; tailoring stopped: "
                + " ".join(blocking)
            )
        tailored_resume_obj = ResumeStructure(**preservation.lossless_resume)
        latency = int((time.time() - start_time) * 1000)

        ats_score = float(tailoring_report.ats_score_after)

        # Log AI Generation stats
        self.audit_repo.log_ai_generation(
            user_id=user_id,
            prompt_version="3.0.0-minimal-diff",
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

        tailored_record["preservation_report"] = {
            "valid": preservation.valid,
            "score": preservation.score,
            "confidence": preservation.confidence,
            "compared_elements": preservation.compared_elements,
            "counts": preservation.counts,
            "warnings": preservation.warnings,
            "repair_actions": [
                {
                    "action": action.action,
                    "element_id": action.element_id,
                    "path": action.path,
                    "reason": action.reason,
                    "responsible_agent": action.responsible_agent,
                    "timestamp": action.timestamp,
                    "applied": action.applied,
                }
                for action in preservation.repair_actions
            ],
        }
        tailored_record["tailoring_audit"] = getattr(
            tailoring_report, "tailoring_audit", {}
        )
        tailored_record["merge_preservation_report"] = {
            "status": merge_report.status,
            "preservation_score": merge_report.preservation_score,
            "violations": merge_report.violations,
            "missing_items": merge_report.missing_items,
            "merged_items": merge_report.merged_items,
            "changed_locked_fields": merge_report.changed_locked_fields,
            "missing_selected_sections": merge_report.missing_selected_sections,
        }
        return tailored_record
