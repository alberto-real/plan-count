from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    openrouter_api_key: str = "stub-key"
    max_upload_size_mb: int = 20
    cors_allowed_origin: str = "http://localhost:4200"
    legend_model: str = "openai/gpt-4o"
    color_match_tolerance: float = 30.0


settings = Settings()
