"""Bảng giá model + quy đô (SRS-5.1zzzzzzz130 → 195). Chế độ test `$$$$$` / tin phụ debug đã gỡ 26/10/2026; còn lại bảng giá phải khớp lib/gia-model.ts."""
import pathlib
import re
from types import SimpleNamespace

from aioi import che_do_test, so_token

GIA_TS = pathlib.Path(__file__).resolve().parent.parent / "lib/gia-model.ts"


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
    assert d == "Tốn: $0.0007 (claude-haiku-5-5 vào 1.0k ra 1.0k)"
    assert "chưa rõ giá" in che_do_test.dong_tien({"model-la": so}) and che_do_test.dong_tien({}) == "Tốn: $0 (không gọi AI)"


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


def test_tong_luot_theo_nhan_tach_chat_va_extract():
    """SRS-5.1zzzzzzz195: cli.py in dòng `$extract` / `$chat` riêng — token phải tách theo mục đích gọi, cùng model vẫn hai dòng."""
    so_token.bat_dau_luot()
    resp = SimpleNamespace(model="claude-haiku-4-5", usage=SimpleNamespace(input_tokens=10, output_tokens=5, cache_creation_input_tokens=0, cache_read_input_tokens=30))
    st = so_token.SoToken(None)
    st.ghi("extract", "claude-haiku-4-5", resp)
    st.ghi("chat", "claude-haiku-4-5", resp)
    st.ghi("chat", "claude-haiku-4-5", resp)
    t = so_token.tong_luot_theo_nhan()
    assert t[("extract", "claude-haiku-4-5")]["calls"] == 1 and t[("chat", "claude-haiku-4-5")]["calls"] == 2
    assert t[("chat", "claude-haiku-4-5")]["p_cache_read"] == 60
    assert so_token.tong_luot()["claude-haiku-4-5"]["calls"] == 3                 # tổng theo model giữ nguyên
    so_token.bat_dau_luot()
    assert so_token.tong_luot_theo_nhan() == {}
