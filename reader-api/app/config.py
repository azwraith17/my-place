from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    reader_password: str = "changeme"
    cookie_secret: str = "change-me"
    library_path: Path = Path("/library")
    data_path: Path = Path("/data")
    cookie_name: str = "reader_session"
    cookie_max_age: int = 60 * 60 * 24 * 30  # 30 days


settings = Settings()
