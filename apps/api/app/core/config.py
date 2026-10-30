from functools import lru_cache
from pathlib import Path
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_env: str = "development"
    app_secret_key: str = "development-only-secret-change-before-production"
    database_url: str = "sqlite:///./artist.db"
    public_origin: str = "http://localhost:8080"
    api_base_url: str = "/api/v1"
    media_base_url: str = "/media"
    storage_root: Path = Path("./storage")
    max_file_bytes: int = 5 * 1024**3
    max_total_bytes: int = 100 * 1024**3
    min_free_bytes: int = 5 * 1024**3
    upload_expiry_hours: int = 24
    trash_retention_days: int = 30
    session_cookie_secure: bool = False
    media_worker_concurrency: int = Field(default=1, ge=1, le=2)
    login_max_attempts: int = Field(default=5, ge=3, le=20)
    login_window_minutes: int = Field(default=15, ge=1, le=1440)
    seed_demo_data: bool = False
    admin_email: str = ""
    admin_password: str = ""

    @model_validator(mode="after")
    def secure_production(self) -> "Settings":
        if self.app_env == "production":
            if len(self.app_secret_key) < 32 or self.app_secret_key.startswith(("development", "replace-with")):
                raise ValueError("production requires a strong APP_SECRET_KEY")
            if not self.session_cookie_secure:
                raise ValueError("production requires SESSION_COOKIE_SECURE=true")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

