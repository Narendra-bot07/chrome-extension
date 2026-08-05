from abc import ABC, abstractmethod

class FileService(ABC):
    @abstractmethod
    def upload_file(self, bucket: str, path: str, data: bytes, content_type: str) -> str:
        pass

    @abstractmethod
    def download_file(self, bucket: str, path: str) -> bytes:
        pass

    def create_signed_download_url(self, bucket: str, path: str, expires_in: int = 60):
        """Return a short-lived direct-download URL when supported."""
        return None
