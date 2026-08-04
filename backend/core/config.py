import os
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings
from typing import Optional

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    DEEPSEEK_API_KEY: str = Field(default="", env="DEEPSEEK_API_KEY")
    DEEPSEEK_BASE_URL: str = Field(default="https://api.deepseek.com", env="DEEPSEEK_BASE_URL")
    DEEPSEEK_MODEL_FLASH: str = Field(default="deepseek-v4-flash", env="DEEPSEEK_MODEL_FLASH")
    DEEPSEEK_MODEL_PRO: str = Field(default="deepseek-v4-pro", env="DEEPSEEK_MODEL_PRO")
    DEEPSEEK_TIMEOUT_SECONDS: float = Field(default=60.0, env="DEEPSEEK_TIMEOUT_SECONDS")
    DEEPSEEK_MAX_RETRIES: int = Field(default=2, env="DEEPSEEK_MAX_RETRIES")
    DEEPSEEK_ENABLE_THINKING: bool = Field(default=False, env="DEEPSEEK_ENABLE_THINKING")
    LLM_PROVIDER: str = Field(default="deepseek", env="LLM_PROVIDER")
    AI_PROVIDER: str = Field(default="deepseek", env="AI_PROVIDER")
    ASTRA_MODEL: str = Field(default="", env="ASTRA_MODEL")
    JWT_SECRET: str = Field(default="super-secret-jwt-key", env="JWT_SECRET")
    JWT_ALGORITHM: str = Field(default="HS256", env="JWT_ALGORITHM")
    JWT_EXPIRE_MINUTES: int = Field(default=30, env="JWT_EXPIRE_MINUTES")
    REFRESH_TOKEN_DAYS: int = Field(default=30, env="REFRESH_TOKEN_DAYS")
    SESSION_INACTIVITY_MINUTES: int = Field(default=30, env="SESSION_INACTIVITY_MINUTES")
    SUPABASE_URL: str = Field(default="", env="SUPABASE_URL")
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default="", env="SUPABASE_SERVICE_ROLE_KEY")
    SUPABASE_ANON_KEY: str = Field(default="", env="SUPABASE_ANON_KEY")
    UPSTASH_REDIS_URL: str = Field(default="", env="UPSTASH_REDIS_URL")
    UPSTASH_REDIS_REST_URL: str = Field(default="", env="UPSTASH_REDIS_REST_URL")
    UPSTASH_REDIS_REST_TOKEN: str = Field(default="", env="UPSTASH_REDIS_REST_TOKEN")
    DATABASE_URL: Optional[str] = Field(default=None, env="DATABASE_URL")
    FRONTEND_URL: str = Field(default="http://localhost:5173", env="FRONTEND_URL")
    RESEND_API_KEY: str = Field(default="", env="RESEND_API_KEY")
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
    LANGSMITH_PROJECT: str = Field(default="tailr4u-ai", env="LANGSMITH_PROJECT")
    LANGSMITH_ENDPOINT: str = Field(default="https://api.smith.langchain.com", env="LANGSMITH_ENDPOINT")
    LANGSMITH_WORKSPACE_ID: str = Field(default="", env="LANGSMITH_WORKSPACE_ID")
    LANGSMITH_TRACING: bool = Field(default=False, env="LANGSMITH_TRACING")

    # Observability & Monitoring Settings
    OBSERVABILITY_ENABLED: bool = Field(default=True, env="OBSERVABILITY_ENABLED")
    APP_ENV: str = Field(default="local", env="APP_ENV")
    APP_RELEASE: str = Field(default="", env="APP_RELEASE")
    SERVICE_NAME: str = Field(default="tailr4u-api", env="SERVICE_NAME")
    # Explicit, default-OFF opt-in for local/dev testing of the paid-plan UI
    # without real Stripe/Razorpay credentials. Deliberately NOT derived from
    # APP_ENV (its actual value on the live deployment isn't something this
    # code can safely assume) -- must be set to "true" by hand in a local
    # .env to do anything, so a missing/misconfigured APP_ENV can never
    # silently leave production able to self-grant paid plans without a real
    # payment. See docs/KNOWN_ISSUES.md ISSUE-015.
    ALLOW_MOCK_BILLING_ACTIVATION: bool = Field(default=False, env="ALLOW_MOCK_BILLING_ACTIVATION")
    
    SENTRY_BACKEND_DSN: str = Field(default="", env="SENTRY_BACKEND_DSN")
    SENTRY_FRONTEND_DSN: str = Field(default="", env="SENTRY_FRONTEND_DSN")
    SENTRY_EXTENSION_DSN: str = Field(default="", env="SENTRY_EXTENSION_DSN")
    SENTRY_TRACES_SAMPLE_RATE: float = Field(default=0.05, env="SENTRY_TRACES_SAMPLE_RATE")
    SENTRY_PROFILES_SAMPLE_RATE: float = Field(default=0.0, env="SENTRY_PROFILES_SAMPLE_RATE")
    
    METRICS_ENABLED: bool = Field(default=True, env="METRICS_ENABLED")
    METRICS_PATH: str = Field(default="/internal/metrics", env="METRICS_PATH")
    METRICS_BEARER_TOKEN: str = Field(default="", env="METRICS_BEARER_TOKEN")
    
    OTEL_ENABLED: bool = Field(default=False, env="OTEL_ENABLED")
    OTEL_SERVICE_NAME: str = Field(default="tailr4u-api", env="OTEL_SERVICE_NAME")
    OTEL_EXPORTER_OTLP_ENDPOINT: str = Field(default="", env="OTEL_EXPORTER_OTLP_ENDPOINT")
    OTEL_EXPORTER_OTLP_HEADERS: str = Field(default="", env="OTEL_EXPORTER_OTLP_HEADERS")
    OTEL_EXPORTER_OTLP_PROTOCOL: str = Field(default="http/protobuf", env="OTEL_EXPORTER_OTLP_PROTOCOL")
    OTEL_TRACES_SAMPLER: str = Field(default="parentbased_traceidratio", env="OTEL_TRACES_SAMPLER")
    OTEL_TRACES_SAMPLER_ARG: float = Field(default=0.05, env="OTEL_TRACES_SAMPLER_ARG")
    
    LOG_LEVEL: str = Field(default="INFO", env="LOG_LEVEL")
    LOG_FORMAT: str = Field(default="json", env="LOG_FORMAT")

    # LLM Redis Caching Settings
    LLM_CACHE_ENABLED: bool = Field(default=True, env="LLM_CACHE_ENABLED")
    LLM_CACHE_NAMESPACE: str = Field(default="tailr4u", env="LLM_CACHE_NAMESPACE")
    LLM_CACHE_SCHEMA_VERSION: str = Field(default="v1", env="LLM_CACHE_SCHEMA_VERSION")
    LLM_CACHE_TTL_JD_SECONDS: int = Field(default=604800, env="LLM_CACHE_TTL_JD_SECONDS")
    LLM_CACHE_TTL_RECOVERY_SECONDS: int = Field(default=604800, env="LLM_CACHE_TTL_RECOVERY_SECONDS")
    LLM_CACHE_TTL_TAILORING_SECONDS: int = Field(default=86400, env="LLM_CACHE_TTL_TAILORING_SECONDS")
    LLM_CACHE_TTL_SUMMARY_SECONDS: int = Field(default=86400, env="LLM_CACHE_TTL_SUMMARY_SECONDS")
    LLM_CACHE_TTL_COVER_LETTER_SECONDS: int = Field(default=86400, env="LLM_CACHE_TTL_COVER_LETTER_SECONDS")
    LLM_CACHE_LOCK_TTL_SECONDS: int = Field(default=120, env="LLM_CACHE_LOCK_TTL_SECONDS")
    LLM_CACHE_LOCK_WAIT_SECONDS: float = Field(default=15.0, env="LLM_CACHE_LOCK_WAIT_SECONDS")

    PROJECT_NAME: str = "Resume Tailor AI"
    API_V1_STR: str = "/api/v1"

    def validate_llm_provider(self) -> None:
        """Startup validation enforcing DeepSeek as the sole valid LLM provider."""
        provider = (self.LLM_PROVIDER or "deepseek").lower()
        if provider != "deepseek":
            raise ValueError(f"Unsupported LLM_PROVIDER '{self.LLM_PROVIDER}'. Tailr4U exclusively supports 'deepseek'.")

        base_url = (self.DEEPSEEK_BASE_URL or "").rstrip("/")
        if not base_url.startswith("http"):
            raise ValueError(f"Invalid DEEPSEEK_BASE_URL: '{self.DEEPSEEK_BASE_URL}'. Must be a valid HTTP/HTTPS URL.")

        disallowed_aliases = {"deepseek-chat", "deepseek-reasoner"}
        if self.DEEPSEEK_MODEL_FLASH.lower() in disallowed_aliases or self.DEEPSEEK_MODEL_PRO.lower() in disallowed_aliases:
            raise ValueError(f"Deprecated model alias detected. Flash='{self.DEEPSEEK_MODEL_FLASH}', Pro='{self.DEEPSEEK_MODEL_PRO}'. Must use 'deepseek-v4-flash' and 'deepseek-v4-pro'.")

    class Config:
        env_file = (BASE_DIR / ".env", ".env")
        case_sensitive = True
        extra = "ignore"

settings = Settings()
settings.validate_llm_provider()
