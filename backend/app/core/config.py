from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DevOpsManager"
    environment: str = "development"
    debug: bool = True
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    database_url: str
    frontend_url: str = "http://localhost:3000"
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parents[2] / ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
