from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime
from typing import Dict, Any, Optional

from core.security import verify_supabase_jwt
from core.database import get_db_connection
from repositories.job_preferences_repository import JobPreferencesRepository
from schemas.job_preferences import JobPreferencesPayload

router = APIRouter(prefix="/job-preferences", tags=["job-preferences"])


_LIST_FIELDS = [
    "target_roles", "target_companies", "preferred_locations", "priority_skills",
    "preferred_industries", "work_modes", "secondary_skills", "employment_types",
    "company_size_preferences", "seniority_preferences",
]
_TEXT_FIELDS = {
    "work_preference": "No Preference",
    "experience_level": "No Preference",
    "primary_role": "",
    "primary_company": "",
    "relocation_preference": "",
    "sponsorship_preference": "",
    "current_title": "",
    "years_experience": "",
    "current_compensation": "",
    "expected_compensation": "",
    "compensation_currency": "USD",
    "salary_period": "Annual",
    "min_compensation": "",
    "notice_period": "",
    "job_alert_frequency": "Weekly",
}


def _isoformat(value: Any) -> Optional[str]:
    """created_at/updated_at come back as datetime objects on a fresh DB read
    but as plain strings when served from the Redis JSON cache (job_preferences_repository.py
    get_by_user) -- handle both instead of assuming datetime."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def serialize_preferences(record: Dict[str, Any], user_id: str) -> Dict[str, Any]:
    record = record or {}
    result = {
        "id": str(record.get("id")) if record.get("id") else None,
        "user_id": str(record.get("user_id") or user_id),
        "is_salary_negotiable": record.get("is_salary_negotiable") if record.get("is_salary_negotiable") is not None else True,
        "has_completed_preferences": bool(
            record.get("target_roles")
            and record.get("target_companies")
            and record.get("preferred_locations")
        ),
        "created_at": _isoformat(record.get("created_at")),
        "updated_at": _isoformat(record.get("updated_at")),
    }
    for field in _LIST_FIELDS:
        result[field] = record.get(field) or []
    for field, default in _TEXT_FIELDS.items():
        result[field] = record.get(field) or default
    return result


@router.get("/me")
def get_my_job_preferences(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection)
):
    repo = JobPreferencesRepository(conn)
    record = repo.get_by_user(user["id"])
    return serialize_preferences(record, user["id"])


@router.put("/me")
def upsert_my_job_preferences(
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
