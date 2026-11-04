"""SRS-5.1zzzzzzz381 — chủ dự án 04/11: "insight của con bot sẽ là thấu hiểu chăm sóc khách hàng cùng với các tính cách từ trước đó. các
prompt về nhân vật tính cách nên để đầu trong prompt bot". Đỏ khi prompt nói với khách không MỞ bằng khối nhân vật, khi khối GIỌNG không đi
ngay sau ở lượt chat, khi nhân vật lặp hai lần, hoặc khi khối nhân vật nằm sau ranh giới cache."""
import pytest

from aioi import prompts as P
from aioi.llm.base import RANH_GIOI_CACHE
from aioi.prompts import BuyerLead
from aioi.schema import Property

_P = Property(loai_hinh="nha_pho", fields={"gia": "3 tỷ", "dia_chi": "12 Lê Lai"})


@pytest.mark.parametrize("ten,s", [
    ("phieu", lambda: P.build_phieu_luot("Đ•ài", _P, "gia")),
    ("mua", lambda: P.build_buyer_chat_system("Đ•ài", BuyerLead(), None)),
    ("nhap", lambda: P.build_listing_proposal_system("Đ•ài", _P)),
    ("phi", lambda: P.build_fee_followup_system("Đ•ài", _P)),
])
def test_luot_chat_mo_bang_nhan_vat_roi_toi_giong(ten, s):
    s = s()
    assert s.startswith("NHÂN VẬT:") and s.count("NHÂN VẬT:") == 1 and "THẤU HIỂU và CHĂM SÓC" in s
    assert s.count(P.GIONG_VUI) == 1 and s.index("THẤU HIỂU") < s.index(P.GIONG_VUI) < s.index(RANH_GIOI_CACHE)
    assert "không đoán thêm chi tiết khách chưa kể" in s   # thấu hiểu không thành bịa (luật GIỌNG / phía mua)


def test_prompt_ngan_cung_mo_bang_nhan_vat_khong_kem_giong():
    for s in (P.build_ngoai_vung_system("Đ•ài", "Hà Nội"), P.build_media_read_instruction("Đ•ài")):
        assert s.startswith("NHÂN VẬT:") and P.GIONG_VUI not in s and "Bạn là" not in s[:200]
