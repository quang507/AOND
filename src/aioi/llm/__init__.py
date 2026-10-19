"""LLM provider abstraction — Claude (chạy thật) / mock (test offline). Bản Gemini đã gỡ 19/10/2026: hỏng cấu hình, không dùng."""
from __future__ import annotations

from ..config import Settings
from .base import LLMProvider, Message


def build_provider(settings: Settings) -> LLMProvider:
    provider = settings.effective_provider
    if provider == "claude":
        from .claude import ClaudeProvider

        return ClaudeProvider(settings)
    if provider == "mock":
        from .mock import MockProvider

        return MockProvider(settings)
    raise ValueError(f"Unknown LLM provider: {provider!r}")


__all__ = ["LLMProvider", "Message", "build_provider"]
