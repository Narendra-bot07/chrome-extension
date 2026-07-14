from supabase import Client
from typing import Dict, Any, List, Optional

class ResumeRepository:
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def create(self, user_id: str, file_path: str, file_name: str, file_size: int, file_type: str, parsed_content: Dict[str, Any]) -> Dict[str, Any]:
        data = {
            "user_id": user_id,
            "file_path": file_path,
            "file_name": file_name,
            "file_size": file_size,
            "file_type": file_type,
            "parsed_content": parsed_content
        }
        response = self.supabase.table("resumes").insert(data).execute()
        # Increment resume count using DB function trigger or direct count function
        try:
            self.supabase.rpc("increment_resume_count", {"user_uuid": user_id}).execute()
        except Exception:
            pass # Ignore if the RPC doesn't exist in local docker setup
        
        return response.data[0] if response.data else {}

    def get_by_id(self, resume_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        response = self.supabase.table("resumes").select("*").eq("id", resume_id).eq("user_id", user_id).is_("deleted_at", "null").execute()
        return response.data[0] if response.data else None

    def list_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        response = self.supabase.table("resumes").select("*").eq("user_id", user_id).is_("deleted_at", "null").execute()
        return response.data if response.data else []

    def soft_delete(self, resume_id: str, user_id: str) -> bool:
        response = self.supabase.rpc("soft_delete_resume", {"resume_uuid": resume_id, "user_uuid": user_id}).execute()
        return response.data if response.data is not None else False
