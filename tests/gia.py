"""Đồ giả dùng chung cho test (audit Đợt 0, SRS-5.1zzzzzzz316, R6).

Production bật vòng agent (`AGENT_BAN` / `AGENT_MUA` = bat), nên engine gọi `provider.converse(...)`. Đồ giả viết tay chỉ có `chat` / `reply`
/ `extract` thì vỡ ở đường production. Trộn `KhongCongCu` vào: vòng công cụ trả lời bằng chữ, không gọi công cụ — đúng như mặc định
`LLMProvider.converse` (model không hỗ trợ công cụ), vòng agent vẫn dừng."""
from __future__ import annotations

from typing import Any

from aioi.llm.base import Message, ToolTurn


class KhongCongCu:
    def converse(self, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]], max_tokens: int = 1024) -> ToolTurn:
        msgs = [Message(m["role"], m["content"]) for m in messages if isinstance(m.get("content"), str)]
        return ToolTurn(text=self.chat(system, msgs, max_tokens=max_tokens), tool_calls=[])
