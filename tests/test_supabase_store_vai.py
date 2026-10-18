"""18/10/2026: `sellers.seller_type` trên Supabase mang mã `ccrb` / `nmg`; nạp chuỗi trần vào `Conversation.user_type` làm
`_build_result` sập ở `.value` (500, bot im với khách thật). Bài này đỏ khi bỏ `vai_tu_seller_type`."""
from aioi.revenue import SellerRole
from aioi.supabase_store import vai_tu_seller_type


def test_ma_crm_sang_vai():
    assert vai_tu_seller_type("ccrb") is SellerRole.CHU_NHA
    assert vai_tu_seller_type("nmg") is SellerRole.MOI_GIOI
    assert vai_tu_seller_type("NMG ") is SellerRole.MOI_GIOI


def test_ma_engine_giu_nguyen():
    assert vai_tu_seller_type("chu_dau_tu") is SellerRole.CHU_DAU_TU
    assert vai_tu_seller_type("luot_song") is SellerRole.LUOT_SONG


def test_la_hoac_trong_thanh_unknown():
    for raw in (None, "", "khach_la", 3):
        assert vai_tu_seller_type(raw) is SellerRole.UNKNOWN


def test_ket_qua_co_value():
    # Đúng chỗ sập ở production: engine gọi conv.user_type.value
    assert vai_tu_seller_type("ccrb").value == "chu_nha"
