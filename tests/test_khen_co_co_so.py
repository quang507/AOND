"""19/10/2026 (SRS-5.1zzzzzzz75; chủ dự án: "khen quá nhiều, khen tào lao"): câu mẫu trong prompt lượt chat người bán từng tự dạy model
khen thị trường không có dữ liệu ("thanh khoản rất tốt", "người mua tìm nhiều lắm", "giá 6 tỷ khu này rất vừa tầm", "giữ gìn sạch
đẹp là khách mua ưng ngay") — bot chép y chang ở mọi lượt. Đỏ khi một câu mẫu như vậy quay lại, hoặc luật khen một nguồn bị gỡ."""
from aioi import prompts
from aioi.schema import Property

P = Property(loai_hinh="nha_pho", fields={"gia": "16 tỷ", "dia_chi": "110 Âu Cơ", "dien_tich_dat": "80m2"})
NHAN_DINH_THI_TRUONG = ("thanh khoản", "tìm nhiều", "tìm mua lắm", "vừa tầm", "khách mua ưng", "giữ gìn sạch đẹp", "đắc địa")


def _phan_day_model(s: str) -> str:
    # Bỏ chính luật cấm (nó phải gọi tên điều cấm) và bố cục tin rao (liệt kê điều không được bịa) — phần còn lại là câu mẫu.
    return s.replace(prompts.LUAT_KHEN, "").replace(prompts.AD_FORMAT, "")


def test_luat_khen_mot_nguon_nam_trong_prompt_chat():
    s = prompts.build_chat_system("Lan", P, "phap_ly_hoan_cong")
    assert s.count(prompts.LUAT_KHEN) == 1
    assert "KHÔNG bình luận giá" in prompts.LUAT_KHEN


def test_cau_mau_khong_day_nhan_dinh_thi_truong():
    for next_field in ("phap_ly_hoan_cong", "gia", None):
        con_lai = _phan_day_model(prompts.build_chat_system("Lan", P, next_field)).lower()
        lot = [c for c in NHAN_DINH_THI_TRUONG if c in con_lai]
        assert not lot, lot


def test_khen_nhieu_hon_van_co_co_so():
    """21/10/2026 (SRS-5.1zzzzzzz119), sếp: "cần nó khen nhiều hơn" — khen điểm tốt thật mỗi lượt có điểm tốt, vẫn cấm bịa thị trường.
    Đỏ khi luật còn bảo "phần lớn các lượt KHÔNG khen", hoặc mất phần cấm bịa."""
    k = prompts.LUAT_KHEN
    assert "KHEN NHIỀU HƠN" in k and "Phần lớn các lượt KHÔNG khen" not in k
    assert "thanh khoản tốt" in k and "KHÔNG bình luận giá" in k          # vẫn cấm nói điều không có số liệu
    s = prompts.build_chat_system("Hằng", prompts.Property(loai_hinh="nha_pho"), "gia", prompts.SellerRole.UNKNOWN, "")
    assert "KHÔNG khen các thông số kỹ thuật thông thường" not in s       # câu cũ ngược luật mới đã bỏ


def test_khen_nhieu_hon_lan_hai_khen_ca_cach_khach_lam_viec_va_ben_mua():
    """22/10/2026 (SRS-5.1zzzzzzz124), Lê Quang hỏi lại "cho nó khen nhiều hơn dc ko": khen thêm CÁCH khách cung cấp thông tin (luôn có cơ sở),
    tối đa hai ý khen mỗi lượt, bên mua có luật khen riêng nhưng cấm nhận xét tài chính / khen lựa chọn đáng mua. Vẫn cấm bịa thị trường."""
    k = prompts.LUAT_KHEN
    assert "CÁCH khách cung cấp thông tin" in k and "tối đa HAI ý khen" in k and "MỘT câu khen" not in k
    assert "thanh khoản tốt" in k and "KHÔNG bình luận giá" in k
    from aioi.schema import BuyerLead
    b = prompts.build_buyer_chat_system("Hằng", BuyerLead(), "khu_vuc")
    assert "KHEN NHIỀU HƠN" in b and 'CẤM nhận xét tài chính' in b and "đáng mua" in b
