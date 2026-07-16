import datetime
import httpx
from fastapi import Request
from user_agents import parse
from psycopg2.extras import RealDictCursor
import threading

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
        
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)
        
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

    def verify_and_update_session(self, session_id: str) -> bool:
        """
        Verify if a session is valid. If valid, update last_active asynchronously if older than 5 minutes.
        Returns True if valid, False if invalid/revoked/expired.
        """
        if not session_id:
            return False
            
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT is_revoked, expires_at, last_active 
                FROM public.user_sessions 
                WHERE session_id = %s
            """, (session_id,))
            session = cur.fetchone()
            
            if not session:
                return False
                
            if session["is_revoked"]:
                return False
                
            if session["expires_at"] and session["expires_at"].replace(tzinfo=None) < datetime.datetime.utcnow():
                return False

            # Throttle last_active update to every 5 minutes
            last_active = session["last_active"].replace(tzinfo=None)
            if datetime.datetime.utcnow() - last_active > datetime.timedelta(minutes=5):
                # Update synchronously for simplicity, but could be pushed to a queue
                cur.execute("""
                    UPDATE public.user_sessions 
                    SET last_active = NOW() 
                    WHERE session_id = %s
                """, (session_id,))
                self.conn.commit()
                
            return True

    def get_active_sessions(self, user_id: str) -> list:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("""
                SELECT * 
                FROM public.user_sessions 
                WHERE user_id = %s AND is_revoked = FALSE
                ORDER BY last_active DESC
            """, (user_id,))
            return cur.fetchall()

    def revoke_session(self, session_id: str, user_id: str) -> bool:
        with self.conn.cursor() as cur:
            cur.execute("""
                UPDATE public.user_sessions 
                SET is_revoked = TRUE 
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
