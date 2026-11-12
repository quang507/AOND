"""SRS-5.1zzzzzzz456 — giá chốt: ô riêng, khối hỏi theo trạng thái, ghi deals.gia_chot_vnd."""
from aioi.prompts import khoi_hoi_coc
from aioi.schema import O_COC, O_GIA_CHOT, O_NOI_BO


def test_gia_chot_la_o_rieng_hoi_dau():
    assert O_COC[0] == O_GIA_CHOT and O_GIA_CHOT in O_NOI_BO


def test_khoi_hoi_theo_trang_thai():
    assert "ĐÃ CỌC" in khoi_hoi_coc("gia_chot")
    k = khoi_hoi_coc("gia_chot", None, "đã bán")
    assert "ĐÃ BÁN" in k and "giá chốt cuối cùng" in k


def test_chot_keo_ghi_gia_chot():
    from tests.test_trang_thai_va_nap_lai import StoreGia, _conv
    st = StoreGia(db_status="dang_ban")
    st._ngan_sach_vnd = lambda s: 4_800_000_000 if s else None
    conv = _conv("đã bán")
    conv.active.prop.fields["gia_chot"] = "4,8 tỷ"
    st.save(conv)
    deal = [d for m, e, d in st.goi if m == "POST" and e.startswith("deals")]
    assert deal and deal[0]["gia_chot_vnd"] == 4_800_000_000
