from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any
from core.security import verify_supabase_jwt
from repositories.profile_repository import ProfileRepository
from api.dependencies import get_profile_repository
from schemas.profile import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])

@router.get("/", response_model=ProfileResponse)
async def get_profile(
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
async def update_profile(
    payload: ProfileUpdate,
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    repo: ProfileRepository = Depends(get_profile_repository)
):
    updates = {}
    if payload.full_name is not None:
        updates["full_name"] = payload.full_name
    if payload.avatar_url is not None:
        updates["avatar_url"] = payload.avatar_url

    profile = repo.update(user["id"], updates)
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found."
        )
    return profile
