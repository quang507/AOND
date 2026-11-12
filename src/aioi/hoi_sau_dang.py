"""LQC hỏi sau đăng chạy nền — SRS-5.1zzzzzzz432 (chủ dự án 12/11/2026 "Làm tiếp 4–7", lỗ hổng 4: các mảng Pháp lý · Lợi thế · So sánh chỉ chạy
khi chủ nhà nhắn — chủ im thì tin dừng ở đó).

Mỗi lượt (`HOI_SAU_DANG_CHU_KY_GIAY`, server): tin đang hiện đã báo đăng (`_da_bao_dang`, đã nói phí lúc duyệt) → engine chọn cụm sau đăng kế
(`Engine.cum_sau_ke`, cùng thứ tự và cùng mốc `sau:*` với lượt chat) → model viết MỘT tin ngắn làm đúng việc của khối (`Engine.khoi_cum_sau`).

Khi nào được nhắn (một người bán tối đa một tin mỗi lượt, mỗi lượt tối đa `TOI_DA_MOT_LUOT` tin):
- khung 8–21 giờ; không nhường sân cho người thật; chat im ít nhất `IM_TOI_THIEU_GIAY` (10 phút, như tin nhắc ảnh SRS-421);
- căn chủ đang khai dở (tin khác chưa đăng) thì không chen vào;
- lời cuối của bot còn câu hỏi chủ chưa đáp → chờ `CHO_KHI_LO_GIAY` (24 giờ);
- đã có tin chủ động chủ chưa đáp (mọi loại: nhắc ảnh, QC ảnh, tin này…) → chờ 24 giờ, tối đa `TOI_DA_LO_LIEN` tin liền chủ không đáp;
- mỗi căn tối đa `TOI_DA_MOT_NGAY` tin nền một ngày; trần chung `schema.TRAN_CAU_SAU_DANG` nằm trong `cum_sau_dang`.
Model hụt hay viết hơn một câu hỏi → không gửi (không có câu mẫu dự phòng — câu hỏi sai ngữ cảnh tệ hơn không hỏi)."""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from .bao_can_moi import trong_khung_gio
from .xung_ho import goi_toi

log = logging.getLogger(__name__)

IM_TOI_THIEU_GIAY = int(os.environ.get("SAU_DANG_NHAC_GIAY", "600"))
CHO_KHI_LO_GIAY = int(os.environ.get("HOI_SAU_DANG_CHO_GIAY", str(24 * 3600)))
TOI_DA_LO_LIEN = int(os.environ.get("HOI_SAU_DANG_LO_LIEN", "2"))
TOI_DA_MOT_NGAY = int(os.environ.get("HOI_SAU_DANG_MOT_NGAY", "3"))
TOI_DA_MOT_LUOT = 5
DAI_TOI_DA = 500


def _ngay_vn(bay_gio: datetime) -> str:
    return (bay_gio.astimezone(timezone.utc) + timedelta(hours=7)).strftime("%Y-%m-%d")


def ly_do_khong_nhac(conv: Any, f: dict, bay_gio: datetime) -> str | None:
    """Lý do KHÔNG nhắn lượt này, hoặc None = được nhắn."""
    hs = list(getattr(conv, "history", None) or [])
    if not hs:
        return "chưa có chat"
    ts = bay_gio.timestamp()
    cuoi = hs[-1]
    if ts - cuoi.at < IM_TOI_THIEU_GIAY:
        return "đang chat"
    if getattr(conv, "nhuong_san_den", 0) > ts:
        return "nhường sân"
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
    ngay, _, n = (f.get("_sau_nhac_ngay") or "").partition(":")
    if ngay == _ngay_vn(bay_gio) and n.isdigit() and int(n) >= TOI_DA_MOT_NGAY:
        return "đủ tin hôm nay"
    return None


def viet_tin(engine: Any, conv: Any, li: Any, khoi: str, goi: str, toi: str) -> str:
    """Model viết MỘT tin theo khối; hụt / dài / hơn một câu hỏi → ""."""
    from .llm import Message
    from .prompts import build_hoi_sau_dang_nhac_system
    he = build_hoi_sau_dang_nhac_system(getattr(conv.assistant, "name", None) or "em", li.prop, khoi, goi, toi)
    gan = "\n".join(f"{'Khách' if t.role == 'user' else 'Em'}: {(t.content or '')[:300]}" for t in conv.history[-6:])
    try:
        tin = engine._provider.reply(he, [Message("user", f"Mấy lượt vừa nói:\n{gan}\n\nViết tin gửi chủ nhà.")], max_tokens=250).strip()
    except Exception as e:  # noqa: BLE001
        log.warning("hoi_sau_dang: model hụt (%s)", type(e).__name__)
        return ""
    if not tin or len(tin) > DAI_TOI_DA or tin.count("?") > 1:
        return ""
    return tin


