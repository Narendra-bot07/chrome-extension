import os
from services.storage.file_service import FileService

class LocalStorageService(FileService):
    def __init__(self, base_dir: str = "local_uploads"):
        self.base_dir = base_dir
        os.makedirs(self.base_dir, exist_ok=True)

    def upload_file(self, bucket: str, path: str, data: bytes, content_type: str) -> str:
        bucket_dir = os.path.join(self.base_dir, bucket)
        os.makedirs(bucket_dir, exist_ok=True)
        
        safe_path = os.path.join(bucket_dir, os.path.normpath(path))
        os.makedirs(os.path.dirname(safe_path), exist_ok=True)
        
        with open(safe_path, "wb") as f:
            f.write(data)
            
        return path

    def download_file(self, bucket: str, path: str) -> bytes:
        safe_path = os.path.join(self.base_dir, bucket, os.path.normpath(path))
        with open(safe_path, "rb") as f:
            return f.read()
