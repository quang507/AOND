"""22/10/2026 (SRS-5.1zzzzzzz130). Chủ dự án: gõ `$$$$$` rồi "mỗi tin nhắn đều có 1 tin `$$$$$` … đã trích xuất thông tin gì, đã hiểu gì",
"từ tin nhắn đầu luôn, viết từ code". Tester không phải gõ `json` mỗi lượt. Test đỏ khi tin phụ không có ở tin trả lời `$$$$$`, khi nó chui vào
lịch sử (model đọc lại) hay lời trả lời gửi khách, khi mất sau khởi động lại, hoặc khi người KHÔNG gõ `$$$$$` cũng nhận tin phụ."""
from fastapi.testclient import TestClient

import aioi.server as srv
from aioi import che_do_test
from aioi.engine import SqliteConversationStore
from tests.test_doc_y_khach import _eng

PLAN = {"operations": [{"op": "update", "fields": {"gia": "6,95 tỷ", "dia_chi": "12 Lê Văn Sỹ"}, "bang_chung": {"gia": "6,95 tỷ", "dia_chi": "12 Lê Văn Sỹ"}}],
        "user_intent": "sell", "xung_ho": "em", "xung_ho_trich_dan": "em ơi"}


def test_lenh_lam_moi_bat_che_do_test_im_lang_roi_tin_ke_co_tin_phu():
    eng, _ = _eng({"operations": []})
    r = eng.handle("t1", "$$$$$")
    assert eng.conversation("t1").che_do_test is True
    assert r.reply == "" and r.chu_thich == ""                          # không thông báo gì (22/10: "không cần thông báo")
    r1 = eng.handle("t1", "chào em")
    assert r1.chu_thich.startswith("$$$$$ Đã trích xuất:") and r1.reply   # tin phụ bắt đầu từ tin kế tiếp


def test_tin_phu_khong_vao_lich_su_va_khong_vao_loi_tra_loi():
    eng, _ = _eng({"operations": []})
    eng.handle("t2", "$$$$$")
    r = eng.handle("t2", "chào em")
    conv = eng.conversation("t2")
    assert all("$$$$$" not in t.content for t in conv.history)          # model không đọc lại tin phụ
    assert "$$$$$" not in r.reply


def test_khong_go_lenh_thi_khong_co_tin_phu():
    eng, _ = _eng({"operations": []})
    r = eng.handle("t3", "nhà anh hẻm 4m nha")
    assert r.chu_thich == "" and eng.conversation("t3").che_do_test is False


def test_sau_moi_luot_co_tin_phu_ghi_o_da_trich_xuat_va_dieu_da_hieu():
    eng, _ = _eng(PLAN)
    eng.handle("t4", "$$$$$")
    r = eng.handle("t4", "em ơi nhà 12 Lê Văn Sỹ giá 6,95 tỷ")
    ct = r.chu_thich
    assert ct.startswith("$$$$$ Đã trích xuất:") and "6,95 tỷ" in ct and "12 Lê Văn Sỹ" in ct
    assert "Đã hiểu: vai: người bán / cho thuê" in ct and "khách xưng: em" in ct and "Còn thiếu:" in ct


def test_khong_co_o_moi_thi_noi_ro_va_ngoai_vung_duoc_ghi():
    eng, _ = _eng({"operations": []})
    eng.handle("t5", "$$$$$")
    conv = eng.conversation("t5")
    conv.prop.fields["_ngoai_vung"] = "Bình Phước"
    ct = che_do_test.chu_thich(conv, [], "gia")
    assert "• (không có ô mới)" in ct and "NGOÀI vùng nhận tin: Bình Phước" in ct and "Đang hỏi tiếp:" in ct


def test_chu_thich_loi_thi_tra_rong_khong_lam_hong_luot():
    assert che_do_test.chu_thich(None, ["gia"]) == ""          # type: ignore[arg-type]


def test_che_do_test_song_qua_khoi_dong_lai(tmp_path):
    kho = SqliteConversationStore(str(tmp_path / "c.db"))
    eng, _ = _eng({"operations": []})
    eng._convstore = kho
    eng.handle("t6", "$$$$$")
    assert kho.load("t6").che_do_test is True
    cu = SqliteConversationStore(str(tmp_path / "c.db"))                 # mở lại file = lõi khởi động lại
    assert cu.load("t6").che_do_test is True


def test_server_gui_tin_phu_sau_loi_tra_loi_nhung_khong_ghi_vao_crm(monkeypatch):
    eng, _ = _eng(PLAN)
    monkeypatch.setattr(srv, "_engine", eng)
    ghi = []
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: ghi.append(k))
    monkeypatch.setattr(srv, "_thu_lai_nen", lambda *a, **k: None)
    cl = TestClient(srv.app)
    r0 = cl.post("/chat-reply", json={"external_user_id": "t7", "text": "$$$$$"}).json()
    assert r0["replies"] == [] and r0["nhip_go"] == [] and r0["reply"] == ""       # bridge không gửi gì
    r1 = cl.post("/chat-reply", json={"external_user_id": "t7", "text": "em ơi nhà 12 Lê Văn Sỹ giá 6,95 tỷ"}).json()
    assert r1["replies"][-1].startswith("$$$$$ Đã trích xuất:") and "$$$$$" not in r1["reply"]
    assert all("$$$$$ Đã trích xuất" not in g["bot_reply"] for g in ghi) and len(r1["nhip_go"]) == len(r1["replies"])


# --- SRS-5.1zzzzzzz130 (bản 2): tiền lượt này, câu khách nói → làm chuẩn, ô bị bỏ và lý do ---------------------------------------------------
import pathlib
import re
from types import SimpleNamespace

from aioi import so_token

