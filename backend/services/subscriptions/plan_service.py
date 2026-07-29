from psycopg2.extras import RealDictCursor, Json

PLAN_DISPLAY = {
    "free": {
        "description": "A focused free start.",
    },
    "pro": {
        "description": "For active job hunting.",
    },
    "elite": {
        "description": "For serious job hunters.",
    },
    "advanced": {
        "description": "For power users and teams.",
    },
}

FEATURE_LABELS = {
    "jd_extraction": "Job description extractions",
    "resume_upload": "Resume uploads",
    "resume_generation": "Tailored resumes",
    "cover_letter_generation": "Cover letters",
    "basic_tailoring": "Basic resume tailoring",
    "advanced_tailoring": "Advanced resume tailoring",
    "application_history": "Application history",
    "priority_processing": "Priority processing",
    "advanced_analytics": "Advanced analytics",
}

FEATURE_ORDER = [
    "jd_extraction",
    "resume_upload",
    "resume_generation",
    "cover_letter_generation",
    "basic_tailoring",
    "advanced_tailoring",
    "application_history",
    "priority_processing",
    "advanced_analytics",
]


class PlanService:
    def __init__(self, conn):
        self.conn = conn

    def _format_price_display(self, price, currency):
        if price is None:
            return None
        amount = float(price)
        return "$0" if amount == 0 else f"${amount:,.2f}"

    def _friendly_feature_label(self, feature_key, limit_value):
        label = FEATURE_LABELS.get(feature_key, feature_key.replace("_", " ").title())
        if feature_key == "jd_extraction":
            return f"{limit_value:,} job description extractions per month" if limit_value else "Unlimited job description extractions"
        if feature_key == "resume_upload":
            return f"{limit_value:,} resume upload{'s' if limit_value != 1 else ''}" if limit_value else "Unlimited resume uploads"
        if feature_key == "resume_generation":
            return f"{limit_value:,} tailored resume{'s' if limit_value != 1 else ''} per month" if limit_value else "Unlimited tailored resumes"
        if feature_key == "cover_letter_generation":
            return f"{limit_value:,} cover letter{'s' if limit_value != 1 else ''} per month" if limit_value else "Unlimited cover letters"
        return label

    def _serialize_plan(self, plan):
        plan = dict(plan)
        display = PLAN_DISPLAY.get(plan.get("code"), {})
        price = plan.get("price_amount")
        currency = plan.get("currency") or "USD"
        features_obj = plan.get("features") or {}
        features = []

        for key in FEATURE_ORDER:
            feature = features_obj.get(key)
            if not feature or not feature.get("enabled"):
                continue
            limit_value = feature.get("limit")
            features.append({
                "key": key,
                "label": self._friendly_feature_label(key, limit_value),
                "limit": limit_value,
                "enabled": True,
            })

        plan["description"] = display.get("description") or plan.get("description") or ""
        plan["price_amount"] = float(price) if price is not None else 0.0
        plan["price"] = plan["price_amount"]
        plan["currency"] = currency
        plan["price_display"] = self._format_price_display(plan["price_amount"], currency)
        plan["features"] = features
        return plan

    def list_active_plans(self):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT p.*, COALESCE(
                    jsonb_object_agg(
                        pf.feature_key,
                        jsonb_build_object('enabled', pf.enabled, 'limit', pf.limit_value)
                    ) FILTER (WHERE pf.id IS NOT NULL),
                    '{}'::jsonb
                ) AS features
                FROM public.plans p
                LEFT JOIN public.plan_features pf ON pf.plan_id = p.id AND pf.feature_key IS NOT NULL
                WHERE p.is_active = TRUE
                GROUP BY p.id
                ORDER BY p.sort_order, p.name
            """)
            return [self._serialize_plan(plan) for plan in cur.fetchall()]

    def list_all_plans(self):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM public.plans ORDER BY sort_order, name")
            return cur.fetchall()

    def create_plan(self, payload):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO public.plans (
                    code, name, description, monthly_jd_limit, resume_limit,
                    price_amount, currency, price_display, billing_interval, is_active, is_default, sort_order
                )
                VALUES (%(code)s, %(name)s, %(description)s, %(monthly_jd_limit)s, %(resume_limit)s,
                        %(price_amount)s, %(currency)s, %(price_display)s, %(billing_interval)s, %(is_active)s, %(is_default)s, %(sort_order)s)
                RETURNING *
            """, payload)
            plan = cur.fetchone()
            self.conn.commit()
            return plan

    def update_plan(self, plan_id, payload):
        allowed = [
            "name", "description", "monthly_jd_limit", "resume_limit", "price_amount", "currency", "price_display",
            "billing_interval", "is_active", "is_default", "sort_order"
        ]
        fields = [key for key in allowed if key in payload]
        if not fields:
            return None
        values = [payload[key] for key in fields]
        set_sql = ", ".join([f"{field} = %s" for field in fields])
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(f"UPDATE public.plans SET {set_sql}, updated_at = NOW() WHERE id = %s RETURNING *", values + [plan_id])
            plan = cur.fetchone()
            self.conn.commit()
            return plan

    def upsert_feature(self, plan_id, feature_key, enabled=True, limit_value=None):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO public.plan_features (plan_id, feature_key, enabled, limit_value, updated_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (plan_id, feature_key) DO UPDATE SET
                    enabled = EXCLUDED.enabled,
                    limit_value = EXCLUDED.limit_value,
                    updated_at = NOW()
                RETURNING *
            """, (plan_id, feature_key, enabled, limit_value))
            feature = cur.fetchone()
            self.conn.commit()
            return feature
