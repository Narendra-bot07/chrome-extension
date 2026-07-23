import os
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    GROQ_API_KEY: str = Field(default="", env="GROQ_API_KEY")
    DEEPSEEK_API_KEY: str = Field(default="", env="DEEPSEEK_API_KEY")
    AI_PROVIDER: str = Field(default="auto", env="AI_PROVIDER")
    ASTRA_MODEL: str = Field(default="", env="ASTRA_MODEL")
    JWT_SECRET: str = Field(default="super-secret-jwt-key", env="JWT_SECRET")
    JWT_ALGORITHM: str = Field(default="HS256", env="JWT_ALGORITHM")
    DATABASE_URL: Optional[str] = Field(default=None, env="DATABASE_URL")
    PROJECT_NAME: str = "Resume Tailor AI"
    API_V1_STR: str = "/api/v1"

    class Config:
        env_file = (BASE_DIR / ".env", ".env")
        case_sensitive = True
        extra = "ignore"

settings = Settings()
