"""05/11/2026 (SRS-5.1zzzzzzz382, chủ dự án: "gỡ regex đi").

Kiểm kê mọi regex trong `src/aioi/` (trừ `llm/mock.py`): không còn regex nào đọc LỜI KHÁCH để đoán ý (loại D) — các đợt SRS-55 / 213 / 281 /
320 / 328 đã chuyển sang trường AI kèm cụm trích. Còn lại: soát lời bot (A), định dạng / số / địa chỉ / chuẩn hoá (B), cổng an toàn (C).
Bài 1 là cổng: thêm regex mới vào lõi → đỏ, người thêm phải xếp loại A / B / C trong mục SRS (loại D thì đưa sang trường AI, không thêm).
Bài 2–3: ý khách (vai người rao) đi qua trường AI `seller_role` + cụm trích, cách nói không có chữ khoá nào vẫn nhận."""
from __future__ import annotations

import re
from pathlib import Path

import aioi.engine as engine
from aioi.engine import Engine
from aioi.revenue import SellerRole
from tests.gia import KhongCongCu

GOC = Path(__file__).resolve().parents[1] / "src" / "aioi"
GOI_RE = re.compile(r"\bre\.(?:compile|search|match|fullmatch|sub|findall|finditer|split)\(")

# Số lời gọi `re.*` mỗi file sau kiểm kê 05/11 (tổng 192, loại D = 0). Chỉ được GIẢM; tăng thì xếp loại trong mục SRS rồi mới nâng số.
TRAN = {
    "engine.py": 83, "dia_danh.py": 16, "supabase_store.py": 15, "schema.py": 12, "mua.py": 12, "prompts.py": 8, "sdt.py": 5,
    "llm/du_phong.py": 5, "bulk.py": 4, "xung_ho.py": 3, "projects.py": 3, "kho_anh.py": 3, "fetch.py": 3, "delivery.py": 3,
    "bao_can_moi.py": 3, "sticker.py": 2, "llm/claude.py": 2, "drive.py": 2, "voice.py": 1, "server.py": 1, "kho_tep.py": 1,
    "inventory.py": 1, "followup.py": 1, "che_do_test.py": 1, "anh_du_an.py": 1, "anh_can.py": 1,
}


def _dem() -> dict[str, int]:
    ra: dict[str, int] = {}
    for p in sorted(GOC.rglob("*.py")):
        ten = p.relative_to(GOC).as_posix()
        if ten == "llm/mock.py":
            continue
        n = len(GOI_RE.findall(p.read_text(encoding="utf-8")))
        if n:
            ra[ten] = n
    return ra


def test_khong_them_regex_moi_vao_loi():
    dem = _dem()
    vuot = {k: (v, TRAN.get(k, 0)) for k, v in dem.items() if v > TRAN.get(k, 0)}
    assert not vuot, (f"Regex mới trong lõi (file: (hiện, trần)) {vuot} — xếp loại A/B/C trong mục SRS rồi nâng TRAN; "
                      "đọc lời khách để đoán ý thì đưa sang trường AI (CLAUDE.md §4.8), không thêm regex.")
    assert sum(dem.values()) <= 192


def test_regex_chet_da_go():
    for ten in ("_PII_KEYWORD_RE", "_TU_RE"):
        assert not hasattr(engine, ten), ten


class _AI(KhongCongCu):
    def __init__(self, ke_hoach: dict):
        self.ke_hoach = ke_hoach

    def extract(self, system, messages, json_schema=None, **k):
        return {"user_intent": "sell", "operations": [], **self.ke_hoach}

    def chat(self, system, messages, **k):
        return "Nhà ở phường nào vậy anh?"

    reply = chat


def test_vai_chu_nha_qua_truong_ai_cach_noi_khong_co_chu_khoa():
    # Không có "chính chủ" / "chủ nhà" / "của tôi" — regex vai cũ (`_VAI_RE`, gỡ ở SRS-320) bỏ sót; AI đọc nghĩa và trích đúng cụm.
    eng = Engine(_AI({"seller_role": "chu_nha", "seller_role_trich_dan": "sổ đứng tên tôi"}))
    eng.handle("rx-382", "căn Lê Lai ba má để lại, sổ đứng tên tôi luôn em")
    assert eng.conversation("rx-382").user_type is SellerRole.CHU_NHA


def test_vai_ai_trich_khong_co_trong_loi_khach_thi_khong_nhan():
    eng = Engine(_AI({"seller_role": "chu_nha", "seller_role_trich_dan": "tôi là chính chủ"}))
    eng.handle("rx-382b", "căn Lê Lai ba má để lại em")
    assert eng.conversation("rx-382b").user_type is not SellerRole.CHU_NHA
