"""29/10/2026 (SRS-5.1zzzzzzz286). Chủ dự án: "Một khách có nhiều bộ nhu cầu (mua ở, mua đầu tư, tìm giùm con). cái này cần làm" và "Ngân sách và
diện tích lưu dạng số min–max". Bản trước: một `buyer_lead` — bộ mới đè bộ cũ; ngân sách "từ 8 tỷ" thành TRẦN 8 tỷ, diện tích "dưới 80m²" thành
TỐI THIỂU 80. Mỗi ca đỏ khi gỡ bản sửa."""
import re
from types import SimpleNamespace

from aioi import bao_can_moi
from aioi.engine import Conversation, SqliteConversationStore
from aioi.assistants import assign_assistant
from aioi.schema import BuyerLead
from tests.test_bao_can_moi import NGAN, TRUA, chay, tin
from tests.test_bao_can_moi import KhoGia as KhoBao
from tests.test_viec_mua import KHACH_MUA, KhoGia, _engine


def _bo(**bl):
    return {"operations": [], "user_intent": "buy", "buyer_lead": bl}


def test_khach_mo_bo_moi_khong_de_bo_cu_va_quay_lai_bo_cu():
    kho = KhoGia()
    eng, ai = _engine(kho, _bo(loai_bds="nha_pho", khu_vuc="Quận 5", ngan_sach="8 tỷ", nhu_cau="mua ở"))
    eng.handle("mua-286", "anh tìm nhà phố quận 5 tầm 8 tỷ để ở")
    ai.ke_hoach = _bo(loai_bds="chung_cu", khu_vuc="Quận 7", ngan_sach="3 tỷ", nhu_cau="cho con", nhu_cau_moi=True)
    eng.handle("mua-286", "à tìm giùm con anh một căn hộ quận 7 tầm 3 tỷ nữa")
    conv = eng._conversations["mua-286"]
    assert conv.buyer_lead.khu_vuc == "Quận 7" and conv.buyer_lead.fields["nhu_cau"] == "cho con"
    assert [(l.khu_vuc, l.ngan_sach, l.fields.get("nhu_cau")) for l in conv.nhu_cau_khac] == [("Quận 5", "8 tỷ", "mua ở")]
    ghi = kho.ghi("POST", "buyer_needs")[-1]
    assert {(d["nhan"], d["dang_noi"]) for d in ghi} == {("cho con", True), ("mua ở", False)}
    assert "BỘ NHU CẦU CỦA KHÁCH" in ai.system[-1] and "«mua ở»" in ai.system[-1]
    ai.ke_hoach = _bo(so_phong_ngu="3PN", nhu_cau="mua ở")
    eng.handle("mua-286", "còn căn nhà phố của anh thì cần 3 phòng ngủ")
    assert conv.buyer_lead.khu_vuc == "Quận 5" and conv.buyer_lead.so_phong_ngu == "3PN"
    assert [l.fields.get("nhu_cau") for l in conv.nhu_cau_khac] == ["cho con"]


def test_ai_goi_nhan_khac_chu_ma_khong_mo_bo_moi_thi_khong_tach_bo():
    kho = KhoGia()
    eng, ai = _engine(kho, _bo(khu_vuc="Quận 5", ngan_sach="8 tỷ", nhu_cau="mua ở"))
    eng.handle("mua-286b", "tìm nhà quận 5 tầm 8 tỷ để ở")
    ai.ke_hoach = _bo(so_phong_ngu="3PN", nhu_cau="để ở cho gia đình")
    eng.handle("mua-286b", "cần 3 phòng ngủ nha")
    conv = eng._conversations["mua-286b"]
    assert conv.nhu_cau_khac == [] and conv.buyer_lead.khu_vuc == "Quận 5" and conv.buyer_lead.so_phong_ngu == "3PN"


class _KhoTien(KhoGia):
    """parse_vnd giả theo chữ "N tỷ" / "N triệu"."""

    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint.startswith("rpc/parse_vnd"):
            self.goi.append((method, endpoint, data))
            m = re.search(r"(\d+(?:[.,]\d+)?)\s*(tỷ|triệu)", data["p"])
            return int(float(m.group(1).replace(",", ".")) * (1e9 if m.group(2) == "tỷ" else 1e6)) if m else None
        return super()._request(method, endpoint, data, prefer)


def _lead(**f):
    return SimpleNamespace(ngan_sach=f.get("ngan_sach"), fields=f, loai_giao_dich="mua")


