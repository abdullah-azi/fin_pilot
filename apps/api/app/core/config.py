from functools import lru_cache
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "FinPilot API"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    allowed_origins: Annotated[list[str], NoDecode] = [
        "http://localhost:8081",
        "http://localhost:19006",
    ]
    database_url: str = "postgresql+psycopg://finpilot:finpilot@localhost:5433/finpilot"
    test_database_url: str = "postgresql+psycopg://finpilot:finpilot@localhost:5433/finpilot_test"
    ai_provider: str = "deepseek"
    ai_model: str = "deepseek-v4-flash"
    ai_base_url: str = "https://api.deepseek.com"
    ai_api_key: str = "replace-me"
    ai_timeout_seconds: float = 30.0
    jwt_secret_key: str = "change-me-to-a-long-random-secret-key-32chars"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    password_reset_token_expire_minutes: int = 30
    resend_api_key: str = ""
    resend_base_url: str = "https://api.resend.com"
    resend_from_email: str = ""
    resend_reply_to_email: str = ""
    password_reset_url_base: str = ""
    storage_backend: str = "local"
    local_storage_root: str = "uploads"
    local_storage_public_base_url: str = "/uploads"
    s3_bucket_name: str = ""
    s3_region: str = ""
    s3_endpoint_url: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_public_base_url: str = ""
    s3_force_path_style: bool = False
    expo_push_base_url: str = "https://exp.host/--/api/v2/push/send"
    expo_push_timeout_seconds: float = 15.0
    database_connect_timeout_seconds: int = 5
    run_migrations_on_startup: bool = True
    grok_api_key: str = ""
    deepseek_api_key: str = ""
    huggingface_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("ai_provider", mode="before")
    @classmethod
    def normalize_ai_provider(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("ai_base_url", mode="before")
    @classmethod
    def normalize_ai_base_url(cls, value: object) -> object:
        if isinstance(value, str) and value.strip():
            return value.rstrip("/")
        return "https://api.deepseek.com"

    @field_validator("resend_base_url", mode="before")
    @classmethod
    def normalize_resend_base_url(cls, value: object) -> object:
        if isinstance(value, str) and value.strip():
            return value.rstrip("/")
        return "https://api.resend.com"

    @field_validator("database_url", "test_database_url", mode="before")
    @classmethod
    def normalize_database_urls(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        if normalized.startswith("postgresql+"):
            return normalized
        if normalized.startswith("postgres://"):
            return normalized.replace("postgres://", "postgresql+psycopg://", 1)
        if normalized.startswith("postgresql://"):
            return normalized.replace("postgresql://", "postgresql+psycopg://", 1)
        return normalized

    @field_validator("storage_backend", mode="before")
    @classmethod
    def normalize_storage_backend(cls, value: object) -> object:
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
        return "local"

    @field_validator("local_storage_public_base_url", "s3_endpoint_url", "s3_public_base_url", mode="before")
    @classmethod
    def normalize_url_like_values(cls, value: object) -> object:
        if isinstance(value, str) and value.strip():
            normalized = value.strip()
            if normalized.startswith("/"):
                return normalized.rstrip("/") or "/"
            return normalized.rstrip("/")
        return ""

    @property
    def active_ai_api_key(self) -> str:
        if self.ai_provider == "deepseek" and self.deepseek_api_key:
            return self.deepseek_api_key
        if self.ai_provider == "grok" and self.grok_api_key:
            return self.grok_api_key
        return self.ai_api_key

    @property
    def resend_enabled(self) -> bool:
        return bool(self.resend_api_key and self.resend_from_email)

    @property
    def expo_push_enabled(self) -> bool:
        return bool(self.expo_push_base_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
