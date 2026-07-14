from supabase import Client
from typing import Dict, Any
import uuid

class StorageService:
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def upload_resume(self, user_id: str, file_name: str, file_data: bytes, content_type: str) -> str:
        """
        Uploads an original resume to Supabase Storage.
        Enforces user isolation via prefixing the path with user_id.
        """
        unique_id = str(uuid.uuid4())
        file_path = f"{user_id}/{unique_id}_{file_name}"
        
        # Uploading to 'original-resumes' bucket
        response = self.supabase.storage.from_("original-resumes").upload(
            path=file_path,
            file=file_data,
            file_options={"content-type": content_type}
        )
        return file_path

    def download_resume(self, file_path: str) -> bytes:
        """
        Downloads a resume from 'original-resumes' bucket.
        """
        return self.supabase.storage.from_("original-resumes").download(file_path)

    def upload_tailored_pdf(self, user_id: str, company_name: str, pdf_data: bytes) -> str:
        """
        Uploads generated tailored resumes to Supabase Storage.
        """
        unique_id = str(uuid.uuid4())
        file_name = f"{company_name}_Resume.pdf".replace(" ", "_")
        file_path = f"{user_id}/{unique_id}_{file_name}"
        
        self.supabase.storage.from_("generated-resumes").upload(
            path=file_path,
            file=pdf_data,
            file_options={"content-type": "application/pdf"}
        )
        return file_path
