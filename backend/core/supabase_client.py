import threading

from core.config import settings
from core.logging import logger

_supabase_client = None
_client_lock = threading.Lock()


def get_supabase_client():
    """
    Lazily create a singleton Supabase client for storage/service-role
    operations. Returns None when Supabase credentials are not configured,
    so callers (e.g. get_storage_service) can fall back to alternate
    behavior instead of failing outright.
    """
    global _supabase_client
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        return None
    if _supabase_client is None:
        with _client_lock:
            if _supabase_client is None:
                from supabase import create_client
                logger.info("[SUPABASE_CLIENT] Initializing Supabase service-role client...")
                _supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _supabase_client
