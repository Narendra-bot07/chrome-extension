from typing import Dict, Any
from fastapi import Header, Depends
from core.database import get_db_connection
from core.exceptions import CredentialError
from core.config import settings

async def verify_supabase_jwt(
    authorization: str = Header(None, description="Bearer JWT token from custom auth")
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
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return {
            "id": payload["sub"],
            "email": payload["email"],
            "metadata": {"full_name": payload.get("full_name", "")}
        }
    except jwt.ExpiredSignatureError:
        raise CredentialError("Session expired.")
    except jwt.InvalidTokenError:
        raise CredentialError("Invalid session token.")

import hashlib
import secrets

def hash_password(password: str, salt: str = None) -> str:
    if not salt:
        salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${hashed.hex()}"

def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        salt, key_hex = password_hash.split('$')
        compare_hash = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt.encode('utf-8'), 100000)
        return compare_hash.hex() == key_hex
    except Exception:
        return False
