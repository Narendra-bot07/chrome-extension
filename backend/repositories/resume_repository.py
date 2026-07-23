from psycopg2.extras import RealDictCursor
import json
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

logger = logging.getLogger("app")

class ResumeRepository:
    def __init__(self, conn):
        self.conn = conn

    def _with_metadata_defaults(self, record: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not record:
            return record

        normalized = dict(record)
        parsed_content = normalized.get("parsed_content") or {}
        if isinstance(parsed_content, str):
            try:
                parsed_content = json.loads(parsed_content)
            except Exception:
                parsed_content = {}

        times_used = normalized.get("times_used")
        tailor_count = normalized.get("tailor_count")
        normalized["times_used"] = times_used if times_used is not None else (tailor_count or 0)
        normalized["tailor_count"] = tailor_count if tailor_count is not None else (times_used or 0)
        normalized["last_used_at"] = normalized.get("last_used_at")
        normalized["upload_source"] = normalized.get("upload_source") or "user_upload"
        normalized["parsing_status"] = (
            normalized.get("parsing_status")
            or parsed_content.get("parse_status")
            or parsed_content.get("parsing_status")
            or "unknown"
        )
        return normalized

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
            
            # The optional profile counter must never roll back the durable
            # resume insert. PostgreSQL keeps a transaction aborted after any
            # statement error, so isolate this call behind a savepoint.
            cur.execute("SAVEPOINT resume_count_increment")
            try:
                cur.execute("SELECT public.increment_resume_count(%s)", (user_id,))
                cur.execute("RELEASE SAVEPOINT resume_count_increment")
            except Exception as exc:
                cur.execute("ROLLBACK TO SAVEPOINT resume_count_increment")
                cur.execute("RELEASE SAVEPOINT resume_count_increment")
                logger.warning(
                    "[RESUME][BACKEND] Optional resume counter update skipped "
                    "user_id=%s error=%s",
                    user_id,
                    str(exc),
                )
            self.conn.commit()
            created = self._with_metadata_defaults(record) or {}
            logger.info(
                "[RESUME][BACKEND] Resume database record committed "
                "user_id=%s resume_id=%s file_name=%s active=%s",
                user_id,
                created.get("id"),
                created.get("file_name"),
                created.get("is_active"),
            )
            return created

    def get_by_id(self, resume_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM public.resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (resume_id, user_id))
            return self._with_metadata_defaults(cur.fetchone())

    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT *
            FROM public.resumes
            WHERE user_id = %s AND deleted_at IS NULL
            ORDER BY is_active DESC, created_at DESC
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            return [self._with_metadata_defaults(record) for record in cur.fetchall()]

    def all_file_paths(self, user_id: str) -> set[str]:
        """Return all known paths, including soft-deleted rows, for safe recovery."""
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT file_path FROM public.resumes WHERE user_id = %s",
                (user_id,),
            )
            return {row[0] for row in cur.fetchall() if row and row[0]}

    def recover_local_file(
        self,
        user_id: str,
        file_path: str,
        file_name: str,
        file_size: int,
        file_type: str,
        parsed_content: Dict[str, Any],
        uploaded_at: datetime,
    ) -> Optional[Dict[str, Any]]:
        """Register one orphaned local file without disturbing active state."""
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT id FROM public.resumes WHERE user_id = %s AND file_path = %s",
                (user_id, file_path),
            )
            if cur.fetchone():
                return None
            cur.execute(
                """
                INSERT INTO public.resumes (
                    user_id, file_path, file_name, file_size, file_type,
                    parsed_content, is_active, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, FALSE, %s, %s)
                RETURNING *
                """,
                (
                    user_id,
                    file_path,
                    file_name,
                    file_size,
                    file_type,
                    json.dumps(parsed_content),
                    uploaded_at,
                    uploaded_at,
                ),
            )
            record = cur.fetchone()
            self.conn.commit()
            return self._with_metadata_defaults(record)

    def get_active(self, user_id: str) -> Optional[Dict[str, Any]]:
        query = """
            SELECT *
            FROM public.resumes
            WHERE user_id = %s AND deleted_at IS NULL AND is_active = TRUE
            ORDER BY created_at DESC
            LIMIT 1
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            return self._with_metadata_defaults(cur.fetchone())

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
            return self._with_metadata_defaults(record)

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

    def mark_used(self, resume_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = """
            UPDATE public.resumes
            SET last_used_at = NOW(),
                times_used = COALESCE(times_used, 0) + 1,
                tailor_count = COALESCE(tailor_count, 0) + 1,
                updated_at = NOW()
            WHERE id = %s AND user_id = %s AND deleted_at IS NULL AND is_active = TRUE
            RETURNING *,
                      COALESCE(times_used, tailor_count, 0) AS times_used,
                      COALESCE(tailor_count, times_used, 0) AS tailor_count
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            try:
                cur.execute(query, (resume_id, user_id))
                record = cur.fetchone()
                self.conn.commit()
                return self._with_metadata_defaults(record)
            except Exception:
                self.conn.rollback()
                return self.get_by_id(resume_id, user_id)
