from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    database_url: str = "postgresql://metis:metis@localhost:55432/metis"
    github_token: str | None = None
    github_api_url: str = "https://api.github.com"
    model_provider: str = "groq"
    model_name: str = "rule-based-mvp"
    model_base_url: str = ""
    model_api_key: str | None = None
    model_timeout_seconds: float = 180.0
    groq_api_key: str | None = None
    groq_model: str = "qwen/qwen3.8-27b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_timeout_seconds: float = Field(default=60.0, gt=0, le=600)
    groq_max_retries: int = Field(default=2, ge=0, le=5)

    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    @field_validator("groq_model", "groq_base_url")
    @classmethod
    def validate_groq_setting(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Groq model and base URL must not be empty")
        return value.strip()

    @property
    def active_model_name(self) -> str:
        return self.groq_model if self.model_provider == "groq" else self.model_name

    @property
    def active_base_url(self) -> str:
        return self.groq_base_url if self.model_provider == "groq" else self.model_base_url

    @property
    def active_api_key(self) -> str | None:
        return self.groq_api_key if self.model_provider == "groq" else self.model_api_key

    @property
    def active_timeout_seconds(self) -> float:
        return self.groq_timeout_seconds if self.model_provider == "groq" else self.model_timeout_seconds


settings = Settings()
