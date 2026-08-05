from psycopg2.extras import RealDictCursor, Json
from fastapi import HTTPException, status
from .subscription_service import SubscriptionService


FEATURE_NAMES = {
    "jd_extraction": "job description extractions",
    "resume_upload": "resume uploads",
    "resume_generation": "tailored resume generations",
    "cover_letter_generation": "cover letter generations",
}

# resume_upload is a lifetime cap ("1 resume upload, ever" on the free plan),
# not a per-billing-period one like the other three -- usage_events has no
# separate window concept, so this set decides which features get summed
# across all-time instead of just the current subscription period.
LIFETIME_WINDOW_FEATURES = {"resume_upload"}

# Quota enforcement previously depended on an ENFORCE_SUBSCRIPTION_QUOTAS env
# var that defaulted to "false" in production -- meaning every account,
# including real customers, was silently unlimited on all four core
# features. Replaced with a per-user bypass: only accounts with
# users.role='admin' are unlimited (today, just the product owner's account
# -- see docs/KNOWN_ISSUES.md / admin_abuse.py's OWNER_EMAILS for how that
# role got set). Free-tier accounts now always get the real plan_features
# limits from the database.
UNLIMITED_FEATURES = {
    "jd_extraction",
    "resume_upload",
    "resume_generation",
    "cover_letter_generation",
}


def quota_error(summary):
    feature_key = summary.get("feature_key")
    feature_name = FEATURE_NAMES.get(feature_key, feature_key.replace("_", " "))
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={
            "code": "QUOTA_EXCEEDED",
            "message": f"You have reached your {feature_name} limit for this billing period. Upgrade your plan to continue.",
            "usage": summary,
        },
    )


class UsageService:
    def __init__(self, conn):
        self.conn = conn
        self.subscription_service = SubscriptionService(conn)
        self._admin_cache = {}

    def _is_admin_user(self, user_id):
        """Admin accounts (currently just the product owner) bypass quotas
        entirely -- checked fresh against the DB rather than trusted from
        the session JWT, since role changes (e.g. granting another admin
        via the admin console) must take effect without requiring re-login."""
        if user_id in self._admin_cache:
            return self._admin_cache[user_id]
        with self.conn.cursor() as cur:
            cur.execute("SELECT role FROM public.users WHERE id = %s", (user_id,))
            row = cur.fetchone()
            is_admin = bool(row and row[0] == "admin")
        self._admin_cache[user_id] = is_admin
        return is_admin

    def get_feature_limit(self, subscription, feature_key, user_id=None):
        if user_id is not None and self._is_admin_user(user_id) and feature_key in UNLIMITED_FEATURES:
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
            if feature_key in LIFETIME_WINDOW_FEATURES:
                cur.execute("""
                    SELECT COALESCE(SUM(quantity), 0) AS used
                    FROM public.usage_events
                    WHERE user_id = %s AND feature_key = %s
                """, (user_id, feature_key))
            else:
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
        enabled, limit = self.get_feature_limit(sub, feature_key, user_id=user_id)
        used = self.get_usage(user_id, feature_key, sub["current_period_start"], sub["current_period_end"])
        remaining = None if limit is None else max(limit - used, 0)
        return {
            "feature_key": feature_key,
            "enabled": enabled,
            "limit": limit,
            "used": used,
            "remaining": remaining,
            "lifetime": feature_key in LIFETIME_WINDOW_FEATURES,
            "period_start": sub["current_period_start"],
            "period_end": sub["current_period_end"],
        }

    def get_usage_summary(self, user_id):
        keys = ["jd_extraction", "resume_upload", "resume_generation", "cover_letter_generation"]
        sub = self.subscription_service.get_current_subscription(user_id)
        is_admin = self._is_admin_user(user_id)
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT feature_key, limit_value, enabled
                FROM public.plan_features
                WHERE plan_id = %s AND feature_key = ANY(%s)
                """,
                (sub["plan_id"], keys),
            )
            features = {row["feature_key"]: row for row in cur.fetchall()}
            cur.execute(
                """
                SELECT feature_key, COALESCE(SUM(quantity), 0)::int AS used
                FROM public.usage_events
                WHERE user_id = %s
                  AND feature_key = ANY(%s)
                  AND (
                    feature_key = 'resume_upload'
                    OR (created_at >= %s AND created_at < %s)
                  )
                GROUP BY feature_key
                """,
                (user_id, keys, sub["current_period_start"], sub["current_period_end"]),
            )
            usage = {row["feature_key"]: max(int(row["used"] or 0), 0) for row in cur.fetchall()}

        result = {}
        for feature_key in keys:
            feature = features.get(feature_key) or {}
            enabled = bool(feature.get("enabled"))
            limit = feature.get("limit_value")
            if enabled and limit is None and feature_key == "jd_extraction":
                limit = sub.get("monthly_jd_limit")
            if is_admin and feature_key in UNLIMITED_FEATURES:
                enabled, limit = True, None
            used = usage.get(feature_key, 0)
            result[feature_key] = {
                "feature_key": feature_key,
                "enabled": enabled,
                "limit": limit,
                "used": used,
                "remaining": None if limit is None else max(limit - used, 0),
                "lifetime": feature_key in LIFETIME_WINDOW_FEATURES,
                "period_start": sub["current_period_start"],
                "period_end": sub["current_period_end"],
            }
        return result

    def require_available(self, user_id, feature_key, quantity=1):
        summary = self.get_current_usage(user_id, feature_key)
        if not summary["enabled"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "FEATURE_NOT_AVAILABLE", "message": f"{FEATURE_NAMES.get(feature_key, feature_key)} is not available on your current plan."},
            )
        if summary["limit"] is not None and summary["used"] + quantity > summary["limit"]:
            quota_error(summary)
        return summary

    def consume_usage(
        self,
        user_id,
        feature_key,
        quantity=1,
        request_id=None,
        metadata=None,
        return_summary=True,
    ):
        metadata = metadata or {}
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                sub = self.subscription_service.get_current_subscription(user_id, lock=True)
                enabled, limit = self.get_feature_limit(sub, feature_key, user_id=user_id)
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
                        return self.get_current_usage(user_id, feature_key) if return_summary else None

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
                return self.get_current_usage(user_id, feature_key) if return_summary else None
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
