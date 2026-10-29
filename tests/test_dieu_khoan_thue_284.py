"""29/10/2026 (SRS-5.1zzzzzzz284). Chủ dự án: "xem các commit của anh Luận có sửa gì ko" — đối chiếu 21 commit `luan8560/aond` (mới nhất 207a145, 26/10):
còn `6d58e9a` chưa chép — tin BÁN "có HĐT 35tr/tháng" thì AI ghi tiền thuê vào `muc_coc`, "sẵn HĐT" vào `thoi_han_hd` (mô tả ô bên mình chỉ là
"mức cọc" / "thời hạn hợp đồng"). Đỏ khi gỡ bản sửa."""
from aioi.prompts import property_field_props


def test_o_dieu_khoan_thue_chi_cho_tin_cho_thue():
    p = property_field_props()
    for k in ("thoi_han_hd", "muc_coc"):
        d = p[k]["description"]
        assert "CHỈ điền cho tin CHO THUÊ" in d and "có HĐT" in d, k
    assert "thu_nhap_thue" in p["muc_coc"]["description"] and "co_hdt" in p["thoi_han_hd"]["description"]
