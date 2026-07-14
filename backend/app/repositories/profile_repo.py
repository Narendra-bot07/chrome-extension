from supabase import Client
from typing import Dict, Any, Optional

class ProfileRepository:
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def get_by_id(self, profile_id: str) -> Optional[Dict[str, Any]]:
        response = self.supabase.table("profiles").select("*").eq("id", profile_id).is_("deleted_at", "null").execute()
        profile = response.data[0] if response.data else None
        
        if profile:
            # Dynamically calculate actual resume count to avoid relying on Postgres RPC/triggers
            try:
                resumes_resp = self.supabase.table("resumes").select("id").eq("user_id", profile_id).is_("deleted_at", "null").execute()
                profile["resume_count"] = len(resumes_resp.data) if resumes_resp.data else 0
            except Exception:
                pass
                
        return profile

    def update_profile(self, profile_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
        response = self.supabase.table("profiles").update(updates).eq("id", profile_id).execute()
        return response.data[0] if response.data else {}

    def get_credits(self, profile_id: str) -> int:
        profile = self.get_by_id(profile_id)
        return profile.get("credits_remaining", 0) if profile else 0

    def deduct_credits(self, profile_id: str, amount: int = 1) -> Dict[str, Any]:
        profile = self.get_by_id(profile_id)
        if not profile:
            raise ValueError("Profile not found")
        new_credits = max(0, profile["credits_remaining"] - amount)
        return self.update_profile(profile_id, {"credits_remaining": new_credits})
