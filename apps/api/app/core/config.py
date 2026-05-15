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
    ai_provider: str = "deepseek"
    ai_model: str = "deepseek-v4-flash"
    ai_base_url: str = "https://api.deepseek.com"
    ai_api_key: str = "replace-me"
    jwt_secret_key: str = "change-me-to-a-long-random-secret-key-32chars"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    grok_api_key: str = ""
    deepseek_api_key: str = ""
    huggingface_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
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

    @property
    def active_ai_api_key(self) -> str:
        if self.ai_provider == "deepseek" and self.deepseek_api_key:
            return self.deepseek_api_key
        if self.ai_provider == "grok" and self.grok_api_key:
            return self.grok_api_key
        return self.ai_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
