"""26/10/2026 (SRS-5.1zzzzzzz193; chủ dự án: "tôi cần nó trả lời tương tác với người ta", ảnh chat bản anh Luận: khách báo "hiện có HĐT 35 triệu"
→ bot đáp "Thông tin vàng đó anh ơi! Có hợp đồng thuê sẵn — khách mua có dòng tiền ngay"). Luật khen một nguồn có thêm bước ĐÁP VÀO Ý NGHĨA điều
khách vừa nói; ví dụ trong luật phải tự tuân các điều cấm của chính nó (không nhận định thị trường / lợi suất / "hấp dẫn")."""
import re

from aioi import prompts
from aioi.schema import Property

CAM = ("thanh khoản", "tìm nhiều", "vừa tầm", "đắc địa", "hấp dẫn", "lợi suất", "dễ bán", "sinh lời")


def _khoi() -> str:
    k = prompts.LUAT_KHEN
    i = k.index("ĐÁP VÀO Ý NGHĨA")
    return k[i:k.index("- Một lượt tối đa HAI ý khen", i)]


def test_luat_dap_vao_y_nghia_nam_trong_luat_khen_mot_nguon():
    s = prompts.build_chat_system("Hằng", Property(loai_hinh="nha_pho"), "gia")
    assert s.count("ĐÁP VÀO Ý NGHĨA") >= 1 and s.count(prompts.LUAT_KHEN) == 1
    assert "HỢP ĐỒNG THUÊ".lower() in _khoi().lower() and "dòng tiền" in _khoi()


def test_vi_du_trong_luat_tu_tuan_cac_dieu_cam():
    ví_dụ = re.findall(r'"([^"]+)"', _khoi())
    cau = [v for v in ví_dụ if v.startswith("Thông tin quý")]
    assert cau, ví_dụ
    for c in cau:
        assert not [x for x in CAM if x in c.lower()], c
        assert len(c.split()) <= 25, c            # lời đáp vẫn ngắn
        assert not re.search(r"\d", c), c         # không kèm con số
    # phần dặn cũng không tự dạy model nói điều cấm (trừ chỗ gọi tên điều cấm sau chữ KHÔNG)
    ngoai_cam = _khoi().split("KHÔNG kèm")[0].lower()
    assert not [x for x in CAM if x in ngoai_cam]


def test_mo_luot_va_nhai_loi_khong_mau_thuan_voi_luat_moi():
    assert "ĐÁP VÀO Ý NGHĨA" in prompts.LUAT_MO_LUOT          # mở lượt cho nhắc MỘT chi tiết khi nói hệ quả
