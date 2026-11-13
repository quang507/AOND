"""LQC — người chăm tin, điều phối MỌI tin chủ động gửi người bán — SRS-5.1zzzzzzz475 (chủ dự án 13/11/2026: "thiết kế làm sao LQC chạy cho
tốt", làm đợt 2 — điều phối chung — trước; "điều phối chung vẫn là tên LQC, đó là tên của sếp đặt").

Trước đây sáu vòng tự nhắn chủ nhà, mỗi vòng giữ luật riêng: tin nhắc 10 phút xin ảnh (`followup`), hàng câu hỏi sau đăng (`hoi_sau_dang`),
Image LQC (`qc_anh`), hỏi còn bán (`hoi_con_ban`), giữ kết nối (`giu_ket_noi`). Trần "3 tin / ngày" chỉ đếm tin của hàng câu hỏi, nên một chủ
có thể nhận tin xin ảnh của vòng này rồi câu pháp lý của vòng kia trong cùng buổi. Nay mọi vòng hỏi chung MỘT hàm `ly_do_khong_nhan`:
- khung 8–21 giờ; chat im ít nhất `IM_TOI_THIEU_GIAY`; không nhường sân cho người thật (cờ nhường sân + nút "giữ" trên CRM);
- MỖI NGƯỜI BÁN tối đa `TRAN_NGAY` tin chủ động một ngày — đếm mọi loại, mọi căn, đọc thẳng từ lịch sử chat (`so_tin_chu_dong_hom_nay`);
- việc hỏi (loại "hoi"): đang có tin chủ động chủ chưa đáp → chờ `CHO_KHI_LO_GIAY`; chủ bỏ qua `TOI_DA_LO_LIEN` tin liền → thôi hỏi;
  lời cuối của bot còn câu hỏi chủ chưa đáp → chờ như vậy. Việc giữ kết nối / hỏi còn bán có nhịp riêng (6 / 20 ngày) nên bỏ qua luật chờ
  đáp, vẫn theo khung giờ, im lặng, nhường sân và trần ngày.
Tin chủ động = lời bot cách lượt trước ít nhất `KHOANG_CHU_DONG_GIAY` (lời bot đáp khách đi trong vài giây; mọi vòng nhắc chờ chat im ≥ 5 phút)."""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from .bao_can_moi import trong_khung_gio

IM_TOI_THIEU_GIAY = int(os.environ.get("SAU_DANG_NHAC_GIAY", "600"))
CHO_KHI_LO_GIAY = int(os.environ.get("HOI_SAU_DANG_CHO_GIAY", str(24 * 3600)))
TOI_DA_LO_LIEN = int(os.environ.get("HOI_SAU_DANG_LO_LIEN", "2"))
TRAN_NGAY = int(os.environ.get("TIN_CHU_DONG_MOT_NGAY", "3"))
KHOANG_CHU_DONG_GIAY = 240
LOAI_NHIP_RIENG = ("giu_ket_noi", "con_ban")


def _ngay_vn(ts: float) -> str:
    return (datetime.fromtimestamp(ts, timezone.utc) + timedelta(hours=7)).strftime("%Y-%m-%d")


def la_tin_chu_dong(hs: list, i: int) -> bool:
    t = hs[i]
    return t.role == "assistant" and (i == 0 or t.at - hs[i - 1].at >= KHOANG_CHU_DONG_GIAY)


def so_tin_chu_dong_hom_nay(conv: Any, bay_gio: datetime) -> int:
    hs = list(getattr(conv, "history", None) or [])
    hom_nay = _ngay_vn(bay_gio.timestamp())
    return sum(1 for i in range(len(hs)) if la_tin_chu_dong(hs, i) and _ngay_vn(hs[i].at) == hom_nay)


def ly_do_khong_nhan(conv: Any, bay_gio: datetime, loai: str = "hoi", kho: Any = None, user_key: str | None = None,
                     im_giay: int | None = None) -> str | None:
    """Lý do KHÔNG nhắn chủ động lượt này, hoặc None = được nhắn. `kho` + `user_key` có thì đọc thêm nút "giữ" trên CRM (gọi mạng, để cuối)."""
    if not trong_khung_gio(bay_gio):
        return "ngoài khung giờ"
    hs = list(getattr(conv, "history", None) or [])
    if not hs:
        return "chưa có chat"
    ts = bay_gio.timestamp()
    cuoi = hs[-1]
    if ts - cuoi.at < (IM_TOI_THIEU_GIAY if im_giay is None else im_giay):
        return "đang chat"
    if getattr(conv, "nhuong_san_den", 0) > ts:
        return "nhường sân"
    if so_tin_chu_dong_hom_nay(conv, bay_gio) >= TRAN_NGAY:
        return "đủ tin hôm nay"
    if loai not in LOAI_NHIP_RIENG:
        # Số lời bot liền nhau ở cuối (sau tin cuối của chủ): 1 = bot vừa đáp chủ; ≥ 2 = đã có tin chủ động chủ chưa đáp.
        duoi = 0
        for t in reversed(hs):
            if t.role == "user":
                break
            if t.role == "assistant":
                duoi += 1
        from .followup import cau_hoi_cuoi_cua_bot
        if duoi >= 2:
            if ts - cuoi.at < CHO_KHI_LO_GIAY:
                return "chờ chủ đáp tin trước"
            if duoi - 1 >= TOI_DA_LO_LIEN:
                return "chủ không đáp"
        elif cau_hoi_cuoi_cua_bot(conv) and ts - cuoi.at < CHO_KHI_LO_GIAY:
            return "câu hỏi chưa đáp"
    giu = getattr(kho, "dang_giu_hoi_thoai", None)
    if giu is not None and user_key:
        try:
            if giu(user_key):
                return "người thật đang giữ"
        except Exception:  # noqa: BLE001 — đọc hụt thì coi như không giữ (như lượt chat)
            pass
    return None


def ly_do_theo_ma(engine: Any, user_key: str, loai: str, bay_gio: datetime | None = None) -> str | None:
    """Cho vòng chỉ có Zalo ID (hỏi còn bán, giữ kết nối): đọc hội thoại có sẵn (không tạo mới) rồi xét. Chưa có hội thoại → None."""
    from .qc_anh import _conv_co_san
    bay_gio = bay_gio or datetime.now(timezone.utc)
    with engine.khoa_luot(user_key):
        conv = _conv_co_san(engine, user_key)
        if conv is None:
            return None
        return ly_do_khong_nhan(conv, bay_gio, loai, engine._convstore, user_key)
