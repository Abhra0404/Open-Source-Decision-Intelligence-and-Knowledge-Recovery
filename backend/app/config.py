from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str = "postgresql://metis:metis@localhost:55432/metis"
    github_token: str | None = None
    github_api_url: str = "https://api.github.com"
    model_provider: str = "deterministic"
    model_name: str = "rule-based-mvp"
    model_base_url: str = ""
    model_api_key: str | None = None

    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")


settings = Settings()
