from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor, Json
from core.database import get_db_connection
from core.security import verify_supabase_jwt
from services.subscriptions.plan_service import PlanService
from services.subscriptions.subscription_service import SubscriptionService
from services.subscriptions.usage_service import UsageService

router = APIRouter(prefix="/admin", tags=["admin-subscriptions"])


class PlanCreateRequest(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    monthly_jd_limit: Optional[int] = None
    resume_limit: Optional[int] = None
    price_amount: float = 0.00
    currency: str = "USD"
    price_display: Optional[str] = None
    billing_interval: str = "month"
    is_active: bool = True
    is_default: bool = False
    sort_order: int = 0


class PlanUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    monthly_jd_limit: Optional[int] = None
    resume_limit: Optional[int] = None
    price_amount: Optional[float] = None
    currency: Optional[str] = None
    price_display: Optional[str] = None
    billing_interval: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None


class ChangePlanRequest(BaseModel):
    plan_code: Optional[str] = None
    plan_id: Optional[str] = None
    immediate: bool = True
    reason: str = "admin_change"


class TrialRequest(BaseModel):
    plan_code: str = "pro"
    days: int = 14


class CancelRequest(BaseModel):
    at_period_end: bool = True


class GrantUsageRequest(BaseModel):
    feature_key: str = "jd_extraction"
    quantity: int
    reason: str = "admin_grant"


def require_admin(user: Dict[str, Any], conn):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT role FROM public.users WHERE id = %s", (user["id"],))
        row = cur.fetchone()
    if not row or row.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "ADMIN_REQUIRED", "message": "Admin access required."})


def audit(conn, admin_user_id, target_user_id, action, metadata):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, metadata_json)
            VALUES (%s, %s, %s, %s)
        """, (admin_user_id, target_user_id, action, Json(metadata or {})))


def get_plan_id(conn, plan_id=None, plan_code=None):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        if plan_id:
            cur.execute("SELECT id FROM public.plans WHERE id = %s", (plan_id,))
        else:
            cur.execute("SELECT id FROM public.plans WHERE code = %s", (plan_code,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail={"code": "PLAN_NOT_FOUND", "message": "Plan not found."})
    return row["id"]


@router.get("/plans")
async def admin_list_plans(user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    return {"plans": PlanService(conn).list_all_plans()}


@router.post("/plans")
async def admin_create_plan(payload: PlanCreateRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    plan = PlanService(conn).create_plan(payload.dict())
    audit(conn, user["id"], None, "plan_create", {"plan_id": str(plan["id"]), "code": plan["code"]})
    conn.commit()
    return plan


@router.patch("/plans/{plan_id}")
async def admin_update_plan(plan_id: str, payload: PlanUpdateRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    plan = PlanService(conn).update_plan(plan_id, payload.dict(exclude_unset=True))
    if not plan:
        raise HTTPException(status_code=404, detail={"code": "PLAN_NOT_FOUND", "message": "Plan not found or no changes supplied."})
    audit(conn, user["id"], None, "plan_update", {"plan_id": plan_id})
    conn.commit()
    return plan


@router.get("/subscriptions")
async def admin_list_subscriptions(user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT s.*, u.email, p.code AS plan_code, p.name AS plan_name
            FROM public.subscriptions s
            JOIN public.users u ON u.id = s.user_id
            JOIN public.plans p ON p.id = s.plan_id
            WHERE s.ended_at IS NULL
            ORDER BY s.created_at DESC
        """)
        return {"subscriptions": cur.fetchall()}


@router.get("/subscriptions/{user_id}")
async def admin_get_subscription(user_id: str, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    return SubscriptionService(conn).get_current_subscription(user_id)


@router.post("/subscriptions/{user_id}/change-plan")
async def admin_change_plan(user_id: str, payload: ChangePlanRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    plan_id = get_plan_id(conn, payload.plan_id, payload.plan_code)
    SubscriptionService(conn).change_plan(user_id, plan_id, changed_by=user["id"], reason=payload.reason, immediate=payload.immediate)
    audit(conn, user["id"], user_id, "subscription_change_plan", payload.dict())
    conn.commit()
    return {"success": True}


@router.post("/subscriptions/{user_id}/start-trial")
async def admin_start_trial(user_id: str, payload: TrialRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    plan_id = get_plan_id(conn, plan_code=payload.plan_code)
    sub = SubscriptionService(conn).get_current_subscription(user_id, lock=True)
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE public.subscriptions
            SET plan_id = %s, status = 'trialing', trial_start = NOW(), trial_end = NOW() + (%s || ' days')::interval, updated_at = NOW()
            WHERE id = %s
        """, (plan_id, payload.days, sub["id"]))
    audit(conn, user["id"], user_id, "subscription_start_trial", payload.dict())
    conn.commit()
    return {"success": True}


@router.post("/subscriptions/{user_id}/cancel")
async def admin_cancel(user_id: str, payload: CancelRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    SubscriptionService(conn).cancel(user_id, at_period_end=payload.at_period_end, changed_by=user["id"])
    audit(conn, user["id"], user_id, "subscription_cancel", payload.dict())
    conn.commit()
    return {"success": True}


@router.post("/subscriptions/{user_id}/reactivate")
async def admin_reactivate(user_id: str, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    SubscriptionService(conn).reactivate(user_id, changed_by=user["id"])
    audit(conn, user["id"], user_id, "subscription_reactivate", {})
    conn.commit()
    return {"success": True}


@router.post("/subscriptions/{user_id}/suspend")
async def admin_suspend(user_id: str, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    sub = SubscriptionService(conn).get_current_subscription(user_id, lock=True)
    with conn.cursor() as cur:
        cur.execute("UPDATE public.subscriptions SET status = 'suspended', updated_at = NOW() WHERE id = %s", (sub["id"],))
    audit(conn, user["id"], user_id, "subscription_suspend", {})
    conn.commit()
    return {"success": True}


@router.post("/subscriptions/{user_id}/grant-usage")
async def admin_grant_usage(user_id: str, payload: GrantUsageRequest, user: Dict[str, Any] = Depends(verify_supabase_jwt), conn = Depends(get_db_connection)):
    require_admin(user, conn)
    UsageService(conn).credit_usage(user_id, payload.feature_key, payload.quantity, {"reason": payload.reason, "admin_user_id": user["id"]})
    audit(conn, user["id"], user_id, "usage_grant", payload.dict())
    conn.commit()
    return {"success": True}
