from functools import lru_cache
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DevOpsManager"
    environment: str = "development"
    debug: bool = True
    allowed_origins: list[str] = ["http://localhost:3000"]
    openai_api_key: str | None = None
    gemini_api_key: str | None = None
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/devopsmanager"

    @field_validator("debug", mode="before")
    @classmethod
    def set_debug_for_environment(cls, v: bool, info) -> bool:
        env = info.data.get("environment", "development")
        if str(env).lower() in ("production", "prod"):
            return False
        return v

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in ("production", "prod")

    model_config = SettingsConfigDict(
        env_file=(
            str(Path(__file__).resolve().parents[3] / ".env"),
            str(Path(__file__).resolve().parents[2] / ".env"),
        ),
        env_file_encoding="utf-8",
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
