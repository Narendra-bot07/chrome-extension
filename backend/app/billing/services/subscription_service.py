from psycopg2.extras import RealDictCursor
from typing import Dict, Any, List, Optional
import uuid

class SubscriptionService:
    def __init__(self, conn):
        self.conn = conn

    def get_plan(self, plan_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM public.plans WHERE id = %s", (plan_id,))
            return cur.fetchone()

    def get_all_plans(self) -> List[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM public.plans WHERE is_active = TRUE ORDER BY price ASC")
            return cur.fetchall()

    def create_payment(self, user_id: str, provider: str, payment_id: str, amount: float, currency: str, status: str) -> Dict[str, Any]:
        """
        Creates a payment record idempotently.
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check if exists
            cur.execute("SELECT * FROM public.payments WHERE provider_payment_id = %s", (payment_id,))
            existing = cur.fetchone()
            if existing:
                return dict(existing)
                
            db_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO public.payments (id, user_id, provider, provider_payment_id, amount, currency, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (db_id, user_id, provider, payment_id, amount, currency, status)
            )
            record = cur.fetchone()
            self.conn.commit()
            return dict(record)

    def activate_subscription(self, user_id: str, plan_id: str, provider: str, sub_id: str) -> None:
        """
        Activates or updates the user subscription
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Upsert subscription record
            db_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO public.subscriptions (id, user_id, plan_id, provider, provider_subscription_id, status)
                VALUES (%s, %s, %s, %s, %s, 'active')
                ON CONFLICT (provider_subscription_id) DO UPDATE SET
                    status = 'active',
                    plan_id = EXCLUDED.plan_id
                """,
                (db_id, user_id, plan_id, provider, sub_id)
            )
            
            # Update user's current plan
            cur.execute(
                "UPDATE public.users SET current_plan = %s, subscription_status = 'active' WHERE id = %s",
                (plan_id, user_id)
            )
            self.conn.commit()

    def cancel_subscription(self, provider_sub_id: str) -> None:
        """
        Marks subscription as pending cancellation
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "UPDATE public.subscriptions SET cancel_at_period_end = TRUE WHERE provider_subscription_id = %s RETURNING user_id",
                (provider_sub_id,)
            )
            self.conn.commit()

    def get_user_subscription(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM public.subscriptions WHERE user_id = %s AND status = 'active' ORDER BY created_at DESC LIMIT 1",
                (user_id,)
            )
            return cur.fetchone()

    def get_payment_history(self, user_id: str) -> List[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM public.payments WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,)
            )
            return cur.fetchall()
