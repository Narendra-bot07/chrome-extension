"""Admin console: user directory, role management, account status.

Reuses verify_admin_access from admin_abuse.py (role='admin' in the DB, or
the OWNER_EMAILS allowlist fallback) -- same gate as every other admin
router, so granting a user role='admin' here immediately gives them access
to all of it (observability, this, abuse tools), not just usage quotas."""
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor
from core.database import get_db_connection
from core.security import verify_supabase_jwt
from api.v1.admin_abuse import verify_admin_access
from services.subscriptions.usage_service import UsageService

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


@router.get("/stats")
def get_user_stats(
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
    conn=Depends(get_db_connection),
):
    """Return authoritative directory aggregates for the admin dashboard."""
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT
                COUNT(*)::int AS total_users,
                COUNT(*) FILTER (WHERE lower(coalesce(current_plan, 'free')) = 'free')::int AS free_users,
                COUNT(*) FILTER (WHERE lower(coalesce(current_plan, '')) = 'basic')::int AS basic_users,
                COUNT(*) FILTER (WHERE lower(coalesce(current_plan, '')) = 'pro')::int AS pro_users,
                COUNT(*) FILTER (WHERE lower(coalesce(current_plan, '')) = 'elite')::int AS elite_users,
                COUNT(*) FILTER (WHERE is_active IS TRUE)::int AS active_users,
                COUNT(*) FILTER (WHERE is_active IS FALSE)::int AS suspended_users,
                COUNT(*) FILTER (WHERE lower(coalesce(role, 'user')) = 'admin')::int AS admin_users,
                COUNT(*) FILTER (WHERE email_verified IS TRUE)::int AS verified_users,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS signups_7d,
                COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS signups_30d
            FROM public.users
            """
        )
        stats = cur.fetchone() or {}
    return stats


@router.get("")
def list_users(
    search: Optional[str] = None,
    role: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
    conn=Depends(get_db_connection),
):
    limit = min(max(limit, 1), 200)
    offset = max(offset, 0)
    clauses = []
    params: list = []
    if search:
        clauses.append("(email ILIKE %s OR full_name ILIKE %s)")
        like = f"%{search}%"
        params += [like, like]
    if role:
        clauses.append("role = %s")
        params.append(role)
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            f"""
            SELECT id, email, full_name, role, current_plan, subscription_status,
                   is_active, email_verified, provider, created_at, last_login,
                   COUNT(*) OVER() AS total_count
            FROM public.users
            {where_clause}
            ORDER BY created_at DESC
            LIMIT %s OFFSET %s
            """,
            params + [limit, offset],
        )
        users = cur.fetchall()

    total = int(users[0]["total_count"]) if users else 0
    for item in users:
        item.pop("total_count", None)

    return {"total": total, "limit": limit, "offset": offset, "users": users}


@router.get("/{user_id}")
def get_user_detail(
    user_id: str,
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
    conn=Depends(get_db_connection),
):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            """
            SELECT id, email, full_name, role, current_plan, subscription_status,
                   is_active, email_verified, provider, auth_provider,
                   has_password_credential, created_at, updated_at, last_login
            FROM public.users WHERE id = %s
            """,
            (user_id,),
        )
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

        cur.execute(
            """
            SELECT s.plan_id, p.name AS plan_name, s.status, s.current_period_start,
                   s.current_period_end, s.trial_end, s.cancel_at_period_end
            FROM public.subscriptions s
            JOIN public.plans p ON p.code = s.plan_id
            WHERE s.user_id = %s AND s.ended_at IS NULL
            ORDER BY s.created_at DESC LIMIT 1
            """,
            (user_id,),
        )
        subscription = cur.fetchone()

    usage = UsageService(conn).get_usage_summary(user_id)
    return {"user": user, "subscription": subscription, "usage": usage}


class RoleUpdateRequest(BaseModel):
    role: str  # "admin" or "user"


@router.patch("/{user_id}/role")
def update_user_role(
    user_id: str,
    payload: RoleUpdateRequest,
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
    current_user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection),
):
    if payload.role not in ("admin", "user"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role must be 'admin' or 'user'.")
    if user_id == current_user["id"] and payload.role == "user":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't remove your own admin access.")

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "UPDATE public.users SET role = %s, updated_at = NOW() WHERE id = %s RETURNING id, email, role",
            (payload.role, user_id),
        )
        updated = cur.fetchone()
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        conn.commit()
    return updated


class StatusUpdateRequest(BaseModel):
    is_active: bool


@router.patch("/{user_id}/status")
def update_user_status(
    user_id: str,
    payload: StatusUpdateRequest,
    admin_user: Dict[str, Any] = Depends(verify_admin_access),
    current_user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn=Depends(get_db_connection),
):
    if user_id == current_user["id"] and not payload.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You can't deactivate your own account.")

    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(
            "UPDATE public.users SET is_active = %s, updated_at = NOW() WHERE id = %s RETURNING id, email, is_active",
            (payload.is_active, user_id),
        )
        updated = cur.fetchone()
        if not updated:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
        conn.commit()
    return updated
