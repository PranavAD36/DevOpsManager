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
    github_token: str | None = None
    github_app_id: int | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None
    github_private_key_path: str | None = None
    database_url: str

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

    @property
    def resolved_github_private_key_path(self) -> Path | None:
        if not self.github_private_key_path:
            return None
        path = Path(self.github_private_key_path)
        if path.is_absolute():
            return path
        return Path(__file__).resolve().parents[2] / path

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
