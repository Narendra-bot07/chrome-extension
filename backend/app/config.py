import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")
load_dotenv()

class Settings:
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")

    JWT_SECRET: str = os.getenv("JWT_SECRET", "super-secret-jwt-key")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    SUPABASE_HOST: str = os.getenv("SUPABASE_HOST", "")

settings = Settings()
