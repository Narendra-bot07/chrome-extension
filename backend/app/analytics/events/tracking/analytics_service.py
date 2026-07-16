import json
from typing import Dict, Any, Optional
from psycopg2.extras import RealDictCursor
import logging

logger = logging.getLogger(__name__)

class AnalyticsService:
    """
    Centralized Event Tracking Service.
    Responsible for logging business events reliably into the `user_events` table.
    """
    
    def __init__(self, conn):
        self.conn = conn

    def emit_event(
        self,
        user_id: str,
        event_type: str,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
        device_id: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> bool:
        """
        Emits a single event to the database. Does not crash the calling function if it fails.
        """
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                query = """
                    INSERT INTO public.user_events 
                    (user_id, event_type, resource_type, resource_id, metadata, session_id, device_id, ip_address)
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s, %s)
                """
                cur.execute(query, (
                    user_id,
                    event_type,
                    resource_type,
                    resource_id,
                    json.dumps(metadata) if metadata else '{}',
                    session_id,
                    device_id,
                    ip_address
                ))
                self.conn.commit()
                return True
        except Exception as e:
            # We explicitly catch exception to not disrupt business flows
            logger.error(f"Failed to emit event {event_type} for user {user_id}: {str(e)}")
            self.conn.rollback()
            return False
