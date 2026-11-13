"""SRS-5.1zzzzzzz466 — trần hạng Đồng 5 căn: bot báo thật, không hẹn "tin hiển thị em nhắn"."""
from aioi.prompts import khoi_trang_thai_web


def test_tran_dong_bao_that_len_bac():
    xac_nhan, hoi_link = khoi_trang_thai_web({"len_web": False, "thieu": [], "tran_hang_dong": True}, False)
    for khoi in (xac_nhan, hoi_link):
        assert "5 căn" in khoi and "Bạc" in khoi and "đã lưu" in khoi
        assert "nhắn ngay kèm link" not in khoi


def test_khong_tran_giu_loi_cu():
    xac_nhan, _ = khoi_trang_thai_web({"len_web": False, "thieu": [], "hen_bao_len_web": True}, False)
    assert "Bạc" not in xac_nhan and "nhắn ngay kèm link" in xac_nhan


def test_engine_khong_hen_len_web_khi_bi_tran():
    import inspect
    from aioi import engine
    nguon = inspect.getsource(engine)
    assert 'not web_tin.get("tran_hang_dong")' in nguon
