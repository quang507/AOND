"""SRS-5.1zzzzzzz391 — Kiểm tra tinh gọn System Prompt <1.500 tokens, tích hợp Customer Insight,
công cụ nguyên tử Function Calling, Fast-Draft tại 50 điểm và CUM_TOI_DA = 2."""
try:
    import pytest
except ImportError:
    class MockPytest:
        @staticmethod
        def mark(): pass
    pytest = MockPytest()
from aioi import prompts as P
from aioi.schema import Property, CUM_TOI_DA
from aioi.dinh_gia import tinh_dinh_gia_tham_khao, kiem_tra_phap_ly_so_tool, tinh_phi_moi_gioi_tool


def test_lean_system_prompt_tokens_under_1500():
    """System Prompt tinh gọn phải dưới 1.500 tokens (~5.000 ký tự)."""
    assert hasattr(P, "LEAN_SYSTEM_PROMPT")
    lean_prompt = P.LEAN_SYSTEM_PROMPT
    assert len(lean_prompt) < 5000, f"Prompt quá dài: {len(lean_prompt)} chars"
    approx_tokens = len(lean_prompt.split()) * 1.3
    assert approx_tokens < 1500, f"Tokens quá cao: ~{approx_tokens}"
    # Đảm bảo giữ nguyên các phần cốt lõi của anh Luận
    assert "AD_FORMAT" in lean_prompt or "BỐ CỤC TIN RAO" in lean_prompt
    assert "tỏi" in lean_prompt and "củ" in lean_prompt
    assert "Truth-grounded" in lean_prompt or "Trung thực tuyệt đối" in lean_prompt


def test_khoi_nhan_vat_co_customer_insight():
    """Khối nhân vật tích hợp insight thấu hiểu và chăm sóc khách hàng."""
    s = P.khoi_nhan_vat("AI Ơi Nhà Đất", "người gửi bán nhà")
    assert "THẤU HIỂU và CHĂM SÓC" in s
    assert "Customer Insight" in s
    assert "tôn trọng tài sản lớn" in s
    assert "áp lực tài chính" in s


def test_cum_toi_da_bang_hai():
    """Chủ dự án duyệt: mỗi lượt hỏi tối đa 2 ý (CUM_TOI_DA = 2)."""
    assert CUM_TOI_DA == 2
    p = Property(loai_hinh="nha_pho", fields={"dia_chi": "110 Âu Cơ", "duong": "Âu Cơ", "gia": "16 tỷ"})
    thieu = p.missing_fields()
    # Khi thiếu cả diện tích đất và diện tích nhà (cùng cụm quy mô), cụm hỏi tối đa 2 ý
    cum = p.cum_hoi(thieu[0], thieu)
    assert len(cum) <= 2


def test_fast_draft_ready_tai_bon_tru_cot_vang():
    """Đủ 4 trụ cột (loại hình, địa chỉ/quận, diện tích, giá) là kích hoạt Fast-Draft không cần chờ hiện trạng/pháp lý."""
    # Thiếu diện tích -> Chưa thể Fast-Draft
    p_thieu = Property(loai_hinh="nha_pho", fields={"dia_chi": "150 Trần Bình Trọng", "quan": "Quận 5", "gia": "12 tỷ"})
    assert not p_thieu.fast_draft_ready()

    # Đủ 4 trụ cột -> Sẵn sàng Fast-Draft ngay (không cần tinh_trang_ban_giao hay phap_ly)
    p_du = Property(
        loai_hinh="nha_pho",
        fields={
            "dia_chi": "150 Trần Bình Trọng",
            "quan": "Quận 5",
            "dien_tich_dat": "80m2",
            "gia": "12 tỷ",
            "lo_gioi_hem": "mặt tiền"
        }
    )
    assert p_du.can_publish()
    assert p_du.fast_draft_ready()


def test_function_calling_atomic_tools_san_sang():
    """Các công cụ nguyên tử định giá, pháp lý và phí môi giới sẵn sàng cho Agent Bán."""
    res_avm = tinh_dinh_gia_tham_khao(khu_vuc="Quận 5", duong="Trần Bình Trọng", dien_tich=80.0, gia_chu_dinh_ban=12.0)
    assert res_avm["don_gia_min"] > 0
    assert res_avm["gia_max"] > res_avm["gia_min"]

    res_pl = kiem_tra_phap_ly_so_tool({"loai_so": "so_hong_rieng", "tinh_trang": "chua_hoan_cong"})
    assert "CĂN CỨ PHÁP LÝ" in res_pl
    assert "Luật Đất đai 2024" in res_pl

    res_phi = tinh_phi_moi_gioi_tool(None, {"gia_chot": 12.0, "loai_giao_dich": "ban", "vai_tro": "chu_nha"})
    assert "1%" in res_phi
    assert "0 ĐỒNG TRƯỚC" in res_phi
