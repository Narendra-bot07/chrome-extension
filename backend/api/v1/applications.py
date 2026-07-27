from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from datetime import datetime, time, timedelta, timezone

from core.security import verify_supabase_jwt
from api.dependencies import get_application_repository
from repositories.application_repository import ApplicationRepository
from app.analytics.events.tracking.analytics_service import AnalyticsService
from core.database import get_db_connection
from services.notifications import NotificationService

def calculate_early_morning_reminder_time(event_date_val: str) -> datetime:
    """
    Calculates reminder time set to 1 day before the target event date at 05:00 AM UTC.
    If 5:00 AM 1 day before has already passed, defaults to 5 minutes from current time.
    """
    now = datetime.now(timezone.utc)
    if not event_date_val:
        return now + timedelta(minutes=5)
    try:
        clean_str = str(event_date_val).strip()
        if "T" in clean_str:
            parsed_dt = datetime.fromisoformat(clean_str.replace("Z", "+00:00"))
            target_date = parsed_dt.date()
        else:
            date_part = clean_str.split()[0]
            target_date = datetime.strptime(date_part, "%Y-%m-%d").date()

        reminder_date = target_date - timedelta(days=1)
        reminder_dt = datetime.combine(reminder_date, time(5, 0, 0), tzinfo=timezone.utc)

        if reminder_dt <= now:
            reminder_dt = now + timedelta(minutes=5)
        return reminder_dt
    except Exception:
        return now + timedelta(minutes=5)

router = APIRouter(prefix="/applications", tags=["applications"])

class ApplicationCreateRequest(BaseModel):
    company_name: str
    company_domain: Optional[str] = None
    job_title: str
    location: Optional[str] = None
    job_url: Optional[str] = None
    resume_version: Optional[str] = None
    cover_letter_version: Optional[str] = None
    ats_score: Optional[float] = None
    resume_match_score: Optional[float] = None
    current_stage: Optional[str] = "Ready To Apply"
    timeline: Optional[List[Dict[str, Any]]] = None

class ApplicationUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    company_domain: Optional[str] = None
    job_title: Optional[str] = None
    location: Optional[str] = None
    job_url: Optional[str] = None
    resume_version: Optional[str] = None
    cover_letter_version: Optional[str] = None
    ats_score: Optional[float] = None
    resume_match_score: Optional[float] = None
    current_stage: Optional[str] = None
    timeline: Optional[List[Dict[str, Any]]] = None
    notes: Optional[str] = None
    recruiter_notes: Optional[str] = None
    interview_notes: Optional[str] = None
    salary_expectations: Optional[str] = None
    reminder: Optional[Dict[str, Any]] = None
    contacts: Optional[List[Dict[str, Any]]] = None
    notes_list: Optional[List[Dict[str, Any]]] = None
    reminders: Optional[List[Dict[str, Any]]] = None
    history: Optional[List[Dict[str, Any]]] = None
    cover_letter_status: Optional[str] = None
    resume_status: Optional[str] = None
    next_action: Optional[str] = None
    next_action_due_at: Optional[str] = None
    last_activity_at: Optional[str] = None
    employment_type: Optional[str] = None
    seniority: Optional[str] = None
    key_skills: Optional[List[str]] = None

class EmailGenerateRequest(BaseModel):
    purpose: str = "Initial Recruiter Outreach"
    recruiter_name: Optional[str] = None
    recruiter_title: Optional[str] = None
    tone: Optional[str] = "Professional and enthusiastic"
    user_instructions: Optional[str] = None

@router.get("/")
async def list_applications(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository)
):
    try:
        return repo.list_by_user(user["id"])
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch applications: {str(e)}"
        )