def test_khoang_gia_doc_san_tran_theo_nghia():
    kho = _KhoTien()
    assert kho.khoang_gia(_lead(ngan_sach="từ 8 tỷ trở lên", ngan_sach_tu="8 tỷ")) == (8_000_000_000, None)
    assert kho.khoang_gia(_lead(ngan_sach="10-15 tỷ", ngan_sach_tu="10 tỷ", ngan_sach_den="15 tỷ")) == (10_000_000_000, 15_000_000_000)
    assert kho.khoang_gia(_lead(ngan_sach="5 tỷ")) == (None, 5_000_000_000)              # hồ sơ cũ: như trước
    assert kho.khoang_gia(_lead(ngan_sach="5-7", ngan_sach_den="7")) == (None, None)      # cụm thiếu đơn vị: bỏ, không đoán


def test_tim_nha_khach_neu_san_thi_khong_tran_va_bo_can_re_han():
    kho = _KhoTien()
    eng, _ = _engine(kho, _bo(khu_vuc="Quận 5", ngan_sach="từ 8 tỷ", ngan_sach_tu="8 tỷ"))
    eng.handle("mua-286c", "tìm nhà quận 5 từ 8 tỷ trở lên")
    tim = [d for m, e, d in kho.goi if e.startswith("rpc/tim_nha")]
    assert tim and tim[-1]["p_gia_max"] is None                 # bản cũ: trần 9,6 tỷ — bỏ hết căn trên 9,6 tỷ
    lead = eng._conversations["mua-286c"].buyer_lead
    assert kho.can_phu_hop(lead) == []                          # căn mẫu 5 tỷ < 80 % sàn 8 tỷ → không gợi
    lead.fields["ngan_sach_tu"] = "6 tỷ"
    assert [c["code"] for c in kho.can_phu_hop(lead)] == ["ABCD1234"]   # trên 80 % sàn 6 tỷ → vẫn gợi


def test_dien_tich_duoi_la_tran_khong_phai_san():
    from aioi.mua import khoang_dien_tich
    assert khoang_dien_tich(_lead(dien_tich_mong_muon="dưới 80m2", dien_tich_den="80")) == (None, 80.0)
    assert khoang_dien_tich(_lead(dien_tich_mong_muon="60-80m2", dien_tich_tu="60", dien_tich_den="80")) == (60.0, 80.0)
    assert khoang_dien_tich(_lead(dien_tich_mong_muon="60m2")) == (60.0, None)


class _KhoBaoNhieuBo(KhoBao):
    def __init__(self, tins, bo):
        super().__init__(tins)
        self.bo = bo

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("buyer_needs?"):
            return self.bo
        return super()._request(method, endpoint, data, prefer)


def test_bao_can_moi_xet_tung_bo_nhu_cau():
    bo = [{"buyer_id": "b1", "preferences": NGAN["preferences"]},                     # bộ đang nói: Quận 5 — không có căn
          {"buyer_id": "b1", "preferences": {"khu_vuc": "Quận 7", "ngan_sach": "3 tỷ", "loai_bds": "nha_pho", "nhu_cau": "cho con"}}]
    kho = _KhoBaoNhieuBo([tin("t7", "Q7AAAAAA", 3e9, quan="Quận 7")], bo)
    _, da_gui = chay(kho, TRUA)
    assert len(da_gui) == 1 and "Quận 7" in da_gui[0][1]
    assert chay(_KhoBaoNhieuBo([tin("t7", "Q7AAAAAA", 3e9, quan="Quận 7")], []), TRUA)[1] == []   # chỉ có preferences (Quận 5)


def test_sqlite_giu_cac_bo_da_cat(tmp_path):
    st = SqliteConversationStore(str(tmp_path / "c.db"))
    conv = Conversation(user_key="u1", assistant=assign_assistant("u1"), role="buyer")
    conv.buyer_lead = BuyerLead(user_key="u1", khu_vuc="Quận 7", fields={"nhu_cau": "cho con"})
    conv.nhu_cau_khac = [BuyerLead(user_key="u1", khu_vuc="Quận 5", fields={"nhu_cau": "mua ở"})]
    st.save(conv)
    lai = st.load("u1")
    assert lai.buyer_lead.khu_vuc == "Quận 7" and [l.khu_vuc for l in lai.nhu_cau_khac] == ["Quận 5"]


def test_khach_mua_cu_mot_bo_van_chay():
    eng, _ = _engine(KhoGia(), KHACH_MUA)
    eng.handle("mua-286d", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    assert eng._conversations["mua-286d"].nhu_cau_khac == []
