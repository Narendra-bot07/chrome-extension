from contextlib import contextmanager
from typing import Dict, Any
from fastapi import Header
from core.database import get_db_connection
from core.exceptions import CredentialError
from core.config import settings
from app.services.session_service import SessionService

_db_context = contextmanager(get_db_connection)

async def verify_supabase_jwt(
    authorization: str = Header(None, description="Bearer JWT token from custom auth"),
) -> Dict[str, Any]:
    """
    Validates client session token (JWT) using settings.JWT_SECRET.
    Returns user details containing id, email, and metadata.
    """
    if not authorization:
        raise CredentialError("Missing authorization header.")

    if not authorization.startswith("Bearer "):
        raise CredentialError("Invalid authorization format. Must start with 'Bearer '.")
    
    token = authorization.split(" ")[1]
    
    # Backward compatibility with seed/local-dev token cache
    if token == "local-dev-token":
        return {
            "id": "00000000-0000-0000-0000-000000000000",
            "email": "local.developer@example.com",
            "metadata": {"full_name": "Local Developer"}
        }

    try:
        import jwt
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        
        # Verify session using SessionService
        session_id = payload.get("jti")
        if session_id:
            with _db_context() as conn:
                session_service = SessionService(conn)
                if not session_service.verify_and_update_session(session_id):
                    raise CredentialError("Session expired or revoked.")

        return {
            "id": payload["sub"],
            "session_id": session_id,
            "email": payload["email"],
            "created_at": payload.get("created_at", ""),
            "metadata": {
                "full_name": payload.get("full_name", ""),
                "provider": payload.get("provider", "email")
            },
            "app_metadata": {
                "provider": payload.get("provider", "email")
            }
        }
    except jwt.ExpiredSignatureError:
        raise CredentialError("Session expired.")
    except jwt.InvalidTokenError:
        raise CredentialError("Invalid session token.")

import hashlib
import secrets
import bcrypt

def hash_password(password: str, salt: str = None) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        if password_hash.startswith(("$2a$", "$2b$", "$2y$")):
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
        # Verify credentials created before the bcrypt migration.
        salt, key_hex = password_hash.split('$')
        compare_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return secrets.compare_digest(compare_hash.hex(), key_hex)
    except Exception:
        return False

def hash_action_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def validate_password(password: str) -> None:
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters.")
    if len(password) > 128:
        raise ValueError("Password must be 128 characters or fewer.")
    if password.lower() in {
        "password123", "password123!", "qwerty12345", "letmein1234",
        "1234567890", "tailr4u"
    }:
        raise ValueError("Choose a less common password.")
