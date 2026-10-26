"""26/10/2026 (SRS-5.1zzzzzzz211, chủ dự án: "/quit … sửa dùng nó để reset xóa dữ liệu"; "làm cho trên zalo cũng bấm dc mấy cái này" — /state,
/listings, /seller, /whoami, /import, /project, /link). Lệnh chỉ nhận khi chữ đầu đúng tên lệnh; lời lệnh xem mở bằng "$$$$$ ", không qua model,
không ghi CRM; /quit xoá sạch phiên, im lặng, giữ số Zalo khách đang nhắn. Đỏ khi gỡ nhánh lệnh khỏi `/chat-reply`."""
from fastapi.testclient import TestClient

import aioi.server as srv
from aioi import lenh_zalo
from aioi.engine import SO_TU_VAN
from tests.test_chuyen_nguoi import _Kho, _tr


class _KhoXoa(_Kho):
    def reset(self, uk):
        self.da_xoa = uk


def _san(monkeypatch):
    goi, sync = [], []
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: sync.append(k))
    monkeypatch.setattr(srv._engine, "_convstore", _KhoXoa())
    monkeypatch.setattr(srv._engine, "handle", lambda uk, text: goi.append(text) or _tr(reply="lời bot"))
    return goi, sync


def _gui(uk, text, **k):
    return TestClient(srv.app).post("/chat-reply", json={"external_user_id": uk, "text": text, **k}).json()


def test_state_tra_tin_debug_khong_qua_model_khong_ghi_crm(monkeypatch):
    goi, sync = _san(monkeypatch)
    c = srv._engine.conversation("8810001")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"duong": "Cao Lỗ", "gia": "8,5 tỷ"})
    r = _gui("8810001", "/STATE")
    assert r["replies"] and all(b.startswith("$$$$$ ") for b in r["replies"])
    assert "gia=8,5 tỷ" in "\n".join(r["replies"]) and "RỔ HÀNG" in r["replies"][0]
    assert goi == [] and sync == []
    assert not any(t.content.startswith("/STATE") for t in c.history)


def test_quit_xoa_sach_im_lang_va_giu_so_nhan(monkeypatch):
    goi, _ = _san(monkeypatch)
    c = srv._engine.conversation("8810002")
    c.prop.fields["gia"] = "6 tỷ"
    c.so_nhan = SO_TU_VAN
    r = _gui("8810002", "/quit")
    moi = srv._engine.conversation("8810002")
    assert r["replies"] == [] and goi == []
    assert moi.prop.fields.get("gia") is None and moi.history == []
    assert moi.so_nhan == SO_TU_VAN


def test_cau_co_dau_gach_cheo_khong_phai_lenh(monkeypatch):
    goi, _ = _san(monkeypatch)
    _gui("8810003", "nhà hẻm 12/3 Cao Lỗ, anh muốn /state lại sau")   # chữ đầu không phải lệnh
    assert goi == ["nhà hẻm 12/3 Cao Lỗ, anh muốn /state lại sau"]
    assert lenh_zalo.ten_lenh("/statex") is None and lenh_zalo.ten_lenh("  /Listings ") == "/listings"


def test_link_bo_chu_lenh_roi_di_duong_thuong(monkeypatch):
    goi, _ = _san(monkeypatch)
    _gui("8810004", "/link https://docs.google.com/spreadsheets/d/abc")
    assert goi == ["https://docs.google.com/spreadsheets/d/abc"]


def test_whoami_listings_seller(monkeypatch):
    _san(monkeypatch)
    srv._engine.conversation("8810005").so_nhan = SO_TU_VAN
    assert "số Zalo: tư vấn" in _gui("8810005", "/whoami")["replies"][0]
    assert "Rổ hàng" in _gui("8810005", "/listings")["replies"][0]
    assert "không đổi được" in _gui("8810005", "/seller abc")["replies"][0]


def test_state_dai_tach_bong_bong():
    dong = [f"dòng {i} " + "x" * 200 for i in range(20)]
    bong = lenh_zalo._goi_bong(dong)
    assert len(bong) > 1 and all(len(b) <= lenh_zalo.DAI_TOI_DA + len(lenh_zalo.DAU_DEBUG) for b in bong)
