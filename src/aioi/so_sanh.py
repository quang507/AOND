"""LQC mảng So sánh cạnh tranh (SRS-5.1zzzzzzz428, chủ dự án 12/11/2026 "Làm mảng So sánh"; đặc tả `docs/lqc-listing-quality-controller.md` mục 4).

Nguồn DUY NHẤT là RPC `can_dang_rao_gan` (migration 20261112b): căn cùng loại + cùng giao dịch đang rao trong bán kính, căn đã cọc / chốt gần
đó (180 ngày), dải đơn giá các căn đang rao. Không trả số nhà / người bán / mô tả. Mọi tin trong kho tính như nhau, kể cả tin `seed_thu`
(SRS-5.1zzzzzzz431, chủ dự án 12/11: "Tin thử được coi là thật").

Luật lời (SRS-5.1zzzzzzz429, chủ dự án quyết 4.5 ngày 12/11: "Được, nói nhẹ"): CODE chấm mức lệch giữa đơn giá rao của chủ và trung vị các
căn CÙNG lối vào (mặt tiền / hẻm) đang rao gần (`muc_lech`, ≥ 3 căn, ±10 % là ngang); model chỉ nói nhẹ MỘT câu đúng mức đó, luôn là giá
RAO, không đưa con số giá mới, không giục tăng / giảm. Chưa đủ căn cùng kiểu thì không nhận xét. Lời chat không có lưới ép viết lại
(SRS-5.1zzzzzzz431) — luật nằm ở khối dặn. Không có dòng giao dịch thật thì không có câu
"tháng trước em bán…", "hôm qua em cọc…" (4.3 · 4.4)."""
from __future__ import annotations

import logging
from typing import Any

from .phap_ly import tien
from .web import link_bao_cao_gia, link_tin

log = logging.getLogger(__name__)

BAN_KINH_M = 3000
TOI_DA_CAN = 3
TOI_THIEU_CAN = 2          # dưới số này không gửi chủ danh sách so sánh (một căn chưa nói lên gì)
TOI_THIEU_DON_GIA = 3      # dải đơn giá từ tin gần thay bảng ước lượng cứng khi đủ mẫu (4.5); cũng là số căn cùng lối vào tối thiểu để nhận xét
NGUONG_NGANG = 0.10       # lệch trung vị dưới 10 % → "ngang mặt bằng"
LOI_VAO = {"mat_tien": "mặt tiền", "hem_xe_hoi": "hẻm xe hơi", "hem_xe_may": "hẻm xe máy", "hem": "hẻm"}


def can_gan(kho: Any, listing_id: str | None) -> dict:
    """Kết quả `can_dang_rao_gan` cho tin; hụt / chưa có toạ độ → rỗng."""
    rong = {"dang_rao": [], "da_giao_dich": [], "don_gia": {"n": 0}}
    if not listing_id or not getattr(kho, "is_configured", False):
        return rong
    try:
        kq = kho._request("POST", "rpc/can_dang_rao_gan", {"p_listing_id": str(listing_id), "p_ban_kinh_m": BAN_KINH_M,
                                                           "p_toi_da": TOI_DA_CAN})
    except Exception as e:  # noqa: BLE001
        log.warning("so_sanh: tra căn gần hụt (%s)", type(e).__name__)
        return rong
    if not isinstance(kq, dict):
        return rong
    kq["ma_tin"] = str(listing_id)[:8].upper()   # mã tin = 8 ký tự đầu UUID (web.link_tin) — cho link báo cáo giá (SRS-5.1zzzzzzz455)
    return kq


