from psycopg2.extras import RealDictCursor
import json
from typing import Dict, Any, List, Optional

class ResumeRepository:
    def __init__(self, conn):
        self.conn = conn

    def create(self, user_id: str, file_path: str, file_name: str, file_size: int, file_type: str, parsed_content: Dict[str, Any]) -> Dict[str, Any]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "UPDATE public.resumes SET is_active = FALSE WHERE user_id = %s AND deleted_at IS NULL",
                (user_id,)
            )
            query = """
                INSERT INTO public.resumes (user_id, file_path, file_name, file_size, file_type, parsed_content, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, TRUE)
                RETURNING *
            """
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
        query = """
            SELECT *
            FROM public.resumes
            WHERE user_id = %s AND deleted_at IS NULL
            ORDER BY is_active DESC, created_at DESC
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            return cur.fetchall()

    def activate(self, resume_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL",
                (resume_id, user_id)
            )
            if not cur.fetchone():
                return None
            cur.execute(
                "UPDATE public.resumes SET is_active = FALSE WHERE user_id = %s AND deleted_at IS NULL",
                (user_id,)
            )
            cur.execute(
                """
                UPDATE public.resumes
                SET is_active = TRUE
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                RETURNING *
                """,
                (resume_id, user_id)
            )
            record = cur.fetchone()
            self.conn.commit()
            return record

    def soft_delete(self, resume_id: str, user_id: str) -> bool:
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT is_active FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL",
                (resume_id, user_id)
            )
            target = cur.fetchone()
            if not target:
                return False
            was_active = bool(target.get("is_active"))
            cur.execute(
                """
                UPDATE public.resumes
                SET deleted_at = NOW(), is_active = FALSE
                WHERE id = %s AND user_id = %s AND deleted_at IS NULL
                RETURNING id
                """,
                (resume_id, user_id)
            )
            success = bool(cur.fetchone())
            if success and was_active:
                cur.execute("""
                    UPDATE public.resumes
                    SET is_active = TRUE
                    WHERE id = (
                        SELECT id
                        FROM public.resumes
                        WHERE user_id = %s AND deleted_at IS NULL
                        ORDER BY created_at DESC
                        LIMIT 1
                    )
                """, (user_id,))
            self.conn.commit()
            return bool(success)

    def update_parsed_content(self, resume_id: str, user_id: str, parsed_content: Dict[str, Any]) -> bool:
        query = """
            UPDATE public.resumes 
            SET parsed_content = %s 
            WHERE id = %s AND user_id = %s AND deleted_at IS NULL
            RETURNING id
        """
        with self.conn.cursor() as cur:
            cur.execute(query, (json.dumps(parsed_content), resume_id, user_id))
            self.conn.commit()
            return bool(cur.fetchone())
