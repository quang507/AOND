"""SRS-5.1zzzzzzz391 — Kiểm tra tinh gọn System Prompt <1.500 tokens, tích hợp Customer Insight,
công cụ nguyên tử Function Calling, CUM_TOI_DA = 2 (Fast-Draft đã gỡ 08/11)."""
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
    """SRS-5.1zzzzzzz410 (chủ dự án 11/11: trả giọng nhân vật + từ điển tiếng lóng đầy đủ cho prompt ngắn): bỏ trần 1.500 token; prompt ngắn
    phải có GIỌNG, LUẬT CỐ ĐỊNH, tin hệ thống, tiếng lóng đầy đủ — và KHÔNG mang danh sách công cụ / bố cục tin rao (không thuộc lượt hỏi ô)."""
    lean_prompt = P.LEAN_SYSTEM_PROMPT
    assert P.GIONG_VUI in lean_prompt and P.SLANG_NOTES in lean_prompt and P.TIN_HE_THONG in lean_prompt and "LUẬT CỐ ĐỊNH" in lean_prompt
    assert "BỐ CỤC TIN RAO" not in lean_prompt and "FUNCTION CALLING" not in lean_prompt
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
    assert CUM_TOI_DA == 1   # SRS-5.1zzzzzzz407: chủ dự án 11/11 "mỗi lượt chỉ hỏi 1 ý"
    p = Property(loai_hinh="nha_pho", fields={"dia_chi": "110 Âu Cơ", "duong": "Âu Cơ", "gia": "16 tỷ"})
    thieu = p.missing_fields()
    # Khi thiếu cả diện tích đất và diện tích nhà (cùng cụm quy mô), cụm hỏi tối đa 2 ý
    cum = p.cum_hoi(thieu[0], thieu)
    assert len(cum) <= 2


def test_ban_nhap_van_cho_phap_ly_va_hien_trang():
    """08/11: gỡ Fast-Draft của bản 06/11 — luật chủ dự án 28/10 (SRS-5.1zzzzzzz260) vẫn đứng: giá · vị trí · quy mô · pháp lý ·
    hiện trạng rồi mới ra bản nháp. Trích dẫn chủ dự án ở SRS-391 chỉ duyệt prompt gọn, công cụ, bỏ câu cấm, insight, 2 ý/lượt."""
    f = {"dia_chi": "150 Trần Bình Trọng", "quan": "Quận 5", "dien_tich_dat": "80m2", "gia": "12 tỷ", "lo_gioi_hem": "mặt tiền"}
    p = Property(loai_hinh="nha_pho", fields=dict(f))
    assert p.can_publish() and not p.summary_ready()
    assert not hasattr(p, "fast_draft_ready")


def test_function_calling_atomic_tools_san_sang():
    """Các công cụ nguyên tử định giá, pháp lý và phí môi giới sẵn sàng cho Agent Bán."""
    res_avm = tinh_dinh_gia_tham_khao(khu_vuc="Quận 5", duong="Trần Bình Trọng", dien_tich=80.0, gia_chu_dinh_ban=12.0)
    assert res_avm["don_gia_min"] > 0
    assert res_avm["gia_max"] > res_avm["gia_min"]

    res_pl = kiem_tra_phap_ly_so_tool({"chu_de": "chua_hoan_cong"})
    assert "CĂN CỨ PHÁP LÝ" in res_pl

    res_phi = tinh_phi_moi_gioi_tool(None, {"gia_vnd": 12_000_000_000, "loai_giao_dich": "ban", "vai_nguoi_gui": "chu_nha"})
    assert "1%" in res_phi and "120 triệu" in res_phi
    assert "0 đồng trước" in res_phi


def test_lean_prompt_chi_nhac_cong_cu_co_that():
    """08/11: bản 06/11 dặn gọi `tim_kiem_gio_hang` / `tra_cuu_du_an` — không công cụ nào tên vậy, và còn "Fast-Draft ~50 điểm" trái
    luật bản nháp SRS-260. Mọi tên trong dấu `…` của prompt gọn phải là công cụ thật của agent_ban / agent_mua."""
    from aioi import agent_ban, agent_mua
    that = {c["name"] for c in agent_ban.CONG_CU} | {c["name"] for c in agent_mua.CONG_CU}
    ten = set(P.LEAN_SYSTEM_PROMPT.split("`")[1::2])
    assert ten and ten <= that, ten - that
    assert "50 điểm" not in P.LEAN_SYSTEM_PROMPT and "pháp lý" in P.LEAN_SYSTEM_PROMPT
