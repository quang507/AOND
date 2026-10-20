"""20/10/2026 (SRS-5.1zzzzzzz86). Bắn thử KB2: nhà phố trong dự án LakeView City bị hỏi "mã số căn hoặc số nhà, tầng và tòa" — nhãn /
câu hỏi ô `ma_so_can` viết theo căn hộ mà dùng cho mọi loại. Một chỗ chọn nhãn / câu theo nhóm (`nhan_o`, `cau_hoi_o`)."""
from aioi import prompts
from aioi.schema import Property


def test_nha_pho_trong_du_an_khong_hoi_tang_toa():
    p = Property(loai_hinh="nha_pho", fields={"du_an": "LakeView City", "gia": "27 tỷ"})
    assert "ma_so_can" in p.missing_fields()
    he = prompts.build_chat_system("Lan", p, "ma_so_can")
    assert "tầng và tòa" not in he and "số lô" in he


def test_can_ho_van_hoi_tang_toa():
    p = Property(loai_hinh="chung_cu", fields={"du_an": "Masteri Thảo Điền"})
    assert "tầng và tòa" in prompts.build_chat_system("Lan", p, "ma_so_can")


def test_nhan_o_mot_cho():
    nha = Property(loai_hinh="nha_pho", fields={"ma_so_can": "A12"})
    assert "số lô" in prompts.describe_captured(nha)
    assert prompts.nhan_o("gia", nha) == prompts.FIELD_LABELS["gia"]
