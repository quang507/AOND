"""Sổ token — mỗi lần gọi Claude ghi số token (vào / ra / ghi cache / đọc cache) và model THẬT vào Supabase qua rpc
`cong_token` (bảng `bot_usage` + `bot_usage_model`), để /admin quy ra đô bằng `lib/gia-model.ts` (SRS-5.1zzzzzzz49).

Bot TypeScript cũ ghi sổ này; lõi Python thay nó từ 18/10/2026 mà không ghi gì → CRM tưởng bot không tốn đồng nào. Ở đây chỉ
ghi CON SỐ + tên model, không bao giờ ghi nội dung tin. Giá KHÔNG để ở đây (một nguồn: `lib/gia-model.ts`), dòng log chỉ in
token. Gửi trên luồng nền để không cộng độ trễ vào câu trả lời; lỗi mạng thì bỏ qua (sổ chi phí không được làm hỏng lượt chat).
"""
from __future__ import annotations

import json
import os
import sys
import threading
import urllib.request
from typing import Any, Callable

_LOG = os.getenv("AIOI_LOG_COST", "1") != "0"   # AIOI_LOG_COST=0 để tắt dòng log stderr


def dem_token(resp: Any) -> dict[str, int] | None:
    """Số token của một phản hồi Messages API; None khi không có `usage` (mock / lỗi)."""
    u = getattr(resp, "usage", None)
    if u is None:
        return None
    lay = lambda k: int(getattr(u, k, 0) or 0)  # noqa: E731
    return {"p_in": lay("input_tokens"), "p_out": lay("output_tokens"),
            "p_cache_write": lay("cache_creation_input_tokens"), "p_cache_read": lay("cache_read_input_tokens")}


class SoToken:
    """`gui(body)` = gửi một dòng lên sổ (mặc định POST rpc cong_token bằng service_role); None = không có Supabase, chỉ log."""

    def __init__(self, gui: Callable[[dict[str, Any]], None] | None = None, nen: bool = True):
        self._gui = gui
        self._nen = nen

    @classmethod
    def tu_cau_hinh(cls, supabase_url: str | None, service_key: str | None) -> "SoToken":
        if not (supabase_url and service_key):
            return cls(None)
        url = f"{supabase_url.rstrip('/')}/rest/v1/rpc/cong_token"

        def gui(body: dict[str, Any]) -> None:
            req = urllib.request.Request(
                url, data=json.dumps(body).encode("utf-8"), method="POST",
                headers={"apikey": service_key, "Authorization": f"Bearer {service_key}",
                         "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as r:
                r.read()

        return cls(gui)

    def ghi(self, nhan: str, model_goi: str, resp: Any) -> dict[str, Any] | None:
        """Ghi một lượt gọi. `model_goi` = model đã yêu cầu; sổ lấy `resp.model` (model API thật sự chạy) khi có."""
        so = dem_token(resp)
        if so is None:
            return None
        body = {**so, "p_model": str(getattr(resp, "model", None) or model_goi)}
        if _LOG:
            print(f"   [💲 {nhan} · {body['p_model']} · in={so['p_in']} out={so['p_out']} "
                  f"cache_w={so['p_cache_write']} cache_r={so['p_cache_read']}]", file=sys.stderr, flush=True)
        if self._gui is not None:
            if self._nen:
                threading.Thread(target=self._gui_an_toan, args=(body,), daemon=True).start()
            else:
                self._gui_an_toan(body)
        return body

    def _gui_an_toan(self, body: dict[str, Any]) -> None:
        try:
            self._gui(body)  # type: ignore[misc]
        except Exception as e:  # noqa: BLE001 — sổ chi phí hỏng thì lượt chat vẫn chạy
            print(f"   [💲 không ghi được sổ token: {type(e).__name__}]", file=sys.stderr, flush=True)
