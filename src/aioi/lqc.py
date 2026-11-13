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
Tin chủ động = lời bot cách lượt trước ít nhất `KHOANG_CHU_DONG_GIAY` (lời bot đáp khách đi trong vài giây; mọi vòng nhắc chờ chat im ≥ 5 phút).

Đợt 1 (SRS-5.1zzzzzzz476) — LQC nghe chủ: chủ hẹn ("chiều chị gửi ảnh") thì im tới giờ hẹn, quá 30 phút mà chưa xong thì nhắc MỘT câu đúng lời
hẹn (vòng `hoi_sau_dang`), hẹn lần hai mà lỡ thì thôi; chủ báo bận thì im tới lúc chủ rảnh; chủ nói không có ảnh / ảnh sổ thì thôi xin thứ đó;
chủ tỏ ra phiền thì thôi hỏi (vẫn còn hỏi còn bán / giữ kết nối)."""
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


# ── Trạng thái của chủ với việc bot hỏi han — SRS-5.1zzzzzzz476 (LQC đợt 1, chủ dự án 13/11: "khách hẹn chiều chị gửi ảnh thì chiều nó hỏi lại")
# AI đọc theo nghĩa ở lượt chat (`prompts.operations_schema`: hen_lai_*, hen_xong, tam_dung_*, khong_co, ngung_cham), `ghi_tu_ke_hoach` kiểm cụm
# trích rồi ghi ô nội bộ của căn: `_hen_luc` / `_hen_viec` / `_hen_lan` / `_hen_so_anh` (căn đang nói), `_tam_dung_den` + `_ngung_cham` (mọi căn
# của chủ — chuyện của người, không của căn), `_khong_co` (căn đang nói).
SAU_HEN_GIAY = 30 * 60          # quá giờ hẹn bấy lâu mà việc chưa xong mới nhắc
HEN_XA_NHAT_GIAY = 7 * 86400    # giờ hẹn AI quy ra xa hơn thì bỏ (đọc sai)
LAN_HEN_TOI_DA = 2              # hẹn lần hai mà lỡ thì thôi nhắc
GOP_HEN_GIAY = 3 * 86400        # hai lần hẹn cách nhau trong khoảng này tính là hẹn lại


def doc_gio(s: Any) -> float | None:
    """"YYYY-MM-DD HH:MM" giờ Việt Nam → epoch; sai dạng → None."""
    try:
        d = datetime.strptime(str(s).strip()[:16], "%Y-%m-%d %H:%M")
    except ValueError:
        return None
    return (d - timedelta(hours=7)).replace(tzinfo=timezone.utc).timestamp()


def _so_anh(li: Any) -> int:
    from .engine import _image_count
    return _image_count(getattr(li, "media", None) or [])


def ghi_tu_ke_hoach(conv: Any, plan: dict, loi_khach: list[str], ts: float) -> None:
    """Ghi trạng thái chủ AI đọc ở lượt này (cụm trích phải có trong lời khách gần đây)."""
    from .engine import _vai_co_bang_chung
    ds = list(getattr(conv, "listings", None) or [])
    li = getattr(conv, "active", None)
    if not ds or li is None:
        return
    f = li.prop.fields
    co = lambda khoa: _vai_co_bang_chung(plan.get(f"{khoa}_trich_dan"), loi_khach)
    # Bận: lượt nào chủ nhắn mà không báo bận nữa là chủ đã rảnh lại.
    den = doc_gio(plan.get("tam_dung_den")) if co("tam_dung") else None
    for x in ds:
        if den and ts < den <= ts + HEN_XA_NHAT_GIAY:
            x.prop.fields["_tam_dung_den"] = str(int(den))
        else:
            x.prop.fields.pop("_tam_dung_den", None)
    if plan.get("ngung_cham") is True and co("ngung_cham"):
        for x in ds:
            x.prop.fields["_ngung_cham"] = "1"
    luc = doc_gio(plan.get("hen_lai_luc")) if co("hen_lai") else None
    if luc and ts < luc <= ts + HEN_XA_NHAT_GIAY:
        cu = doc_gio_epoch(f.get("_hen_dat"))
        f["_hen_lan"] = str(int(f.get("_hen_lan") or 0) + 1 if cu and ts - cu < GOP_HEN_GIAY else 1)
        f["_hen_luc"], f["_hen_dat"] = str(int(luc)), str(int(ts))
        f["_hen_viec"] = str(plan.get("hen_lai_viec") or "việc đã hẹn")[:60]
        f["_hen_so_anh"] = str(_so_anh(li))
    elif plan.get("hen_xong") is True:
        xoa_hen(li)
    khong = plan.get("khong_co")
    if isinstance(khong, list) and khong and co("khong_co"):
        da = set(filter(None, (f.get("_khong_co") or "").split(",")))
        f["_khong_co"] = ",".join(sorted(da | {k for k in khong if k in ("anh", "anh_so")}))
        moc = {"sau:anh", "sau:anh_lan_2"} if "anh" in khong else set()
        moc |= {"sau:anh_so"} if "anh_so" in khong else set()
        if moc:   # thôi xin thứ chủ không có — hàng câu hỏi coi như đã hỏi
            f["_sau_da_hoi"] = ",".join(sorted(set(filter(None, (f.get("_sau_da_hoi") or "").split(","))) | moc))


def doc_gio_epoch(s: Any) -> float | None:
    try:
        return float(s) if s else None
    except (TypeError, ValueError):
        return None


def xoa_hen(li: Any) -> None:
    for k in ("_hen_luc", "_hen_viec", "_hen_so_anh"):
        li.prop.fields.pop(k, None)


def hen_dang_treo(conv: Any) -> Any:
    """Căn có lời hẹn còn treo (chưa nhắc / chưa xong). Hẹn gửi ảnh mà ảnh đã về → xoá hẹn, None."""
    for li in getattr(conv, "listings", None) or []:
        f = li.prop.fields
        if not doc_gio_epoch(f.get("_hen_luc")):
            continue
        if "ảnh" in (f.get("_hen_viec") or "") and _so_anh(li) > int(f.get("_hen_so_anh") or 0):
            xoa_hen(li)
            continue
        return li
    return None


def chu_dang_hen(conv: Any, ts: float, loai: str = "hoi") -> str | None:
    """Lý do chủ muốn yên lúc này: đang bận, đang chờ tới giờ hẹn, hoặc đã bảo thôi hỏi (chỉ chặn việc hỏi)."""
    ds = list(getattr(conv, "listings", None) or [])
    if any((doc_gio_epoch(x.prop.fields.get("_tam_dung_den")) or 0) > ts for x in ds):
        return "chủ đang bận, hẹn nói sau"
    if loai in LOAI_NHIP_RIENG:
        return None
    if any(x.prop.fields.get("_ngung_cham") == "1" for x in ds):
        return "chủ không muốn hỏi thêm"
    li = hen_dang_treo(conv) if loai != "nhac_hen" else None
    if li is not None and ts < float(li.prop.fields["_hen_luc"]) + SAU_HEN_GIAY:
        return "chờ tới giờ hẹn"
    return None


def ly_do_khong_nhan(conv: Any, bay_gio: datetime, loai: str = "hoi", kho: Any = None, user_key: str | None = None,
                     im_giay: int | None = None) -> str | None:
    """Lý do KHÔNG nhắn chủ động lượt này, hoặc None = được nhắn. `kho` + `user_key` có thì đọc thêm nút "giữ" trên CRM (gọi mạng, để cuối)."""
    if not trong_khung_gio(bay_gio):
        return "ngoài khung giờ"
    hs = list(getattr(conv, "history", None) or [])
    if not hs:
        return "chưa có chat"
    ts = bay_gio.timestamp()
    hen = chu_dang_hen(conv, ts, loai)
    if hen:
        return hen
    cuoi = hs[-1]
    if ts - cuoi.at < (IM_TOI_THIEU_GIAY if im_giay is None else im_giay):
        return "đang chat"
    if getattr(conv, "nhuong_san_den", 0) > ts:
        return "nhường sân"
    if so_tin_chu_dong_hom_nay(conv, bay_gio) >= TRAN_NGAY:
        return "đủ tin hôm nay"
    if loai not in LOAI_NHIP_RIENG and loai != "nhac_hen":   # nhắc lời hẹn: chủ đã hứa, không chờ câu hỏi cũ được đáp
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
