"""Đồ giả dùng chung cho test (audit Đợt 0, SRS-5.1zzzzzzz316, R6).

Vòng agent bán / mua luôn chạy (công tắc gỡ ở Đợt 8, SRS-5.1zzzzzzz319), nên engine gọi `provider.converse(...)`. Đồ giả viết tay chỉ có `chat` / `reply`
/ `extract` thì vỡ ở đường production. Trộn `KhongCongCu` vào: vòng công cụ trả lời bằng chữ, không gọi công cụ — đúng như mặc định
`LLMProvider.converse` (model không hỗ trợ công cụ), vòng agent vẫn dừng."""
from __future__ import annotations

from typing import Any

from aioi.llm.base import Message, ToolTurn


class KhongCongCu:
    def converse(self, system: str, messages: list[dict[str, Any]], tools: list[dict[str, Any]], max_tokens: int = 1024) -> ToolTurn:
        if any(t.get("name") == "ghi_o" for t in tools):
            # Bước ghi của vòng agent gộp / agent bóc (SRS-5.1zzzzzzz371): model không gọi công cụ → engine đọc bằng form. Không lấy lời đã soạn
            # của đồ giả (`chat`) — lời đó dành cho lượt viết lời.
            return ToolTurn(text="", tool_calls=[])
        msgs = [Message(m["role"], m["content"]) for m in messages if isinstance(m.get("content"), str)]
        return ToolTurn(text=self.chat(system, msgs, max_tokens=max_tokens), tool_calls=[])
