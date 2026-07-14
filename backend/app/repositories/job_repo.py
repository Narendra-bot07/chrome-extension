from supabase import Client
from typing import Dict, Any, List, Optional

class JobRepository:
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def create(self, user_id: str, raw_text: str, company_name: str, job_title: str, normalized_content: Dict[str, Any], ats_keywords: List[str], skills_categories: Dict[str, Any]) -> Dict[str, Any]:
        data = {
            "user_id": user_id,
            "raw_text": raw_text,
            "company_name": company_name,
            "job_title": job_title,
            "normalized_content": normalized_content,
            "ats_keywords": ats_keywords,
            "skills_categories": skills_categories
        }
        response = self.supabase.table("job_descriptions").insert(data).execute()
        return response.data[0] if response.data else {}

    def get_by_id(self, jd_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        response = self.supabase.table("job_descriptions").select("*").eq("id", jd_id).eq("user_id", user_id).is_("deleted_at", "null").execute()
        return response.data[0] if response.data else None
