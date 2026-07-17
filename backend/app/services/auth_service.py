import os
from google.oauth2 import id_token
from google.auth.transport import requests
from core.config import settings
from psycopg2.extras import RealDictCursor
import datetime
import jwt

class AuthService:
    def __init__(self, conn):
        self.conn = conn

    def verify_google_token(self, credential: str) -> dict:
        """
        Verify the Google ID token and return user info.
        """
        client_id = os.getenv("GOOGLE_CLIENT_ID")
        if not client_id:
            raise ValueError("GOOGLE_CLIENT_ID is not configured.")
        
        try:
            idinfo = id_token.verify_oauth2_token(credential, requests.Request(), client_id)
            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                raise ValueError('Wrong issuer.')
            return idinfo
        except Exception:
            # Fallback for access token (e.g., from useGoogleLogin in Chrome Extensions)
            import requests as req
            resp = req.get('https://www.googleapis.com/oauth2/v3/userinfo', headers={'Authorization': f'Bearer {credential}'})
            if resp.status_code == 200:
                return resp.json()
            raise ValueError("Invalid Google credential (neither ID token nor access token).")

    def sync_oauth_user(self, provider: str, provider_user_id: str, email: str, full_name: str, avatar_url: str, email_verified: bool) -> dict:
        """
        Find existing user by provider_user_id or email, update or create accordingly.
        """
        if not provider_user_id or not email:
            raise ValueError(f"Incomplete {provider} user profile.")

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check by provider_user_id first
            cur.execute("SELECT * FROM public.users WHERE provider_user_id = %s", (provider_user_id,))
            user = cur.fetchone()

            if user:
                # Update last_login, etc.
                cur.execute("""
                    UPDATE public.users 
                    SET last_login = NOW(), full_name = %s, avatar_url = %s, updated_at = NOW()
                    WHERE id = %s RETURNING *
                """, (full_name, avatar_url, user['id']))
                user = cur.fetchone()
            else:
                # Check by email in case they signed up with email/password or another provider before
                cur.execute("SELECT * FROM public.users WHERE email = %s", (email,))
                user = cur.fetchone()

                if user:
                    # Link oauth provider to existing email account
                    cur.execute("""
                        UPDATE public.users 
                        SET provider_user_id = %s, provider = %s, last_login = NOW(), 
                            avatar_url = COALESCE(avatar_url, %s), updated_at = NOW()
                        WHERE id = %s RETURNING *
                    """, (provider_user_id, provider, avatar_url, user['id']))
                    user = cur.fetchone()
                else:
                    # Create completely new user
                    cur.execute("""
                        INSERT INTO public.users (provider_user_id, email, full_name, avatar_url, provider, email_verified, last_login)
                        VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        RETURNING *
                    """, (provider_user_id, email, full_name, avatar_url, provider, email_verified))
                    user = cur.fetchone()

            # Ensure public.profiles is seeded for compatibility with old architecture
            cur.execute("SELECT id FROM public.profiles WHERE id = %s", (user["id"],))
            if not cur.fetchone():
                cur.execute(
                    "INSERT INTO public.profiles (id, email, full_name) VALUES (%s, %s, %s)",
                    (user["id"], user["email"], user["full_name"])
                )

            self.conn.commit()
            return user

    def generate_custom_jwt(self, user: dict, session_id: str) -> str:
        """
        Generate MY OWN JWT for the authenticated user.
        """
        created_at_val = user.get("created_at")
        if isinstance(created_at_val, datetime.datetime):
            created_at_val = created_at_val.isoformat()
        elif not created_at_val:
            created_at_val = datetime.datetime.utcnow().isoformat()
            
        token_payload = {
            "sub": str(user["id"]),
            "email": user["email"],
            "full_name": user.get("full_name", ""),
            "provider": user.get("provider", "email"),
            "created_at": created_at_val,
            "jti": session_id,
            "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
        }
        access_token = jwt.encode(token_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return access_token
