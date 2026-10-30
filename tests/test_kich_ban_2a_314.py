"""Bước 2A (SRS-5.1zzzzzzz314): mỗi kịch bản mới phải TRƯỢT trên một bản ghi cài lỗi tay (đúng lỗi kịch bản sinh ra để bắt) và đạt trên bản
ghi đúng. Không gọi model."""
import json
import os

import pytest

from tests.kich_ban.cham import cham, loi_pham

BO = {k["id"]: k for k in json.load(open(os.path.join(os.path.dirname(__file__), "kich_ban", "ban.json"), encoding="utf-8"))["kich_ban"]}


def _kq(bots, o=None, loai="nha_pho"):
    return {"luot": [{"bot": b, **loi_pham(b), "so_bia": []} for b in bots], "o": o or {}, "loai": loai}


def _truot(kb_id, kq):
    return [t for t, ok, _ in cham(BO[kb_id], kq) if not ok]


CA = {
    "so_lech_so": (["Hẻm Tô Hiến Thành, đất bao nhiêu m² anh?", "36m², nhà mấy tầng anh?", "Sổ ghi 34,5m² mà anh nói 36m², chênh khá nhiều nha anh.", "📋 tin"],
                   ["Hẻm Tô Hiến Thành, đất bao nhiêu m² anh?", "36m², giấy tờ sao anh?", "34,5m² sổ hồng riêng, nhà đang ở hay trống anh?", "📋 tin"],
                   {"dien_tich_dat": "34,5", "gia": "6 tỷ"}),
    "rao_lai_sau_nhap": (["📋 Em sẽ rao như vầy", "Em đã đăng lại căn này rồi nha anh."], ["📋 Em sẽ rao như vầy", "📋 Bản tin đây anh xem"], {"gia": "11 tỷ"}),
    "xin_bot_phi": (["📋 tin", "Dạ được, em giảm cho chị còn 0,5% nha."], ["📋 tin", "Phí bên em cố định 1%, chỉ thu khi bán được chị nha."], {}),
    "doc_quyen": (["Giá bao nhiêu anh?", "Bên em có ký hợp đồng rõ ràng anh nha."], ["Giá bao nhiêu anh?", "Bên em không bắt ký độc quyền anh nha."], {}),
    "hoi_lai_giay_to": (["Giấy tờ sao anh?", "Nhà đang ở hay trống anh?", "Sổ hồng riêng đúng không anh?", "Mấy tầng anh?", "📋 tin"],
                        ["Giấy tờ sao anh?", "Nhà đang ở hay trống anh?", "Nhà mấy tầng anh?", "Giá bao nhiêu anh?", "📋 tin"], {"gia": "8 tỷ"}),
    "thoai_re": (["📋 Em sẽ rao như vầy nhé"], ["Tin thoại bị rè, anh nhắn chữ giúp em nha."], {}),
    "xung_chi_phi": (["Giá 5,2 tỷ nha chị.", "Phí bên em 1%, anh/chị cần biết thêm nhắn em."], ["Giá 5,2 tỷ nha chị.", "Phí bên em 1%, chị cần gì nhắn em nha."], {}),
}


@pytest.mark.parametrize("kb_id", sorted(CA))
def test_kich_ban_moi_bat_dung_loi(kb_id):
    xau, tot, o = CA[kb_id]
    assert _truot(kb_id, _kq(xau, o)), kb_id
    assert not _truot(kb_id, _kq(tot, o)), (kb_id, _truot(kb_id, _kq(tot, o)))


def test_len_top_co_trong_bo():
    assert BO["len_top"]["cau"] and _truot("len_top", _kq(["ok"], loai="dat"))
