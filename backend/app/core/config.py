from functools import lru_cache
from typing import List
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from dotenv import load_dotenv
import os

# Force load the .env file
BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend folder
ENV_PATH = BASE_DIR / ".env"

print("=" * 60)
print(f"Looking for .env at: {ENV_PATH}")
print(f".env exists? → {ENV_PATH.exists()}")

# Force load it
if ENV_PATH.exists():
    load_dotenv(dotenv_path=ENV_PATH, override=True)
    print("dotenv loaded successfully")
else:
    print("WARNING: .env file NOT found!")

print(f"DATABASE_URL from os.environ = {os.getenv('DATABASE_URL')}")
print("=" * 60)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_PATH) if ENV_PATH.exists() else None,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "Resume Management System"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str = "change-me-to-a-long-random-string-at-least-32-chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/resume_db"

    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    AI_PROVIDER: str = "groq"
    GROQ_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    TESSERACT_CMD: str = "tesseract"
    OCR_LANGUAGE: str = "eng"

    STORAGE_PROVIDER: str = "supabase"
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    STORAGE_BUCKET: str = "resumes"

    STORAGE_ENDPOINT: str = ""
    STORAGE_ACCESS_KEY: str = ""
    STORAGE_SECRET_KEY: str = ""
    STORAGE_REGION: str = "auto"

    MAX_FILE_SIZE_MB: int = 15
    MAX_BATCH_FILES: int = 50

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def max_file_size_bytes(self) -> int:
        return self.MAX_FILE_SIZE_MB * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    return s