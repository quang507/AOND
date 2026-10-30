"""Provider CHỈ ĐỂ TEST: lõi gọi model qua lệnh `claude -p` (Claude Code CLI) — tốn quota gói Claude Code của người chạy, không tốn tiền API
(SRS-5.1zzzzzzz300, chủ dự án 30/10/2026: "cài claude code dùng quota của bên mình đi").

KHÔNG dùng cho bot phục vụ khách thật (VPS): quota gói Claude Code dành cho người dùng tự làm việc; bot trả lời khách là sản phẩm → API key.
Bật bằng `AIOI_LLM_PROVIDER=claude_cli` khi chạy `cli.py` / `scripts/thu-cli.py` trên máy mình.

Khác đường API (kết quả không đại diện hoàn toàn): lịch sử chat gửi thành MỘT bản ghi chép trong lời nhắn (CLI không nhận lượt assistant);
không có công cụ (vòng agent mua chạy như model không gọi công cụ); không đọc ảnh; mỗi lần gọi CLI khởi động vài giây; không có dấu cache
riêng (`RANH_GIOI_CACHE` bị bỏ). Bóc tách dùng `--json-schema` của CLI (đầu ra có cấu trúc)."""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import tempfile
import time
from typing import Any, Callable

from .base import MODEL_CHAT_LUOT, LLMProvider, Message, bo_ranh_gioi
from .claude import chuan_theo_schema

log = logging.getLogger(__name__)

HAN_GIAY = 180


def _ghi_chep(messages: list[Message]) -> str:
    """Lịch sử chat → một bản ghi chép (cũ → mới). Lượt cuối là tin khách cần trả lời."""
    dong = []
    for m in messages:
        ai = "KHÁCH" if m.role == "user" else "EM (bot)"
        dong.append(f"{ai}: {m.content}")
    return ("LỊCH SỬ CUỘC CHAT (cũ → mới):\n" + "\n\n".join(dong)
            + "\n\n---\nViết lượt tiếp theo của EM theo đúng hướng dẫn hệ thống, đáp tin KHÁCH cuối cùng. Chỉ viết đúng nội dung "
              "gửi khách (hoặc đúng JSON khi được yêu cầu), không thêm lời dẫn.")


def _chay_cli(model: str, system: str, loi_nhan: str, schema: dict[str, Any] | None) -> dict[str, Any]:
    """Một lần `claude -p` trong thư mục trống (không nạp CLAUDE.md / cấu hình dự án), không công cụ, không MCP, không lưu phiên."""
    with tempfile.TemporaryDirectory(prefix="aioi-cli-") as thu_muc:
        f = os.path.join(thu_muc, "system.txt")
        with open(f, "w", encoding="utf-8") as h:
            h.write(system)
        # Windows: npm cài `claude.cmd` — subprocess không tự thêm đuôi, phải tìm đường dẫn đủ (SRS-5.1zzzzzzz304).
        lenh = [shutil.which("claude") or "claude", "-p", "--model", model, "--output-format", "json", "--system-prompt-file", f,
                "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence"]
        if schema is not None:
            lenh += ["--json-schema", json.dumps(schema, ensure_ascii=False), "--max-turns", "3"]
        else:
            lenh += ["--max-turns", "1"]
        kq = subprocess.run(lenh, input=loi_nhan, capture_output=True, text=True, encoding="utf-8", cwd=thu_muc, timeout=HAN_GIAY)
    if kq.returncode != 0 and not kq.stdout.strip():
        raise RuntimeError(f"claude -p hỏng (mã {kq.returncode}): {kq.stderr.strip()[:300]}")
    j = json.loads(kq.stdout)
    if j.get("is_error"):
        raise RuntimeError(f"claude -p báo lỗi: {str(j.get('result'))[:300]}")
    return j


class ClaudeCliProvider(LLMProvider):
    """`chat` / `reply` dùng model chat (AIOI_CHAT_MODEL, hoặc model của lượt), `extract` dùng AIOI_EXTRACT_MODEL. Đếm số lần gọi và tiền quy
    đổi CLI báo (`total_cost_usd` — giá niêm yết, quota gói không trừ tiền thật) để so model."""

    def __init__(self, settings: Any, chay: Callable[..., dict[str, Any]] | None = None):
        self._chat_model = settings.chat_model
        self._extract_model = settings.extract_model
        self._chay = chay or _chay_cli
        self.so_lan = 0
        self.tien_quy_doi = 0.0
        self.giay = 0.0

    def _goi(self, model: str, system: str, messages: list[Message], schema: dict[str, Any] | None = None) -> dict[str, Any]:
        bat_dau = time.monotonic()
        j = self._chay(model, bo_ranh_gioi(system), _ghi_chep(messages), schema)
        self.so_lan += 1
        self.tien_quy_doi += float(j.get("total_cost_usd") or 0)
        self.giay += time.monotonic() - bat_dau
        return j

    def chat(self, system: str, messages: list[Message], max_tokens: int = 256) -> str:
        j = self._goi(MODEL_CHAT_LUOT.get() or self._chat_model, system, messages)
        return str(j.get("result") or "").strip()

    def extract(self, system: str, messages: list[Message], json_schema: dict[str, Any]) -> dict[str, Any]:
        j = self._goi(self._extract_model, system, messages, json_schema)
        kq = j.get("structured_output")
        if not isinstance(kq, dict):
            try:
                kq = json.loads(str(j.get("result") or "{}"))
            except ValueError:
                log.warning("claude_cli extract: không đọc được JSON — trả rỗng")
                kq = {}
        return chuan_theo_schema(kq, json_schema)

    def describe_media(self, items: list[tuple[bytes, str]], instruction: str, max_tokens: int = 1024) -> str:
        raise NotImplementedError("claude_cli: chưa đọc ảnh / PDF (chỉ để test lời chat)")

    def group_media(self, items: list[tuple[bytes, str]], labels: list[str], instruction: str,
                    json_schema: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("claude_cli: chưa đọc ảnh / PDF (chỉ để test lời chat)")

    def extract_media(self, items: list[tuple[bytes, str]], instruction: str, json_schema: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("claude_cli: chưa đọc ảnh / PDF (chỉ để test lời chat)")
