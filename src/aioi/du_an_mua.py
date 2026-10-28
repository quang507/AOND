"""Khách MUA hỏi thông tin dự án → bot tra kho dự án (SRS-5.1zzzzzzz184, chủ dự án 25/10/2026: "cho bot phía mua tra kho dự án đi").

Trước bản này kho `projects` (2.362 dự án, nguồn mogi: chủ đầu tư, địa chỉ, pháp lý, giá niêm yết, tiện ích) và `du_an_kien_thuc` (kiến thức chủ dự án
duyệt) chỉ phía BÁN dùng; khách mua hỏi "dự án X có gì / của ai / pháp lý ra sao" thì model trả lời từ trí nhớ — đúng lớp lỗi bịa số liệu.
Nay lượt lập thao tác đọc `mua.hoi_du_an` (tên khách gõ, cụm phải nằm trong tin khách), `SupabaseConversationStore.tra_du_an` tra kho, và khối
này đưa ĐÚNG dữ kiện có trong kho cho model, kèm luật nói thật khi thiếu. Hàm ở đây thuần chuỗi, không gọi mạng."""
from __future__ import annotations

from typing import Any

TIEU_DE = "DỰ ÁN TRONG KHO"          # dấu mốc: `engine._so_khong_co_trong_can` cho phép con số nằm trong khối này
CAT_KIEN_THUC = 2800                  # tối đa chữ kiến thức chủ dự án đưa cho model mỗi lượt
CAT_TIEN_ICH = 8


def _tien(v: Any) -> str | None:
    """Giá niêm yết dạng nói: 578000000 → "578 triệu", 1200000000 → "1,2 tỷ". Không phải số dương → None."""
    if not isinstance(v, (int, float)) or v <= 0:
        return None
    if v >= 1e9:
        return f"{v / 1e9:.2f}".rstrip("0").rstrip(".").replace(".", ",") + " tỷ"
    return f"{v / 1e6:.0f} triệu"


def _chu(v: Any) -> str:
    return str(v).strip() if isinstance(v, (str, int, float)) and str(v).strip() else ""


def dong_du_an(p: dict[str, Any]) -> list[str]:
    """Các dòng dữ kiện của một dự án — chỉ ô có dữ liệu thật; không bịa ô trống. Không đưa `source_url` (link nguồn mogi)."""
    d: list[str] = []
    if _chu(p.get("name")):
        d.append(f"- Tên trong kho: {_chu(p['name'])}")
    if _chu(p.get("developer")):
        d.append(f"- Chủ đầu tư: {_chu(p['developer'])}")
    vi_tri = _chu(p.get("location_raw")) or ", ".join(x for x in (_chu(p.get("ward")), _chu(p.get("district")), _chu(p.get("province"))) if x)
    if vi_tri:
        d.append(f"- Vị trí: {vi_tri}")
    if _chu(p.get("legal_status")):
        d.append(f"- Pháp lý: {_chu(p['legal_status'])}")
    ban_giao = _chu(p.get("handover_date")) or _chu(p.get("handover"))
    if ban_giao:
        d.append(f"- Bàn giao: {ban_giao}")
    if _chu(p.get("status_text")):
        d.append(f"- Tình trạng: {_chu(p['status_text'])}")
    thap, cao = _tien(p.get("price_min")), _tien(p.get("price_max"))
    if thap and cao and thap != cao:
        d.append(f"- Giá niêm yết tham khảo: từ {thap} đến {cao}")
    elif thap or cao:
        d.append(f"- Giá niêm yết tham khảo: từ {thap or cao}")
    sp = p.get("specs") if isinstance(p.get("specs"), dict) else {}
    if _chu(sp.get("tong_dien_tich")):
        d.append(f"- Tổng diện tích: {_chu(sp['tong_dien_tich'])}")
    if _chu(sp.get("gia_dong")):
        d.append(f"- Giá (theo nguồn): {_chu(sp['gia_dong'])}")
    tu, den = sp.get("dien_tich_tu_m2"), sp.get("dien_tich_den_m2")
    if isinstance(tu, (int, float)) and isinstance(den, (int, float)) and tu and den:
        d.append(f"- Diện tích sản phẩm: {tu:g}–{den:g} m²")
    if _chu(sp.get("nam_khoi_cong")) or _chu(sp.get("nam_hoan_thanh")):
        d.append("- Thời gian: " + "; ".join(x for x in (f"khởi công {_chu(sp.get('nam_khoi_cong'))}" if _chu(sp.get("nam_khoi_cong")) else "",
                                                          f"hoàn thành {_chu(sp.get('nam_hoan_thanh'))}" if _chu(sp.get("nam_hoan_thanh")) else "") if x))
    loai = p.get("unit_types")
    if isinstance(loai, list) and loai:
        ten = [_chu(x.get("name") or x.get("ten")) if isinstance(x, dict) else _chu(x) for x in loai]
        ten = [t for t in ten if t][:CAT_TIEN_ICH]
        if ten:
            d.append("- Loại căn: " + "; ".join(ten))
    tt = p.get("thong_tin") if isinstance(p.get("thong_tin"), dict) else {}
    ti = p.get("amenities")
    ti = [_chu(x)[:140] for x in ((ti if isinstance(ti, list) else []) + list(tt.get("tien_ich") or [])) if _chu(x)][:CAT_TIEN_ICH]
    if ti:
        d.append("- Tiện ích: " + "; ".join(dict.fromkeys(ti)))
    # Dữ kiện người bán / admin bổ sung ĐÃ DUYỆT (đủ phiếu theo hạng hoặc admin ghi) — cùng một kho với phía bán (SRS-5.1zzzzzzz249).
    for k, v in (tt.get("thuoc_tinh") or {}).items():
        if _chu(k) and _chu(v):
            d.append(f"- {_chu(k)[:60]}: {_chu(v)[:200]}")
    return d


