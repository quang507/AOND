"""SRS-5.1zzzzzzz270 (chủ dự án 29/10: "người ta bấm nút trả lời thì bot có đọc chính xác hơn dc ko"): khách bấm "Trả lời" một tin trên Zalo
→ bridge gửi `quote_text` (zca-js `quote.msg`) → lượt lập thao tác và lượt trả lời đều thấy khối "KHÁCH BẤM TRẢ LỜI". Nội dung tin trích
không phải lời khách: không vào `loi_khach_luot` (cổng bằng chứng ô tin, SRS-73). Trước bản này bridge bỏ trường quote, lõi không biết."""
from aioi.prompts import khoi_tin_tra_loi
from aioi.server import ZaloBridgePayload


def test_khoi_rong_khi_khong_bam_tra_loi():
    assert khoi_tin_tra_loi(None) == "" and khoi_tin_tra_loi("  ") == ""
    k = khoi_tin_tra_loi("📋 Em sẽ rao như vầy nhé anh: nhà mặt tiền đường Mã Lò")
    assert "TRẢ LỜI" in k and "Mã Lò" in k and "KHÔNG phải lời" in k


def test_payload_bridge_nhan_quote_text():
    p = ZaloBridgePayload(external_user_id="thu-q", text="ừ đăng đi", quote_text="📋 Em sẽ rao như vầy")
    assert p.quote_text == "📋 Em sẽ rao như vầy"


def test_luot_lap_thao_tac_va_tra_loi_thay_tin_duoc_tra_loi(monkeypatch):
    from tests.test_engine import _engine
    e = _engine()
    he_thong: list[str] = []
    goc_extract, goc_chat = e._provider.extract, e._provider.chat
    monkeypatch.setattr(e._provider, "extract", lambda system, *a, **k: (he_thong.append(system), goc_extract(system, *a, **k))[1])
    monkeypatch.setattr(e._provider, "chat", lambda system, *a, **k: (he_thong.append(system), goc_chat(system, *a, **k))[1])
    e.handle("thu-q", "bán nhà Mã Lò 12.5 tỉ")
    assert not any("KHÁCH BẤM" in s for s in he_thong)          # không bấm trả lời → không có khối
    he_thong.clear()
    conv = e.conversation("thu-q")
    conv.tin_tra_loi = "Đất của mình theo sổ khoảng bao nhiêu mét vuông, đất 999m2 hay sao anh?"
    e.handle("thu-q", "135m2 nha")
    co = [s for s in he_thong if "KHÁCH BẤM" in s and "đất 999m2" in s]
    assert len(co) >= 2                                            # cả lượt lập thao tác lẫn lượt trả lời
    assert "999" not in conv.loi_khach_luot                        # tin trích không phải lời khách
    assert "999" not in str(conv.prop.fields.get("dien_tich_dat") or conv.prop.fields.get("dien_tich") or "")
