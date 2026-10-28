"""SRS-5.1zzzzzzz247 (bắn thử bộ môi giới 28/10/2026, run 40662188653): "ok em đăng đi" ngay sau bản nháp mà log ghi AI=dong_y trích_khớp=False
hai lượt — tin lên web trễ 3 lượt, khách tự trả lời trước các cụm hỏi sau đăng nên chỉ một cụm được hỏi. AI đọc ra đồng ý trễ một lượt thì
trích tin cũ; nay nhận cụm nằm trong tin khách gửi SAU bản nháp 📋 đang chờ, khi bản nháp đó chưa duyệt. Đỏ khi bỏ nhánh nhận trễ, hoặc khi
bỏ mốc `_duyet_ban` (trích cũ duyệt lại mãi)."""
from aioi.engine import Turn
from tests.test_duyet_ban_nhap import _eng


def _co_ban_nhap(conv):
    conv.listing_proposed = True
    conv.history.append(Turn("assistant", "📋 Em sẽ rao như vầy nhé chị:\n\nNhà phố hẻm xe hơi…\n\nChị muốn sửa chỗ nào, hay em đăng luôn ạ?", 1.0))


def test_dong_y_doc_tre_mot_luot_van_nhan(monkeypatch):
    eng, kho, _, conv = _eng({"operations": []}, monkeypatch)                      # lượt "ok em đăng đi": AI đọc sót
    _co_ban_nhap(conv)
    eng.handle("u-duyet", "ok em đăng đi")
    assert kho.duyet == []
    monkeypatch.setattr(eng._provider, "extract", lambda s, m, sc: {"operations": [], "duyet_ban_nhap": "dong_y",
                                                                   "duyet_trich_dan": "ok em đăng đi"}, raising=False)
    eng.handle("u-duyet", "phí bên em sao chị chưa biết")                         # lượt sau AI mới đọc ra, trích tin cũ
    assert kho.duyet == [True]
    eng.handle("u-duyet", "5 sao nha em")                                          # đã duyệt bản nháp này → trích cũ không duyệt lại
    assert kho.duyet == [True]


def test_cach_noi_moi_va_trich_truoc_ban_nhap_khong_tinh(monkeypatch):
    eng, kho, _, conv = _eng({"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "lên bài giùm chị"}, monkeypatch)
    conv.history.append(Turn("user", "được rồi đó em, lên bài giùm chị", 0.5))   # nói TRƯỚC bản nháp — không phải duyệt bản này
    _co_ban_nhap(conv)
    eng.handle("u-duyet", "nhà hướng đông nam nha")
    assert kho.duyet == []
