"""19/10/2026 (SRS-5.1zzzzzzz68): bộ câu hỏi theo loại BĐS chỉ còn ở `schema.py`. Toà nhà / CHDV và phòng trọ chung nhóm nhà ở
nhưng hỏi bộ riêng (chép ý từ bảng `required_facts` đã gỡ): trước bản này phòng trọ bị hỏi kết cấu + hoàn công như nhà phố,
toà nhà bị hỏi tình trạng bàn giao thay vì số phòng + dòng tiền. Đỏ khi bỏ `CORE_THEO_LOAI`."""
from aioi.prompts import build_chat_system, property_field_props
from aioi.schema import CORE_THEO_LOAI, Property


def test_phong_tro_hoi_bo_rieng():
    hoi = Property(loai_hinh="phong_tro").missing_fields()
    assert {"tien_ich_phong", "gia_dien_nuoc", "gio_giac"} <= set(hoi)
    assert "ket_cau" not in hoi and "phap_ly_hoan_cong" not in hoi


def test_toa_nha_hoi_so_phong_va_dong_tien():
    for loai in ("toa_nha", "chdv", "khach_san"):
        hoi = Property(loai_hinh=loai).missing_fields()
        assert "so_phong" in hoi and "dong_tien_thue" in hoi, loai
        assert "tinh_trang_ban_giao" not in hoi, loai


def test_nha_pho_dat_can_ho_giu_bo_cua_nhom():
    assert "tinh_trang_ban_giao" in Property(loai_hinh="nha_pho").missing_fields()
    assert "lo_gioi_duong" in Property(loai_hinh="dat").missing_fields()
    assert "so_phong_ngu" in Property(loai_hinh="chung_cu").missing_fields()


def test_o_rieng_co_cho_trong_schema_boc_tach():
    o = property_field_props()
    for k in sum(CORE_THEO_LOAI.values(), []):
        assert k in o, k                                   # model có chỗ ghi ô mới, không thì hỏi mãi



def test_cau_hoi_ke_dung_y_cua_loai():
    # Câu hỏi kế đưa cho model là ý tự nhiên của ô (NATURAL_QUESTIONS), không phải tên slug.
    s = build_chat_system("T•ai", Property(loai_hinh="phong_tro"), "gio_giac")
    assert "giờ giấc tự do hay có giờ đóng cổng" in s


def test_dat_nong_nghiep_va_dat_kinh_doanh_hoi_theo_dat_trong():
    nn = Property(loai_hinh="dat_nong_nghiep").missing_fields()
    assert "len_tho_cu" in nn and "chi_tieu_xay_dung" not in nn and "tho_cu" not in nn
    kd = Property(loai_hinh="dat_kinh_doanh").missing_fields()
    assert "muc_dich_su_dung_dat" in kd and "chieu_cao_tran" not in kd and "tai_trong_san" not in kd
    assert "chieu_cao_tran" in Property(loai_hinh="kho_xuong").missing_fields()


# Enum `listings.property_type` trên DB (soát 19/10/2026) — 12 loại của CRM.
ENUM_DB = {"nha_pho", "nha_cap4", "chung_cu", "dat", "biet_thu", "phong_tro", "mat_bang", "chua_ro", "toa_nha",
           "dat_nong_nghiep", "dat_kinh_doanh", "kho_xuong"}


def test_ma_loai_ghi_xuong_db_luon_nam_trong_enum():
    from aioi.schema import TYPE_TO_GROUP
    from aioi.supabase_store import loai_tu_db, ma_loai_db
    for loai in TYPE_TO_GROUP:
        assert ma_loai_db(loai) in ENUM_DB | {None}, loai   # mã ngoài enum = PostgREST 22P02, cả dòng tin không ghi được
    assert ma_loai_db("nha_cap_4") == "nha_cap4" and ma_loai_db("chdv") == "toa_nha" and ma_loai_db("du_an") is None
    assert loai_tu_db("nha_cap4") == "nha_cap_4"            # nạp lại: nhà cấp 4 không rơi về nhóm "chưa rõ"
    assert loai_tu_db("toa_nha", {"loai_hinh": "chdv"}) == "chdv"


def test_save_ghi_nha_cap4():
    from tests.test_trang_thai_va_nap_lai import StoreGia, _conv, _patch_tin
    st = StoreGia()
    c = _conv("đang bán")
    c.listings[0].prop.loai_hinh = "nha_cap_4"
    st.save(c)
    assert _patch_tin(st)[0]["property_type"] == "nha_cap4"
