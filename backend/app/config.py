from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    max_upload_size_mb: int = 20
    cors_allowed_origin: str = "http://localhost:4200"
    color_match_tolerance: float = 30.0
    auth_disabled: bool = False


settings = Settings()
