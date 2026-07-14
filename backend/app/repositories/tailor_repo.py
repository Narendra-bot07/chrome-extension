from supabase import Client
from typing import Dict, Any, List, Optional

class TailorRepository:
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def create_tailored(self, user_id: str, original_resume_id: str, job_description_id: str, tailored_content: Dict[str, Any], ats_score: float) -> Dict[str, Any]:
        data = {
            "user_id": user_id,
            "original_resume_id": original_resume_id,
            "job_description_id": job_description_id,
            "tailored_content": tailored_content,
            "ats_score": ats_score
        }
        response = self.supabase.table("tailored_resumes").insert(data).execute()
        
        # Automatically create the first version of the tailored resume
        if response.data:
            tailored_resume_id = response.data[0]["id"]
            self.create_version(tailored_resume_id, tailored_content, "Initial tailoring generation")
            
        return response.data[0] if response.data else {}

    def get_tailored_by_id(self, tailored_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        response = self.supabase.table("tailored_resumes").select("*").eq("id", tailored_id).eq("user_id", user_id).is_("deleted_at", "null").execute()
        return response.data[0] if response.data else None

    def update_file_path(self, tailored_id: str, file_path: str) -> Dict[str, Any]:
        response = self.supabase.table("tailored_resumes").update({"file_path": file_path}).eq("id", tailored_id).execute()
        return response.data[0] if response.data else {}

    def create_version(self, tailored_resume_id: str, content: Dict[str, Any], changes_summary: str) -> Dict[str, Any]:
        data = {
            "tailored_resume_id": tailored_resume_id,
            "content": content,
            "changes_summary": changes_summary
        }
        # version_number is handled by the database trigger
        response = self.supabase.table("resume_versions").insert(data).execute()
        return response.data[0] if response.data else {}

    def get_versions(self, tailored_resume_id: str) -> List[Dict[str, Any]]:
        response = self.supabase.table("resume_versions").select("*").eq("tailored_resume_id", tailored_resume_id).order("version_number", desc=True).execute()
        return response.data if response.data else []
