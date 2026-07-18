from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any

from core.security import verify_supabase_jwt
from core.database import get_db_connection
from repositories.job_preferences_repository import JobPreferencesRepository
from schemas.job_preferences import JobPreferencesPayload

router = APIRouter(prefix="/job-preferences", tags=["job-preferences"])


def serialize_preferences(record: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    if not record:
        return {
            "id": None,
            "user_id": user_id,
            "target_roles": [],
            "target_companies": [],
            "preferred_locations": [],
            "work_preference": "No Preference",
            "experience_level": "No Preference",
            "priority_skills": [],
            "has_completed_preferences": False,
            "created_at": None,
            "updated_at": None,
        }

    return {
        "id": str(record.get("id")) if record.get("id") else None,
        "user_id": str(record.get("user_id") or user_id),
        "target_roles": record.get("target_roles") or [],
        "target_companies": record.get("target_companies") or [],
        "preferred_locations": record.get("preferred_locations") or [],
        "work_preference": record.get("work_preference") or "No Preference",
        "experience_level": record.get("experience_level") or "No Preference",
        "priority_skills": record.get("priority_skills") or [],
        "has_completed_preferences": bool(
            record.get("target_roles")
            and record.get("target_companies")
            and record.get("preferred_locations")
        ),
        "created_at": record.get("created_at").isoformat() if record.get("created_at") else None,
        "updated_at": record.get("updated_at").isoformat() if record.get("updated_at") else None,
    }


@router.get("/me")
async def get_my_job_preferences(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection)
):
    repo = JobPreferencesRepository(conn)
    record = repo.get_by_user(user["id"])
    return serialize_preferences(record, user["id"])


@router.put("/me")
async def upsert_my_job_preferences(
    payload: JobPreferencesPayload,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection)
):
    if not payload.target_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one target role is required.")
    if not payload.target_companies:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one target company is required.")
    if not payload.preferred_locations:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one preferred location is required.")

    repo = JobPreferencesRepository(conn)
    record = repo.upsert(user["id"], payload.dict())
    return serialize_preferences(record, user["id"])
