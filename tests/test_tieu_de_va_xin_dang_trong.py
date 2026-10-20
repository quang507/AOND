"""20/10/2026 (SRS-5.1zzzzzzz91). Bắn thử KB2: tiêu đề "Bán nhà phố LakeView City 5x20m²…" (5x20 là kích thước, diện tích 100m²) — code
kiểm bố cục dòng tiêu đề, lệch thì gọi lại model một lần. Chat tester: "đăng giúp mình theo nội dung này" khi căn chưa có ý gì (khách
sắp dán bài) → bot hỏi giá / địa chỉ; nay mời khách dán nội dung. Kèm: nhà trong khu dự án là nhà phố. Đỏ khi bỏ một bản sửa."""
from aioi.engine import Engine, _tieu_de_sai_don_vi
from aioi.prompts import OPERATIONS_SYSTEM, khoi_xin_dang
from aioi.schema import Property
from tests.test_tieu_de_co_gia import _SpyLan

SAI = "📋 Em sẽ rao như vầy nhé anh chị:\n\nBán nhà phố LakeView City 5x20m², 1 trệt 3 lầu, 27 tỷ\n\nThân."
DUNG = "📋 Em sẽ rao như vầy nhé anh chị:\n\nBán nhà phố LakeView City 100m², 1 trệt 3 lầu, 27 tỷ\n\nThân."


def test_kich_thuoc_kem_m2_trong_tieu_de_thi_goi_lai():
    assert _tieu_de_sai_don_vi(SAI) and not _tieu_de_sai_don_vi(DUNG)
    assert not _tieu_de_sai_don_vi("Bán nhà 5x20m 27 tỷ")   # không phải bản tin
    spy = _SpyLan({"operations": []}, [SAI, DUNG])
    eng = Engine(spy)
    conv = eng.conversation("td2")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({"du_an": "LakeView City", "gia": "27 tỷ", "kich_thuoc": "5x20", "dien_tich_dat": "100m2"})
    conv.listing_proposed = True
    eng.handle("td2", "hướng Đông Nam")
    assert "VIẾT LẠI LƯỢT NÀY" in spy.systems[-1] and conv.history[-1].content == DUNG


def test_xin_dang_khi_chua_co_y_gi_thi_moi_dan_noi_dung():
    trong = khoi_xin_dang(["gia", "dien_tich"], Property(loai_hinh="nha_pho"))
    assert "dán nội dung" in trong and "KHÔNG hỏi từng ô" in trong
    co = khoi_xin_dang(["gia"], Property(loai_hinh="nha_pho", fields={"dia_chi": "Âu Dương Lân"}))
    assert "dán nội dung" not in co and "Tin còn thiếu" in co


def test_nha_trong_khu_du_an_la_nha_pho():
    assert "trong khu dự án" in OPERATIONS_SYSTEM and "tòa / block / tầng X" in OPERATIONS_SYSTEM
