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
import time
import urllib.request
from typing import Any, Callable

_LOG = os.getenv("AIOI_LOG_COST", "1") != "0"   # AIOI_LOG_COST=0 để tắt dòng log stderr

# Token của MỘT lượt chat (SRS-5.1zzzzzzz130, chế độ test): engine.handle chạy cả lượt trên một luồng, nên cộng vào bộ nhớ của luồng đó.
# Chỉ để tin phụ "$$$$$" báo lượt này tốn bao nhiêu — sổ Supabase ở dưới vẫn là nguồn chi phí thật.
_LUOT = threading.local()


def bat_dau_luot() -> None:
    """Bắt đầu đếm token cho lượt chat đang chạy trên luồng này (xoá số của lượt trước)."""
    _LUOT.tong = {}


def tong_luot() -> dict[str, dict[str, int]]:
    """Token đã tiêu từ lúc `bat_dau_luot` trên luồng này, theo model ({p_in, p_out, p_cache_write, p_cache_read, calls}); chưa bắt đầu → {}."""
    return {m: dict(v) for m, v in (getattr(_LUOT, "tong", None) or {}).items()}


def _cong_luot(model: str, so: dict[str, int]) -> None:
    tong = getattr(_LUOT, "tong", None)
    if tong is None:
        return
    d = tong.setdefault(model, {"p_in": 0, "p_out": 0, "p_cache_write": 0, "p_cache_read": 0, "calls": 0})
    for k in ("p_in", "p_out", "p_cache_write", "p_cache_read"):
        d[k] += int(so.get(k, 0) or 0)
    d["calls"] += 1


def dem_token(resp: Any) -> dict[str, int] | None:
    """Số token của một phản hồi Messages API; None khi không có `usage` (mock / lỗi)."""
    u = getattr(resp, "usage", None)
    if u is None:
        return None
    lay = lambda k: int(getattr(u, k, 0) or 0)  # noqa: E731
    return {"p_in": lay("input_tokens"), "p_out": lay("output_tokens"),
            "p_cache_write": lay("cache_creation_input_tokens"), "p_cache_read": lay("cache_read_input_tokens")}


class SoToken:
    """`gui(body)` = gửi một dòng lên sổ (mặc định POST rpc cong_token bằng service_role); None = không có Supabase, chỉ log.
    `rpc(ten, body)` = gọi hàm khác của DB (beat / log_loi) cho tín hiệu "model chính sống / hết số dư" ở thẻ Quota tiêu hao."""

    def __init__(self, gui: Callable[[dict[str, Any]], None] | None = None, nen: bool = True,
                 rpc: Callable[[str, dict[str, Any]], None] | None = None):
        self._gui = gui
        self._nen = nen
        self._rpc = rpc
        self._beat_luc = 0.0

    @classmethod
    def tu_cau_hinh(cls, supabase_url: str | None, service_key: str | None) -> "SoToken":
        if not (supabase_url and service_key):
            return cls(None)
        goc = f"{supabase_url.rstrip('/')}/rest/v1/rpc/"

        def rpc(ten: str, body: dict[str, Any]) -> None:
            req = urllib.request.Request(
                goc + ten, data=json.dumps(body).encode("utf-8"), method="POST",
                headers={"apikey": service_key, "Authorization": f"Bearer {service_key}",
                         "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as r:
                r.read()

        return cls(lambda body: rpc("cong_token", body), rpc=rpc)

    def ghi(self, nhan: str, model_goi: str, resp: Any) -> dict[str, Any] | None:
        """Ghi một lượt gọi. `model_goi` = model đã yêu cầu; sổ lấy `resp.model` (model API thật sự chạy) khi có."""
        so = dem_token(resp)
        if so is None:
            return None
        body = {**so, "p_model": str(getattr(resp, "model", None) or model_goi)}
        _cong_luot(body["p_model"], so)
        if _LOG:
            print(f"   [💲 {nhan} · {body['p_model']} · in={so['p_in']} out={so['p_out']} "
                  f"cache_w={so['p_cache_write']} cache_r={so['p_cache_read']}]", file=sys.stderr, flush=True)
        if self._gui is not None:
            self._chay(self._gui_an_toan, body)
        # Dấu sống model chính (bot_health 'model_chinh', tiết chế 2 phút) — thẻ Quota tiêu hao dùng để biết đã HẾT số dư
        # hay đã gọi lại được (quota_tieu_hao, FR-192). Bot TS đóng dấu này; lõi Python từ 19/10 (SRS-5.1zzzzzzz56).
        if self._rpc is not None and time.time() - self._beat_luc > 120:
            self._beat_luc = time.time()
            self._chay(self._rpc_an_toan, "beat", {"p_who": "model_chinh"})
        return body

    def ghi_du_phong(self, model: str, vao: int, ra: int) -> None:
        """Lượt gọi qua đường dự phòng (SRS-5.1zzzzzzz117: "Gemini:<model>" / "Groq:<model>") — chỉ số token, KHÔNG đóng dấu sống
        model chính (dấu đó để biết Claude đã gọi lại được)."""
        _cong_luot(model, {"p_in": vao, "p_out": ra})
        if self._gui is not None:
            self._chay(self._gui_an_toan, {"p_in": vao, "p_out": ra, "p_cache_write": 0, "p_cache_read": 0, "p_model": model})

    def bao_loi(self, nhan: str, e: Exception) -> None:
        """Lượt gọi Claude hỏng → một dòng sổ lỗi (log_loi). Chỉ tên lỗi + thông báo của API (vd "credit balance is too low"),
        không có nội dung tin khách. Thẻ Quota tiêu hao đọc dòng có "credit balance is too low" để báo HẾT SỐ DƯ."""
        if self._rpc is None:
            return
        self._chay(self._rpc_an_toan, "log_loi",
                   {"p_source": f"claude {nhan}", "p_detail": f"{type(e).__name__}: {str(e)[:500]}"})

    def ghi_loi(self, nguon: str, chi_tiet: str) -> None:
        """Một dòng sổ lỗi (log_loi) cho sự cố ngoài lượt gọi Claude (vd không chép được tin thoại). Không mang nội dung tin khách."""
        if self._rpc is not None:
            self._chay(self._rpc_an_toan, "log_loi", {"p_source": nguon, "p_detail": chi_tiet[:500]})

    def _chay(self, ham: Callable[..., None], *args: Any) -> None:
        if self._nen:
            threading.Thread(target=ham, args=args, daemon=True).start()
        else:
            ham(*args)

    def _rpc_an_toan(self, ten: str, body: dict[str, Any]) -> None:
        try:
            self._rpc(ten, body)  # type: ignore[misc]
        except Exception as e:  # noqa: BLE001
            print(f"   [💲 không gọi được {ten}: {type(e).__name__}]", file=sys.stderr, flush=True)

    def _gui_an_toan(self, body: dict[str, Any]) -> None:
        try:
            self._gui(body)  # type: ignore[misc]
        except Exception as e:  # noqa: BLE001 — sổ chi phí hỏng thì lượt chat vẫn chạy
            print(f"   [💲 không ghi được sổ token: {type(e).__name__}]", file=sys.stderr, flush=True)
