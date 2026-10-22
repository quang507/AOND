"""22/10/2026 (SRS-5.1zzzzzzz122). Chủ dự án gửi sticker thỏ vẫy tay "HI!": bot chỉ thấy "[khách gửi sticker]", đáp "Em nhận được sticker của anh
rồi ạ" rồi hỏi tiếp câu đang dở — không biết khách CHÀO ("hello này nó biết là sticker thôi à… thì dùng gemini đi"). Bridge gửi link ảnh sticker,
lõi cho một lượt đọc ảnh rẻ (Gemini trước) đọc NGHĨA; code chỉ nối chữ. Đỏ khi: sticker chào vẫn là chuỗi trung tính, sticker đã đọc thành
đồng ý / ghi vào tin, đọc hỏng làm hỏng lượt, hay Claude bị gọi trước Gemini."""
from types import SimpleNamespace

from fastapi.testclient import TestClient

import aioi.server as srv
from aioi import sticker
from aioi.fetch import FetchError
from aioi.llm.du_phong import URL_GEMINI, URL_GROQ, DuPhongProvider, LoiNguon, Nguon
from aioi.sticker import STICKER_TRUNG_TINH, doc_sticker, la_sticker, ra_van_ban
from tests.test_doc_y_khach import _eng

ANH = SimpleNamespace(data=b"\x89PNG", media_type="image/png")


def test_ra_van_ban_chao_la_hello_con_lai_giu_dau_sticker():
    assert ra_van_ban({"y_nghia": "chao", "mo_ta": "thỏ vẫy tay, chữ HI!"}) == "hello"
    cam_on = ra_van_ban({"y_nghia": "cam_on", "mo_ta": "gấu cúi đầu [cảm ơn]\nnhiều"})
    assert cam_on == "[khách gửi sticker: gấu cúi đầu cảm ơn nhiều]" and la_sticker(cam_on)
    assert ra_van_ban({"y_nghia": "lạ", "mo_ta": "x"}) == STICKER_TRUNG_TINH
    assert ra_van_ban({"y_nghia": "vui", "mo_ta": ""}) == STICKER_TRUNG_TINH and ra_van_ban(None) == STICKER_TRUNG_TINH
    assert la_sticker(STICKER_TRUNG_TINH) and not la_sticker("hello") and not la_sticker("tôi gửi sticker nè")


def test_doc_sticker_dung_duong_gemini_truoc_va_chao_thanh_hello(monkeypatch):
    monkeypatch.setattr(sticker, "fetch_media", lambda *a, **k: ANH)
    goi = []

    class P:
        def extract_media(self, *a):
            goi.append("claude")
            return {"y_nghia": "khac", "mo_ta": "x"}

        def extract_media_re(self, items, hd, schema):
            goi.append(("re", items[0][1], "HI!" in hd))
            return {"y_nghia": "chao", "mo_ta": "thỏ vẫy tay"}
    assert doc_sticker(P(), "https://cdn.example/s.png", "HI!") == "hello"
    assert goi == [("re", "image/png", True)]


def test_doc_sticker_loi_nao_cung_ra_chuoi_trung_tinh(monkeypatch):
    class P:
        def extract_media(self, *a):
            raise RuntimeError("model hỏng")
    monkeypatch.setattr(sticker, "fetch_media", lambda *a, **k: ANH)
    assert doc_sticker(P(), "https://cdn.example/s.png") == STICKER_TRUNG_TINH
    monkeypatch.setattr(sticker, "fetch_media", lambda *a, **k: (_ for _ in ()).throw(FetchError("không tải được")))
    assert doc_sticker(P(), "https://cdn.example/s.png") == STICKER_TRUNG_TINH
    monkeypatch.setattr(sticker, "fetch_media", lambda *a, **k: SimpleNamespace(data=b"%PDF", media_type="application/pdf"))
    assert doc_sticker(P(), "https://cdn.example/s.pdf") == STICKER_TRUNG_TINH


def test_sticker_da_doc_van_khong_bao_gio_la_dong_y():
    cau = "[khách gửi sticker: thỏ gật đầu ok]"
    eng, spy = _eng({"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": cau, "xin_dang": cau})
    conv = eng.conversation("st1")
    conv.listing_proposed = True
    eng.handle("st1", cau)
    assert conv.duyet_luot is None


def _nguon():
    return [Nguon("Gemini", URL_GEMINI, ["kg"], ["g-x"], True), Nguon("Groq", URL_GROQ, ["kq"], ["q-x"], False)]


class _Claude:
    def __init__(self):
        self.goi = 0

    def extract_media(self, *a):
        self.goi += 1
        return {"y_nghia": "khac", "mo_ta": "từ claude"}


def _dap(chu):
    return {"choices": [{"message": {"content": chu}}], "usage": {"prompt_tokens": 5, "completion_tokens": 2}}


def test_extract_media_re_gemini_truoc_claude_sau_cung():
    claude = _Claude()
    p = DuPhongProvider(claude, _nguon(), goi=lambda n, k, than, han: _dap('{"y_nghia": "chao", "mo_ta": "thỏ"}'))
    kq = p.extract_media_re([(b"x", "image/png")], "đọc", sticker.SCHEMA)
    assert kq["y_nghia"] == "chao" and claude.goi == 0           # Gemini đủ → không đụng Claude
    hong = DuPhongProvider(claude, _nguon(), goi=lambda n, k, than, han: (_ for _ in ()).throw(LoiNguon("Gemini HTTP 503", 503)))
    assert hong.extract_media_re([(b"x", "image/png")], "đọc", sticker.SCHEMA)["mo_ta"] == "từ claude" and claude.goi == 1


def test_server_thay_chuoi_trung_tinh_bang_nghia_sticker(monkeypatch):
    thay = []
    monkeypatch.setattr(srv, "doc_sticker", lambda prov, url, nhan="": thay.append((url, nhan)) or "hello")
    goi = []
    monkeypatch.setattr(srv._engine, "handle", lambda uid, text, *a, **k: goi.append(text) or (_ for _ in ()).throw(RuntimeError("dừng")))
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: None)
    monkeypatch.setattr(srv, "_thu_lai_nen", lambda *a, **k: None)
    TestClient(srv.app).post("/chat-reply", json={"external_user_id": "st2", "text": STICKER_TRUNG_TINH,
                                                    "sticker_url": "https://cdn.example/s.png", "sticker_text": "hi"})
    assert thay == [("https://cdn.example/s.png", "hi")] and goi == ["hello"]
