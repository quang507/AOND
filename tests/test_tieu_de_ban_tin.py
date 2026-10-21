"""21/10/2026 (SRS-5.1zzzzzzz109). Bắn thử 211 KB3: tiêu đề căn hộ "Bán căn hộ Masteri MT Q.2, 68m², 2PN, 6,8 tỷ" — "MT" người mua đọc là mặt
tiền. Cùng lượt soát: bước kiểm tiêu đề luôn lấy dòng KẾ dòng 📋, nhưng bản tin cập nhật ghi tiêu đề NGAY trên dòng 📋 ("📋 Bản tin cập
nhật: <tiêu đề>") → kiểm giá / đơn vị soi nhầm đoạn mô tả. Đỏ trên code cũ (đã thử)."""
from aioi.engine import _dong_tieu_de, _tieu_de_can_ho_co_mt, _tieu_de_thieu
from aioi.schema import Property

NHAP = "📋 Em sẽ rao như vầy nhé anh chị:\n\nBán căn hộ Masteri Thảo Điền Q.2 68m² 6,8 tỷ\n\nCăn hộ nằm trong dự án…"
CAP_NHAT = "Em cập nhật rồi ạ.\n\n📋 Bản tin cập nhật: Bán căn hộ Masteri Q.2 68m² 2PN\n\nCăn hộ giá 6,8 tỷ nằm trong dự án…"


def test_dong_tieu_de_hai_kieu_ban_tin():
    assert _dong_tieu_de(NHAP) == "Bán căn hộ Masteri Thảo Điền Q.2 68m² 6,8 tỷ"
    assert _dong_tieu_de(CAP_NHAT) == "Bán căn hộ Masteri Q.2 68m² 2PN"
    assert _dong_tieu_de("không có bản tin") == ""


def test_ban_cap_nhat_thieu_gia_trong_tieu_de_van_bat_duoc():
    can = Property(loai_hinh="chung_cu", fields={"gia": "6,8 tỷ"})
    assert _tieu_de_thieu(CAP_NHAT, can) == ["giá (6,8 tỷ)"]     # giá chỉ có trong mô tả, không có trong tiêu đề
    assert _tieu_de_thieu(NHAP, can) == []


def test_tieu_de_can_ho_co_mt():
    can = Property(loai_hinh="chung_cu")
    assert _tieu_de_can_ho_co_mt("📋 Bản tin cập nhật: Bán căn hộ Masteri MT Q.2, 68m², 6,8 tỷ", can)
    assert not _tieu_de_can_ho_co_mt(NHAP, can)
    assert not _tieu_de_can_ho_co_mt("📋 Em sẽ rao như vầy nhé anh chị:\n\nBán căn hộ MTA Tower 70m² 3 tỷ", can)
    assert not _tieu_de_can_ho_co_mt("📋 Em sẽ rao như vầy nhé anh chị:\n\nBán nhà MT Cao Lỗ Q.8 60m² 10 tỷ", Property(loai_hinh="nha_pho"))
