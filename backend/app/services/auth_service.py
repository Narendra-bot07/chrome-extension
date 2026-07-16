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
        except Exception as e:
            raise ValueError(f"Invalid Google token: {str(e)}")

    def sync_google_user(self, idinfo: dict) -> dict:
        """
        Find existing user by google_sub or email, update or create accordingly.
        """
        google_sub = idinfo.get("sub")
        email = idinfo.get("email")
        full_name = idinfo.get("name", "")
        avatar_url = idinfo.get("picture", "")
        email_verified = idinfo.get("email_verified", False)

        if not google_sub or not email:
            raise ValueError("Incomplete Google user profile.")

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check by google_sub first
            cur.execute("SELECT * FROM public.users WHERE google_sub = %s", (google_sub,))
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
                # Check by email in case they signed up with email/password before
                cur.execute("SELECT * FROM public.users WHERE email = %s", (email,))
                user = cur.fetchone()

                if user:
                    # Link google sub to existing email account
                    cur.execute("""
                        UPDATE public.users 
                        SET google_sub = %s, provider = 'google', last_login = NOW(), 
                            avatar_url = COALESCE(avatar_url, %s), updated_at = NOW()
                        WHERE id = %s RETURNING *
                    """, (google_sub, avatar_url, user['id']))
                    user = cur.fetchone()
                else:
                    # Create completely new user
                    cur.execute("""
                        INSERT INTO public.users (google_sub, email, full_name, avatar_url, provider, email_verified, last_login)
                        VALUES (%s, %s, %s, %s, 'google', %s, NOW())
                        RETURNING *
                    """, (google_sub, email, full_name, avatar_url, email_verified))
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

    def generate_custom_jwt(self, user: dict) -> str:
        """
        Generate MY OWN JWT for the authenticated user.
        """
        token_payload = {
            "sub": str(user["id"]),
            "email": user["email"],
            "full_name": user.get("full_name", ""),
            "provider": user.get("provider", "email"),
            "exp": datetime.datetime.utcnow() + datetime.timedelta(days=7)
        }
        access_token = jwt.encode(token_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return access_token
