"""20/10/2026 (SRS-5.1zzzzzzz86). Bắn thử KB2: khách "Em gửi căn…" → bot gọi "bạn", xưng "mình" — chính sách chung viết `Gọi khách là
"em" (hoặc "bạn")`. KB3: khách chưa tự xưng → khối xưng hô "chưa biết" không có luật "Dạ", bot mở "Dạ, phí quản lý…". Sửa ở nguồn:
luật giọng chung đi kèm MỌI khối xưng hô (cả nhánh người mua, trả lời từ tài liệu), chính sách không còn cho "bạn", câu viết cứng
trong code không mở bằng "Dạ"."""
import re
from pathlib import Path

from aioi import prompts
from aioi.engine import khoi_xung_ho

GOC = Path(__file__).resolve().parents[1] / "src" / "aioi"


def test_moi_cach_xung_ho_deu_cam_da_va_ban():
    for p in ("em", "anh", "chi", "elder", "unknown"):
        k = khoi_xung_ho(p)
        assert '"Dạ"' in k and '"bạn"' in k, p


def test_chinh_sach_chung_khong_cho_goi_ban_khong_doan_theo_zalo():
    s = prompts.build_chat_system("Hằng", prompts.Property(loai_hinh="nha_pho"), "gia")   # SRS-207: chính sách chung nay là prompt bản anh Luận
    assert '(hoặc "bạn")' not in s and "Zalo nam giới" not in s and "Zalo nữ giới" not in s


def test_cau_viet_cung_trong_code_khong_mo_bang_da():
    # Chữ code tự ghép gửi khách (không phải luật trong prompt): chuỗi mở bằng "Dạ " là vi phạm quyết định chủ dự án.
    for p in GOC.glob("*.py"):
        if p.name != "prompts.py":   # prompts.py chứa luật cấm có trích "Dạ em..." làm ví dụ sai
            assert not re.findall(r'(?<!\\)"Dạ [a-zđA-ZĐ]', p.read_text(encoding="utf-8")), p.name


def test_khach_xung_em_bot_xung_minh_khong_anh_chi():
    # Bắn thử lần 3 KB2: khách "Em gửi căn…", bot gọi "em" ba lượt rồi lượt "đăng đi" lại "vậy anh/chị?" — luật cũ cho bot tự xưng
    # "mình hoặc anh/chị", trùng chữ với cách gọi khách. Đỏ trên bản trước.
    k = khoi_xung_ho("em")
    assert "hoặc 'anh/chị'" not in k and "KHÔNG có chữ 'anh/chị'" in k
