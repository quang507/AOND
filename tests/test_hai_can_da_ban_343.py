"""02/11/2026 (SRS-5.1zzzzzzz343, cham `hai_can_da_ban` 2/2 trượt sau #260 — phiên test độc lập báo).

Lớp lỗi: lời người bán hai căn báo "căn đó bán rồi" chỉ được giữ đúng khi AI bóc tách TẠO thao tác đổi trạng thái (khi đó cổng
`_chua_ro_can` bật khối hỏi lại). Lượt AI bỏ sót thao tác thì model viết lời không có dữ kiện gì, tự chọn một căn và chúc mừng ("chốt được căn
mặt tiền Phạm Hùng rồi!") trong khi dữ liệu vẫn "đang bán"; khối hỏi lại thì lộ chữ nội bộ "rổ" ("Em chưa đổi gì trong rổ hết"). Sửa: lượt
nào rổ ≥ 2 căn mà KHÔNG có thao tác đổi trạng thái → dữ kiện hệ thống "lượt này không đổi trạng thái căn nào" (không đọc lời khách bằng chữ);
khối hỏi lại không còn chữ "rổ". Đỏ khi gỡ bản sửa."""
from __future__ import annotations

from aioi.engine import Engine
from tests.gia import KhongCongCu

HAI_CAN = {"user_intent": "sell", "operations": [
    {"op": "add", "target": "", "fields": {"duong": "Bùi Minh Trực", "quan": "Quận 8", "gia": "5 tỷ", "loai_hinh": "nha_pho"},
     "bang_chung": {"duong": "Bùi Minh Trực", "gia": "5 tỷ"}},
    {"op": "add", "target": "", "fields": {"duong": "Phạm Hùng", "quan": "Quận 8", "gia": "12 tỷ", "loai_hinh": "nha_pho"},
     "bang_chung": {"duong": "Phạm Hùng", "gia": "12 tỷ"}}]}


class _AI(KhongCongCu):
    def __init__(self):
        self.ke, self.systems = HAI_CAN, []

    def extract(self, system, messages, json_schema=None, **k):
        return dict(self.ke)

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return "Vâng anh."

    reply = chat


def _hai_can() -> tuple[Engine, _AI]:
    ai = _AI()
    eng = Engine(ai)
    eng.handle("thu-hai-can", "anh có 2 căn cần bán: căn 1 nhà hẻm đường Bùi Minh Trực quận 8 giá 5 tỷ, căn 2 nhà mặt tiền đường Phạm Hùng quận 8 giá 12 tỷ")
    return eng, ai


def test_ai_bo_sot_thao_tac_doi_trang_thai_thi_van_co_du_kien_khong_doi():
    for cau in ("à căn đó anh bán được rồi em nhé", "chốt khách rồi em ơi, có người cọc rồi", "xong một căn rồi nha"):   # hai cách nói mới
        eng, ai = _hai_can()
        ai.ke = {"user_intent": "sell", "operations": []}                     # AI bóc tách không tạo set_status (ca trượt thật)
        eng.handle("thu-hai-can", cau)
        s = ai.systems[-1]
        assert "Lượt này hệ thống KHÔNG đổi trạng thái căn nào" in s and "KHÔNG tự chọn một căn" in s, cau
        assert all(li.active.status != "đã bán" if hasattr(li, "active") else True for li in [eng.conversation("thu-hai-can")])


def test_co_thao_tac_doi_dung_mot_can_thi_khong_them_du_kien():
    eng, ai = _hai_can()
    ai.ke = {"user_intent": "sell", "operations": [{"op": "set_status", "status": "da_ban", "target": "Phạm Hùng", "trich_dan_can": "Phạm Hùng"}]}
    eng.handle("thu-hai-can", "căn Phạm Hùng anh bán rồi nha")
    assert "Lượt này hệ thống KHÔNG đổi trạng thái căn nào" not in ai.systems[-1]


def test_khoi_hoi_lai_can_nao_khong_co_chu_ro():
    eng, ai = _hai_can()
    ai.ke = {"user_intent": "sell", "operations": [{"op": "set_status", "status": "da_ban", "target": "", "trich_dan_can": ""}]}
    eng.handle("thu-hai-can", "à căn đó anh bán được rồi em nhé")
    s = ai.systems[-1]
    assert "CHƯA đổi căn nào" in s and "trong rổ" not in s
