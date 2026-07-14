from typing import Dict, Any
from core.exceptions import CredentialError

class JWTService:
    @staticmethod
    def decode_token(token: str) -> Dict[str, Any]:
        # Token validation is handled directly by Supabase client in security.py
        # This service provides token layout parsing
        if not token:
            raise CredentialError("Session token is empty.")
        return {"jwt": token}
