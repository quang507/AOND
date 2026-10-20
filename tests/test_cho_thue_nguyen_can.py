"""20/10/2026 (SRS-5.1zzzzzzz90). Chat tester chị N. ca cho thuê nhà nguyên căn Âu Dương Lân: khách xưng "chị" mà dòng mở bản tin vẫn
"anh chị"; lời sau khi duyệt dài ("nghe dài mệt quá"); phí viết "0.75 tháng"; ô khách lờ 2 lần quên sạch khi lõi khởi động lại;
"nhà trọ nguyên căn" xếp thành phòng trọ. Đỏ khi bỏ một trong các bản sửa."""
from aioi.prompts import (OPERATIONS_SYSTEM, build_fee_followup_system, build_listing_proposal_system, cat_truoc_mo_dau,
                          khoi_trang_thai_web, mo_dau_nhap)
from aioi.schema import Property
from tests.test_supabase_store_luu_tin import StoreGia, _conv, _ghi_tin


def test_mo_dau_ban_tin_theo_cach_khach_xung():
    assert mo_dau_nhap("chi") == "📋 Em sẽ rao như vầy nhé chị:" and mo_dau_nhap("anh") == "📋 Em sẽ rao như vầy nhé anh:"
    assert mo_dau_nhap("unknown") == "📋 Em sẽ rao như vầy nhé anh chị:" and mo_dau_nhap("em") == "📋 Mình sẽ rao như vầy nhé em:"
    assert cat_truoc_mo_dau("Em ghi nhận rồi chị. Em sẽ rao như vầy nhé anh chị:\n\nCho thuê nhà", "chi") == \
        "📋 Em sẽ rao như vầy nhé chị:\n\nCho thuê nhà"
    p = Property(loai_hinh="nha_pho", is_rental=True)
    he = build_listing_proposal_system("Đạt", p, xung_ho="chi")
    assert "Dòng 1: 📋 Em sẽ rao như vầy nhé chị:" in he and "Chị thấy bản tin này hấp dẫn chưa ạ?" in he


def test_loi_sau_duyet_ngan_va_phi_thue_ba_phan_tu():
    xac_nhan, _ = khoi_trang_thai_web({"len_web": True})
    assert "ĐÚNG 1 CÂU" in xac_nhan and "mạng lưới kết nối khách mua ngay" not in xac_nhan
    he = build_fee_followup_system("Đạt", Property(loai_hinh="nha_pho", is_rental=True), web={"len_web": True})
    assert "CHƯA BIẾT PHÍ" in he and "tối đa 2 câu" in he
    import aioi.prompts as P
    assert "0.75 tháng" not in open(P.__file__, encoding="utf-8").read()


def test_nha_tro_nguyen_can_la_nha_pho_trong_luat_lap_thao_tac():
    assert "nhà trọ nguyên căn" in OPERATIONS_SYSTEM and "TỪNG PHÒNG" in OPERATIONS_SYSTEM


def test_o_de_sau_di_kem_tin_qua_khoi_dong_lai():
    st = StoreGia(co_san=False)
    conv = _conv({"gia": "3,7 triệu/tháng", "dien_tich": "35m2"})
    conv.listings[0].prop.hoan = {"tien_ich_phong"}
    st.save(conv)
    [(_, _, d)] = _ghi_tin(st)
    assert d["boc_tach"]["_hoan"] == ["tien_ich_phong"] and d["boc_tach"]["gia"] == "3,7 triệu/tháng"
