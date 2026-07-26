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
    LANGSMITH_API_KEY: str = Field(default="", env="LANGSMITH_API_KEY")
    LANGSMITH_PROJECT: str = Field(
        default="tailorflow-ai",
        env="LANGSMITH_PROJECT",
    )
    LANGSMITH_ENDPOINT: str = Field(
        default="https://api.smith.langchain.com",
        env="LANGSMITH_ENDPOINT",
    )
    LANGSMITH_WORKSPACE_ID: str = Field(
        default="",
        env="LANGSMITH_WORKSPACE_ID",
    )
    LANGSMITH_TRACING: bool = Field(default=False, env="LANGSMITH_TRACING")
    PROJECT_NAME: str = "Resume Tailor AI"
    API_V1_STR: str = "/api/v1"

    class Config:
        env_file = (BASE_DIR / ".env", ".env")
        case_sensitive = True
        extra = "ignore"

settings = Settings()
