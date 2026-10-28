"""28/10/2026 (SRS-5.1zzzzzzz239). Chủ dự án: "nếu bắn product đổi sang key gemini bắn từ từ". `AIOI_CHAT_MODEL_THU=gemini` → mọi lượt gọi
model của ID thử đi THẲNG Gemini, không chạm Claude, không rơi về Groq / Claude khi Gemini hỏng; khách thật không đổi. Đỏ khi lượt bắn thử
vẫn gọi Claude (tốn tiền thật) hoặc khách thật bị đưa sang Gemini."""
import re

import pytest

from aioi.llm.base import CHI_GEMINI, NGUON_LUOT
from aioi.llm.du_phong import DuPhongProvider
from tests.test_du_phong import M, ClaudeGia, _dap, _nguon
from tests.test_phap_ly import CHU_NHA
from tests.test_viec_mua import KhoGia, _engine


def test_luot_chi_gemini_khong_goi_claude_khong_goi_groq():
    claude, goi = ClaudeGia(), []
    p = DuPhongProvider(claude, _nguon(), goi=lambda n, k, than, han: goi.append(n.ten) or _dap("Gemini đáp"))
    dau = NGUON_LUOT.set(CHI_GEMINI)
    try:
        assert p.reply("sys", M) == "Gemini đáp"
    finally:
        NGUON_LUOT.reset(dau)
    assert claude.goi == 0 and goi == ["Gemini"]
    assert p.reply("sys", M) and claude.goi == 1          # ngoài lượt bắn thử: Claude là đường chính như cũ


def test_gemini_hong_thi_luot_hong_khong_roi_ve_claude():
    claude, goi = ClaudeGia(), []

    def hong(n, k, than, han):
        goi.append(n.ten)
        raise TimeoutError("timed out")
    p = DuPhongProvider(claude, _nguon(), goi=hong)
    dau = NGUON_LUOT.set(CHI_GEMINI)
    try:
        with pytest.raises(Exception):
            p.reply("sys", M)
    finally:
        NGUON_LUOT.reset(dau)
    assert claude.goi == 0 and set(goi) == {"Gemini"}


def test_engine_dat_nguon_gemini_chi_cho_id_thu(monkeypatch):
    monkeypatch.setenv("AIOI_CHAT_MODEL_THU", "gemini")
    thay = []
    eng, ai = _engine(KhoGia(), CHU_NHA)
    goc = ai.chat
    ai.chat = lambda *a, **k: (thay.append(NGUON_LUOT.get()), goc(*a, **k))[1]   # type: ignore[method-assign]
    eng.handle("thu-gemini-1", "Chị bán nhà 125 Bình Long giá 3 tỷ")
    n_thu = len(thay)
    eng.handle("khach-that-2", "Chị bán nhà 125 Bình Long giá 3 tỷ")
    assert thay[:n_thu] and set(thay[:n_thu]) == {CHI_GEMINI}
    assert set(thay[n_thu:]) == {None}
    assert NGUON_LUOT.get() is None                                       # trả lại sau lượt


def test_cai_vps_dat_id_thu_gemini():
    from pathlib import Path
    s = (Path(__file__).resolve().parent.parent / "bot/bridge-zca/cai-vps.sh").read_text()
    assert re.search(r'^\s*MODEL_CHAT_THU="(gemini|tat|claude-[a-z0-9-]+)"$', s, re.M) and "AIOI_CHAT_MODEL_THU=%s" in s   # SRS-243: đổi được


def test_luot_chi_gemini_khong_ghi_so_loi_du_phong():
    """SRS-5.1zzzzzzz241: lượt bắn thử chỉ-Gemini không ghi "Claude hỏng" vào sổ lỗi (báo động giả cho còi sức khoẻ); Claude hỏng thật vẫn ghi."""
    from tests.test_du_phong import HetTien, So
    so = So()
    p = DuPhongProvider(ClaudeGia(), _nguon(), so=so, goi=lambda n, k, than, han: _dap("Gemini đáp"))
    dau = NGUON_LUOT.set(CHI_GEMINI)
    try:
        p.reply("sys", M)
    finally:
        NGUON_LUOT.reset(dau)
    assert so.loi == []
    p2 = DuPhongProvider(ClaudeGia(HetTien()), _nguon(), so=so, goi=lambda n, k, than, han: _dap("Gemini đáp"))
    p2.reply("sys", M)
    assert so.loi and "Claude hỏng" in so.loi[0][1]
