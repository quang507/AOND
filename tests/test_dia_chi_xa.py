"""22/10/2026 (SRS-5.1zzzzzzz126). Lê Quang test đất ở "xã Phước Lý" (Long An): bot hỏi "Xã Phước Lý thuộc huyện nào của Long An vậy anh?" và lúc
trước đó xin "tên đường, phường và quận" — từ 1/7/2025 không còn cấp quận / huyện ("xã phước lý tức là hết huyện rồi"). Đỏ khi câu hỏi địa
chỉ còn bảo model hỏi quận / huyện, hay mất dòng hỏi đất "gần chỗ nào hoặc đường nào"."""
from aioi import prompts
from aioi.schema import Property


def test_cau_hoi_dia_chi_khong_bao_hoi_quan_huyen_va_co_cau_hoi_dat_gan_cho_nao():
    q = prompts.NATURAL_QUESTIONS["dia_chi"]
    assert "KHÔNG hỏi quận / huyện" in q and "gần chỗ nào hoặc đường nào" in q and "tên đường / phường / quận" not in q
    assert "xã" in prompts.FIELD_LABELS["phuong"]


def test_prompt_nguoi_rao_noi_xa_cong_tinh_la_du_cap_hanh_chinh():
    s = prompts.build_chat_system("Hằng", Property(loai_hinh="dat"), "dia_chi")
    assert "ĐỦ cấp hành chính" in s and 'KHÔNG hỏi "thuộc' in s and "gần chỗ nào hoặc đường nào" in s