def dong_bao_cao(kq: dict) -> str:
    """LQC 4.6 (đặc tả anh Luận, SRS-5.1zzzzzzz455): đủ căn cùng loại đang rao để có dải đơn giá thì mời chủ xem trang báo cáo giá rao quanh
    căn (miễn phí, tính từ giá rao — chủ dự án 13/11 "dựa trên giá rao cũng dc"). Chưa đủ mẫu → "" (trang cũng chỉ báo chưa đủ)."""
    dg = kq.get("don_gia") or {}
    link = link_bao_cao_gia(kq.get("ma_tin"))
    if not link or int(dg.get("n") or 0) < TOI_THIEU_DON_GIA:
        return ""
    return ("BÁO CÁO GIÁ: hệ thống đã làm sẵn trang báo cáo giá rao quanh căn của chủ (miễn phí): dải giá mỗi m² các căn cùng loại đang rao "
            f"trong {BAN_KINH_M // 1000} km, theo mặt tiền / hẻm, căn gần nhất. Thêm MỘT câu mời chủ xem, kèm nguyên link: {link} — nói rõ là "
            "tính từ giá rao.\n")


def _kc(m: Any) -> str:
    try:
        m = float(m)
    except (TypeError, ValueError):
        return ""
    return f"cách khoảng {max(50, round(m / 50) * 50)} m" if m < 1000 else f"cách khoảng {m / 1000:.1f} km".replace(".", ",")


def dong_can(c: dict, giao_dich: bool = False) -> str:
    """Một dòng dữ kiện về một căn gần (không số nhà)."""
    phan = [f"#{c.get('code')}", ", ".join(x for x in (c.get("street"), c.get("ward")) if x)]
    if c.get("access_type") in LOI_VAO:
        phan.append(LOI_VAO[c["access_type"]])
    if c.get("floors"):
        phan.append(f"{c['floors']} tầng")
    if c.get("area_m2"):
        phan.append(f"{float(c['area_m2']):g} m²")
    if c.get("price_vnd"):
        dg = f" (khoảng {round(c['price_per_m2_vnd'] / 1_000_000)} triệu/m²)" if c.get("price_per_m2_vnd") else ""
        phan.append(("giá rao lúc đó " if giao_dich else "rao ") + tien(c["price_vnd"]) + dg)
    if giao_dich:
        phan.append("ĐÃ CỌC" if c.get("status") == "da_coc" else "ĐÃ CHỐT")
    phan.append(_kc(c.get("m")))
    return " · ".join(x for x in phan if x) + f" — {link_tin(c.get('code'))}"


def muc_lech(kq: dict) -> dict | None:
    """Mức lệch giá chủ so với trung vị đơn giá căn CÙNG lối vào đang rao gần (code chấm, model chỉ nói). None = không nhận xét được."""
    chu = kq.get("cua_chu") or {}
    dg = kq.get("don_gia") or {}
    g, tv, n = chu.get("price_per_m2_vnd"), dg.get("trung_vi_cung_loi_vao"), int(dg.get("n_cung_loi_vao") or 0)
    if not g or not tv or n < TOI_THIEU_DON_GIA:
        return None
    lech = float(g) / float(tv) - 1
    muc = "ngang" if abs(lech) < NGUONG_NGANG else "nhinh" if lech > 0 else "mem"
    return {"muc": muc, "pt": round(abs(lech) * 100), "chu": round(float(g) / 1e6), "tv": round(float(tv) / 1e6), "n": n,
            "loi_vao": LOI_VAO.get(chu.get("access_type") or "", "")}


def dong_nhan_xet(m: dict | None) -> str:
    """Dòng dặn model nhận xét nhẹ theo mức code chấm; None → dặn KHÔNG nhận xét."""
    if m is None:
        return ("NHẬN XÉT GIÁ: chưa đủ căn cùng kiểu (cùng mặt tiền / hẻm) quanh đây để so — KHÔNG nói giá chủ cao / thấp / hợp lý, chỉ đưa dữ "
                "kiện để tham khảo.\n")
    cau = {"ngang": "giá mình đang sát mặt bằng rao quanh khu",
           "nhinh": f"giá mình đang nhỉnh hơn mặt bằng rao quanh khu khoảng {m['pt']}%",
           "mem": f"giá mình đang mềm hơn mặt bằng rao quanh khu khoảng {m['pt']}%"}[m["muc"]]
    return (f"NHẬN XÉT GIÁ (hệ thống tính — được nói NHẸ, đúng MỘT câu): đơn giá rao của chủ khoảng {m['chu']} triệu/m², trung vị {m['n']} "
            f"căn cùng loại{(' ' + m['loi_vao']) if m['loi_vao'] else ''} đang rao quanh đây khoảng {m['tv']} triệu/m² → ý: \"{cau}\". "
            "Nói đây là so với giá RAO (chưa phải giá bán thật), chỉ để anh/chị tham khảo; KHÔNG đưa con số giá "
            "mới, KHÔNG khuyên tăng / giảm, KHÔNG đoán dễ bán / khó bán.\n")


