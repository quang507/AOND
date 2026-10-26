"""SRS-5.1zzzzzzz198 (chủ dự án 26/10/2026: "cho phép mở đầu sôi nổi như Wow, Tuyệt vời!"; vẫn cấm "đắc địa", bình giá, dự đoán khách quan tâm).
Chỉ prompt: LUAT_KHEN cho phép MỘT tiếng cảm thán đầu lượt khi điều khách nói thật sự tốt, các cấm bịa thị trường giữ nguyên và thêm cấm đoán khách mua.
Đỏ khi bỏ khối cho phép, hoặc khi cảm thán kéo theo gỡ một cấm."""
from aioi.prompts import LUAT_KHEN, build_chat_system
from aioi.schema import Property


def _khen(system: str) -> str:
    i = system.index("KHEN NHIỀU HƠN")
    return system[i:i + len(LUAT_KHEN)]


def test_cho_phep_mo_dau_sol_noi_trong_prompt_chat():
    s = build_chat_system("T•ai", Property(loai_hinh="nha_pho"), "gia")
    k = _khen(s)
    for tu in ("Wow,", "Tuyệt vời!", "Hay quá anh!"):
        assert tu in k, tu
    assert "MỘT tiếng cảm thán" in k and "hai lượt liền nhau đổi chữ" in k


def test_van_cam_dac_dia_binh_gia_va_du_doan_khach():
    k = LUAT_KHEN
    assert "vị trí đắc địa" in k and "KHÔNG bình luận giá" in k          # cấm cũ còn nguyên
    assert "CẤM dự đoán" in k and "khách mua sẽ thích" in k and "chắc nhiều người hỏi" in k   # cấm mới
    assert "KHÔNG phá các cấm này" in k and "Wow, vị trí đắc địa quá!" in k   # cảm thán không là kẽ hở


def test_van_cam_mo_dau_da_va_khong_ghi_nhan():
    s = build_chat_system("T•ai", Property(loai_hinh="nha_pho"), "gia")
    assert "KHÔNG mở đầu bằng \"Dạ\"" in s or "CẤM mở đầu" in s or "Vẫn cấm mở đầu \"Dạ\"" in s
