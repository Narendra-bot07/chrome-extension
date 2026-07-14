from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List
from psycopg2.extras import RealDictCursor
from core.database import get_db_connection
from core.security import verify_supabase_jwt

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/dashboard")
async def get_dashboard_metrics(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM public.user_dashboard_view WHERE user_id = %s", (user["id"],))
            row = cur.fetchone()
            return row if row else {}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch dashboard metrics: {str(e)}"
        )

@router.get("/activity")
async def get_recent_activity(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM public.recent_activity_view WHERE user_id = %s LIMIT 20", (user["id"],))
            return cur.fetchall() or []
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch recent activities: {str(e)}"
        )
