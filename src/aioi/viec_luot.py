"""Việc của lượt phía bán — MỘT việc, code quyết (kế hoạch bước 2B, SRS-5.1zzzzzzz314).

Hàm thuần: đọc ảnh chụp trạng thái lượt (`TrangThaiLuot`, engine dựng) và trả về đúng một `Viec`. Thứ tự ưu tiên CHỈ đặt ở đây.
Từ Đợt 4 (SRS-5.1zzzzzzz327) engine DÙNG kết quả: khối hỏi nằm trong `bo` bị gỡ khỏi prompt (và cờ "đã hỏi" của nó trả lại), nên mỗi
lượt chỉ còn MỘT câu hỏi. `conv.y_luot["_viec"]` / `["_khoi"]` (khối còn lại sau khi gỡ) vẫn ghi cho bộ chấm.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# Khối mà engine ghép vào prompt kèm lời dặn HỎI khách (mỗi khối tự nhận là câu hỏi của lượt). Hai khối trở lên cùng bật = lệch.
KHOI_HOI = frozenset({"hoi_trung_ten", "chua_ro_can", "tach_ban_thue", "dia_danh", "hoi_du_an", "mat_tien", "hoi_coc", "hoi_sau_dang",
                      "xin_sao", "hoi_o"})


@dataclass(frozen=True)
class TrangThaiLuot:
    """Những gì code đã biết trước khi viết lời. `pha`: "ngoai_vung" | "thu_thap" | "trinh_nhap" | "sau_nhap". `khoi`: tên khối engine bật."""
    pha: str
    next_field: str | None = None
    khoi: tuple[str, ...] = ()
    hoi_ve: str | None = None          # phi | uy_tin | link_web | tinh_hinh_ban | dinh_gia (AI đọc theo nghĩa)
    muon_dang: bool = False            # khách bảo đăng / rao (lại) — nghĩa cụ thể do trạng thái quyết
    thieu_toi_thieu: bool = False      # chưa đủ ô tối thiểu để ra bản nháp (loại · vị trí · giá)
    da_co_nhap: bool = False           # đã trình bản nháp 📋
    trang_thai: str = ""               # trạng thái tin hiện tại ("đang bán", "ẩn", "đã cọc"…)
    duyet: str | None = None           # dong_y | khong_dong_y | None
    yeu_cau_viet: bool = False         # khách dặn cách viết bản tin


@dataclass(frozen=True)
class Viec:
    ten: str
    o: str | None = None
    bo: tuple[str, ...] = field(default=())   # khối hỏi đang bật mà việc này không dùng (chỗ lệch với engine)


def viec_luot(t: TrangThaiLuot) -> Viec:
    """MỘT việc cho lượt. Thứ tự: ngoài vùng > cần người > câu khách hỏi (pháp lý, ngoài việc, phí / uy tín / link…) > đăng / rao lại
    > dữ kiện hệ thống cần hỏi lại (căn nào, tên dự án) > việc của pha (trình nháp; sau nháp: sửa / đăng / hỏi sau; thu thập: hỏi một ô)."""
    k = set(t.khoi)
    v = _chon(t, k)
    return Viec(v.ten, v.o, tuple(sorted((k & KHOI_HOI) - {v.ten} - _KHOI_CUA.get(v.ten, set()))))


# Khối mà một việc dùng lại (không tính là lệch): việc "hoi_o" của ô giá khi vừa tách bán / thuê là chính khối tach_ban_thue.
_KHOI_CUA = {"hoi_dia_danh": {"dia_danh"}, "hoi_du_an": {"hoi_du_an"}, "xac_nhan_mat_tien": {"mat_tien"}, "hoi_can_nao": {"chua_ro_can"},
             "hoi_trung_ten": {"hoi_trung_ten"}, "hoi_coc": {"hoi_coc"}, "hoi_sau_dang": {"hoi_sau_dang"}, "xin_sao": {"xin_sao"},
             "hoi_gia_tin_moi": {"tach_ban_thue"}}


def _chon(t: TrangThaiLuot, k: set[str]) -> Viec:
    if t.pha == "ngoai_vung":
        return Viec("ngoai_vung")
    if "can_nguoi" in k:
        return Viec("can_nguoi")
    for khoi in ("phap_ly", "ngoai_viec"):
        if khoi in k:
            return Viec("tra_loi", khoi)
    if t.hoi_ve:
        return Viec("tra_loi", t.hoi_ve)
    if t.muon_dang:   # "đăng đi" / "rao lại": căn đang ẩn → rao lại căn; chưa có bản nháp → trình nháp; có rồi → gửi lại bản tin
        if t.trang_thai == "ẩn":
            return Viec("doi_trang_thai", "rao")
        if t.da_co_nhap:
            return Viec("gui_lai_ban_tin")
        return Viec("hoi_o", t.next_field) if t.thieu_toi_thieu and t.next_field else Viec("trinh_nhap")
    if "chua_ro_can" in k:
        return Viec("hoi_can_nao")
    if "hoi_trung_ten" in k:
        return Viec("hoi_trung_ten")
    if "tin_dang_hien_ngoai_chat" in k:   # tin tạo ngoài chat đang hiển thị: không phải câu hỏi — câu hỏi sau đăng (cọc, hỏi thêm, sao) vẫn được hỏi
        for khoi in ("hoi_coc", "hoi_sau_dang", "xin_sao"):
            if khoi in k:
                return Viec(khoi)
        return Viec("cap_nhat_tin_dang_hien")
    if t.pha == "trinh_nhap":
        return Viec("trinh_nhap")
    if t.pha == "sau_nhap":
        if t.yeu_cau_viet:
            return Viec("sua_nhap")
        if t.duyet == "dong_y":
            return Viec("dang_tin")
        for khoi in ("hoi_coc", "hoi_sau_dang", "xin_sao"):
            if khoi in k:
                return Viec(khoi)
        return Viec("chot")
    # thu thập
    if "tach_ban_thue" in k:
        return Viec("hoi_gia_tin_moi")
    if "dia_danh" in k:   # khối "dia_danh" chỉ bật khi hỏi xác nhận TÊN ĐƯỜNG (dữ kiện phường / xã đi riêng, không phải câu hỏi) — hỏi đường TRƯỚC
        return Viec("hoi_dia_danh")
    if "hoi_du_an" in k:
        return Viec("hoi_du_an")
    if "mat_tien" in k:
        return Viec("xac_nhan_mat_tien")
    if t.next_field:
        return Viec("hoi_o", t.next_field)
    return Viec("chot")
