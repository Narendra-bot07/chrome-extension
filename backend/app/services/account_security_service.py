import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

from psycopg2.extras import RealDictCursor

from core.config import settings
from core.security import hash_action_token, hash_password, validate_password, verify_password


def normalize_email(email: str) -> str:
    return email.strip().lower()


class AccountSecurityService:
    def __init__(self, conn):
        self.conn = conn

    @staticmethod
    def fingerprint(value: str) -> str:
        return hashlib.sha256((value or "unknown").encode("utf-8")).hexdigest()

    def rate_limited(self, action: str, subject: str, limit: int, minutes: int) -> bool:
        digest = self.fingerprint(subject)
        with self.conn.cursor() as cur:
            cur.execute(
                """DELETE FROM public.auth_rate_limits WHERE created_at < NOW() - INTERVAL '2 days';
                   SELECT COUNT(*) FROM public.auth_rate_limits
                   WHERE action=%s AND subject_hash=%s
                     AND created_at > NOW() - (%s * INTERVAL '1 minute')""",
                (action, digest, minutes),
            )
            count = cur.fetchone()[0]
            if count >= limit:
                self.conn.commit()
                return True
            cur.execute(
                "INSERT INTO public.auth_rate_limits(action, subject_hash) VALUES (%s,%s)",
                (action, digest),
            )
        self.conn.commit()
        return False

    def audit(self, event_type: str, user_id=None, metadata=None, ip="", user_agent=""):
        with self.conn.cursor() as cur:
            cur.execute(
                """INSERT INTO public.security_audit_events
                   (user_id,event_type,metadata_json,ip_hash,user_agent)
                   VALUES (%s,%s,%s::jsonb,%s,%s)""",
                (user_id, event_type, json.dumps(metadata or {}), self.fingerprint(ip), user_agent[:1000]),
            )

    def issue_token(self, table: str, user_id: str, expiry: timedelta, request=None) -> str:
        if table not in {"password_reset_tokens", "email_verification_tokens"}:
            raise ValueError("Invalid token type")
        raw = secrets.token_urlsafe(32)
        token_hash = hash_action_token(raw)
        extra_columns = ""
        extra_values = ()
        if table == "password_reset_tokens":
            ip = request.client.host if request and request.client else ""
            ua = request.headers.get("user-agent", "") if request else ""
            extra_columns = ", requested_ip_hash, user_agent"
            extra_values = (self.fingerprint(ip), ua[:1000])
        with self.conn.cursor() as cur:
            cur.execute(f"UPDATE public.{table} SET used_at=NOW() WHERE user_id=%s AND used_at IS NULL", (user_id,))
            placeholders = ", %s, %s" if extra_values else ""
            cur.execute(
                f"""INSERT INTO public.{table}
                    (user_id, token_hash, expires_at{extra_columns})
                    VALUES (%s,%s,%s{placeholders})""",
                (user_id, token_hash, datetime.now(timezone.utc) + expiry, *extra_values),
            )
        return raw

    def get_user_by_email(self, email: str):
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT id,email,password_hash,has_password_credential,email_verified_at
                   FROM public.users WHERE LOWER(email)=%s AND COALESCE(is_active,TRUE)=TRUE""",
                (normalize_email(email),),
            )
            return cur.fetchone()

    def reset_password(self, raw_token: str, new_password: str) -> str:
        validate_password(new_password)
        token_hash = hash_action_token(raw_token)
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT t.id,t.user_id,u.email,u.has_password_credential
                   FROM public.password_reset_tokens t JOIN public.users u ON u.id=t.user_id
                   WHERE t.token_hash=%s AND t.used_at IS NULL AND t.expires_at>NOW()
                   FOR UPDATE OF t,u""",
                (token_hash,),
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("invalid_token")
            cur.execute(
                """UPDATE public.users SET password_hash=%s,has_password_credential=TRUE,password_changed_at=NOW(),updated_at=NOW()
                   WHERE id=%s""", (hash_password(new_password), row["user_id"])
            )
            cur.execute("UPDATE public.password_reset_tokens SET used_at=NOW() WHERE user_id=%s AND used_at IS NULL", (row["user_id"],))
            if settings.REVOKE_SESSIONS_ON_PASSWORD_RESET:
                cur.execute("UPDATE public.user_sessions SET is_revoked=TRUE WHERE user_id=%s AND is_revoked=FALSE", (row["user_id"],))
            self.audit("password_reset_completed", row["user_id"])
        self.conn.commit()
        return row["email"]

    def verify_email(self, raw_token: str) -> str:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT t.id,t.user_id,u.email FROM public.email_verification_tokens t
                   JOIN public.users u ON u.id=t.user_id
                   WHERE t.token_hash=%s AND t.used_at IS NULL AND t.expires_at>NOW()
                   FOR UPDATE OF t,u""", (hash_action_token(raw_token),)
            )
            row = cur.fetchone()
            if not row:
                raise ValueError("invalid_token")
            cur.execute("UPDATE public.users SET email_verified_at=NOW(),email_verified=TRUE,updated_at=NOW() WHERE id=%s", (row["user_id"],))
            cur.execute("UPDATE public.email_verification_tokens SET used_at=NOW() WHERE user_id=%s AND used_at IS NULL", (row["user_id"],))
            self.audit("email_verified", row["user_id"])
        self.conn.commit()
        return row["email"]

    def change_password(self, user_id: str, current: str, new: str, current_session_id=None) -> str:
        validate_password(new)
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT email,password_hash,has_password_credential FROM public.users WHERE id=%s FOR UPDATE", (user_id,))
            user = cur.fetchone()
            if not user or not user["has_password_credential"] or not verify_password(current, user["password_hash"]):
                raise PermissionError("Current password is incorrect.")
            if verify_password(new, user["password_hash"]):
                raise ValueError("Your new password must be different.")
            cur.execute("UPDATE public.users SET password_hash=%s,password_changed_at=NOW(),updated_at=NOW() WHERE id=%s", (hash_password(new), user_id))
            if current_session_id:
                cur.execute("UPDATE public.user_sessions SET is_revoked=TRUE WHERE user_id=%s AND session_id<>%s AND is_revoked=FALSE", (user_id, current_session_id))
            self.audit("password_changed", user_id)
        self.conn.commit()
        return user["email"]
