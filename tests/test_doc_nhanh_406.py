"""SRS-5.1zzzzzzz406 (chủ dự án 11/11/2026): tin đầu "em ơi" tốn $0.11, phần lớn là ghi cache form lập thao tác đầy đủ (~56 nghìn chữ) dù khách
chưa nói gì. Nay khách CHƯA rõ vai thì một lượt AI ngắn (`Engine._doc_nhanh_chua_ro_vai`) đọc tin theo nghĩa: chưa có gì để ghi (chào, xưng hô,
cảm ơn, ý chung muốn bán / mua chưa kèm dữ kiện) → bỏ form đầy đủ, vai do AI đọc. SRS-403 (đã hoàn tác) làm việc này bằng regex và bỏ luôn
lượt định vai — các bài dưới canh: (1) không chạy form đầy đủ khi AI nói chưa cần; (2) phần sau của lượt (vai, phiếu lượt, giọng, câu chào
theo số) Y NHƯ khi form đầy đủ trả cùng kế hoạch; (3) cần đọc / thiếu cờ / lỗi / đã có ô tin, bản nháp, thao tác chờ, tin trả lời, ảnh →
đường đầy đủ như cũ. Đỏ khi gỡ lời gọi `_doc_nhanh_chua_ro_vai` trong `_lap_ke_hoach`."""
from __future__ import annotations

from aioi.engine import DAU_TA_ANH_CHUP, SO_TU_VAN, Engine
from aioi.llm.base import Message
from aioi.prompts import doc_nhanh_schema, operations_schema
from tests.gia import KhongCongCu


class _AI(KhongCongCu):
    """`can_doc`: lượt đọc nhanh trả can_doc_day_du gì (None = ném lỗi, "thieu" = không trả cờ). Hai lượt cùng trả `ke` (ý, xã giao)."""

    def __init__(self, can_doc=False, ke: dict | None = None):
        self.can_doc, self.ke, self.goi, self.systems = can_doc, dict(ke or {}), [], []

    def extract(self, system, messages, json_schema=None, **k):
        props = (json_schema or {}).get("properties") or {}
        if "can_doc_day_du" in props:
            self.goi.append("nhanh")
            if self.can_doc is None:
                raise RuntimeError("API hỏng")
            return dict(self.ke) if self.can_doc == "thieu" else {"can_doc_day_du": self.can_doc, **self.ke}
        if "operations" in props or "user_intent" in props:
            self.goi.append("day_du")
            return {"operations": [], **self.ke}
        return {}

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return "Em chào anh, anh đang có căn nào muốn gửi bán hay cho thuê không ạ?"

    reply = chat


def _luot(ai: _AI, cau: str, so: str = "", key: str = "dn-1"):
    eng = Engine(ai)
    eng.conversation(key).so_nhan = so
    eng.handle(key, cau)
    return eng, eng.conversation(key)


def _chao(cau: str) -> dict:
    return {"user_intent": "unknown", "loi_xa_giao": "chao", "loi_xa_giao_trich_dan": cau}


def test_chao_khach_moi_khong_chay_form_day_du_va_luot_sau_y_nhu_cu():
    for cau in ("em ơi", "alo", "chào em nha", "hello bạn"):   # ca gốc + ba cách chào mới
        nhanh, cu = _AI(False, _chao(cau)), _AI(True, _chao(cau))
        _, c_nhanh = _luot(nhanh, cau)
        _, c_cu = _luot(cu, cau)
        assert nhanh.goi.count("nhanh") == 1 and "day_du" not in nhanh.goi, (cau, nhanh.goi)
        assert cu.goi[:2] == ["nhanh", "day_du"], cau
        assert nhanh.systems and nhanh.systems[-1] == cu.systems[-1], cau   # phiếu lượt / giọng / câu chào số ký gửi: y hệt đường đầy đủ
        assert c_nhanh.role == c_cu.role and c_nhanh.y_luot == c_cu.y_luot, cau


def test_y_chung_muon_ban_hoac_mua_chua_kem_du_kien_van_dinh_vai():
    for cau, y, vai in (("em ơi anh muốn bán nhà", "sell", "seller"), ("chị cần tìm thuê căn hộ", "buy", "buyer")):
        nhanh, cu = _AI(False, {"user_intent": y}), _AI(True, {"user_intent": y})
        _, c_nhanh = _luot(nhanh, cau)
        _, c_cu = _luot(cu, cau)
        assert "day_du" not in nhanh.goi and c_nhanh.role == vai == c_cu.role, cau   # vai do AI đọc ở lượt ngắn, như form đầy đủ
        assert nhanh.systems[-1] == cu.systems[-1], cau


def test_chao_o_so_tu_van_van_vao_vai_mua():
    ai = _AI(False, _chao("em ơi"))
    _, conv = _luot(ai, "em ơi", so=SO_TU_VAN)
    assert "day_du" not in ai.goi and conv.role == "buyer"   # vai mặc định của số tư vấn (SRS-210) vẫn quyết ở phần sau


def test_can_doc_thieu_co_hoac_loi_thi_chay_form_day_du():
    for can_doc in (True, "thieu", None):   # AI nói cần đọc / không trả cờ / lượt ngắn ném lỗi
        ai = _AI(can_doc, {"user_intent": "sell"})
        _luot(ai, "em ơi chị muốn bán nhà quận 8 giá 5 tỷ")
        assert ai.goi[:2] == ["nhanh", "day_du"], (can_doc, ai.goi)
        assert ai.systems, can_doc   # lượt vẫn có lời trả


def test_khong_doc_nhanh_khi_co_o_tin_ban_nhap_thao_tac_cho_tra_loi_hay_anh():
    ai = _AI(False, _chao("ok em"))
    eng = Engine(ai)
    conv = eng.conversation("dn-2")
    src = [Message("user", "ok em")]
    for dat, tri in (("listing_proposed", True), ("pending_destructive", {"op": "xoa"}), ("tin_tra_loi", "bản tin hôm qua")):
        cu = getattr(conv, dat)
        setattr(conv, dat, tri)
        assert eng._doc_nhanh_chua_ro_vai(conv, src) is None, dat
        setattr(conv, dat, cu)
    conv.prop.fields["gia"] = "5 tỷ"
    assert eng._doc_nhanh_chua_ro_vai(conv, src) is None
    conv.prop.fields.clear()
    assert eng._doc_nhanh_chua_ro_vai(conv, [Message("user", DAU_TA_ANH_CHUP + " sổ hồng]")]) is None
    assert ai.goi == []   # không trường hợp nào ở trên gọi AI
    assert eng._doc_nhanh_chua_ro_vai(conv, src) == {"operations": [], **_chao("ok em")}


def test_da_ro_vai_thi_khong_doc_nhanh():
    ai = _AI(False, {"user_intent": "sell"})
    eng = Engine(ai)
    eng.conversation("dn-3").role = "seller"
    eng.handle("dn-3", "em ơi")
    assert "nhanh" not in ai.goi   # vai đã rõ đi vòng agent / form gọn của vai đó, không qua lượt ngắn


def test_khuon_luot_ngan_dung_lai_mo_ta_cua_form_day_du():
    ngan, day_du = doc_nhanh_schema()["properties"], operations_schema()["properties"]
    for k in ("user_intent", "loi_xa_giao", "loi_xa_giao_trich_dan", "xung_ho", "xung_ho_trich_dan"):
        assert ngan[k] == day_du[k], k
    assert "operations" not in ngan