def khoi_du_an(kq: dict[str, Any] | None) -> str:
    """Khối cho lời đáp phía mua khi khách hỏi thông tin dự án. `kq` = kết quả `tra_du_an` (None / rỗng → không có khối)."""
    if not isinstance(kq, dict) or not kq.get("ten_khach"):
        return ""
    ten = kq["ten_khach"]
    dau = f'\n\n=== {TIEU_DE} (khách MUA vừa hỏi thông tin dự án "{ten}"; hệ thống tra kho, KHÔNG phải khách nói) ===\n'
    khop = kq.get("khop")
    if khop == "nhieu":
        ds = "; ".join(str(x) for x in (kq.get("ung_vien") or [])[:4])
        return dau + (f"Kho có nhiều dự án gần tên này: {ds}. Hỏi khách MỘT câu ngắn là dự án nào, CHƯA kể thông tin dự án nào, "
                      "KHÔNG đoán.\n")
    if khop in ("khong", "loi") or not isinstance(kq.get("du_an"), dict):
        return dau + ("Kho CHƯA có dự án tên này" + (" (tra kho đang lỗi)" if khop == "loi" else "") + ". Nói thật NGẮN là em chưa có thông tin "
                      "dự án đó trong hệ thống, đề nghị khách cho tên đầy đủ hoặc khu vực; KHÔNG kể gì về dự án từ trí nhớ, KHÔNG "
                      "đoán chủ đầu tư / giá / pháp lý / tiện ích.\n")
    p = kq["du_an"]
    dong = dong_du_an(p)
    if khop == "gan":
        dong.insert(0, f'Lưu ý: tên khách gõ không trùng hẳn; nhắc TÊN ĐẦY ĐỦ "{_chu(p.get("name"))}" trong lời để khách xác nhận đúng dự án.')
    kt = _chu(kq.get("kien_thuc"))[:CAT_KIEN_THUC]
    out = dau + "\n".join(dong) + "\n"
    if kt:
        out += ("Kiến thức dự án (tài liệu đã duyệt; dòng đánh dấu ⚠ là chưa chắc — KHÔNG khẳng định, nói sẽ kiểm tra rồi báo lại):\n"
                + kt + "\n")
    out += ("CÁCH NÓI: chỉ dùng ĐÚNG dữ kiện ở khối này; thứ khách hỏi mà khối không có (hoặc đánh dấu ⚠) thì nói thật là em chưa có thông "
            "tin đó, em kiểm tra rồi báo lại — KHÔNG đoán, KHÔNG lấy từ trí nhớ. Giá là giá niêm yết THAM KHẢO, không bình luận đắt / rẻ / "
            "đáng đầu tư. Chọn vài ý đúng câu khách hỏi, không đổ cả khối; không dán link nguồn. Xong ý thì giữ MỘT câu hỏi ngắn như mọi "
            "lượt (nếu có), không hỏi thêm về dự án.\n")
    return out
