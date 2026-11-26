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

import copy
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Callable

from .bao_can_moi import trong_khung_gio
from . import cau_mau
from .giong import bo_gach_cheo, lam_sach_tin_chu_dong
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
    tin = lam_sach_tin_chu_dong(tin, goi)   # SRS-5.1zzzzzzz546: tin chủ động không có lưới gọi lại model
    if not tin or len(tin) > DAI_TOI_DA or tin.count("?") > 1:
        return ""
    return tin


HEN_TRA_HAN_GIAY = 24 * 3600   # SRS-5.1zzzzzzz526: câu hẹn tra cứu quá một ngày chưa trả lời được thì bỏ
HEN_TRA_THU_TOI_DA = 2         # model không viết được câu trả lời quá số lượt này thì bỏ câu hẹn


def viet_tra_cuu(engine: Any, conv: Any, li: Any, caus: list[str], goi: str, toi: str) -> str:
    """BOA trả lời điều FDA đã hẹn xem kỹ (SRS-5.1zzzzzzz526): một vòng công cụ nhỏ với các công cụ tra cứu (`agent_ban.CONG_CU_BOA`) + căn thật
    đang rao gần (`so_sanh`) làm dữ kiện giá. Hụt / dài quá → ""."""
    from . import agent_ban, agent_gop, so_sanh
    from .prompts import build_hoi_sau_dang_nhac_system, khoi_tra_hen
    f = li.prop.fields
    try:
        khoi_gia = so_sanh.khoi_tra_loi_gia(so_sanh.can_gan(engine._convstore, li.listing_id)) or ""
    except Exception as e:  # noqa: BLE001
        log.warning("tra_cuu: so sánh giá hụt (%s)", type(e).__name__)
        khoi_gia = ""
    he = build_hoi_sau_dang_nhac_system(getattr(conv.assistant, "name", None) or "em", li.prop, khoi_tra_hen(caus) + khoi_gia, goi, toi)
    tools = [copy.deepcopy(c) for c in agent_ban.CONG_CU if c["name"] in agent_ban.CONG_CU_BOA]
    project = engine._projects.get(f.get("du_an")) if f.get("du_an") else None

    co = [bool(khoi_gia)]   # có dữ kiện thật (căn đang rao gần, hoặc một công cụ trả ra nội dung) thì model mới được viết câu trả lời

    def chay(c: Any) -> str:
        r = agent_ban._khoi(engine, conv, project, c.name, dict(c.input or {})).strip()
        co[0] = co[0] or bool(r)
        return r or "Không có dữ liệu này."

    gan = "\n".join(f"{'Khách' if t.role == 'user' else 'Em'}: {(t.content or '')[:300]}" for t in conv.history[-6:])
    try:
        ra = agent_gop._vong_viet(engine, he, [{"role": "user", "content": f"Mấy lượt vừa nói:\n{gan}\n\nViết tin trả lời điều em đã hẹn."}],
                                  tools, chay, time.monotonic(), 500, "BOA tra cứu")
    except Exception as e:  # noqa: BLE001
        log.warning("tra_cuu: model hụt (%s)", type(e).__name__)
        return ""
    tin = lam_sach_tin_chu_dong((ra[0] if ra else "").strip(), goi)   # SRS-5.1zzzzzzz546
    log.warning("BOA tra cứu: gọi %d công cụ, có dữ kiện: %s", len(ra[2]) if ra else 0, co[0])
    return tin if co[0] and tin and len(tin) <= 900 and tin.count("?") <= 1 else ""


def tin_chua_co_du_kien(goi: str, toi: str) -> str:
    """Hết lượt thử mà không tra ra dữ kiện nào: lời hẹn vẫn phải giữ — nói thật, không đoán; câu hỏi sang người phụ trách (code soạn, không qua model)."""
    # SRS-5.1zzzzzzz546: câu nguyên văn ở cau_mau (bỏ "Dạ" mở đầu, "ạ" chồng); chưa biết cách gọi thì "anh chị", không gạch chéo (OPEN-62)
    return bo_gach_cheo(cau_mau.cau("tra_cuu_chua_co", goi, toi=toi), goi)


