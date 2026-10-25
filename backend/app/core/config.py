"""Application settings, loaded from environment variables and validated at startup."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = Path(__file__).resolve().parents[2]

PLACEHOLDER_SECRET_MARKERS = ("replace-with", "changeme", "change-me", "secret", "example")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: Literal["development", "test", "production"] = "development"
    app_name: str = "ShipTrack"

    # Required: there is deliberately no default, so a missing value fails loudly at startup.
    database_url: str
    session_secret_key: str

    frontend_url: str = "http://localhost:5173"
    backend_url: str = "http://localhost:8000"
    extra_cors_origins: str = ""  # comma separated

    session_ttl_hours: int = Field(default=24 * 7, ge=1, le=24 * 90)
    cookie_secure: bool | None = None  # None -> True in production, False otherwise
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    ai_provider: Literal["mock", "anthropic", "openai"] = "mock"
    ai_api_key: str = ""
    ai_model: str = ""
    ai_base_url: str = ""  # optional override (OpenAI-compatible gateways, proxies)
    ai_timeout_seconds: float = Field(default=20.0, gt=0, le=120)
    ai_max_input_chars: int = Field(default=5000, ge=100, le=50_000)

    rate_limit_enabled: bool = True
    trust_proxy_headers: bool = False
    max_request_body_bytes: int = Field(default=1_000_000, ge=1_000)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def use_secure_cookies(self) -> bool:
        return self.is_production if self.cookie_secure is None else self.cookie_secure

    @property
    def cors_origins(self) -> list[str]:
        extra = [o.strip() for o in self.extra_cors_origins.split(",") if o.strip()]
        return [self.frontend_url, *extra]

    @model_validator(mode="after")
    def _validate(self) -> "Settings":
        secret = self.session_secret_key
        if len(secret) < 16:
            raise ValueError("SESSION_SECRET_KEY must be at least 16 characters (run `make secret`).")
        if self.is_production:
            if len(secret) < 32 or any(m in secret.lower() for m in PLACEHOLDER_SECRET_MARKERS):
                raise ValueError(
                    "SESSION_SECRET_KEY looks insecure for production. "
                    "Use at least 32 random characters (run `make secret`)."
                )
            if not self.use_secure_cookies:
                raise ValueError("COOKIE_SECURE must not be disabled in production.")
        if self.cookie_samesite == "none" and not self.use_secure_cookies:
            raise ValueError("COOKIE_SAMESITE=none requires secure cookies.")
        if self.ai_provider != "mock":
            if not self.ai_api_key:
                raise ValueError(f"AI_API_KEY is required when AI_PROVIDER={self.ai_provider}.")
            if not self.ai_model:
                raise ValueError(f"AI_MODEL is required when AI_PROVIDER={self.ai_provider}.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
