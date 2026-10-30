"""LLM provider abstraction — Claude (chạy thật) / mock (test offline). Bản Gemini đã gỡ 19/10/2026: hỏng cấu hình, không dùng."""
from __future__ import annotations

from ..config import Settings
from .base import LLMProvider, Message


def build_provider(settings: Settings) -> LLMProvider:
    provider = settings.effective_provider
    if provider == "claude":
        from .claude import ClaudeProvider

        chinh = ClaudeProvider(settings)
        # SRS-5.1zzzzzzz117: Claude hỏng (hết số dư, quá tải…) thì Gemini rồi Groq — chỉ khi có khoá.
        from .du_phong import URL_GEMINI, URL_GROQ, DuPhongProvider, Nguon

        nguon = [Nguon("Gemini", URL_GEMINI, list(settings.gemini_api_keys), list(settings.gemini_chat_models), True),
                 Nguon("Groq", URL_GROQ, list(settings.groq_api_keys), list(settings.groq_chat_models), False)]
        if not any(n.khoa for n in nguon):
            return chinh
        return DuPhongProvider(chinh, nguon, so=getattr(chinh, "_so", None))
    if provider == "claude_cli":   # SRS-5.1zzzzzzz300: CHỈ ĐỂ TEST trên máy mình — gọi model qua `claude -p` (quota gói Claude Code)
        from .claude_cli import ClaudeCliProvider

        return ClaudeCliProvider(settings)
    if provider == "mock":
        from .mock import MockProvider

        return MockProvider(settings)
    raise ValueError(f"Unknown LLM provider: {provider!r}")


__all__ = ["LLMProvider", "Message", "build_provider"]
