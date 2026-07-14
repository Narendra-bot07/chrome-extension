from supabase import Client
from typing import Dict, Any, List, Optional

class AuditRepository:
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def log_activity(self, user_id: str, action: str, metadata: Dict[str, Any]) -> str:
        response = self.supabase.rpc("log_user_activity", {
            "user_uuid": user_id,
            "user_action": action,
            "log_metadata": metadata
        }).execute()
        return response.data if response.data else ""

    def log_ai_generation(self, user_id: str, prompt_version: str, model: str, latency_ms: int, input_tokens: int, output_tokens: int, cost: float, status: str, error: Optional[str] = None) -> Dict[str, Any]:
        data = {
            "user_id": user_id,
            "prompt_version": prompt_version,
            "llm_model": model,
            "latency_ms": latency_ms,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "estimated_cost": cost,
            "status": status,
            "error_message": error
        }
        response = self.supabase.table("ai_generations").insert(data).execute()
        return response.data[0] if response.data else {}

    def log_download(self, user_id: str, tailored_resume_id: str, template_id: Optional[str], file_type: str, ats_score: float, company_name: str, job_title: str) -> Dict[str, Any]:
        data = {
            "user_id": user_id,
            "tailored_resume_id": tailored_resume_id,
            "template_id": template_id,
            "file_type": file_type,
            "ats_score": ats_score,
            "company_name": company_name,
            "job_title": job_title
        }
        response = self.supabase.table("downloads").insert(data).execute()
        return response.data[0] if response.data else {}

    def log_api_usage(self, user_id: Optional[str], endpoint: str, method: str, status_code: int, response_time_ms: int, ip_address: Optional[str] = None) -> Dict[str, Any]:
        data = {
            "user_id": user_id,
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "response_time_ms": response_time_ms,
            "ip_address": ip_address
        }
        response = self.supabase.table("api_usage").insert(data).execute()
        return response.data[0] if response.data else {}
