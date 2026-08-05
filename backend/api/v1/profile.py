from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from core.security import verify_supabase_jwt
from repositories.profile_repository import ProfileRepository
from api.dependencies import get_profile_repository
from schemas.profile import ProfileResponse, ProfileUpdate
from services.profile_validation import validate_location

router = APIRouter(prefix="/profile", tags=["profile"])

@router.get("/", response_model=ProfileResponse)
def get_profile(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ProfileRepository = Depends(get_profile_repository)
):
    profile = repo.get_by_id(user["id"])
    if not profile:
        meta = user.get("metadata") or {}
        repo.create(user["id"], user.get("email", ""), meta.get("full_name", ""))
        profile = repo.get_by_id(user["id"])
        
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found."
        )
    return profile

@router.put("/update", response_model=ProfileResponse)
def update_profile(
    payload: ProfileUpdate,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ProfileRepository = Depends(get_profile_repository)
):
    updates = payload.model_dump(exclude_unset=True)
    current = repo.get_by_id(user["id"]) or {}
    merged = {**current, **updates}
    try:
        validate_location(merged.get("country"), merged.get("state"), merged.get("city"))
    except ValueError as exc:
        field = "city" if merged.get("city") else "state" if merged.get("state") else "country"
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"field": field, "message": str(exc)},
        )
    if updates.get("username") and not repo.username_available(updates["username"], user["id"]):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"field": "username", "message": "That username is already taken."},
        )
    if "uploaded_profile_image_url" in updates:
        uploaded = updates.get("uploaded_profile_image_url") or None
        updates["uploaded_profile_image_url"] = uploaded
        updates["avatar_url"] = uploaded
        updates["profile_image_source"] = "uploaded" if uploaded else None

    profile = repo.update(user["id"], updates)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found."
        )
    return profile
