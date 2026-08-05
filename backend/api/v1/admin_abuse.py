from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from core.database import get_db_connection
from core.security import verify_supabase_jwt
from psycopg2.extras import RealDictCursor

router = APIRouter(prefix="/admin/abuse", tags=["admin-abuse"])

class UnblockDeviceRequest(BaseModel):
    device_hash: str

class GrantTrialOverrideRequest(BaseModel):
    user_id: str
    reason: Optional[str] = "Admin false-positive resolution override"

# verify_supabase_jwt never populates role/app_metadata.role/is_superadmin
# (it only decodes the session JWT -- see core/security.py -- which doesn't
# carry those claims), so the checks below always fell through to the
# @tailr4u.com domain check. The actual product owner's account uses a
# personal Gmail address, so that check alone locked them out of every
# admin-gated endpoint using this dependency. Listed explicitly until a
# real role-based system exists.
OWNER_EMAILS = {"bandinarendra3333@gmail.com"}

def verify_admin_access(user: Dict[str, Any] = Depends(verify_supabase_jwt)):
    # Verify user has admin role or internal admin permissions
    role = user.get("role") or user.get("app_metadata", {}).get("role")
    email = user.get("email", "")
    if (
        role != "admin"
        and not email.endswith("@tailr4u.com")
        and email not in OWNER_EMAILS
        and user.get("is_superadmin") != True
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for device abuse operations."
        )
    return user

@router.get("/registrations")
async def list_abuse_registrations(
    blocked_only: bool = False,
    high_risk_only: bool = False,
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
    conn = Depends(get_db_connection)
):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        clauses = []
        if blocked_only:
            clauses.append("blocked_at IS NOT NULL")
        if high_risk_only:
            clauses.append("risk_score >= 50")
        
        where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        cur.execute(
            f"""SELECT id, device_hash, user_id, first_seen_at, last_seen_at,
                       signup_ip_hash, user_agent_hash, trial_claimed_at,
                       risk_score, blocked_at, block_reason, created_at
                FROM public.device_registrations
                {where_clause}
                ORDER BY created_at DESC
                LIMIT 100"""
        )
        rows = cur.fetchall()
        return {"status": "success", "registrations": rows}

@router.post("/unblock-device")
async def unblock_device(
    payload: UnblockDeviceRequest,
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
    conn = Depends(get_db_connection)
):
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE public.device_registrations
               SET blocked_at = NULL, block_reason = NULL, risk_score = 0
               WHERE device_hash = %s""",
            (payload.device_hash,)
        )
        updated = cur.rowcount
        conn.commit()
    return {
        "status": "success",
        "message": f"Device hash {payload.device_hash} unblocked successfully ({updated} records updated)."
    }

@router.post("/grant-trial-override")
async def grant_trial_override(
    payload: GrantTrialOverrideRequest,
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
    conn = Depends(get_db_connection)
):
    with conn.cursor() as cur:
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc)
        cur.execute(
            """UPDATE public.device_registrations
               SET trial_claimed_at = %s
               WHERE user_id = %s""",
            (now, payload.user_id)
        )
        cur.execute(
            """UPDATE public.profiles
               SET subscription_plan = 'trial', trial_ends_at = NOW() + INTERVAL '14 days'
               WHERE id = %s""",
            (payload.user_id,)
        )
        conn.commit()
    return {
        "status": "success",
        "message": f"Trial override granted to user {payload.user_id}."
    }