@router.post("/")
async def create_application(
    request: ApplicationCreateRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository),
    conn = Depends(get_db_connection)
):
    try:
        # Default timelines if none supplied
        timeline = request.timeline
        if not timeline:
            timeline = [
                {"event": "Ready To Apply", "timestamp": "now"}
            ]
            
        record = repo.create(
            user_id=user["id"],
            company_name=request.company_name,
            company_domain=request.company_domain,
            job_title=request.job_title,
            location=request.location,
            job_url=request.job_url,
            resume_version=request.resume_version,
            cover_letter_version=request.cover_letter_version,
            ats_score=request.ats_score,
            resume_match_score=request.resume_match_score,
            current_stage=request.current_stage or "Ready To Apply",
            timeline=timeline
        )
        
        AnalyticsService(conn).emit_event(
            user_id=user["id"],
            event_type="APPLICATION_CREATED",
            resource_type="application",
            resource_id=record["id"],
            metadata={
                "company_name": request.company_name,
                "job_title": request.job_title,
                "current_stage": request.current_stage or "Ready To Apply"
            }
        )
        NotificationService(conn).emit(
            user["id"], "application.created",
            {"company": request.company_name, "application_id": str(record["id"])},
            "application", str(record["id"]), f"application_created:{record['id']}"
        )
        
        return record
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create application: {str(e)}"
        )

