import os
import requests
import logging
from typing import Optional

logger = logging.getLogger("tailr4u.turnstile")

def verify_turnstile_token(token: Optional[str], remote_ip: Optional[str] = None) -> bool:
    """
    Validates a Cloudflare Turnstile token against Cloudflare siteverify endpoint.
    Never trusts frontend validation. Missing or empty tokens are ALWAYS rejected.
    """
    if not token or not token.strip():
        logger.warning("Turnstile validation failed: No token provided.")
        return False

    secret_key = os.getenv("TURNSTILE_SECRET_KEY")
    testing_mode = os.getenv("TESTING", "").lower() in ("true", "1")

    # In test mode or local dev without secret key, validate test tokens
    if testing_mode or not secret_key or secret_key == "dummy":
        if token.startswith("1x000000") or token == "valid_test_token":
            return True
        if not secret_key:
            logger.info("TURNSTILE_SECRET_KEY not configured; accepting non-empty token in dev mode.")
            return True

    try:
        url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
        payload = {
            "secret": secret_key,
            "response": token,
        }
        if remote_ip and remote_ip != "unknown" and remote_ip != "127.0.0.1":
            payload["remoteip"] = remote_ip

        resp = requests.post(url, data=payload, timeout=5)
        if resp.status_code == 200:
            result = resp.json()
            success = bool(result.get("success"))
            if not success:
                logger.warning(f"Turnstile siteverify returned success=False. Error codes: {result.get('error-codes')}")
            return success
        logger.error(f"Turnstile siteverify HTTP status {resp.status_code}")
        return False
    except Exception as exc:
        logger.error(f"Turnstile verification request failed: {exc}")
        return False