def _nhac_mot(engine: Any, uk: str, lid: str, bay_gio: datetime, gui: Callable[[str, str], bool]) -> tuple[str, str] | None:
    """Chọn cụm + viết tin + GỬI + ghi mốc dưới khoá lượt của khách. (tin, mã cụm) hoặc None. Gửi trước, ghi mốc sau (SRS-5.1zzzzzzz441):
    bridge hụt thì câu chưa tới chủ nên không tính "đã hỏi" — bản trước ghi mốc rồi mới gửi, bridge hụt là mất câu hỏi luôn."""
    from .engine import _detect_customer_pronoun
    from .qc_anh import _conv_co_san
    with engine.khoa_luot(uk):
        conv = _conv_co_san(engine, uk)
        if conv is None or getattr(conv, "role", "") == "buyer":
            return None
        li = next((x for x in conv.listings if str(x.listing_id).replace("-", "") == lid), None)
        if li is None:
            return None
        f = li.prop.fields
        if f.get("_da_bao_dang") != "1" or f.get("_phi_da_hoi") != "1" or f.get("_ngoai_vung"):
            return None
        act = getattr(conv, "active", None)
        if act is not None and act is not li and act.prop.fields.get("_da_bao_dang") != "1" and act.prop.fields_khach():
            return None   # chủ đang khai một căn khác chưa đăng — không chen câu hỏi của căn cũ
        if ly_do_khong_nhac(conv, f, bay_gio):
            return None
        da_hoi = {x for x in (f.get("_sau_da_hoi") or "").split(",") if x}
        cum, kq_ss = engine.cum_sau_ke(li, da_hoi)
        if not cum:
            return None
        khoi, moc = engine.khoi_cum_sau(li, cum, kq_ss)
        goi, toi = goi_toi(_detect_customer_pronoun(conv, ""), getattr(conv.assistant, "name", None))
        tin = viet_tin(engine, conv, li, khoi, goi, toi)
        if not tin:
            return None
        try:
            if not gui(uk, tin):
                return None
        except Exception as e:  # noqa: BLE001
            log.warning("hoi_sau_dang: bridge hụt (%s)", type(e).__name__)
            return None
        f["_sau_da_hoi"] = ",".join(sorted(da_hoi | {moc}))
        hom_nay = _ngay_vn(bay_gio)
        ngay, _, n = (f.get("_sau_nhac_ngay") or "").partition(":")
        f["_sau_nhac_ngay"] = f"{hom_nay}:{(int(n) if ngay == hom_nay and n.isdigit() else 0) + 1}"
        if engine._convstore is not None:
            engine._convstore.save(conv)
    return tin, cum[0]


def chay_mot_luot(engine: Any, gui: Callable[[str, str], bool],
                  ghi_lich_su: Callable[[str, str, str, str | None, str], None] | None = None,
                  bay_gio: datetime | None = None) -> list[dict]:
    """Một lượt quét. Trả danh sách tin đã nhắn ({ma, cum})."""
    kho = engine._convstore
    if not getattr(kho, "is_configured", False):
        return []
    bay_gio = bay_gio or datetime.now(timezone.utc)
    if not trong_khung_gio(bay_gio):
        return []
    rows = kho._get("listings?status=in.(dang_ban,dang_quan_tam)&boc_tach->>_da_bao_dang=eq.1"
                    "&select=id,code,sellers!listings_seller_id_fkey(zalo_user_id,name)&order=updated_at.desc&limit=200")
    ra: list[dict] = []
    da_xet: set[str] = set()
    for r in rows or []:
        if len(ra) >= TOI_DA_MOT_LUOT:
            break
        seller = r.get("sellers") or {}
        uk = seller.get("zalo_user_id")
        if not uk or uk in da_xet:
            continue
        da_xet.add(uk)
        try:
            kq = _nhac_mot(engine, uk, str(r["id"]).replace("-", ""), bay_gio, gui)
        except Exception as e:  # noqa: BLE001
            log.warning("hoi_sau_dang: xét #%s hụt (%s)", r.get("code"), type(e).__name__)
            continue
        if not kq:
            continue
        tin, cum = kq
        if ghi_lich_su:
            try:
                ghi_lich_su(uk, tin, "seller", seller.get("name"), "bot")
            except Exception as e:  # noqa: BLE001
                log.warning("hoi_sau_dang: ghi lịch sử hụt (%s)", type(e).__name__)
        log.warning("Hỏi sau đăng (nền) #%s: cụm %s", r.get("code"), cum)
        ra.append({"ma": r.get("code"), "cum": cum})
    return ra
