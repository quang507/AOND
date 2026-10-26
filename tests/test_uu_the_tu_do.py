"""26/10/2026 (SRS-5.1zzzzzzz205; chủ dự án: "Ô tự do uu_the lấy lun" — theo anh Luận ce11491 "bóc tách không thiếu"). Điều khách TỰ NÓI mà không có
ô riêng ("gần trường quốc tế", "tặng nội thất"…) trước đây mất; nay vào ô `uu_the` (mảng cụm ngắn) CỘNG DỒN, thành chất liệu cho tin rao. Giữ luật của
mình: chỉ cụm NẰM NGUYÊN trong lời khách mới được ghi (cùng cổng bằng chứng mọi ô). Đỏ khi bỏ cổng `_loc_uu_the` hoặc phép cộng dồn."""
from aioi.engine import Engine
from aioi.prompts import describe_captured, property_field_props
from aioi.schema import Property
from tests.test_doc_y_khach import _eng


def test_o_uu_the_co_trong_schema_la_mang_cum_ngan():
    t = property_field_props()["uu_the"]
    assert t["type"] == "array" and t["items"] == {"type": "string"} and "KHÔNG bịa" in t["description"]


def test_cong_dong_khong_ghi_de_va_khong_trung():
    p = Property(loai_hinh="nha_pho", fields={})
    assert p.update({"uu_the": "gần trường quốc tế"}) == ["uu_the"]
    p.update({"uu_the": "tặng nội thất · Gần trường quốc tế"})
    assert p.fields["uu_the"] == "gần trường quốc tế · tặng nội thất"


def test_chi_giu_cum_nam_nguyen_trong_loi_khach():
    eng, _ = _eng({"operations": []})
    conv = eng.conversation("uu1")
    conv.loi_khach_luot = "nhà gần trường quốc tế, tặng toàn bộ nội thất nha em"
    giu = Engine._loc_uu_the(conv, ["gần trường quốc tế", "tặng toàn bộ nội thất", "khu an ninh có bảo vệ"])
    assert giu == "gần trường quốc tế · tặng toàn bộ nội thất"          # "khu an ninh…" AI tự suy → bỏ
    assert any(b[0] == "uu_the" for b in conv.bo_luot)
    assert Engine._loc_uu_the(conv, None) == "" and Engine._loc_uu_the(conv, ["", 5]) == ""


def test_loc_o_tin_dua_uu_the_vao_ket_qua_va_bo_cum_bia():
    eng, _ = _eng({"operations": []})
    conv = eng.conversation("uu2")
    conv.loi_khach_luot = "hẻm thông ra Nguyễn Trãi, nhà mới sơn"
    out = eng._loc_o_tin(conv, {"uu_the": ["hẻm thông ra Nguyễn Trãi", "gần chợ"]}, {})
    assert out.get("uu_the") == "hẻm thông ra Nguyễn Trãi"


def test_uu_the_di_vao_du_lieu_ban_tin_va_khong_vao_cot_thong_so():
    p = Property(loai_hinh="nha_pho", fields={"gia": "9 tỷ", "uu_the": "gần trường quốc tế · tặng nội thất"})
    assert "gần trường quốc tế · tặng nội thất" in describe_captured(p)
    from aioi import supabase_store
    assert "uu_the" in supabase_store._O_KHONG_PHAI_THONG_SO


def test_uu_the_khong_chen_vao_ô_hoi_va_khong_chan_ban_nhap():
    p = Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Lê Lợi", "duong": "Lê Lợi", "gia": "9 tỷ", "uu_the": "gần chợ"})
    assert "uu_the" not in p.missing_fields() and p.can_publish()
