from supabase import Client
from storage3.exceptions import StorageApiError
from services.storage.file_service import FileService

class SupabaseStorageService(FileService):
    def __init__(self, supabase: Client):
        self.supabase = supabase

    def upload_file(self, bucket: str, path: str, data: bytes, content_type: str) -> str:
        # upsert: without it, Supabase Storage's upload() rejects a second
        # write to the same path with a "Duplicate" error. Existing callers
        # (resume uploads) always use a fresh UUID-prefixed path, so this
        # never changes their behavior -- but callers that intentionally use
        # a deterministic, one-object-per-record path (e.g. cover letters,
        # one file per application, overwritten on every regeneration) need
        # re-uploads to succeed rather than fail with a conflict.
        self.supabase.storage.from_(bucket).upload(
            path=path,
            file=data,
            file_options={"content-type": content_type, "upsert": "true"}
        )
        return path

    def download_file(self, bucket: str, path: str) -> bytes:
        try:
            return self.supabase.storage.from_(bucket).download(path)
        except StorageApiError as exc:
            # Records created before this app was wired up to Supabase Storage
            # (or from an interrupted upload) can reference an object that was
            # never actually persisted to the bucket. Surface a plain
            # FileNotFoundError so API layers can return a clean 404 instead of
            # letting the raw storage-client exception crash the request.
            if "not_found" in str(exc).lower() or "404" in str(exc):
                raise FileNotFoundError(f"Object not found in storage: {bucket}/{path}") from exc
            raise
