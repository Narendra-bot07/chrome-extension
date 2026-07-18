from typing import Dict, Any
from fastapi import APIRouter, Depends
from core.database import get_db_connection
from core.security import verify_supabase_jwt
from services.subscriptions.usage_service import UsageService

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/me")
async def get_my_usage(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    return {"usage": UsageService(conn).get_usage_summary(user["id"])}


@router.get("/me/jd-extraction")
async def get_my_jd_usage(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    return UsageService(conn).get_current_usage(user["id"], "jd_extraction")