GIA_TS = pathlib.Path(__file__).resolve().parent.parent / "lib/gia-model.ts"


def _plan(gia, bc):
    return {"operations": [{"op": "update", "fields": {"gia": gia}, "bang_chung": {"gia": bc}}], "user_intent": "sell"}


def test_bang_gia_python_giong_tung_dong_voi_lib_gia_model_ts():
    ts = GIA_TS.read_text(encoding="utf-8")
    dong = re.findall(r"\[/\^(.+?)/, \{ vao: ([\d.]+), ra: ([\d.]+), nhan: \"[^\"]*\"(?:, doc: ([\d.]+))? \}\]", ts)
    ts_bang = [(m, float(v), float(r), float(d) if d else None) for m, v, r, d in dong]
    assert len(ts_bang) == len(che_do_test.BANG_GIA) >= 10
    assert ts_bang == [tuple(x) for x in che_do_test.BANG_GIA]                 # đỏ khi sửa giá ở một bên mà quên bên kia
    assert f"HE_SO_NAP_5M = {che_do_test.HE_SO_NAP_5M}" in ts and f"HE_SO_DOC = {che_do_test.HE_SO_DOC}" in ts


def test_tien_va_dong_tien():
    so = {"p_in": 1000, "p_out": 1000, "p_cache_write": 1000, "p_cache_read": 1000, "calls": 2}
    assert abs(che_do_test.tien_usd("claude-haiku-5-5-20260101", so) - 0.000735) < 1e-12
    assert che_do_test.tien_usd("Gemini:gemini-flash-lite-latest", so) == 0 and che_do_test.tien_usd("model-la", so) is None
    d = che_do_test.dong_tien({"claude-haiku-5-5": so})
    assert d.startswith("Tốn lượt này: $0.0007 — claude-haiku-5-5: vào 1.0k · ra 1.0k · cache ghi 1.0k/đọc 1.0k · 2 lượt gọi")
    assert "chưa rõ giá" in che_do_test.dong_tien({"model-la": so}) and che_do_test.dong_tien({}) == "Tốn lượt này: $0 (không gọi AI)."


def test_so_token_cong_dung_theo_luot_cua_luong():
    so_token.bat_dau_luot()
    resp = SimpleNamespace(model="claude-haiku-5-5", usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_creation_input_tokens=20, cache_read_input_tokens=30))
    st = so_token.SoToken(None)
    st.ghi("chat", "claude-haiku-5-5", resp)
    st.ghi("chat", "claude-haiku-5-5", resp)
    st.ghi_du_phong("Gemini:flash", 100, 7)
    t = so_token.tong_luot()
    assert t["claude-haiku-5-5"] == {"p_in": 20, "p_out": 10, "p_cache_write": 40, "p_cache_read": 60, "calls": 2}
    assert t["Gemini:flash"]["p_in"] == 100 and t["Gemini:flash"]["calls"] == 1
    so_token.bat_dau_luot()
    assert so_token.tong_luot() == {}                                           # lượt mới đếm lại từ đầu


def test_tin_phu_co_tien_cua_dung_luot_do():
    eng, spy = _eng(_plan("9,2 tỷ", "9.2"))
    goc = spy.extract

    def extract(*a, **k):                                                       # giả lập một lượt gọi Claude trong lượt này
        so_token._cong_luot("claude-haiku-5-5", {"p_in": 2000, "p_out": 400, "p_cache_write": 1000, "p_cache_read": 5000})
        return goc(*a, **k)
    spy.extract = extract
    eng.handle("t8", "$$$$$")
    r = eng.handle("t8", "giá 9.2 nha em")
    assert "Tốn lượt này: $0.0006 — claude-haiku-5-5: vào 2.0k · ra 400 · cache ghi 1.0k/đọc 5.0k · 1 lượt gọi" in r.chu_thich
    r2 = eng.handle("t8", "ok em")
    assert "Tốn lượt này: $0.0006" in r2.chu_thich                              # lượt sau tính riêng, không cộng dồn lượt trước


def test_tin_phu_cum_khach_noi_lam_chuan_moi_va_doi():
    eng, spy = _eng(_plan("9,2 tỷ", "9.2"))
    eng.handle("t9", "$$$$$")
    ct = eng.handle("t9", "giá 9.2 nha em").chu_thich
    assert '• giá: "9.2" → làm chuẩn "9,2 tỷ" (mới)' in ct and "thêm thông tin mới (giá)" in ct
    spy.plan = _plan("9,5 tỷ", "9.5")
    ct2 = eng.handle("t9", "à nhầm, giá 9.5 nha").chu_thich
    assert '• giá: "9.5" → làm chuẩn "9,5 tỷ" (đổi từ "9,2 tỷ")' in ct2
    assert 'yêu cầu ĐỔI thông tin: giá → "9.5"' in ct2


def test_tin_phu_noi_ro_o_ai_de_xuat_nhung_bi_bo_va_ly_do():
    eng, _ = _eng(_plan("9,2 tỷ", "9.2"))                                       # AI "đọc" ra giá mà khách KHÔNG nói
    eng.handle("t10", "$$$$$")
    ct = eng.handle("t10", "nhà hẻm 4m nha").chu_thich
    assert "Đã BỎ (AI đề xuất nhưng code không ghi):" in ct and '• giá: AI đọc "9,2 tỷ" (trích "9.2") → BỎ vì không có bằng chứng' in ct
    assert "AI đề xuất: update(gia)." in ct and "• (không có ô mới)" in ct
    eng2, _ = _eng({"operations": []})
    eng2.handle("t11", "$$$$$")
    assert "AI đề xuất: không đọc ra thao tác nào từ tin này." in eng2.handle("t11", "giá 9.2 nha em").chu_thich    # AI không đọc ra gì → nói thẳng
