"""LQC hỏi sau đăng chạy nền — SRS-5.1zzzzzzz432 (chủ dự án 12/11/2026 "Làm tiếp 4–7", lỗ hổng 4: các mảng Pháp lý · Lợi thế · So sánh chỉ chạy
khi chủ nhà nhắn — chủ im thì tin dừng ở đó).

Mỗi lượt (`HOI_SAU_DANG_CHU_KY_GIAY`, server): tin đang hiện đã báo đăng (`_da_bao_dang`, đã nói phí lúc duyệt) → engine chọn cụm sau đăng kế
(`Engine.cum_sau_ke`, cùng thứ tự và cùng mốc `sau:*` với lượt chat) → model viết MỘT tin ngắn làm đúng việc của khối (`Engine.khoi_cum_sau`).

Khi nào được nhắn (một người bán tối đa một tin mỗi lượt, mỗi lượt tối đa `TOI_DA_MOT_LUOT` tin):
- luật chung mọi tin chủ động ở LQC (`lqc.py`) (SRS-5.1zzzzzzz475): khung 8–21 giờ, chat im 10 phút, nhường sân / nút "giữ", tối đa 3 tin chủ
  động MỖI NGƯỜI BÁN một ngày (mọi loại tin, mọi căn), chờ chủ đáp 24 giờ, chủ bỏ qua 2 tin liền thì thôi;
- căn chủ đang khai dở (tin khác chưa đăng) thì không chen vào; trần chung `schema.TRAN_CAU_SAU_DANG` mỗi căn nằm trong `cum_sau_dang`.
Model hụt hay viết hơn một câu hỏi → không gửi (không có câu mẫu dự phòng — câu hỏi sai ngữ cảnh tệ hơn không hỏi)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from .bao_can_moi import trong_khung_gio
from .xung_ho import goi_toi

log = logging.getLogger(__name__)

TOI_DA_MOT_LUOT = 5
HEN_QUA_HAN_GIAY = 12 * 3600   # SRS-5.1zzzzzzz476: lời hẹn quá giờ lâu hơn (ngoài khung giờ, chủ bận…) thì bỏ, không nhắc trễ
DAI_TOI_DA = 500


def ly_do_khong_nhac(conv: Any, f: dict, bay_gio: datetime, kho: Any = None, uk: str | None = None) -> str | None:
    """Lý do KHÔNG nhắn lượt này, hoặc None = được nhắn — luật chung LQC (`lqc.py`) (SRS-5.1zzzzzzz475; trần ngày tính theo người bán, thay trần
    3 tin / căn / ngày cũ)."""
    from .lqc import ly_do_khong_nhan
    return ly_do_khong_nhan(conv, bay_gio, "hoi", kho, uk)


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


def _nhac_hen(engine: Any, conv: Any, uk: str, bay_gio: datetime, gui: Callable[[str, str], bool]) -> tuple[str, str] | tuple[()] | None:
    """Lời hẹn của chủ đã quá giờ (SRS-5.1zzzzzzz476): nhắc MỘT câu đúng lời hẹn rồi xoá hẹn. Gọi trong khoá lượt.
    None = không có hẹn tới hạn (đi tiếp hàng câu hỏi); () = có hẹn tới hạn nhưng lượt này không gửi (chờ / đã bỏ); (tin, "nhac_hen") = đã gửi."""
    from .engine import _detect_customer_pronoun
    from .lqc import LAN_HEN_TOI_DA, SAU_HEN_GIAY, hen_dang_treo, ly_do_khong_nhan, xoa_hen
    from .prompts import khoi_nhac_hen
    h = hen_dang_treo(conv)
    if h is None:
        return None
    fh = h.prop.fields
    luc, ts = float(fh["_hen_luc"]), bay_gio.timestamp()
    if ts < luc + SAU_HEN_GIAY:
        return None
    if int(fh.get("_hen_lan") or 1) >= LAN_HEN_TOI_DA or ts > luc + HEN_QUA_HAN_GIAY:
        xoa_hen(h)   # hẹn lần hai mà lỡ thì thôi; nhắc trễ quá nửa ngày thì câu "chiều rồi nè" sai giờ — bỏ, hàng câu hỏi đi tiếp sau
        if engine._convstore is not None:
            engine._convstore.save(conv)
        return ()
    if ly_do_khong_nhan(conv, bay_gio, "nhac_hen", engine._convstore, uk):
        return ()
    goi, toi = goi_toi(_detect_customer_pronoun(conv, ""), getattr(conv.assistant, "name", None))
    tin = viet_tin(engine, conv, h, khoi_nhac_hen(fh.get("_hen_viec") or "việc đã hẹn", luc), goi, toi)
    if not tin:
        return ()
    try:
        if not gui(uk, tin):
            return ()
    except Exception as e:  # noqa: BLE001
        log.warning("hoi_sau_dang: bridge hụt (%s)", type(e).__name__)
        return ()
    xoa_hen(h)
    if engine._convstore is not None:
        engine._convstore.save(conv)
    return tin, "nhac_hen"


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
        nhac = _nhac_hen(engine, conv, uk, bay_gio, gui)   # SRS-5.1zzzzzzz476: lời hẹn tới giờ đi trước hàng câu hỏi
        if nhac is not None:
            return nhac or None
        f = li.prop.fields
        if f.get("_da_bao_dang") != "1" or f.get("_phi_da_hoi") != "1" or f.get("_ngoai_vung"):
            return None
        act = getattr(conv, "active", None)
        if act is not None and act is not li and act.prop.fields.get("_da_bao_dang") != "1" and act.prop.fields_khach():
            return None   # chủ đang khai một căn khác chưa đăng — không chen câu hỏi của căn cũ
        if ly_do_khong_nhac(conv, f, bay_gio, engine._convstore, uk):
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
    chon = "&select=id,code,sellers!listings_seller_id_fkey(zalo_user_id,name)&order=updated_at.desc&limit=200"
    # Căn có lời hẹn của chủ (SRS-5.1zzzzzzz476) xét trước — kể cả căn chưa đăng (chủ hẹn gửi ảnh lúc đang khai).
    rows = (kho._get("listings?boc_tach->>_hen_luc=not.is.null" + chon) or []) + (
        kho._get("listings?status=in.(dang_ban,dang_quan_tam)&boc_tach->>_da_bao_dang=eq.1" + chon) or [])
    ra: list[dict] = []
    da_xet: set[str] = set()
    for r in rows or []:
        if len(ra) >= TOI_DA_MOT_LUOT:
            break
        seller = r.get("sellers") or {}
        uk = seller.get("zalo_user_id")
        if not uk or uk in da_xet:   # một người bán tối đa một tin mỗi lượt; căn đầu không có gì hỏi thì xét căn kế của cùng người bán
            continue
        try:
            kq = _nhac_mot(engine, uk, str(r["id"]).replace("-", ""), bay_gio, gui)
        except Exception as e:  # noqa: BLE001
            log.warning("hoi_sau_dang: xét #%s hụt (%s)", r.get("code"), type(e).__name__)
            continue
        if not kq:
            continue
        da_xet.add(uk)
        tin, cum = kq
        if ghi_lich_su:
            try:
                ghi_lich_su(uk, tin, "seller", seller.get("name"), "bot")
            except Exception as e:  # noqa: BLE001
                log.warning("hoi_sau_dang: ghi lịch sử hụt (%s)", type(e).__name__)
        log.warning("Hỏi sau đăng (nền) #%s: cụm %s", r.get("code"), cum)
        ra.append({"ma": r.get("code"), "cum": cum})
    return ra
