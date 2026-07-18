from datetime import datetime, timezone
import calendar
from psycopg2.extras import RealDictCursor, Json


ACTIVE_STATUSES = {"trialing", "active", "grace_period"}


def add_one_month(dt):
    month = dt.month + 1
    year = dt.year
    if month > 12:
        month = 1
        year += 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


class SubscriptionService:
    def __init__(self, conn):
        self.conn = conn

    def get_default_plan(self):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM public.plans WHERE is_default = TRUE AND is_active = TRUE ORDER BY sort_order LIMIT 1")
            plan = cur.fetchone()
            if not plan:
                cur.execute("SELECT * FROM public.plans WHERE code = 'free' AND is_active = TRUE LIMIT 1")
                plan = cur.fetchone()
            return plan

    def ensure_user_subscription(self, user_id: str):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            if user_id == "00000000-0000-0000-0000-000000000000":
                cur.execute("""
                    INSERT INTO public.users (id, email, full_name, provider, email_verified)
                    VALUES (%s, 'local.developer@example.com', 'Local Developer', 'local', TRUE)
                    ON CONFLICT (id) DO NOTHING
                """, (user_id,))
            cur.execute("""
                SELECT s.*, p.code AS plan_code, p.name AS plan_name
                FROM public.subscriptions s
                JOIN public.plans p ON p.id = s.plan_id
                WHERE s.user_id = %s AND s.ended_at IS NULL
                ORDER BY s.created_at DESC
                LIMIT 1
            """, (user_id,))
            sub = cur.fetchone()
            if sub:
                return self.ensure_current_period(sub)

            plan = self.get_default_plan()
            if not plan:
                raise RuntimeError("No default plan configured.")
            cur.execute("""
                INSERT INTO public.subscriptions (
                    user_id, plan_id, status, started_at, current_period_start, current_period_end
                )
                VALUES (%s, %s, 'active', NOW(), NOW(), NOW() + INTERVAL '1 month')
                RETURNING *
            """, (user_id, plan["id"]))
            self.conn.commit()
            return self.get_current_subscription(user_id)

    def get_current_subscription(self, user_id: str, lock: bool = False):
        lock_sql = " FOR UPDATE" if lock else ""
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"""
                SELECT s.*, p.code AS plan_code, p.name AS plan_name,
                       p.monthly_jd_limit, p.resume_limit, p.price_amount, p.currency, p.price_display, p.billing_interval
                FROM public.subscriptions s
                JOIN public.plans p ON p.id = s.plan_id
                WHERE s.user_id = %s AND s.ended_at IS NULL
                ORDER BY s.created_at DESC
                LIMIT 1
                {lock_sql}
            """, (user_id,))
            sub = cur.fetchone()
        if not sub:
            sub = self.ensure_user_subscription(user_id)
        return self.ensure_current_period(sub)

    def ensure_current_period(self, subscription):
        now = datetime.now(timezone.utc)
        if subscription.get("status") == "trialing" and subscription.get("trial_end") and subscription["trial_end"] <= now:
            free_plan = self.get_default_plan()
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    UPDATE public.subscriptions
                    SET plan_id = %s, status = 'active', trial_start = NULL, trial_end = NULL, updated_at = NOW()
                    WHERE id = %s
                """, (free_plan["id"], subscription["id"]))
                cur.execute("""
                    INSERT INTO public.subscription_history (
                        user_id, old_plan_id, new_plan_id, old_status, new_status, reason, metadata_json
                    )
                    VALUES (%s, %s, %s, %s, 'active', 'trial_expired_to_free', %s)
                """, (subscription["user_id"], subscription["plan_id"], free_plan["id"], subscription["status"], Json({})))
                self.conn.commit()
            return self.get_current_subscription(subscription["user_id"])

        if subscription.get("status") == "grace_period" and subscription.get("grace_period_end") and subscription["grace_period_end"] <= now:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("UPDATE public.subscriptions SET status = 'suspended', updated_at = NOW() WHERE id = %s", (subscription["id"],))
                cur.execute("""
                    INSERT INTO public.subscription_history (
                        user_id, old_plan_id, new_plan_id, old_status, new_status, reason, metadata_json
                    )
                    VALUES (%s, %s, %s, %s, 'suspended', 'grace_period_expired', %s)
                """, (subscription["user_id"], subscription["plan_id"], subscription["plan_id"], subscription["status"], Json({})))
                self.conn.commit()
            return self.get_current_subscription(subscription["user_id"])

        period_end = subscription.get("current_period_end")
        if not period_end or period_end > now:
            return subscription

        status = subscription.get("status")
        plan_id = subscription.get("plan_id")
        old_plan_id = plan_id

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            if subscription.get("cancel_at_period_end") or status == "cancelled":
                free_plan = self.get_default_plan()
                plan_id = free_plan["id"]
                status = "active"
                cur.execute("""
                    INSERT INTO public.subscription_history (
                        user_id, old_plan_id, new_plan_id, old_status, new_status, reason, metadata_json
                    )
                    VALUES (%s, %s, %s, %s, %s, 'period_end_cancellation_to_free', %s)
                """, (subscription["user_id"], old_plan_id, plan_id, subscription.get("status"), status, Json({})))

            if subscription.get("pending_plan_id") and subscription.get("pending_change_effective_at") and subscription["pending_change_effective_at"] <= now:
                old_plan_id = plan_id
                plan_id = subscription["pending_plan_id"]
                cur.execute("""
                    INSERT INTO public.subscription_history (
                        user_id, old_plan_id, new_plan_id, old_status, new_status, reason, metadata_json
                    )
                    VALUES (%s, %s, %s, %s, %s, 'scheduled_plan_change', %s)
                """, (subscription["user_id"], old_plan_id, plan_id, subscription.get("status"), status, Json({})))

            start = period_end
            end = add_one_month(start)
            cur.execute("""
                UPDATE public.subscriptions
                SET plan_id = %s,
                    status = %s,
                    current_period_start = %s,
                    current_period_end = %s,
                    cancel_at_period_end = FALSE,
                    pending_plan_id = NULL,
                    pending_change_effective_at = NULL,
                    updated_at = NOW()
                WHERE id = %s
            """, (plan_id, status, start, end, subscription["id"]))
            self.conn.commit()
        return self.get_current_subscription(subscription["user_id"])

    def is_access_allowed(self, subscription):
        status = subscription.get("status")
        if status in {"active", "trialing"}:
            return True
        if status == "grace_period":
            grace_end = subscription.get("grace_period_end")
            return bool(grace_end and grace_end > datetime.now(timezone.utc))
        return False

    def change_plan(self, user_id, new_plan_id, changed_by=None, reason="admin_change", immediate=True):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            sub = self.get_current_subscription(user_id, lock=True)
            if immediate:
                cur.execute("""
                    UPDATE public.subscriptions
                    SET plan_id = %s, status = 'active', cancel_at_period_end = FALSE, updated_at = NOW()
                    WHERE id = %s
                """, (new_plan_id, sub["id"]))
            else:
                cur.execute("""
                    UPDATE public.subscriptions
                    SET pending_plan_id = %s, pending_change_effective_at = current_period_end, updated_at = NOW()
                    WHERE id = %s
                """, (new_plan_id, sub["id"]))
            cur.execute("""
                INSERT INTO public.subscription_history (
                    user_id, old_plan_id, new_plan_id, old_status, new_status, reason, changed_by, metadata_json
                )
                VALUES (%s, %s, %s, %s, 'active', %s, %s, %s)
            """, (user_id, sub["plan_id"], new_plan_id, sub["status"], reason, changed_by, Json({"immediate": immediate})))
            self.conn.commit()

    def cancel(self, user_id, at_period_end=True, changed_by=None):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            sub = self.get_current_subscription(user_id, lock=True)
            if at_period_end:
                cur.execute("UPDATE public.subscriptions SET cancel_at_period_end = TRUE, cancelled_at = NOW(), updated_at = NOW() WHERE id = %s", (sub["id"],))
            else:
                free = self.get_default_plan()
                cur.execute("""
                    UPDATE public.subscriptions
                    SET plan_id = %s, status = 'active', cancel_at_period_end = FALSE, cancelled_at = NOW(), updated_at = NOW()
                    WHERE id = %s
                """, (free["id"], sub["id"]))
            cur.execute("""
                INSERT INTO public.subscription_history (user_id, old_plan_id, new_plan_id, old_status, new_status, reason, changed_by, metadata_json)
                VALUES (%s, %s, %s, %s, %s, 'cancel', %s, %s)
            """, (user_id, sub["plan_id"], sub["plan_id"], sub["status"], "cancelled" if at_period_end else "active", changed_by, Json({"at_period_end": at_period_end})))
            self.conn.commit()

    def reactivate(self, user_id, changed_by=None):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            sub = self.get_current_subscription(user_id, lock=True)
            cur.execute("UPDATE public.subscriptions SET cancel_at_period_end = FALSE, cancelled_at = NULL, status = 'active', updated_at = NOW() WHERE id = %s", (sub["id"],))
            cur.execute("""
                INSERT INTO public.subscription_history (user_id, old_plan_id, new_plan_id, old_status, new_status, reason, changed_by, metadata_json)
                VALUES (%s, %s, %s, %s, 'active', 'reactivate', %s, %s)
            """, (user_id, sub["plan_id"], sub["plan_id"], sub["status"], changed_by, Json({})))
            self.conn.commit()
