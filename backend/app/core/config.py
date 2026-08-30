from functools import lru_cache
from pathlib import Path
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "DevOpsManager"
    environment: str = "development"
    debug: bool = True
    allowed_origins: list[str] = [
        "http://localhost:3000",
<<<<<<< HEAD
        "http://localhost:3001",
        "https://dev-ops-manager.vercel.app",
    ]
    frontend_url: str = Field(
        default="http://localhost:3000",
        validation_alias=AliasChoices("FRONTEND_URL", "frontend_url"),
    )
=======
        "http://127.0.0.1:3000",
        "https://dev-ops-manager.vercel.app",
    ]
    allow_origin_regex: str | None = r"https://.*\.vercel\.app$"
>>>>>>> f62dd4717c27434e0b5ff190c699b5558fef2949
    openrouter_api_key: str | None = None
    gemini_api_key: str | None = None
    ai_provider: str = "openrouter"
    openrouter_model: str = "deepseek/deepseek-chat-v3-0324:free"
    gemini_model: str = "gemini-1.5-flash"
    github_token: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None
    github_app_id: str | None = None
    github_private_key_path: str | None = None
    github_redirect_uri: str = "http://localhost:8000/v1/github/callback"
    github_callback_url: str = "http://localhost:8000/v1/github/callback"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/devopsmanager"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def normalize_allowed_origins(cls, v: str | list[str] | None) -> list[str]:
        defaults = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "https://dev-ops-manager.vercel.app",
        ]
        if v in (None, ""):
            return defaults
        if isinstance(v, str):
            values = [item.strip() for item in v.split(",") if item.strip()]
            return values or defaults
        if isinstance(v, list):
            values = [str(item).strip() for item in v if str(item).strip()]
            return values or defaults
        return defaults

    @field_validator("database_url", mode="before")
    @classmethod
    def ensure_async_db_driver(cls, v: str | None) -> str:
        if not v:
            return "postgresql+asyncpg://postgres:postgres@localhost:5432/devopsmanager"
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        if v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+asyncpg://", 1)
        if v.startswith("postgresql+psycopg2://"):
            return v.replace("postgresql+psycopg2://", "postgresql+asyncpg://", 1)
        return v

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
