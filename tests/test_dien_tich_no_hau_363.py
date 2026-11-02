"""SRS-5.1zzzzzzz363 — chat thật 01–02/11: khách "mặt tiền 6m dài 15 nở hậu 3" → bản tin "đất 90m² ngang 6m nở hậu… càng vô sâu càng rộng nhờ
nở hậu 3m". 6 × 15 chỉ đúng khi không nở hậu; khách không nói diện tích. Lớp lỗi: dữ kiện bản tin không nói căn CHƯA có số m² nào, khuôn bản tin
lại bảo "LUÔN kèm đơn vị (35m²)" → model tự nhân (cùng lớp "72m²" SRS-352). Sửa: dòng dữ kiện do code quyết theo ô tin. Số / tên giả."""
from aioi.engine import Engine, Turn, _so_khong_co_trong_tin
from aioi.prompts import build_listing_proposal_system, khoi_su_that_can
from aioi.schema import Property


def test_chua_co_dien_tich_thi_cam_tu_nhan_va_in_nguyen_kich_thuoc():
    for f, kt in (({"kich_thuoc": "6x15", "no_hau": "3m"}, '"6x15 nở hậu 3m"'),
                  ({"kich_thuoc": "ngang 4 dài 20", "no_hau": "hậu 5m"}, '"ngang 4 dài 20 nở hậu hậu 5m"')):   # cách nói mới
        k = khoi_su_that_can(f, False)
        assert "CHƯA có số m² nào từ khách" in k and "KHÔNG tự nhân ngang × dài" in k and kt in k


def test_co_dien_tich_khach_noi_thi_in_dung_so_do():
    k = khoi_su_that_can({"kich_thuoc": "6x15", "no_hau": "3m", "dien_tich_dat": "100m2"}, False)
    assert "đất 100m2" in k and "CHƯA có số m²" not in k


def test_dong_vao_luot_ban_nhap_va_luoi_so_van_bat_90m2():
    p = Property(loai_hinh="nha_pho", fields={"kich_thuoc": "6x15", "no_hau": "3m", "gia": "9 tỷ", "dia_chi": "Lê Lợi", "duong": "Lê Lợi"})
    he = build_listing_proposal_system("Lan", p) + khoi_su_that_can(p.fields, False)
    assert "CHƯA có số m² nào từ khách" in he
    c = Engine(None).conversation("thu-363")
    c.prop.loai_hinh = p.loai_hinh
    c.prop.fields.update(p.fields)
    c.history.append(Turn("user", "mặt tiền 6m dài 15 nở hậu 3", 0.0))
    assert "90m²" in _so_khong_co_trong_tin("📋 Em sẽ rao như vầy nhé anh:\n\nNhà Lê Lợi 9 tỷ\n\nĐất 90m² nở hậu 3m.\n\nNhắn em!", c)
