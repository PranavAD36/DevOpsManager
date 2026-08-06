from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DevOpsManager"
    environment: str = "development"
    debug: bool = True
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/devopsmanager"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