def du_de_gui(kq: dict) -> bool:
    return len(kq.get("dang_rao") or []) >= TOI_THIEU_CAN


def khoi_gui_so_sanh(kq: dict) -> str:
    """Khối lượt sau đăng (cụm `so_sanh`): gửi chủ 2–3 căn cùng loại đang rao gần để tham khảo — dữ kiện, không phán giá."""
    dong = "\n".join(f"- {dong_can(c)}" for c in kq.get("dang_rao") or [])
    gd = "\n".join(f"- {dong_can(c, True)}" for c in kq.get("da_giao_dich") or [])
    return ("\n\n=== GỬI THAM KHẢO LƯỢT NÀY (tin đã lên web — căn cùng loại đang rao gần nhà chủ, hệ thống tra kho tin): ===\n"
            "Việc lượt này: sau lời đáp, xuống một dòng trống rồi nói em gửi anh/chị tham khảo vài căn cùng loại đang rao quanh khu, chép NGUYÊN "
            f"các dòng dưới (giữ link):\n{dong}\n"
            + (f"Căn gần đó đã có giao dịch (chỉ được nói đúng như dòng này):\n{gd}\n" if gd else "")
            + dong_nhan_xet(muc_lech(kq))
            + dong_bao_cao(kq)
            + "KHÔNG nói căn nào đẹp hơn. Căn khác lối vào (mặt tiền / hẻm) hay khác diện tích thì không so thẳng đơn giá từng căn. "
            + ("KHÔNG nói đã bán / đã cọc căn nào. " if not gd else "")
            + "Không cần câu hỏi; có thể kết bằng \"anh/chị muốn em tìm thêm căn nào thì nhắn em\".\n")


def khoi_tra_loi_gia(kq: dict) -> str:
    """Chủ nhà hỏi "giá tôi cao hay thấp" (`hoi_ve` = dinh_gia): có căn cùng loại đang rao gần thì trả lời bằng dữ kiện kho + nhận xét nhẹ."""
    if not (kq.get("dang_rao") or []):
        return ""
    dong = "\n".join(f"- {dong_can(c)}" for c in kq.get("dang_rao") or [])
    return ("\n\n=== ƯU TIÊN LƯỢT NÀY — CHỦ NHÀ HỎI GIÁ THỊ TRƯỜNG / GIÁ CAO HAY THẤP: ===\n"
            f"Dữ kiện hệ thống — căn cùng loại đang RAO gần căn của chủ (giá rao, chưa phải giá giao dịch):\n{dong}\n"
            + dong_don_gia_gan(kq) + dong_nhan_xet(muc_lech(kq)) + dong_bao_cao(kq)
            + "Việc lượt này: trả lời câu chủ hỏi bằng các dữ kiện trên (có thể gửi 1–2 dòng kèm link).\n")


def dong_don_gia_gan(kq: dict) -> str:
    """Dải đơn giá từ tin đang rao gần cho công cụ định giá (4.5) — "" khi chưa đủ mẫu."""
    dg = kq.get("don_gia") or {}
    if int(dg.get("n") or 0) < TOI_THIEU_DON_GIA or not dg.get("min") or not dg.get("max"):
        return ""
    tr = lambda v: round(float(v) / 1_000_000)  # noqa: E731
    return (f"- Đơn giá các căn CÙNG LOẠI ĐANG RAO trong bán kính {BAN_KINH_M // 1000} km ({dg['n']} căn, giá rao — chưa phải giá giao dịch): "
            f"{tr(dg['min'])} – {tr(dg['max'])} triệu/m², trung vị khoảng {tr(dg['trung_vi'])} triệu/m². Số này ưu tiên hơn bảng ước lượng "
            "theo vùng.\n")
