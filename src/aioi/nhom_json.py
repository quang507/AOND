"""Lệnh `json` / `thong tin` hiện dữ liệu 2 tầng (SRS-5.1zzzzzzz141). Chủ dự án 22/10/2026: JSON phẳng ~20 ô lẫn lộn quá dài, "làm nhiều tầng,
vài tầng lớn, trong đó có tầng nhỏ". Tầng lớn: tin · vi_tri · quy_mo · gia · phap_ly · su_dung · nhap. Chỉ là cách HIỂN THỊ — ô vẫn lưu phẳng
trong `Property.fields` / `listings.boc_tach`. Ô chưa có trong bảng nhóm vào `khac` (không bao giờ rơi mất); `tests/test_json_2_tang.py`
đỏ khi một ô của `FIELD_LABELS` chưa có nhóm, nên thêm ô mới thì thêm vào `NHOM_O` ở đây."""
from __future__ import annotations

from typing import Any

from .schema import O_NOI_BO

# Thứ tự tầng = thứ tự in. Mỗi tầng: các ô con (khoá lõi → in nguyên khoá).
NHOM_O: dict[str, tuple[str, ...]] = {
    "tin": ("unit_type", "tieu_de", "ma_so_can", "chu_dau_tu_phan_khu"),
    "vi_tri": ("quan", "duong", "phuong", "dia_chi", "gan_nga_tu", "tang_toa", "lo_gioi_hem", "lo_gioi_duong",
               "yeu_to_ha_tang", "vi_he_xe", "loi_di", "ranh_gioi_cot_moc"),
    "quy_mo": ("dien_tich", "dien_tich_dat", "dien_tich_nha", "kich_thuoc", "mat_tien", "ket_cau", "so_phong_ngu", "so_phong", "tho_cu",
               "thang_may", "chieu_cao_tran", "tai_trong_san", "tram_bien_ap", "tieu_chuan_container"),
    "gia": ("gia", "thuong_luong", "dong_tien_thue", "muc_coc", "truot_gia", "thoi_han_hd", "thoi_gian_fitout", "phi_quan_ly", "phi_gui_xe",
            "gia_dien_nuoc", "thue_phi", "thanh_toan", "chiet_khau", "phi_chuyen_nhuong", "chinh_sach_thanh_toan", "hd_thue_con"),
    "phap_ly": ("phap_ly", "phap_ly_hoan_cong", "phap_ly_so_do", "phap_ly_so_hong", "phap_ly_du_an", "the_chap", "quy_hoach", "len_tho_cu",
                "thoi_han_su_dung", "muc_dich_su_dung_dat", "chi_tieu_xay_dung", "tinh_trang_ban_giao", "thoi_gian_ban_giao",
                "tien_do_xay_dung"),
    "su_dung": ("hien_trang_su_dung", "dien_tich_trang_thiet_bi", "dien_nuoc_kd", "nganh_nghe", "noi_that", "huong", "nam_xay",
                "ban_cong_view", "can_goc", "pccc", "tien_ich_phong", "gio_giac", "nguon_nuoc"),
}
# Ô không phải thông số căn: ảnh (đếm riêng ở khối `nhap`), ô riêng của chủ (schema.O_NOI_BO — không in ra), ô của người mua.
BO_QUA = frozenset({"hinh_anh"}) | O_NOI_BO
O_NGUOI_MUA = frozenset({"khu_vuc", "ngan_sach", "loai_bds", "yeu_cau_xe_hoi", "muc_dich", "tien_do_mua", "vay_ngan_hang", "nhan_nha_khi_nao",
                         "moi_truong_song", "thanh_vien", "noi_lam_viec", "dien_tich_mong_muon", "tien_ich_mong_muon", "nguoi_quyet_dinh",
                         "loai_giao_dich"})

_NHOM_CUA_O = {o: nhom for nhom, cac_o in NHOM_O.items() for o in cac_o}


def nhom_o(ten_o: str) -> str:
    """Tầng lớn của một ô; ô lạ → `khac`."""
    return _NHOM_CUA_O.get(ten_o, "khac")


def gom_nhom(thong_tin: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Ô phẳng → {tầng lớn: {ô: giá trị}}; bỏ ô rỗng, ô bị `BO_QUA`; tầng không có ô nào thì không in. `khac` nằm cuối."""
    ra: dict[str, dict[str, Any]] = {n: {} for n in (*NHOM_O, "khac")}
    for k, v in thong_tin.items():
        if k in BO_QUA or v in (None, "", [], {}):
            continue
        ra[nhom_o(k)][k] = v
    return {n: o for n, o in ra.items() if o}


def json_tin_ban(listing_id: str, loai_hinh: str | None, du_an: str | None, thong_tin: dict[str, Any], *, do_day_du: str,
                 thieu: list[str], du_dieu_kien: bool | None, so_anh: int) -> dict[str, Any]:
    """Một căn của người bán: `tin` (định danh) + các tầng lớn + `nhap` (độ đầy đủ). Tầng rỗng không in."""
    nhom = gom_nhom(thong_tin)
    tin = {"ma_can": listing_id, "loai_hinh": loai_hinh, "du_an": du_an, **nhom.pop("tin", {})}
    nhap: dict[str, Any] = {"do_day_du": do_day_du, "thieu": thieu, "hinh_anh": so_anh}
    if du_dieu_kien is not None:
        nhap["du_soan_nhap"] = du_dieu_kien
    return {"tin": {k: v for k, v in tin.items() if v not in (None, "")}, **nhom, "nhap": nhap}


def json_nguoi_mua(lead_id: Any, stage: Any, loai_giao_dich: Any, loai_bds: Any, ngan_sach: Any, khu_vuc: Any,
                   thong_tin: dict[str, Any]) -> dict[str, Any]:
    """Người mua, cũng 2 tầng: `tin` (định danh) · `nhu_cau` (4 ô lõi) · `them` (ô còn lại của phiếu)."""
    nhu_cau = {k: v for k, v in {"loai_giao_dich": loai_giao_dich, "loai_bds": loai_bds, "ngan_sach": ngan_sach, "khu_vuc": khu_vuc}.items()
               if v not in (None, "")}
    them = {k: v for k, v in thong_tin.items() if v not in (None, "", [], {})}
    return {"tin": {"vai_tro": "buyer", "lead_id": lead_id, "stage": stage}, "nhu_cau": nhu_cau, **({"them": them} if them else {})}
