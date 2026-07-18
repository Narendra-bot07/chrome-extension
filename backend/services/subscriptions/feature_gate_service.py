from fastapi import HTTPException, status
from psycopg2.extras import RealDictCursor
from .subscription_service import SubscriptionService
from .usage_service import UsageService


class FeatureGateService:
    def __init__(self, conn):
        self.conn = conn
        self.subscription_service = SubscriptionService(conn)
        self.usage_service = UsageService(conn)

    def get_plan_features(self, user_id):
        sub = self.subscription_service.get_current_subscription(user_id)
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT feature_key, enabled, limit_value
                FROM public.plan_features
                WHERE plan_id = %s
            """, (sub["plan_id"],))
            rows = cur.fetchall()
        return {
            row["feature_key"]: {"enabled": row["enabled"], "limit": row["limit_value"]}
            for row in rows
        }

    def can_use_feature(self, user_id, feature_key):
        try:
            self.require_feature(user_id, feature_key)
            return True
        except HTTPException:
            return False

    def get_feature_limit(self, user_id, feature_key):
        sub = self.subscription_service.get_current_subscription(user_id)
        enabled, limit = self.usage_service.get_feature_limit(sub, feature_key)
        return limit if enabled else 0

    def require_feature(self, user_id, feature_key):
        sub = self.subscription_service.get_current_subscription(user_id)
        if sub.get("status") == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "SUBSCRIPTION_SUSPENDED", "message": "Your subscription is suspended."},
            )
        if not self.subscription_service.is_access_allowed(sub):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "SUBSCRIPTION_INACTIVE", "message": "Your subscription is not active."},
            )
        enabled, _ = self.usage_service.get_feature_limit(sub, feature_key)
        if not enabled:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FEATURE_NOT_AVAILABLE", "message": f"{feature_key} is not available on your current plan."},
            )
        return True
