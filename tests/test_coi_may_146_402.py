"""SRS-5.1zzzzzzz402 (11/11/2026): còi giám sát máy 146. Trước đây `bot_health_tick` chỉ canh nhịp bridge số ký gửi — lõi chết (bridge vẫn gõ
nhịp đều), bridge số tư vấn chết, acc Zalo văng phiên chờ quét QR đều không ai báo; lời báo còn ghi "VPS".

Đỏ khi: lõi thôi đóng nhịp `aond-core`; migration bỏ canh một trong ba ca; lời báo quay lại "VPS"."""
import pathlib
import re

import pytest

from aioi import server
from aioi.so_token import SoToken

GOC = pathlib.Path(__file__).resolve().parents[1]
MIG = (GOC / "bot" / "supabase" / "migrations" / "20261111a_coi_may_146.sql").read_text(encoding="utf-8")


def test_so_token_beat_goi_rpc_beat():
    goi = []
    so = SoToken(None, nen=False, rpc=lambda ten, body: goi.append((ten, body)))
    so.beat("aond-core")
    assert goi == [("beat", {"p_who": "aond-core"})]
    SoToken(None, nen=False).beat("aond-core")          # không có Supabase → không làm gì, không lỗi


def test_vong_nhip_loi_dong_dau_aond_core(monkeypatch):
    goi = []

    class _Dung(Exception):
        pass

    def _ngu(_giay):
        raise _Dung

    monkeypatch.setattr(server._so_loi, "beat", lambda ai: goi.append(ai))
    monkeypatch.setattr(server.time, "sleep", _ngu)
    with pytest.raises(_Dung):
        server._vong_nhip_loi()
    assert goi == ["aond-core"]
    assert server.NHIP_LOI_CHU_KY_GIAY <= 300            # còi báo sau 15 phút im — nhịp phải dày hơn nhiều


def test_migration_canh_du_ba_ca_va_khong_con_vps():
    than = MIG.split("AS $function$", 1)[1]
    assert "'bridge-zca-tu-van'" in than and "'aond-core'" in than
    assert re.search(r"from bridge_dang_nhap d\s+where d\.trang_thai in \('cho_quet', 'het_han', 'tu_choi'\)", than)
    chuoi = " ".join(re.findall(r"'([^']*)'", than))
    assert "VPS" not in chuoi and "nhadat-bridge" not in chuoi
    # Số ký gửi giữ hành vi cũ (chưa từng điểm danh cũng báo); hai nhịp mới chỉ báo khi đã từng có.
    assert "CHƯA TỪNG điểm danh" in than
    assert "h.at < now() - interval '15 minutes'" in than
