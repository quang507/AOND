"""Runtime configuration, read from environment (.env)."""
from __future__ import annotations

import os
from dataclasses import dataclass

try:  # optional dependency; harmless if missing
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass


@dataclass(frozen=True)
class Settings:
    provider: str
    anthropic_api_key: str | None
    chat_model: str
    vision_model: str
    extract_model: str = "claude-haiku-4-5"  # structured extraction/ops — cheap model is enough
    google_api_key: str | None = None  # for Google Drive folder listing (optional)
    db_path: str = "aioi.db"           # local persistent store (projects, later listings)
    max_photos_per_listing: int = 20      # cap photos KEPT per listing (storage cost control)
    groq_api_key: str | None = None       # Groq Cloud API key for Whisper STT
    groq_whisper_model: str = "whisper-large-v3-turbo"
    supabase_url: str = "https://rqxmmqmctpklqcmbfxuj.supabase.co"
    supabase_service_role_key: str | None = None
    gemini_api_keys: tuple[str, ...] = ()  # nhúng câu tìm địa danh theo nghĩa (dia_danh.py); không có = chỉ tra theo chữ

    @property
    def effective_provider(self) -> str:
        """Fall back to the offline mock provider when Claude is selected but no key is present."""
        if self.provider == "claude" and not self.anthropic_api_key:
            return "mock"
        return self.provider



def load_settings() -> Settings:
    return Settings(
        provider=os.getenv("AIOI_LLM_PROVIDER", "claude").strip().lower(),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
        chat_model=os.getenv("AIOI_CHAT_MODEL", "claude-haiku-4-5"),
        vision_model=os.getenv("AIOI_VISION_MODEL", "claude-opus-4-8"),
        extract_model=os.getenv("AIOI_EXTRACT_MODEL", "claude-haiku-4-5"),

        google_api_key=os.getenv("GOOGLE_API_KEY") or None,
        db_path=os.getenv("AIOI_DB_PATH", "aioi.db"),
        max_photos_per_listing=_int_env("AIOI_MAX_PHOTOS_PER_LISTING", 20),
        groq_api_key=os.getenv("GROQ_API_KEY") or None,
        groq_whisper_model=os.getenv("GROQ_WHISPER_MODEL", "whisper-large-v3-turbo"),
        supabase_url=os.getenv("SUPABASE_URL", "https://rqxmmqmctpklqcmbfxuj.supabase.co"),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY") or None,
        gemini_api_keys=_ds_khoa("GEMINI_API_KEY", "GEMINI_API_KEYS"),
    )


def _ds_khoa(*ten: str) -> tuple[str, ...]:
    """Các khoá từ biến môi trường (biến có thể mang nhiều khoá cách nhau dấu phẩy), bỏ trùng, giữ thứ tự."""
    ds = [k.strip() for t in ten for k in (os.getenv(t) or "").split(",") if k.strip()]
    return tuple(dict.fromkeys(ds))


def _int_env(name: str, default: int) -> int:
    """Read an int from the environment, falling back to `default` on missing/invalid."""
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default
