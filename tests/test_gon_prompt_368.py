"""SRS-5.1zzzzzzz368 — làm gọn prompt (chủ dự án 02/11: "prompt bot gọn lại hơn dc ko, có chỗ nào bị dài dòng chồng nhau ko" → "làm gọn
nó đi"). (1) Khuôn bản tin `AD_FORMAT` (~5k ký tự, nằm SAU ranh giới cache nên không được cache) chỉ đi kèm lượt sau bản nháp có thể phải rao
lại bản tin. (2) Chữ gửi model không mang mã "SRS-…" / ngày sửa — lịch sử ở docs/07. (3) Danh sách ô của lượt soát ô hỏi (SRS-367) nằm trong
system (cache được), bỏ ô chỉ dùng phía mua."""
import re
from types import SimpleNamespace

import pytest

from aioi import prompts as P
from aioi.engine import _co_the_viet_lai_tin
from aioi.schema import Property


def _p():
    return Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Lê Văn Sỹ", "gia": "5 tỷ"})


def test_khuon_ban_tin_chi_khi_can_viet_lai():
    assert P.AD_FORMAT in P.build_fee_followup_system("Mai·Anh", _p(), viet_lai_tin=True)
    assert P.AD_FORMAT not in P.build_fee_followup_system("Mai·Anh", _p(), viet_lai_tin=False)


@pytest.mark.parametrize("duyet,yeu_cau,captured,can", [
    ("dong_y", None, ["gia"], False),        # khách duyệt → đăng, không rao lại
    (None, None, [], False),                 # hỏi phí / tán gẫu
    ("khong_dong_y", None, [], True),        # không duyệt → có thể sửa và rao lại
    (None, ["tiêu đề ngắn lại"], [], True),   # dặn cách viết
    (None, None, ["gia"], True),             # vừa đổi giá → rao lại bản tin cập nhật
    (None, None, ["_phuong_he_thong"], False),
])
def test_engine_quyet_viet_lai_tin(duyet, yeu_cau, captured, can):
    conv = SimpleNamespace(duyet_luot=duyet, y_luot={"yeu_cau_viet": yeu_cau} if yeu_cau else {})
    assert _co_the_viet_lai_tin(conv, captured) is can


def test_chu_gui_model_khong_mang_ma_srs_hay_ngay_sua():
    """Quét MỌI hằng chữ viết hoa của prompts + prompt dựng sẵn + schema bóc tách (bản đầu chỉ soát 6 hằng — sót 9 chỗ)."""
    import json
    lich_su = re.compile(r"SRS-5\.1z|\b\d{1,2}/1[01](?:/2026)?\b")
    chu = {n: v for n, v in vars(P).items() if n.isupper() and isinstance(v, str)}
    chu.update(phieu=P.build_phieu_luot("Mai·Anh", _p(), "huong"), sau=P.build_fee_followup_system("Mai·Anh", _p()),
               nhap=P.build_listing_proposal_system("Mai·Anh", _p(), ""), schema=json.dumps(P.operations_schema(), ensure_ascii=False))
    lech = {n: lich_su.findall(v)[:3] for n, v in chu.items() if lich_su.search(v)}
    assert not lech, lech


def test_danh_sach_o_soat_trong_system_va_khong_co_o_phia_mua():
    s = P.SOAT_O_HOI_SYSTEM
    assert "- phuong:" in s and "- duong:" in s and "- gia:" in s
    assert "- ngan_sach:" not in s and "- khu_vuc:" not in s
