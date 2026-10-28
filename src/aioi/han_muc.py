"""Trần lượt trả lời — mỗi người và cả hệ thống mỗi ngày (FR-192, SRS-5.1zzzzzzz53).

Bot TypeScript cũ chặn hai tầng trước khi gọi model: `bump_user_quota(uid)` (30 lượt / giờ, 120 / 24 giờ; người đã là người
rao / admin ×4) và `bump_model_quota(trần)` (trần cả hệ thống mỗi ngày, Vault `DAILY_MODEL_CALL_CAP`, mặc định 1000;
chạm trần thì DB tự báo admin một lần mỗi ngày). Lõi Python thay bộ não từ 18/10/2026 mà không gọi hai hàm đó → không trần
nào, ai có cửa vào cũng đốt được tiền model không giới hạn, và thẻ "Quota tiêu hao" ở /admin đếm 0 lượt.

Vượt trần thì bot IM (như bản cũ). DB không trả lời được thì CHO QUA và ghi log: sổ hạn mức hỏng không được làm câm bot với
khách thật — trần là lưới chống đốt tiền, không phải cổng đăng nhập.
"""
from __future__ import annotations

import json
import logging
import urllib.request
from typing import Any, Callable

log = logging.getLogger("aioi.han_muc")

TRAN_NGAY_MAC_DINH = 1000   # đúng con số bot TS và quota_tieu_hao() dùng khi Vault không có DAILY_MODEL_CALL_CAP


class HanMuc:
    """`rpc(ten, body)` = gọi một hàm Supabase, trả kết quả JSON; None = không có Supabase (chạy thử) → không chặn."""

    def __init__(self, rpc: Callable[[str, dict[str, Any]], Any] | None, tran_ngay: int = TRAN_NGAY_MAC_DINH):
        self._rpc = rpc
        self.tran_ngay = tran_ngay

    @classmethod
    def tu_cau_hinh(cls, supabase_url: str | None, service_key: str | None) -> "HanMuc":
        if not (supabase_url and service_key):
            return cls(None)
        goc = f"{supabase_url.rstrip('/')}/rest/v1/rpc/"

        def rpc(ten: str, body: dict[str, Any]) -> Any:
            req = urllib.request.Request(
                goc + ten, data=json.dumps(body).encode("utf-8"), method="POST",
                headers={"apikey": service_key, "Authorization": f"Bearer {service_key}",
                         "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as r:
                return json.loads(r.read().decode("utf-8") or "null")

        tran = TRAN_NGAY_MAC_DINH
        try:
            v = rpc("get_secret", {"secret_name": "DAILY_MODEL_CALL_CAP"})
            if isinstance(v, (str, int)) and str(v).strip().isdigit() and int(str(v).strip()) > 0:
                tran = int(str(v).strip())
        except Exception:  # noqa: BLE001 — không đọc được Vault thì dùng mặc định
            pass
        return cls(rpc, tran)

    def cho_phep(self, uid: str) -> bool:
        """True = được trả lời lượt này (và đã cộng một lượt vào sổ)."""
        if self._rpc is None:
            return True
        try:
            if self._rpc("bump_user_quota", {"p_uid": uid}) is False:
                log.info("han muc nguoi: %s vuot tran, bot im", uid[-4:])
                return False
            if self._rpc("bump_model_quota", {"p_limit": self.tran_ngay}) is False:
                log.warning("han muc ngay: cham tran %s luot, bot im", self.tran_ngay)
                return False
        except Exception as e:  # noqa: BLE001
            log.warning("han muc: khong goi duoc DB (%s) — cho qua", type(e).__name__)
        return True
