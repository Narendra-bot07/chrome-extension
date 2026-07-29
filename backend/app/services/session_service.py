import datetime
import httpx
from fastapi import Request
from user_agents import parse
from psycopg2.extras import RealDictCursor
import threading
import hashlib
import secrets
from core.config import settings

class SessionService:
    def __init__(self, conn):
        self.conn = conn

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "127.0.0.1"

    def _get_location_from_ip(self, ip: str) -> dict:
        if ip in ("127.0.0.1", "::1", "localhost"):
            return {
                "city": "Local Development",
                "state": "Local",
                "country": "Localhost",
                "timezone": "UTC"
            }
        try:
            # Note: In production, consider using a paid tier or caching to avoid rate limits
            with httpx.Client(timeout=3.0) as client:
                res = client.get(f"http://ip-api.com/json/{ip}")
                if res.status_code == 200:
                    data = res.json()
                    if data.get("status") == "success":
                        return {
                            "city": data.get("city", "Unknown"),
                            "state": data.get("regionName", "Unknown"),
                            "country": data.get("country", "Unknown"),
                            "timezone": data.get("timezone", "UTC")
                        }
        except Exception as e:
            print(f"IP Geolocation failed for {ip}: {e}")
        
        return {
            "city": "Unknown",
            "state": "Unknown",
            "country": "Unknown",
            "timezone": "UTC"
        }

    def create_session(self, user_id: str, request: Request, login_method: str) -> str:
        user_agent_string = request.headers.get("User-Agent", "")
        user_agent = parse(user_agent_string)
        
        device_type = "Desktop" if user_agent.is_pc else "Mobile" if user_agent.is_mobile else "Tablet" if user_agent.is_tablet else "Unknown"
        device_name = user_agent.device.family
        browser = user_agent.browser.family
        browser_version = user_agent.browser.version_string
        operating_system = user_agent.os.family
        operating_system_version = user_agent.os.version_string
        
        ip_address = self._get_client_ip(request)
        location = self._get_location_from_ip(ip_address)
        
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(
            minutes=settings.JWT_EXPIRE_MINUTES
        )
        
        query = """
            INSERT INTO public.user_sessions (
                user_id, device_type, device_name, browser, browser_version,
                operating_system, operating_system_version, user_agent,
                ip_address, city, state, country, timezone, login_method, expires_at
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            ) RETURNING session_id;
        """
        
        with self.conn.cursor() as cur:
            cur.execute(query, (
                user_id, device_type, device_name, browser, browser_version,
                operating_system, operating_system_version, user_agent_string,
                ip_address, location["city"], location["state"], location["country"],
                location["timezone"], login_method, expires_at
            ))
            session_id = cur.fetchone()[0]
            self.conn.commit()
            
        return str(session_id)

    def issue_refresh_token(self, session_id: str) -> str:
        token = secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE public.user_sessions
                SET refresh_token_hash=%s,
                    refresh_expires_at=NOW() + (%s * INTERVAL '1 day'),
                    expires_at=NOW() + (%s * INTERVAL '1 minute')
                WHERE session_id=%s AND is_revoked=FALSE
            """, (token_hash, settings.REFRESH_TOKEN_DAYS,
                  settings.JWT_EXPIRE_MINUTES, session_id))
            self.conn.commit()
        return token

    def rotate_refresh_token(self, refresh_token: str):
        token_hash = hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT s.session_id, s.user_id, s.last_active,
                       s.refresh_expires_at, u.*
                FROM public.user_sessions s
                JOIN public.users u ON u.id=s.user_id
                WHERE s.refresh_token_hash=%s
                  AND s.is_revoked=FALSE
                  AND s.refresh_expires_at > NOW()
                FOR UPDATE OF s
            """, (token_hash,))
            row = cur.fetchone()
            if not row:
                return None
            last_active = row["last_active"].replace(tzinfo=None)
            if datetime.datetime.utcnow() - last_active >= datetime.timedelta(
                minutes=settings.SESSION_INACTIVITY_MINUTES
            ):
                cur.execute("""
                    UPDATE public.user_sessions
                    SET is_revoked=TRUE, revoked_at=NOW(), refresh_token_hash=NULL
                    WHERE session_id=%s
                """, (row["session_id"],))
                self.conn.commit()
                return None
            new_token = secrets.token_urlsafe(48)
            new_hash = hashlib.sha256(new_token.encode("utf-8")).hexdigest()
            cur.execute("""
                UPDATE public.user_sessions
                SET refresh_token_hash=%s,
                    expires_at=NOW() + (%s * INTERVAL '1 minute')
                WHERE session_id=%s
            """, (new_hash, settings.JWT_EXPIRE_MINUTES, row["session_id"]))
            self.conn.commit()
            return row, new_token

    def record_activity(self, session_id: str) -> bool:
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE public.user_sessions
                SET last_active=NOW()
                WHERE session_id=%s AND is_revoked=FALSE
                  AND (refresh_expires_at IS NULL OR refresh_expires_at > NOW())
            """, (session_id,))
            self.conn.commit()
            return cur.rowcount > 0

    def verify_and_update_session(self, session_id: str) -> bool:
        """
        Verify if a session is valid. If valid, update last_active asynchronously if older than 5 minutes.
        Returns True if valid, False if invalid/revoked/expired.
        """
        if not session_id:
            return False
            
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT is_revoked, expires_at, last_active, login_time
                FROM public.user_sessions 
                WHERE session_id = %s
            """, (session_id,))
            session = cur.fetchone()
            
            if not session:
                return False
                
            if session["is_revoked"]:
                return False
                
            return True

    def get_active_sessions(self, user_id: str) -> list:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * 
                FROM public.user_sessions 
                WHERE user_id = %s AND is_revoked = FALSE
                  AND (
                    refresh_expires_at > NOW()
                    OR (refresh_expires_at IS NULL AND expires_at > NOW())
                  )
                ORDER BY last_active DESC
            """, (user_id,))
            return cur.fetchall()

    def revoke_session(self, session_id: str, user_id: str) -> bool:
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE public.user_sessions 
                SET is_revoked = TRUE, revoked_at=NOW(), refresh_token_hash=NULL
                WHERE session_id = %s AND user_id = %s
            """, (session_id, user_id))
            self.conn.commit()
            return cur.rowcount > 0

    def revoke_other_sessions(self, current_session_id: str, user_id: str) -> bool:
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE public.user_sessions 
                SET is_revoked = TRUE 
                WHERE user_id = %s AND session_id != %s AND is_revoked = FALSE
            """, (user_id, current_session_id))
            self.conn.commit()
            return True
