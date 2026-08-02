from typing import Dict, Any
from fastapi import APIRouter, Depends
from core.database import get_db_connection
from core.security import verify_supabase_jwt
from services.subscriptions.subscription_service import SubscriptionService
from services.subscriptions.feature_gate_service import FeatureGateService
from services.subscriptions.usage_service import UsageService
from services.cache.redis_cache import redis_cache
import json

router = APIRouter(prefix="/subscription", tags=["subscription"])


@router.get("/me")
async def get_my_subscription(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    cache_key = f"subscription:{user['id']}"
    cached = redis_cache.get(cache_key)
    if cached:
        try:
            return json.loads(cached) if isinstance(cached, str) else cached
        except Exception:
            pass

    sub_svc = SubscriptionService(conn)
    sub = sub_svc.get_current_subscription(user["id"])
    features = FeatureGateService(conn).get_plan_features(user["id"])
    usage = UsageService(conn).get_usage_summary(user["id"])
    trial = None
    if sub.get("trial_start") or sub.get("trial_end"):
        trial = {"start": sub.get("trial_start"), "end": sub.get("trial_end")}
    result = {
        "plan": {
            "id": sub["plan_id"],
            "code": sub["plan_code"],
            "name": sub["plan_name"],
            "price_amount": float(sub.get("price_amount") or 0),
            "currency": sub.get("currency") or "USD",
            "price_display": sub.get("price_display"),
            "billing_interval": sub.get("billing_interval"),
        },
        "status": sub["status"],
        "current_period_start": sub["current_period_start"],
        "current_period_end": sub["current_period_end"],
        "cancel_at_period_end": sub.get("cancel_at_period_end", False),
        "cancelled_at": sub.get("cancelled_at"),
        "grace_period_end": sub.get("grace_period_end"),
        "trial": trial,
        "usage": usage,
        "features": features,
    }
    redis_cache.set(cache_key, result, ttl_seconds=300)
    return result


@router.post("/cancel")
async def cancel_my_subscription(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    redis_cache.delete(f"subscription:{user['id']}")
    SubscriptionService(conn).cancel(user["id"], at_period_end=True, changed_by=user["id"])
    return {"success": True}


@router.post("/reactivate")
async def reactivate_my_subscription(
    user: Dict[str, Any] = Depends(verify_supabase_jwt),
    conn = Depends(get_db_connection)
):
    redis_cache.delete(f"subscription:{user['id']}")
    SubscriptionService(conn).reactivate(user["id"], changed_by=user["id"])
    return {"success": True}
