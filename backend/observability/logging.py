import json
import logging
import re
import sys
from datetime import datetime
from typing import Any, Dict, Union
from observability.config import LOG_LEVEL, LOG_FORMAT, APP_ENV, APP_RELEASE, SERVICE_NAME
from observability.context import get_request_id, get_trace_id

SENSITIVE_KEYS = {
    "password", "access_token", "refresh_token", "cookie", "authorization",
    "supabase_service_role_key", "signed_url", "deepseek_api_key", "email",
    "phone", "payment_details", "api_key", "resume", "job_description",
    "cover_letter", "prompt", "response", "text", "email_address",
    "phone_number", "bearer_token", "client_secret"
}
# Compound keys (contain "_") are intentionally specific phrases and stay
# substring-matched. Single-word keys must match a whole underscore/case
# token — plain substring matching let short common words like "text" match
# unrelated keys that merely contain those letters (e.g. Sentry's own
# "contexts" field, which then breaks the Sentry SDK when its value gets
# replaced with the literal string "[REDACTED]" instead of the dict it
# expects).
_COMPOUND_SENSITIVE_KEYS = {key for key in SENSITIVE_KEYS if "_" in key}
_SINGLE_WORD_SENSITIVE_KEYS = {key for key in SENSITIVE_KEYS if "_" not in key}


def _key_is_sensitive(key: str) -> bool:
    lowered = key.lower()
    if any(compound in lowered for compound in _COMPOUND_SENSITIVE_KEYS):
        return True
    tokens = re.split(r"[^a-z0-9]+", lowered)
    return any(token in _SINGLE_WORD_SENSITIVE_KEYS for token in tokens if token)

def redact_sensitive_data(data: Any) -> Any:
    """Recursively redact keys matching sensitive strings."""
    if isinstance(data, dict):
        return {
            k: (
                "[REDACTED]"
                if _key_is_sensitive(k)
                else redact_sensitive_data(v)
            )
            for k, v in data.items()
        }
    elif isinstance(data, list):
        return [redact_sensitive_data(item) for item in data]
    elif isinstance(data, str):
        # Additional regex/check to ensure email is not logged
        if "@" in data and len(data) < 100:
            if re.match(r"[^@]+@[^@]+\.[^@]+", data.strip()):
                return "[REDACTED_EMAIL]"
    return data

class JSONFormatter(logging.Formatter):
    """Custom Formatter to serialize logs as JSON objects."""
    def format(self, record: logging.LogRecord) -> str:
        log_data: Dict[str, Any] = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "service": SERVICE_NAME,
            "environment": APP_ENV,
            "release": APP_RELEASE,
            "request_id": get_request_id() or "",
            "trace_id": get_trace_id() or "",
            "message": redact_sensitive_data(record.getMessage())
        }

        # Include traceback details on warning or error
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Include custom properties passed via extra={...}
        if hasattr(record, "extra_info"):
            log_data["extra_info"] = redact_sensitive_data(record.extra_info)
        elif hasattr(record, "__dict__"):
            # Check for other custom extra keys
            custom_extra = {}
            for k, v in record.__dict__.items():
                if k not in {
                    "args", "asctime", "created", "exc_info", "exc_text", "filename",
                    "funcName", "levelname", "levelno", "lineno", "module", "msecs",
                    "msg", "name", "pathname", "process", "processName", "relativeCreated",
                    "stack_info", "thread", "threadName"
                }:
                    custom_extra[k] = v
            if custom_extra:
                log_data["extra_info"] = redact_sensitive_data(custom_extra)

        return json.dumps(log_data)

def setup_observability_logging():
    """Configure system-wide structured JSON logging."""
    root = logging.getLogger()
    
    # Remove existing handlers
    for handler in root.handlers[:]:
        root.removeHandler(handler)
        
    handler = logging.StreamHandler(sys.stdout)
    if LOG_FORMAT.lower() == "json":
        handler.setFormatter(JSONFormatter())
    else:
        # Standard readable fallback for local developers
        handler.setFormatter(logging.Formatter(
            '[%(asctime)s] [%(levelname)s] [ReqID: %(request_id)s] %(message)s'
        ))
        
    root.addHandler(handler)
    
    # Map configured log levels
    level_map = {
        "DEBUG": logging.DEBUG,
        "INFO": logging.INFO,
        "WARNING": logging.WARNING,
        "ERROR": logging.ERROR,
        "CRITICAL": logging.CRITICAL
    }
    level = level_map.get(LOG_LEVEL.upper(), logging.INFO)
    root.setLevel(level)

# Instantiate application logger
logger = logging.getLogger("tailr4u-api")
