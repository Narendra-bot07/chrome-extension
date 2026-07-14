from psycopg2.extras import RealDictCursor
import json
from typing import Dict, Any, Optional

class AuditRepository:
    def __init__(self, conn):
        self.conn = conn

    def log_activity(self, user_id: str, action: str, metadata: Dict[str, Any]) -> str:
        query = "SELECT public.log_user_activity(%s, %s, %s)"
        with self.conn.cursor() as cur:
            cur.execute(query, (user_id, action, json.dumps(metadata)))
            res = cur.fetchone()
            self.conn.commit()
            return res[0] if res else ""

    def log_ai_generation(self, user_id: str, prompt_version: str, model: str, latency_ms: int, input_tokens: int, output_tokens: int, cost: float, status: str, error: Optional[str] = None) -> Dict[str, Any]:
        query = """
            INSERT INTO public.ai_generations (user_id, prompt_version, llm_model, latency_ms, input_tokens, output_tokens, estimated_cost, status, error_message)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (
                user_id,
                prompt_version,
                model,
                latency_ms,
                input_tokens,
                output_tokens,
                cost,
                status,
                error
            ))
            self.conn.commit()
            return cur.fetchone() or {}

    def log_download(self, user_id: str, tailored_resume_id: str, template_id: Optional[str], file_type: str, ats_score: float, company_name: str, job_title: str) -> Dict[str, Any]:
        query = """
            INSERT INTO public.downloads (user_id, tailored_resume_id, template_id, file_type, ats_score, company_name, job_title)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (
                user_id,
                tailored_resume_id,
                template_id,
                file_type,
                ats_score,
                company_name,
                job_title
            ))
            self.conn.commit()
            return cur.fetchone() or {}

    def log_api_usage(self, user_id: Optional[str], endpoint: str, method: str, status_code: int, response_time_ms: int, ip_address: Optional[str] = None) -> Dict[str, Any]:
        query = """
            INSERT INTO public.api_usage (user_id, endpoint, method, status_code, response_time_ms, ip_address)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
        """
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, (
                user_id,
                endpoint,
                method,
                status_code,
                response_time_ms,
                ip_address
            ))
            self.conn.commit()
            return cur.fetchone() or {}
