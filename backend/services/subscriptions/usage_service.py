from psycopg2.extras import RealDictCursor, Json
from fastapi import HTTPException, status
from .subscription_service import SubscriptionService


def quota_error(summary):
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "QUOTA_EXCEEDED",
            "message": "You have used all JD extractions for this period.",
            "usage": summary,
        },
    )


class UsageService:
    def __init__(self, conn):
        self.conn = conn
        self.subscription_service = SubscriptionService(conn)

    def get_feature_limit(self, subscription, feature_key):
        # Temporary local/dev override: keep JD extraction available without a monthly cap.
        # Usage events are still recorded, but quota checks treat this feature as unlimited.
        if feature_key == "jd_extraction":
            return True, None

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT pf.limit_value, pf.enabled
                FROM public.plan_features pf
                WHERE pf.plan_id = %s AND pf.feature_key = %s
            """, (subscription["plan_id"], feature_key))
            feature = cur.fetchone()
            if not feature or not feature["enabled"]:
                return False, 0
            if feature["limit_value"] is not None:
                return True, feature["limit_value"]
            if feature_key == "jd_extraction":
                return True, subscription.get("monthly_jd_limit")
            return True, None

    def get_usage(self, user_id, feature_key, period_start, period_end):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT COALESCE(SUM(quantity), 0) AS used
                FROM public.usage_events
                WHERE user_id = %s
                  AND feature_key = %s
                  AND created_at >= %s
                  AND created_at < %s
            """, (user_id, feature_key, period_start, period_end))
            return max(int(cur.fetchone()["used"] or 0), 0)

    def get_current_usage(self, user_id, feature_key):
        sub = self.subscription_service.get_current_subscription(user_id)
        enabled, limit = self.get_feature_limit(sub, feature_key)
        used = self.get_usage(user_id, feature_key, sub["current_period_start"], sub["current_period_end"])
        remaining = None if limit is None else max(limit - used, 0)
        return {
            "feature_key": feature_key,
            "enabled": enabled,
            "limit": limit,
            "used": used,
            "remaining": remaining,
            "period_start": sub["current_period_start"],
            "period_end": sub["current_period_end"],
        }

    def get_usage_summary(self, user_id):
        return {
            "jd_extraction": self.get_current_usage(user_id, "jd_extraction")
        }

    def consume_usage(self, user_id, feature_key, quantity=1, request_id=None, metadata=None):
        metadata = metadata or {}
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                sub = self.subscription_service.get_current_subscription(user_id, lock=True)
                enabled, limit = self.get_feature_limit(sub, feature_key)
                if not enabled:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"code": "FEATURE_NOT_AVAILABLE", "message": f"{feature_key} is not available on your current plan."},
                    )
                if not self.subscription_service.is_access_allowed(sub):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail={"code": "SUBSCRIPTION_INACTIVE", "message": "Your subscription is not active."},
                    )

                if request_id:
                    cur.execute("""
                        SELECT *
                        FROM public.usage_events
                        WHERE request_id = %s AND user_id = %s AND feature_key = %s
                        LIMIT 1
                    """, (request_id, user_id, feature_key))
                    existing = cur.fetchone()
                    if existing:
                        self.conn.commit()
                        return self.get_current_usage(user_id, feature_key)

                used = self.get_usage(user_id, feature_key, sub["current_period_start"], sub["current_period_end"])
                summary = {
                    "feature_key": feature_key,
                    "limit": limit,
                    "used": used,
                    "remaining": None if limit is None else max(limit - used, 0),
                    "period_start": sub["current_period_start"],
                    "period_end": sub["current_period_end"],
                }
                if limit is not None and used + quantity > limit:
                    quota_error(summary)

                cur.execute("""
                    INSERT INTO public.usage_events (user_id, subscription_id, feature_key, quantity, request_id, metadata_json)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (user_id, sub["id"], feature_key, quantity, request_id, Json(metadata)))
                self.conn.commit()
                return self.get_current_usage(user_id, feature_key)
        except Exception:
            self.conn.rollback()
            raise

    def credit_usage(self, user_id, feature_key, quantity, metadata=None):
        sub = self.subscription_service.get_current_subscription(user_id)
        with self.conn.cursor() as cur:
            cur.execute("""
                INSERT INTO public.usage_events (user_id, subscription_id, feature_key, quantity, metadata_json)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_id, sub["id"], feature_key, -abs(quantity), Json(metadata or {"reason": "usage_credit"})))
            self.conn.commit()
