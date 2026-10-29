"""SRS-5.1zzzzzzz262 (chủ dự án 29/10/2026: khách tìm theo khu vực, giá, công năng, gần bệnh viện / trường, yên tĩnh, "tìm nhà có 4 tầng", nhà cấp 4,
đất nền… "tìm trường phù hợp với code có sẵn, và vector hoá"; và "khách hỏi đúng một căn mà bot không tìm thấy thì nói rõ căn đó chưa có trước").
(1) Số tầng chưa có đường nào: thêm ô `so_tang_mong_muon` (AI ghi con số tính cả trệt) → `tim_nha(p_tang_min)` cộng điểm, căn ít tầng / chưa rõ
    số tầng ghi cờ lệch để bot nói thẳng. (2) Bắn thử SRD 28/10: khách hỏi "nhà hẻm xe hơi Trần Bình Trọng giá 10 tỷ còn không" (căn chưa lên web)
    → bot "em có căn này hợp với anh" và kể căn KHÁC. Nay `mua.can_cu_the` (AI đọc, code kiểm cụm trích) → việc dặn nói thẳng chưa thấy đúng căn đó.
Đỏ khi bỏ `p_tang_min`, bỏ cờ `_thieu_tang`, hoặc bỏ khối `can_cu_the` ở `Engine._viec_mua`."""
from types import SimpleNamespace

from aioi.mua import danh_dau_lech, dong_can
from tests.test_ngung_bao_va_khong_hop import KhoHaiCan
from tests.test_viec_mua import KHACH_MUA, _engine


def _lead(**f):
    return SimpleNamespace(fields=f, so_phong_ngu=None)


def test_tim_nha_gui_so_tang_khach_muon():
    kho = KhoHaiCan()
    eng, ai = _engine(kho, {**KHACH_MUA, "buyer_lead": {**KHACH_MUA["buyer_lead"], "so_tang_mong_muon": "4"}})
    eng.handle("mua-tang-1", "Anh tìm nhà phố quận 5 tầm 5 tỷ, nhà 1 trệt 3 lầu nha")
    tim = [d for m, e, d in kho.goi if e.startswith("rpc/tim_nha")]
    assert tim and tim[0]["p_tang_min"] == 4
    eng2, _ = _engine(KhoHaiCan(), KHACH_MUA)
    kho2 = eng2._convstore
    eng2.handle("mua-tang-2", "Anh tìm nhà phố quận 5 tầm 5 tỷ")
    assert [d for m, e, d in kho2.goi if e.startswith("rpc/tim_nha")][0]["p_tang_min"] is None   # khách không nói số tầng → không cộng


def test_can_it_tang_hoac_chua_ro_thi_noi_thang():
    can = [{"code": "A1", "floors": 2}, {"code": "B2"}, {"code": "C3", "floors": 5}]
    danh_dau_lech(can, _lead(so_tang_mong_muon="4"))
    assert "ÍT tầng hơn khách muốn (có 2 tầng, khách muốn 4)" in dong_can(can[0])
    assert "CHƯA RÕ số tầng (khách muốn 4 tầng)" in dong_can(can[1])
    assert "tầng" not in dong_can(can[2]).split("·")[-1] and "_thieu_tang" not in can[2]


def test_khach_hoi_dung_mot_can_khong_ma_thi_noi_thang_chua_thay():
    cau = "Cho anh hỏi nhà hẻm xe hơi đường Trần Bình Trọng quận 5 giá 10 tỷ còn không em?"
    eng, ai = _engine(KhoHaiCan(), {**KHACH_MUA, "mua": {"can_cu_the": "nhà hẻm xe hơi đường Trần Bình Trọng quận 5 giá 10 tỷ",
                                                         "trich_dan": "còn không em"}})
    eng.handle("mua-cu-the-1", cau)
    assert any("em chưa thấy đúng căn đó trên hệ thống" in s and "căn KHÁC" in s for s in ai.system)
    # Cụm AI trích không có trong lời khách (bịa) → không có khối; khách tả nhu cầu chung (AI để trống) → không có khối.
    eng2, ai2 = _engine(KhoHaiCan(), {**KHACH_MUA, "mua": {"can_cu_the": "căn 3 tỷ ở Sunrise City"}})
    eng2.handle("mua-cu-the-2", cau)
    assert not any("em chưa thấy đúng căn đó" in s for s in ai2.system)
    eng3, ai3 = _engine(KhoHaiCan(), KHACH_MUA)
    eng3.handle("mua-cu-the-3", "Anh tìm nhà phố quận 5 tầm 5 tỷ")
    assert not any("em chưa thấy đúng căn đó" in s for s in ai3.system)


def test_khach_go_ma_khong_co_thi_noi_thang():
    # SRS-5.1zzzzzzz264: mã khách gõ không có căn đang hiện (KhoHaiCan chỉ có ABCD1234 / EFGH5678) → câu đầu nói thẳng, không lờ đi.
    eng, ai = _engine(KhoHaiCan(), {**KHACH_MUA, "mua": {"ma_can": ["ZZZZ9999"], "quan_tam": True, "trich_dan": "căn ZZZZ9999 còn không"}})
    eng.handle("mua-ma-1", "Căn ZZZZ9999 còn không em?")
    assert any("#ZZZZ9999" in s and "KHÔNG có căn đang rao nào mang mã đó" in s for s in ai.system)
    eng2, ai2 = _engine(KhoHaiCan(), {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "quan_tam": True, "trich_dan": "căn ABCD1234 còn không"}})
    eng2.handle("mua-ma-2", "Căn ABCD1234 còn không em?")
    assert not any("KHÔNG có căn đang rao nào mang mã đó" in s for s in ai2.system)   # mã có thật → không có khối
