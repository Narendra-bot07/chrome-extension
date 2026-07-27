from psycopg2.extras import RealDictCursor
from typing import Dict, Any, Optional
from datetime import datetime, timezone

class ProfileRepository:
    def __init__(self, conn):
        self.conn = conn

    def get_by_id(self, profile_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """
                SELECT p.*,
                       u.auth_provider,
                       u.has_password_credential,
                       COALESCE(u.email_verified, FALSE) AS email_verified,
                       u.email_verified_at
                FROM public.profiles p
                JOIN public.users u ON u.id = p.id
                WHERE p.id = %s AND p.deleted_at IS NULL
                """,
                (profile_id,)
            )
            profile = cur.fetchone()
            
            if profile:
                try:
                    cur.execute(
                        "SELECT COUNT(id) as count FROM public.resumes WHERE user_id = %s AND deleted_at IS NULL",
                        (profile_id,)
                    )
                    count_row = cur.fetchone()
                    profile["resume_count"] = count_row["count"] if count_row else 0
                except Exception:
                    pass
                    
            return profile
    def create(self, profile_id: str, email: str, full_name: str) -> Dict[str, Any]:
        query = "INSERT INTO public.profiles (id, email, full_name) VALUES (%s, %s, %s) RETURNING *"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (profile_id, email, full_name))
            self.conn.commit()
            return cur.fetchone() or {}

    def update(self, profile_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        if not updates:
            return {}

        required = ("first_name", "last_name", "username", "phone_number", "country", "timezone")
        current = self.get_by_id(profile_id) or {}
        completed = all(
            str(updates.get(field, current.get(field, "")) or "").strip()
            for field in required
        )
        if completed:
            updates["profile_completed_at"] = current.get("profile_completed_at") or datetime.now(timezone.utc)
        updates["profile_confirmed_at"] = datetime.now(timezone.utc)
        updates["updated_at"] = datetime.now(timezone.utc)

        fields = ", ".join([f"{k} = %s" for k in updates.keys()])
        values = list(updates.values()) + [profile_id]
        query = f"UPDATE public.profiles SET {fields} WHERE id = %s RETURNING *"
        
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, values)
            self.conn.commit()
            return self.get_by_id(profile_id) or {}

    def get_credits(self, profile_id: str) -> int:
        profile = self.get_by_id(profile_id)
        return profile.get("credits_remaining", 0) if profile else 0

    def deduct_credits(self, profile_id: str, amount: int = 1) -> Dict[str, Any]:
        profile = self.get_by_id(profile_id)
        if not profile:
            raise ValueError("Profile not found")
        new_credits = max(0, profile["credits_remaining"] - amount)
        return self.update(profile_id, {"credits_remaining": new_credits})
