import os
from google.oauth2 import id_token
from google.auth.transport import requests
from core.config import settings
from psycopg2.extras import RealDictCursor
import datetime
import jwt
import logging

logger = logging.getLogger(__name__)

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
                identity = resp.json()
                identity["tailorflow_profile"] = self._fetch_google_people_profile(credential)
                return identity
            raise ValueError("Invalid Google credential (neither ID token nor access token).")

    def _fetch_google_people_profile(self, access_token: str) -> dict:
        """Best-effort People API enrichment. Missing scopes/data are non-fatal."""
        import requests as req

        fields = (
            "names,nicknames,birthdays,genders,phoneNumbers,addresses,locales,"
            "organizations,urls,photos"
        )
        try:
            response = req.get(
                "https://people.googleapis.com/v1/people/me",
                params={"personFields": fields},
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=8,
            )
            if response.status_code != 200:
                error_payload = response.json() if "json" in response.headers.get("content-type", "") else {}
                error_message = (
                    error_payload.get("error", {}).get("message")
                    or f"People API returned HTTP {response.status_code}"
                )
                logger.info(
                    "Google People API optional enrichment skipped: status=%s reason=%s",
                    response.status_code,
                    error_message,
                )
                return {
                    "_import_status": "failed",
                    "_import_http_status": response.status_code,
                    "_import_error": error_message,
                }
            person = response.json()

            def primary(items):
                values = items or []
                return next(
                    (item for item in values if item.get("metadata", {}).get("primary")),
                    values[0] if values else {},
                )

            name = primary(person.get("names"))
            nickname = primary(person.get("nicknames"))
            birthday = primary(person.get("birthdays")).get("date", {})
            phone = primary(person.get("phoneNumbers"))
            address = primary(person.get("addresses"))
            organization = primary(person.get("organizations"))
            locale = primary(person.get("locales")).get("value", "")
            urls = person.get("urls") or []

            date_of_birth = ""
            if birthday.get("year") and birthday.get("month") and birthday.get("day"):
                date_of_birth = (
                    f"{birthday['year']:04d}-{birthday['month']:02d}-{birthday['day']:02d}"
                )

            links = {}
            for item in urls:
                value = item.get("value", "")
                lowered = value.lower()
                if "linkedin.com" in lowered:
                    links["linkedin_url"] = value
                elif "github.com" in lowered:
                    links["github_url"] = value
                elif value and "website_url" not in links:
                    links["website_url"] = value

            canonical_phone = phone.get("canonicalForm") or phone.get("value", "")
            country_code = ""
            phone_number = canonical_phone
            if canonical_phone.startswith("+") and " " in canonical_phone:
                country_code, phone_number = canonical_phone.split(" ", 1)

            enriched = {
                "first_name": name.get("givenName", ""),
                "last_name": name.get("familyName", ""),
                "preferred_name": nickname.get("value", ""),
                "date_of_birth": date_of_birth,
                "gender": primary(person.get("genders")).get("value", ""),
                "phone_country_code": country_code,
                "phone_number": phone_number,
                "country": address.get("country", ""),
                "state": address.get("region", ""),
                "city": address.get("city", ""),
                "preferred_language": locale,
                "current_title": organization.get("title", ""),
                **links,
            }
            populated = sorted(key for key, value in enriched.items() if value)
            enriched["_import_status"] = "success"
            enriched["_populated_fields"] = populated
            logger.info("Google People API enrichment populated fields: %s", populated)
            return enriched
        except Exception as exc:
            logger.info("Google People API enrichment skipped: %s", exc)
            return {
                "_import_status": "failed",
                "_import_error": str(exc),
            }

    def sync_oauth_user(
        self,
        provider: str,
        provider_user_id: str,
        email: str,
        full_name: str,
        avatar_url: str,
        email_verified: bool,
        first_name: str = "",
        last_name: str = "",
        locale: str = "",
        profile_details: dict | None = None,
    ) -> dict:
        """
        Find existing user by provider_user_id or email, update or create accordingly.
        """
        if not provider_user_id or not email:
            raise ValueError(f"Incomplete {provider} user profile.")
        details = profile_details or {}

        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Check by provider_user_id first
            cur.execute("SELECT * FROM public.users WHERE provider_user_id = %s", (provider_user_id,))
            user = cur.fetchone()

            if user:
                # Authentication metadata may refresh; confirmed profile fields must not.
                cur.execute("""
                    UPDATE public.users 
                    SET last_login = NOW(),
                        full_name = COALESCE(NULLIF(full_name, ''), %s),
                        avatar_url = %s,
                        locale = COALESCE(NULLIF(locale, ''), %s),
                        email_verified = email_verified OR %s,
                        email_verified_at = CASE
                            WHEN email_verified_at IS NULL AND %s THEN NOW()
                            ELSE email_verified_at
                        END,
                        updated_at = NOW()
                    WHERE id = %s RETURNING *
                """, (full_name, avatar_url, locale, email_verified, email_verified, user['id']))
                user = cur.fetchone()
            else:
                # Check by email in case they signed up with email/password or another provider before
                cur.execute("SELECT * FROM public.users WHERE email = %s", (email,))
                user = cur.fetchone()

                if user:
                    if not email_verified:
                        raise ValueError(
                            "This email is already associated with an account and cannot "
                            "be linked until Google verifies it."
                        )
                    # Link oauth provider to existing email account
                    cur.execute("""
                        UPDATE public.users 
                        SET provider_user_id = %s, provider = %s, last_login = NOW(), 
                            auth_provider = %s,
                            avatar_url = COALESCE(NULLIF(avatar_url, ''), %s),
                            email_verified = TRUE,
                            email_verified_at = COALESCE(email_verified_at, NOW()),
                            locale = COALESCE(NULLIF(locale, ''), %s),
                            updated_at = NOW()
                        WHERE id = %s RETURNING *
                    """, (provider_user_id, provider, provider, avatar_url, locale, user['id']))
                    user = cur.fetchone()
                else:
                    # Create completely new user
                    cur.execute("""
                        INSERT INTO public.users (
                            provider_user_id, email, full_name, avatar_url, provider,
                            auth_provider, has_password_credential, email_verified,
                            email_verified_at, locale, last_login
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, FALSE, %s,
                                CASE WHEN %s THEN NOW() ELSE NULL END, %s, NOW())
                        RETURNING *
                    """, (
                        provider_user_id, email, full_name, avatar_url, provider,
                        provider, email_verified, email_verified, locale
                    ))
                    user = cur.fetchone()

            cur.execute("SELECT * FROM public.profiles WHERE id = %s", (user["id"],))
            profile = cur.fetchone()
            if not profile:
                cur.execute(
                    """
                    INSERT INTO public.profiles (
                        id, email, full_name, first_name, last_name,
                        google_profile_image_url, avatar_url, profile_image_source,
                        preferred_language, preferred_name, date_of_birth, gender,
                        phone_country_code, phone_number, country, state, city,
                        current_title, linkedin_url, github_url, website_url
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'google', NULLIF(%s, ''), NULLIF(%s, ''),
                            NULLIF(%s, '')::date, NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''),
                            NULLIF(%s, ''), NULLIF(%s, ''), NULLIF(%s, ''))
                    """,
                    (
                        user["id"], user["email"], full_name,
                        details.get("first_name") or first_name,
                        details.get("last_name") or last_name,
                        avatar_url, avatar_url,
                        details.get("preferred_language") or locale,
                        details.get("preferred_name", ""),
                        details.get("date_of_birth", ""),
                        details.get("gender", ""),
                        details.get("phone_country_code", ""),
                        details.get("phone_number", ""),
                        details.get("country", ""),
                        details.get("state", ""),
                        details.get("city", ""),
                        details.get("current_title", ""),
                        details.get("linkedin_url", ""),
                        details.get("github_url", ""),
                        details.get("website_url", ""),
                    )
                )
            else:
                cur.execute(
                    """
                    UPDATE public.profiles
                    SET full_name = CASE
                            WHEN profile_confirmed_at IS NULL AND COALESCE(full_name, '') = ''
                            THEN %s ELSE full_name END,
                        first_name = CASE
                            WHEN profile_confirmed_at IS NULL AND COALESCE(first_name, '') = ''
                            THEN %s ELSE first_name END,
                        last_name = CASE
                            WHEN profile_confirmed_at IS NULL AND COALESCE(last_name, '') = ''
                            THEN %s ELSE last_name END,
                        google_profile_image_url = %s,
                        avatar_url = CASE
                            WHEN uploaded_profile_image_url IS NULL THEN %s ELSE avatar_url END,
                        profile_image_source = CASE
                            WHEN uploaded_profile_image_url IS NULL AND %s <> '' THEN 'google'
                            ELSE profile_image_source END,
                        preferred_language = CASE
                            WHEN profile_confirmed_at IS NULL
                                 AND COALESCE(preferred_language, '') = ''
                            THEN %s ELSE preferred_language END,
                        preferred_name = COALESCE(NULLIF(preferred_name, ''), NULLIF(%s, '')),
                        date_of_birth = COALESCE(
                            date_of_birth, NULLIF(%s, '')::date
                        ),
                        gender = COALESCE(NULLIF(gender, ''), NULLIF(%s, '')),
                        phone_country_code = COALESCE(NULLIF(phone_country_code, ''), NULLIF(%s, '')),
                        phone_number = COALESCE(NULLIF(phone_number, ''), NULLIF(%s, '')),
                        country = COALESCE(NULLIF(country, ''), NULLIF(%s, '')),
                        state = COALESCE(NULLIF(state, ''), NULLIF(%s, '')),
                        city = COALESCE(NULLIF(city, ''), NULLIF(%s, '')),
                        current_title = COALESCE(NULLIF(current_title, ''), NULLIF(%s, '')),
                        linkedin_url = COALESCE(NULLIF(linkedin_url, ''), NULLIF(%s, '')),
                        github_url = COALESCE(NULLIF(github_url, ''), NULLIF(%s, '')),
                        website_url = COALESCE(NULLIF(website_url, ''), NULLIF(%s, '')),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        full_name, first_name, last_name, avatar_url, avatar_url,
                        avatar_url, details.get("preferred_language") or locale,
                        details.get("preferred_name", ""),
                        details.get("date_of_birth", ""),
                        details.get("gender", ""),
                        details.get("phone_country_code", ""),
                        details.get("phone_number", ""),
                        details.get("country", ""),
                        details.get("state", ""),
                        details.get("city", ""),
                        details.get("current_title", ""),
                        details.get("linkedin_url", ""),
                        details.get("github_url", ""),
                        details.get("website_url", ""),
                        user["id"]
                    )
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
            
        issued_at = datetime.datetime.utcnow()
        token_payload = {
            "sub": str(user["id"]),
            "email": user["email"],
            "full_name": user.get("full_name", ""),
            "provider": user.get("provider", "email"),
            "created_at": created_at_val,
            "jti": session_id,
            "iat": issued_at,
            "exp": issued_at + datetime.timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
        }
        access_token = jwt.encode(token_payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return access_token
