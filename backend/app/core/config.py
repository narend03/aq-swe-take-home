from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AQ Code Platform"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./app.db"
    echo_sql: bool = False
    allowed_origins: Optional[str] = None

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False)

    @property
    def cors_origins(self) -> List[str]:
        if self.allowed_origins:
            return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
