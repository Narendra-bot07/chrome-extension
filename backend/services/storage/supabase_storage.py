from supabase import Client
from services.storage.file_service import FileService

class SupabaseStorageService(FileService):
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def upload_file(self, bucket: str, path: str, data: bytes, content_type: str) -> str:
        self.supabase.storage.from_(bucket).upload(
            path=path,
            file=data,
            file_options={"content-type": content_type}
        )
        return path

    def download_file(self, bucket: str, path: str) -> bytes:
        return self.supabase.storage.from_(bucket).download(path)
