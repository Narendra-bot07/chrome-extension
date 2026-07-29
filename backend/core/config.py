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
    JWT_EXPIRE_MINUTES: int = Field(default=30, env="JWT_EXPIRE_MINUTES")
    REFRESH_TOKEN_DAYS: int = Field(default=30, env="REFRESH_TOKEN_DAYS")
    SESSION_INACTIVITY_MINUTES: int = Field(default=30, env="SESSION_INACTIVITY_MINUTES")
    DATABASE_URL: Optional[str] = Field(default=None, env="DATABASE_URL")
    FRONTEND_URL: str = Field(default="http://localhost:5173", env="FRONTEND_URL")
    SMTP_HOST: str = Field(default="", env="SMTP_HOST")
    SMTP_PORT: int = Field(default=587, env="SMTP_PORT")
    SMTP_USERNAME: str = Field(default="", env="SMTP_USERNAME")
    SMTP_PASSWORD: str = Field(default="", env="SMTP_PASSWORD")
    SMTP_FROM_EMAIL: str = Field(default="", env="SMTP_FROM_EMAIL")
    SMTP_FROM_NAME: str = Field(default="tailr4u", env="SMTP_FROM_NAME")
    SMTP_USE_TLS: bool = Field(default=True, env="SMTP_USE_TLS")
    SMTP_TIMEOUT_SECONDS: int = Field(default=10, env="SMTP_TIMEOUT_SECONDS")
    PASSWORD_RESET_MINUTES: int = Field(default=45, env="PASSWORD_RESET_MINUTES")
    EMAIL_VERIFICATION_HOURS: int = Field(default=24, env="EMAIL_VERIFICATION_HOURS")
    REVOKE_SESSIONS_ON_PASSWORD_RESET: bool = Field(default=True, env="REVOKE_SESSIONS_ON_PASSWORD_RESET")
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