def _tra_loi_tra_cuu(engine: Any, conv: Any, uk: str, bay_gio: datetime, gui: Callable[[str, str], bool]) -> tuple[str, str] | tuple[()] | None:
    """Căn có câu FDA đã hẹn tra cứu (`_cho_tra_cuu`): chat im đủ lâu thì BOA trả lời MỘT tin rồi xoá hẹn. Gọi trong khoá lượt.
    None = không có câu hẹn; () = có nhưng lượt này không gửi; (tin, "tra_cuu") = đã gửi."""
    from .engine import _detect_customer_pronoun
    from .lqc import ly_do_khong_nhan
    li = next((x for x in conv.listings if x.prop.fields.get("_cho_tra_cuu")), None)
    if li is None:
        return None
    f, ts = li.prop.fields, bay_gio.timestamp()
    luu = lambda: engine._convstore.save(conv) if engine._convstore is not None else None
    try:
        ds = [d for d in json.loads(f["_cho_tra_cuu"]) if isinstance(d, dict) and d.get("cau") and ts - float(d.get("luc") or 0) < HEN_TRA_HAN_GIAY]
    except (ValueError, TypeError):
        ds = []
    if not ds:
        f.pop("_cho_tra_cuu", None)
        luu()
        return ()
    if ly_do_khong_nhan(conv, bay_gio, "tra_hen", engine._convstore, uk):
        return ()
    goi, toi = goi_toi(_detect_customer_pronoun(conv, ""), getattr(conv.assistant, "name", None))
    caus = [str(d["cau"]) for d in ds]
    tin = viet_tra_cuu(engine, conv, li, caus, goi, toi)
    chuyen = False
    if not tin:
        for d in ds:
            d["lan"] = int(d.get("lan") or 0) + 1
        if any(d["lan"] < HEN_TRA_THU_TOI_DA for d in ds):
            f["_cho_tra_cuu"] = json.dumps(ds, ensure_ascii=False)
            luu()
            return ()
        tin, chuyen = tin_chua_co_du_kien(goi, toi), True   # hết lượt thử: không bỏ rơi lời hẹn, không cho model đoán
    try:
        if not gui(uk, tin):
            return ()
    except Exception as e:  # noqa: BLE001
        log.warning("hoi_sau_dang: bridge hụt (%s)", type(e).__name__)
        return ()
    f.pop("_cho_tra_cuu", None)
    luu()
    if chuyen:
        bao = getattr(engine._convstore, "bao_can_nguoi", None)
        try:
            if callable(bao):
                bao(uk, "Chủ hỏi điều bot chưa tra ra dữ liệu: " + "; ".join(caus))
        except Exception as e:  # noqa: BLE001
            log.warning("tra_cuu: báo người phụ trách hụt (%s)", type(e).__name__)
    return tin, "tra_cuu"


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
        tra = _tra_loi_tra_cuu(engine, conv, uk, bay_gio, gui)   # SRS-5.1zzzzzzz526: điều bot đã hẹn xem kỹ đi trước mọi thứ
        if tra is not None:
            return tra or None
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
    from .diem_boa import trung_binh
    chon = "&select=id,code,diem_boa:boc_tach->>_diem_boa,sellers!listings_seller_id_fkey(zalo_user_id,name)&order=updated_at.desc&limit=200"
    # Căn có lời hẹn của chủ (SRS-5.1zzzzzzz476) xét trước — kể cả căn chưa đăng (chủ hẹn gửi ảnh lúc đang khai). Sau đó là tin đang rao,
    # tin điểm chất lượng BOA thấp đi trước (SRS-5.1zzzzzzz520; bản anh Luận: "mỗi ngày soi lại listing đang rao mà điểm chất lượng còn thấp").
    rows = (kho._get("listings?boc_tach->>_cho_tra_cuu=not.is.null" + chon) or []) + (   # SRS-5.1zzzzzzz526: câu bot đã hẹn tra cứu
        kho._get("listings?boc_tach->>_hen_luc=not.is.null" + chon) or []) + sorted(
        kho._get("listings?status=in.(dang_ban,dang_quan_tam)&boc_tach->>_da_bao_dang=eq.1" + chon) or [],
        key=lambda r: trung_binh(r.get("diem_boa")))
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
