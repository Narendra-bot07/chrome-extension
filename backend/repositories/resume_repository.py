from psycopg2.extras import RealDictCursor
import json
from typing import Dict, Any, List, Optional

class ResumeRepository:
    def __init__(self, conn):
        self.conn = conn

    def create(self, user_id: str, file_path: str, file_name: str, file_size: int, file_type: str, parsed_content: Dict[str, Any]) -> Dict[str, Any]:
        query = """
            INSERT INTO public.resumes (user_id, file_path, file_name, file_size, file_type, parsed_content)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id, file_path, file_name, file_size, file_type, json.dumps(parsed_content)))
            record = cur.fetchone()
            
            # Increment count
            try:
                cur.execute("SELECT public.increment_resume_count(%s)", (user_id,))
            except Exception:
                # Ignore if the Postgres RPC does not exist
                pass
            self.conn.commit()
            return record or {}

    def get_by_id(self, resume_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (resume_id, user_id))
            return cur.fetchone()

    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        query = "SELECT * FROM public.resumes WHERE user_id = %s AND deleted_at IS NULL"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            return cur.fetchall()

    def soft_delete(self, resume_id: str, user_id: str) -> bool:
        with self.conn.cursor() as cur:
            try:
                cur.execute("SELECT public.soft_delete_resume(%s, %s)", (resume_id, user_id))
                success = cur.fetchone()[0]
            except Exception:
                # Fallback if RPC doesn't exist
                self.conn.rollback()
                cur.execute(
                    "UPDATE public.resumes SET deleted_at = NOW() WHERE id = %s AND user_id = %s RETURNING id",
                    (resume_id, user_id)
                )
                success = bool(cur.fetchone())
            self.conn.commit()
            return bool(success)
