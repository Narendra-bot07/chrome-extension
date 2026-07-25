from psycopg2.extras import RealDictCursor
import json
import logging
from typing import Dict, Any, List, Optional

logger = logging.getLogger("app")

class ATSRepository:
    def __init__(self, conn):
        self.conn = conn

    def get_cached_analysis(self, resume_id: str, jd_id: str, engine_version: str) -> Optional[Dict[str, Any]]:
        """
        Retrieves a cached ATS analysis if the resume and job description have not changed.
        """
        # Fetch latest analysis for this resume + JD + engine version
        query_analysis = """
            SELECT * FROM public.ats_analyses 
            WHERE resume_id = %s AND jd_id = %s AND engine_version = %s 
            ORDER BY created_at DESC LIMIT 1
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query_analysis, (resume_id, jd_id, engine_version))
            analysis = cur.fetchone()
            if not analysis:
                return None

            # Fetch updated_at for resume
            cur.execute("SELECT updated_at FROM public.resumes WHERE id = %s", (resume_id,))
            resume_res = cur.fetchone()
            
            # Fetch updated_at for JD
            cur.execute("SELECT updated_at FROM public.job_descriptions WHERE id = %s", (jd_id,))
            jd_res = cur.fetchone()

            if not resume_res or not jd_res:
                return None

            # Verify if cached analysis is still fresh
            created_at = analysis["created_at"]
            resume_updated = resume_res["updated_at"]
            jd_updated = jd_res["updated_at"]

            if created_at >= resume_updated and created_at >= jd_updated:
                logger.info(
                    "[ATS-CACHE][BACKEND] Found valid cached ATS analysis "
                    "analysis_id=%s resume_id=%s jd_id=%s",
                    analysis["id"], resume_id, jd_id
                )
                return analysis
        return None

    def create_analysis(
        self,
        user_id: str,
        resume_id: str,
        jd_id: str,
        engine_version: str,
        overall_score: int,
        resume_match_score: int,
        ats_score: int,
        breakdown: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Saves a new ATS analysis record.
        """
        query = """
            INSERT INTO public.ats_analyses (user_id, resume_id, jd_id, engine_version, overall_score, resume_match_score, ats_score, breakdown_json)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (
                user_id,
                resume_id,
                jd_id,
                engine_version,
                overall_score,
                resume_match_score,
                ats_score,
                json.dumps(breakdown)
            ))
            self.conn.commit()
            return cur.fetchone() or {}

    def create_suggestion_impact(
        self,
        suggestion_id: str,
        ats_analysis_id: str,
        score_delta: float,
        category: str,
        explanation: str
    ) -> Dict[str, Any]:
        """
        Saves a suggestion score impact record.
        """
        query = """
            INSERT INTO public.ats_suggestion_impacts (suggestion_id, ats_analysis_id, score_delta, category, explanation)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (
                suggestion_id,
                ats_analysis_id,
                score_delta,
                category,
                explanation
            ))
            self.conn.commit()
            return cur.fetchone() or {}

    def get_suggestion_impacts(self, ats_analysis_id: str) -> List[Dict[str, Any]]:
        """
        Retrieves suggestion impacts linked to a given ATS analysis ID.
        """
        query = "SELECT * FROM public.ats_suggestion_impacts WHERE ats_analysis_id = %s"
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (ats_analysis_id,))
            return cur.fetchall()
