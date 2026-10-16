from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    falkordb_host: str = "localhost"
    falkordb_port: int = 6379
    falkordb_password: str | None = None
    falkordb_username: str | None = None
    openai_api_key: str | None = None
    model_provider: str = "openai"
    model_name: str = "gpt-4o-mini"
    session_secret: str = "local-development-only-change-me"
    max_upload_bytes: int = 250_000
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
