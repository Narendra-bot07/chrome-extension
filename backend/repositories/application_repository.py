from psycopg2.extras import RealDictCursor
import json
from typing import Dict, Any, List, Optional

class ApplicationRepository:
    def __init__(self, conn):
        self.conn = conn

    def create(self, user_id: str, company_name: str, company_domain: Optional[str], job_title: str, location: Optional[str], job_url: Optional[str], resume_version: Optional[str], cover_letter_version: Optional[str], ats_score: Optional[float], resume_match_score: Optional[float], job_description: Optional[str] = None, organized_jd: Optional[Dict[str, Any]] = None, resume_id: Optional[str] = None, resume_snapshot: Optional[Dict[str, Any]] = None, cover_letter_snapshot: Optional[Dict[str, Any]] = None, current_stage: str = 'Ready To Apply', timeline: List[Dict[str, Any]] = None, notes: Optional[str] = None) -> Dict[str, Any]:
        if timeline is None:
            timeline = []
        
        query = """
            INSERT INTO public.applications (user_id, company_name, company_domain, job_title, location, job_url, resume_version, cover_letter_version, ats_score, resume_match_score, job_description, organized_jd, resume_id, resume_snapshot, cover_letter_snapshot, current_stage, timeline, notes)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            try:
                cur.execute(query, (
                    user_id,
                    company_name,
                    company_domain,
                    job_title,
                    location,
                    job_url,
                    resume_version,
                    cover_letter_version,
                    ats_score,
                    resume_match_score,
                    job_description,
                    json.dumps(organized_jd or {}),
                    resume_id,
                    json.dumps(resume_snapshot or {}),
                    json.dumps(cover_letter_snapshot or {}),
                    current_stage,
                    json.dumps(timeline),
                    notes
                ))
                record = cur.fetchone() or {}
                self.conn.commit()
                return record
            except Exception:
                self.conn.rollback()
                raise

    def get_by_id(self, app_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM public.applications WHERE id = %s AND user_id = %s"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (app_id, user_id))
            return cur.fetchone()

    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        query = "SELECT * FROM public.applications WHERE user_id = %s ORDER BY created_at DESC"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (user_id,))
            return cur.fetchall()

    def update(self, app_id: str, user_id: str, update_data: Dict[str, Any]) -> Dict[str, Any]:
        if not update_data:
            return {}
        
        # Build set query dynamically
        set_clauses = []
        params = []
        for key, val in update_data.items():
            set_clauses.append(f"{key} = %s")
            if isinstance(val, (dict, list)):
                params.append(json.dumps(val))
            else:
                params.append(val)
        
        # Append updated_at and last_activity logic
        set_clauses.append("updated_at = timezone('utc'::text, now())")
        set_clauses.append("last_activity = timezone('utc'::text, now())")
        
        query = f"""
            UPDATE public.applications
            SET {", ".join(set_clauses)}
            WHERE id = %s AND user_id = %s
            RETURNING *
        """
        params.extend([app_id, user_id])
        
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            self.conn.commit()
            return cur.fetchone() or {}

    def delete(self, app_id: str, user_id: str) -> bool:
        query = "DELETE FROM public.applications WHERE id = %s AND user_id = %s"
        with self.conn.cursor() as cur:
            cur.execute(query, (app_id, user_id))
            self.conn.commit()
            return cur.rowcount > 0
