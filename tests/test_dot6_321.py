"""02/11/2026 (SRS-5.1zzzzzzz321, audit Đợt 6 — code chết và một nguồn).

Lớp lỗi: cùng một việc viết nhiều bản (9 hàm bỏ dấu, hai `_hoi_thoai_mua` trong một class — bản sau đè im lặng, danh sách ID thử Python ↔ SQL chép
tay, tin báo admin xếp ở nhiều chỗ mỗi chỗ tự nhớ chặn ID thử), và code chỉ test gọi. Mỗi bài dưới đỏ khi một bản sao / chỗ xếp tin riêng quay lại."""
from __future__ import annotations

import ast
import glob
import os
import re

from aioi.chu import bo_dau
from aioi.engine import _TIEN_TO_ID_THU
from aioi.supabase_store import SupabaseConversationStore

GOC = os.path.join(os.path.dirname(__file__), "..")
SRC = sorted(glob.glob(os.path.join(GOC, "src", "aioi", "**", "*.py"), recursive=True))


def test_bo_dau_mot_ham():
    assert bo_dau("Đồng Nai ĐƯỜNG") == "dong nai duong" and bo_dau(None) == "" and bo_dau("Bà Rịa – Vũng Tàu") == "ba ria – vung tau"
    from aioi import dia_danh
    assert dia_danh.bo_dau is bo_dau
    # Chỉ `chu.py` bỏ dấu; `kho_anh._khoa_an_toan` giữ hoa thường cho khoá Storage (định dạng khoá, không phải so chữ).
    lot = [os.path.relpath(t, GOC) for t in SRC if 'normalize("NFD"' in open(t, encoding="utf-8").read()
           and not t.endswith(("chu.py", "kho_anh.py"))]
    assert not lot, lot


def test_khong_method_nao_dinh_nghia_hai_lan_trong_mot_class():
    lot = []
    for t in SRC:
        for node in ast.walk(ast.parse(open(t, encoding="utf-8").read())):
            if isinstance(node, ast.ClassDef):
                ten = [n.name for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                       and not any(isinstance(d, ast.Attribute) and d.attr in ("setter", "deleter") for d in n.decorator_list)]   # property setter là hợp lệ
                lot += [f"{os.path.basename(t)}:{node.name}.{x}" for x in {x for x in ten if ten.count(x) > 1}]
    assert not lot, lot


def test_tien_to_id_thu_python_khop_sql():
    sql = open(os.path.join(GOC, "bot", "supabase", "schema.sql"), encoding="utf-8").read()
    m = re.search(r"FUNCTION public\.la_id_thu\(p text\).*?p ~ '\^\(([^)]*)\)'", sql, re.S)
    assert m, "không thấy la_id_thu trong schema.sql"
    assert tuple(m.group(1).split("|")) == _TIEN_TO_ID_THU


class _Kho(SupabaseConversationStore):
    def __init__(self, id_thu: bool):
        super().__init__(url="https://x.supabase.co", key="k")
        self.id_thu, self.goi = id_thu, []

    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint == "rpc/la_id_thu":
            return self.id_thu
        self.goi.append((method, endpoint, data))
        return [{"zalo_user_id": "thu-mua-1"}] if endpoint.startswith("buyers?") else []


def test_tin_admin_mot_cua_chan_id_thu():
    thu, that = _Kho(id_thu=True), _Kho(id_thu=False)
    assert thu._xep_tin_admin({"buyer_id": "b1", "note": "Lịch xem #A"}) is False                      # tra Zalo ID qua buyer_id
    assert not [g for g in thu.goi if g[1] == "reminders"]
    assert that._xep_tin_admin({"buyer_id": "b1", "note": "Lịch xem #A"}, "khach-that") is True
    assert [g for g in that.goi if g[1] == "reminders"][0][2]["kind"] == "escalation"
    # Mọi chỗ xếp tin admin đi qua MỘT cửa: chuỗi kind "escalation" chỉ còn trong `_xep_tin_admin`.
    lot = [f"{os.path.basename(t)}:{i}" for t in SRC for i, d in enumerate(open(t, encoding="utf-8"), 1)
           if '"kind": "escalation"' in d and "_xep_tin_admin" not in "".join(open(t, encoding="utf-8").readlines()[max(0, i - 12):i])]
    assert not lot, lot


def test_code_chet_da_xoa():
    from aioi import engine, gamification, kho_tep, revenue, server
    assert not hasattr(revenue, "quote_fee") and not hasattr(revenue, "nmg_eligibility") and not hasattr(gamification, "perks_for")
    assert not hasattr(engine, "_looks_personal_doc") and not hasattr(server, "CAU_THU_LAI_HONG")
    assert not hasattr(kho_tep.MediaRef, "from_dict") and not hasattr(SupabaseConversationStore, "_get_or_create_conversation")
    assert "de_xuat_luot" not in engine.Conversation.__dataclass_fields__


def test_khach_da_noi_phap_ly_thi_khong_hoi_lai_so():
    """cham `xa_phuoc_ly` (Đợt 8 và Đợt 3): khách nói "thuê đất trả tiền hàng năm" (ô phap_ly), đất vẫn hỏi ô phap_ly_so_do "đã có sổ đỏ chưa"."""
    from aioi.schema import Property
    for loai, o in (("dat", "phap_ly_so_do"), ("chung_cu", "phap_ly_so_hong")):
        p = Property(loai_hinh=loai, fields={"phap_ly": "thuê đất trả tiền hàng năm", "dia_chi": "QL50, Phước Lý", "gia": "50 tỷ"})
        assert o not in p.missing_fields(), loai
        p2 = Property(loai_hinh=loai, fields={"dia_chi": "QL50, Phước Lý", "gia": "50 tỷ"})
        assert o in p2.expected_fields() and not p2._has(o)     # chưa nói gì về giấy tờ thì vẫn là ô còn thiếu


def test_production_thieu_khoa_khong_chay_bang_mock():
    """Audit Đợt 6: `config` thiếu ANTHROPIC_API_KEY thì lặng lẽ chạy MockProvider (đoán bằng từ khoá) — production trả lời khách bằng mock."""
    import pytest
    from aioi.config import Settings
    from aioi.llm import build_provider
    s = Settings(provider="claude", anthropic_api_key=None, chat_model="x", vision_model="y")
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        build_provider(s)
    assert type(build_provider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))).__name__ == "MockProvider"
