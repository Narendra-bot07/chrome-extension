from psycopg2.extras import RealDictCursor
import json
from typing import Dict, Any, List, Optional

class TailoringRepository:
    def __init__(self, conn):
        self.conn = conn

    def create_tailored(self, user_id: str, original_resume_id: str, job_description_id: str, tailored_content: Dict[str, Any], ats_score: float) -> Dict[str, Any]:
        query = """
            INSERT INTO public.tailored_resumes (user_id, original_resume_id, job_description_id, tailored_content, ats_score)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (
                user_id,
                original_resume_id,
                job_description_id,
                json.dumps(tailored_content),
                ats_score
            ))
            record = cur.fetchone()
            
            # Save first version of the tailored resume
            if record:
                tailored_resume_id = record["id"]
                self._create_version_internal(
                    cur, tailored_resume_id, tailored_content, "Initial tailoring generation",
                    resume_id=original_resume_id,
                )
            
            self.conn.commit()
            return record or {}

    def get_tailored_by_id(self, tailored_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM public.tailored_resumes WHERE id = %s AND user_id = %s AND deleted_at IS NULL"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (tailored_id, user_id))
            return cur.fetchone()

    def update_file_path(self, tailored_id: str, file_path: str) -> Dict[str, Any]:
        query = "UPDATE public.tailored_resumes SET file_path = %s WHERE id = %s RETURNING *"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (file_path, tailored_id))
            self.conn.commit()
            return cur.fetchone() or {}

    def _create_version_internal(
        self, cur, tailored_resume_id: str, content: Dict[str, Any], changes_summary: str,
        resume_id: Optional[str] = None,
    ):
        # resume_id links this row back into the ORIGINAL resume's version
        # family so ResumeRepository.list_versions (which filters on
        # resume_versions.resume_id) can actually find tailored versions --
        # without it, this row was only reachable via tailored_resume_id,
        # invisible to the Resume Manager's "All Versions" view even though
        # a tailoring had genuinely just been created. version_number is left
        # for the tr_increment_resume_version trigger to compute from
        # resume_id's existing version family.
        query = """
            INSERT INTO public.resume_versions (tailored_resume_id, content, changes_summary, resume_id, version_type)
            VALUES (%s, %s, %s, %s, 'tailored')
        """
        cur.execute(query, (tailored_resume_id, json.dumps(content), changes_summary, resume_id))

    def create_version(self, tailored_resume_id: str, content: Dict[str, Any], changes_summary: str) -> Dict[str, Any]:
        query = """
            INSERT INTO public.resume_versions (tailored_resume_id, content, changes_summary)
            VALUES (%s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (tailored_resume_id, json.dumps(content), changes_summary))
            self.conn.commit()
            return cur.fetchone() or {}

    def get_versions(self, tailored_resume_id: str) -> List[Dict[str, Any]]:
        query = "SELECT * FROM public.resume_versions WHERE tailored_resume_id = %s ORDER BY version_number DESC"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (tailored_resume_id,))
            return cur.fetchall()

    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        query = """
            SELECT t.*, j.company_name, j.job_title 
            FROM public.tailored_resumes t
            LEFT JOIN public.job_descriptions j ON t.job_description_id = j.id
            WHERE t.user_id = %s AND t.deleted_at IS NULL 
            ORDER BY t.created_at DESC
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            return cur.fetchall()
