from psycopg2.extras import RealDictCursor
import json
from typing import Dict, Any, Optional

class JobRepository:
    def __init__(self, conn):
        self.conn = conn

    def create(self, user_id: str, raw_text: str, company_name: str, job_title: str, normalized_content: Dict[str, Any], ats_keywords: list, skills_categories: Dict[str, Any]) -> Dict[str, Any]:
        query = """
            INSERT INTO public.job_descriptions (user_id, raw_text, company_name, job_title, normalized_content, ats_keywords, skills_categories)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (
                user_id,
                raw_text,
                company_name,
                job_title,
                json.dumps(normalized_content),
                json.dumps(ats_keywords),
                json.dumps(skills_categories)
            ))
            self.conn.commit()
            return cur.fetchone() or {}

    def get_by_id(self, jd_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM public.job_descriptions WHERE id = %s AND user_id = %s AND deleted_at IS NULL"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (jd_id, user_id))
            return cur.fetchone()