@router.put("/{id}")
async def update_application(
    id: str,
    request: ApplicationUpdateRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository),
    conn = Depends(get_db_connection)
):
    try:
        previous = repo.get_by_id(id, user["id"])
        # Filter request data to only fields that were set
        update_data = {k: v for k, v in request.dict().items() if v is not None}
        record = repo.update(id, user["id"], update_data)
        if not record:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application session not found."
            )
            
        if request.current_stage:
            event_type = "APPLICATION_MOVED"
            if request.current_stage == "Accepted":
                event_type = "OFFER_ACCEPTED"
            elif request.current_stage == "Rejected":
                event_type = "OFFER_REJECTED"
            elif request.current_stage == "Archived":
                event_type = "APPLICATION_ARCHIVED"
                
            AnalyticsService(conn).emit_event(
                user_id=user["id"],
                event_type=event_type,
                resource_type="application",
                resource_id=id,
                metadata={"new_stage": request.current_stage}
            )
            if previous and previous.get("current_stage") != request.current_stage:
                NotificationService(conn).emit(
                    user["id"], "application.stage_changed",
                    {"company": record.get("company_name") or "This application",
                     "application_id": id, "old_stage": previous.get("current_stage") or "Unknown",
                     "new_stage": request.current_stage},
                    "application", id, f"application_stage:{id}:{request.current_stage}"
                )

        # Preserve the entered next action on the application and schedule one
        # durable reminder for it. Re-editing the date updates the existing
        # stage-created reminder instead of leaving stale reminders behind.
        due_date_val = request.next_action_due_at or update_data.get("next_action_due_at")
        if due_date_val:
            reminder_time = calculate_early_morning_reminder_time(due_date_val)
            company = record.get("company_name") or "Application"
            job_title = record.get("job_title") or "Role"
            stage = request.current_stage or record.get("current_stage") or "Follow-up"
            note_str = request.next_action or request.notes or ""
            reminder_type = (
                "interview_event"
                if stage in ("Interview", "Final Round", "Assessment")
                else "application_followup"
            )

            title = f"Reminder: {stage} for {company}"
            description = f"1-day reminder (5:00 AM): You have an event/follow-up scheduled tomorrow ({due_date_val}) for {job_title} at {company}. {note_str}".strip()

            try:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE reminders
                           SET reminder_type=%s, title=%s, description=%s,
                               due_at=%s, status='scheduled', snoozed_until=NULL,
                               completed_at=NULL, updated_at=now()
                         WHERE id = (
                            SELECT id FROM reminders
                             WHERE user_id=%s AND application_id=%s
                               AND created_by='stage_change'
                               AND status IN ('scheduled','due','snoozed','overdue')
                             ORDER BY created_at DESC
                             LIMIT 1
                         )
                    """, (
                        reminder_type,
                        title,
                        description,
                        reminder_time,
                        user["id"],
                        id
                    ))
                    if cur.rowcount == 0:
                        cur.execute("""
                            INSERT INTO reminders
                                (user_id, application_id, reminder_type, title,
                                 description, due_at, status, created_by)
                            VALUES (%s, %s, %s, %s, %s, %s, 'scheduled', 'stage_change')
                        """, (
                            user["id"], id, reminder_type, title,
                            description, reminder_time
                        ))
                    conn.commit()
            except Exception as e:
                conn.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Application was saved, but its reminder could not be scheduled: {str(e)}"
                )

        return record
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update application: {str(e)}"
        )

@router.delete("/{id}")
async def delete_application(
    id: str,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository)
):
    try:
        success = repo.delete(id, user["id"])
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Application session not found."
            )
        return {"status": "success", "message": "Application deleted successfully."}
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete application: {str(e)}"
        )

@router.post("/{id}/generate-email")
async def generate_application_email(
    id: str,
    request: EmailGenerateRequest,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ApplicationRepository = Depends(get_application_repository)
):
    try:
        app = repo.get_by_id(id, user["id"])
        if not app:
            raise HTTPException(status_code=404, detail="Application session not found.")
        
        role = app.get("job_title") or "Target Role"
        company = app.get("company_name") or "Target Company"
        recruiter = request.recruiter_name or "Hiring Manager"

        purpose = request.purpose or "Initial Recruiter Outreach"

        if "Outreach" in purpose:
            subject = f"Inquiry regarding {role} position at {company}"
            body = (
                f"Dear {recruiter},\n\n"
                f"I hope this email finds you well. I recently applied for the {role} position at {company} and wanted to express my enthusiasm for the opportunity.\n\n"
                f"With my background in building scalable software systems and delivering measurable results, I am confident I can make a strong contribution to your team.\n\n"
                f"I would welcome the opportunity to discuss how my qualifications align with {company}'s current priorities.\n\n"
                f"Thank you for your time and consideration.\n\n"
                f"Best regards,"
            )
        elif "Follow-up" in purpose:
            subject = f"Follow-up on Application: {role} - {company}"
            body = (
                f"Dear {recruiter},\n\n"
                f"I hope you are having a productive week. I am following up on my application for the {role} role at {company}.\n\n"
                f"I remain very interested in the position and would appreciate any updates regarding the next steps in your recruitment process.\n\n"
                f"Thank you again for your time and assistance.\n\n"
                f"Best regards,"
            )
        elif "Thank" in purpose:
            subject = f"Thank you - {role} Interview"
            body = (
                f"Dear {recruiter},\n\n"
                f"Thank you for taking the time to speak with me today regarding the {role} position at {company}.\n\n"
                f"Our conversation reinforced my excitement about joining your team. Please let me know if you need any additional information from my side.\n\n"
                f"Best regards,"
            )
        elif "Confirmation" in purpose:
            subject = f"Interview Confirmation: {role} at {company}"
            body = (
                f"Dear {recruiter},\n\n"
                f"Thank you for scheduling our upcoming interview for the {role} position at {company}.\n\n"
                f"I am writing to confirm my availability. I look forward to speaking with you.\n\n"
                f"Best regards,"
            )
        elif "Offer" in purpose:
            subject = f"Offer Clarification: {role} Position - {company}"
            body = (
                f"Dear {recruiter},\n\n"
                f"Thank you very much for extending the offer for the {role} position at {company}! I am thrilled about the opportunity.\n\n"
                f"Before finalizing, I would appreciate a brief conversation to clarify a few details regarding the start date and onboarding schedule.\n\n"
                f"Thank you again for this offer!\n\n"
                f"Best regards,"
            )
        else:
            subject = f"Regarding {role} Application - {company}"
            body = (
                f"Dear {recruiter},\n\n"
                f"I hope you are doing well. I am reaching out regarding the {role} role at {company}.\n\n"
                f"Please let me know if there are any updates or if you need further details regarding my background.\n\n"
                f"Best regards,"
            )

        return {
            "status": "success",
            "subject": subject,
            "body": body,
            "purpose": purpose,
            "recruiter_name": recruiter
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate email: {str(e)}"
        )
