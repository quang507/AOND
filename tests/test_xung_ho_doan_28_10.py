"""SRS-5.1zzzzzzz245 (chat thử 28/10/2026 "chú bán nhà ở 125 Bình Long…": log lõi không có dòng "Xưng hô" nào cả cuộc chat, tin nhắc mở "Anh ơi",
lượt sau "Anh cho em hỏi"). Hai lỗ: (1) AI trả chữ ("chú") thay mã → rơi im lặng; (2) khách chưa được ghi nhận tự xưng thì giới tính Zalo "anh"
vào prompt như lời khách tự xưng ("Khách xưng 'anh'"), đè cả cách gọi model đang đọc đúng từ lời khách.
Đỏ khi: bỏ chuẩn hoá `_MA_XUNG_HO`, hoặc khối xưng hô không phân biệt đoán (`_xung_ho_doan`)."""
from aioi.engine import _detect_customer_pronoun, khoi_xung_ho
from tests.test_phap_ly import CHU_NHA
from tests.test_viec_mua import KhoGia, _engine


def test_ai_tra_chu_thay_ma_van_nhan():
    eng, _ = _engine(KhoGia(), {**CHU_NHA, "xung_ho": "chú", "xung_ho_trich_dan": "chú bán nhà"})
    eng.handle("xh-doan-1", "chú bán nhà ở 125 Bình Long, Bình Hưng Hòa A, Bình Tân, 70m2, giá 3 tỷ")
    assert eng.conversation("xh-doan-1").xung_ho == "chu_co_bac:chú"
    eng2, _ = _engine(KhoGia(), {**CHU_NHA, "xung_ho": "Cô", "xung_ho_trich_dan": "cô có căn hộ"})
    eng2.handle("xh-doan-2", "cô có căn hộ ở Bình Tân muốn bán 2 tỷ 1")          # cách nói mới
    assert _detect_customer_pronoun(eng2.conversation("xh-doan-2")) == "elder:cô"


def test_gioi_tinh_zalo_chi_la_doan_khong_noi_khach_xung_anh():
    eng, ai = _engine(KhoGia(), CHU_NHA)                                         # lượt lập thao tác KHÔNG đọc ra chữ xưng
    conv = eng.conversation("xh-doan-3")
    conv.xung_ho_goi_y = "anh"                                                    # hồ sơ Zalo: nam
    eng.handle("xh-doan-3", "chú bán nhà ở 125 Bình Long, Bình Hưng Hòa A, Bình Tân, 70m2, giá 3 tỷ")
    he = [s for s in ai.system if "QUY TẮC XƯNG HÔ" in s]
    assert he and all("Khách xưng 'anh'" not in s for s in he)
    assert all("ĐOÁN" in s and "chú bán nhà" in s for s in he)


def test_khach_tu_xung_anh_van_la_luat_cung():
    assert "Khách xưng 'anh'" in khoi_xung_ho("anh", "M•ai", doan=False)
    assert "Khách xưng 'anh'" not in khoi_xung_ho("anh", "M•ai", doan=True)
    assert "Khách tự xưng 'chú'" in khoi_xung_ho("elder:chú", "M•ai", doan=True)  # đoán chỉ áp cho anh / chị
