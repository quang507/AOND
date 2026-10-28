"""SRS-5.1zzzzzzz231 (chủ dự án 28/10/2026: "cho supabase nhúng vector hóa đi" → "nguyên văn luật" + "24 câu + trích điều"). Khách hỏi pháp
lý: lõi nhúng câu khách, `tim_dieu_luat` trả điều luật nguyên văn gần nghĩa; bot vẫn đáp bằng câu soạn sẵn nhưng kèm điều luật để dẫn căn
cứ, câu ngoài 24 mục mà có điều khớp thì chỉ tóm điều đó thay vì nói "chưa có". Đỏ khi: điều dưới ngưỡng lọt vào prompt, Gemini lỗi làm
hỏng lượt, câu nhạy cảm bị kèm điều luật (phải chuyển người), tách điều sai (tiêu đề dính thân, đầu trang Công báo lọt, trùng số điều)."""
import importlib.util
import pathlib

import pytest

from aioi import phap_ly
from aioi.dia_danh import NGUONG_LUAT, TraDiaDanh
from aioi.engine import Engine
from tests.test_viec_mua import AiGia, KhoGia

GOC = pathlib.Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("tach_dieu_luat", GOC / "scripts" / "tach-dieu-luat.py")
tach_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tach_mod)

D45 = {"so_hieu": "31/2024/QH15", "ten_van_ban": "Luật Đất đai 2024", "nguon_url": "https://x", "dieu": "45", "phan": 1,
       "tieu_de": "Điều 45. Điều kiện thực hiện các quyền chuyển đổi, chuyển nhượng",
       "noi_dung": "1. Người sử dụng đất được thực hiện các quyền chuyển nhượng khi có đủ các điều kiện sau đây: a) Có Giấy chứng nhận",
       "do_gan": 0.81}


@pytest.fixture(autouse=True)
def _sach():
    phap_ly.dang_ky(None)
    yield
    phap_ly.dang_ky(None)


class TraGia(TraDiaDanh):
    def __init__(self, dong=None, loi=False):
        self.goi = []

        def rpc(ten, payload):
            self.goi.append((ten, payload))
            return list(dong or [])

        def nhung(cau):
            if loi:
                raise RuntimeError("429")
            return [0.1] * 768
        super().__init__(rpc, None, nhung)


def test_dieu_luat_loc_nguong_va_loi_khong_hong():
    thap = {**D45, "dieu": "46", "do_gan": NGUONG_LUAT - 0.01}
    tra = TraGia([D45, thap])
    assert [d["dieu"] for d in tra.dieu_luat("đất chưa có sổ bán được không")] == ["45"]
    assert tra.goi[0][0] == "tim_dieu_luat"
    assert TraGia([D45], loi=True).dieu_luat("đất chưa có sổ") == []
    assert TraDiaDanh(lambda t, p: [D45]).dieu_luat("đất chưa có sổ") == []   # không có khoá Gemini → không tra
    assert TraGia([D45]).dieu_luat("  ") == []


def test_khoi_luot_kem_dieu_luat_va_ngoai_kho():
    trong = phap_ly.khoi_luot("dat_chua_so", dieu=[D45])
    assert "Đất chưa có sổ, mua bán giấy tay" in trong and phap_ly.TIEU_DE_DIEU_LUAT in trong and "Điều 45" in trong
    assert "NÓI KHÁC nội dung tham khảo" in trong
    ngoai = phap_ly.khoi_luot("khac", dieu=[D45])
    assert "NGOÀI TÀI LIỆU SOẠN SẴN" in ngoai and "Điều 45" in ngoai and "CHƯA CÓ" not in ngoai
    assert "CHƯA CÓ" in phap_ly.khoi_luot("khac", dieu=[])
    nhay = phap_ly.khoi_luot("khac", nhay_cam=True, dieu=[D45])
    assert "NHẠY CẢM" in nhay and "Điều 45" not in nhay
    assert len(phap_ly.khoi_dieu_luat([{**D45, "noi_dung": "x" * 5000}])) < phap_ly.CAT_DIEU + 800


def _engine(tra, ke_hoach):
    ai = AiGia(ke_hoach)
    return Engine(ai, conversation_store=KhoGia(), dia_danh=tra), ai


def test_engine_tra_dieu_luat_khi_hoi_phap_ly():
    tra = TraGia([D45])
    eng, ai = _engine(tra, {"operations": [], "user_intent": "sell", "hoi_phap_ly": "khac",
                            "phap_ly_trich_dan": "đất chưa có sổ mà góp vốn được không"})
    eng.handle("dl-1", "Cho hỏi đất chưa có sổ mà góp vốn được không em?")
    assert any(ten == "tim_dieu_luat" for ten, _ in tra.goi)
    assert any("NGOÀI TÀI LIỆU SOẠN SẴN" in s and "Điều 45" in s for s in ai.system)


def test_engine_cau_nhay_cam_khong_tra_luat():
    tra = TraGia([D45])
    eng, ai = _engine(tra, {"operations": [], "user_intent": "sell", "hoi_phap_ly": "khac", "phap_ly_nhay_cam": True,
                            "phap_ly_trich_dan": "anh em tranh chấp thì bán sao"})
    r = eng.handle("dl-2", "Nhà anh em tranh chấp thì bán sao em?")
    assert not any(ten == "tim_dieu_luat" for ten, _ in tra.goi)
    assert r.can_nguoi_that


CONG_BAO = """Ký bởi: CÔNG BÁO NƯỚC CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
Chương I
QUY ĐỊNH CHUNG
Điều 1. Phạm vi điều chỉnh
Luật này quy định về chế độ sở hữu đất đai, quyền hạn và trách nhiệm của Nhà nước
đại diện chủ sở hữu toàn dân về đất đai.
Điều 2. Điều kiện thực hiện các quyền chuyển đổi, chuyển nhượng, cho thuê,
cho thuê lại quyền sử dụng đất
1. Người sử dụng đất được thực hiện các quyền khi có đủ các điều kiện sau
đây:

CÔNG BÁO/Số 363 + 364/Ngày 01-3-2024

43

a) Có Giấy chứng nhận quyền sử dụng đất;
b) Đất không có tranh chấp.
2. Ngoài các điều kiện quy định tại khoản 1 Điều này, người sử dụng đất còn phải
đáp ứng các điều kiện khác.
Luật này được Quốc hội nước Cộng hòa xã hội chủ nghĩa Việt Nam khóa XV thông qua./.
CHỦ TỊCH QUỐC HỘI
"""


def test_tach_dieu_cong_bao():
    ds = tach_mod.tach(CONG_BAO)
    assert [(d["dieu"], d["phan"]) for d in ds] == [("1", 1), ("2", 1)]
    assert ds[0]["tieu_de"] == "Điều 1. Phạm vi điều chỉnh"
    assert ds[0]["noi_dung"].startswith("Luật này quy định về chế độ sở hữu đất đai")
    assert ds[1]["tieu_de"] == "Điều 2. Điều kiện thực hiện các quyền chuyển đổi, chuyển nhượng, cho thuê, cho thuê lại quyền sử dụng đất"
    nd = ds[1]["noi_dung"]
    assert "CÔNG BÁO" not in nd and "\n43" not in nd and "Quốc hội" not in nd
    assert nd.split("\n") == ["1. Người sử dụng đất được thực hiện các quyền khi có đủ các điều kiện sau đây:",
                              "a) Có Giấy chứng nhận quyền sử dụng đất;", "b) Đất không có tranh chấp.",
                              "2. Ngoài các điều kiện quy định tại khoản 1 Điều này, người sử dụng đất còn phải đáp ứng các điều kiện khác."]


def test_tach_dieu_dai_cat_theo_khoan_va_bat_trung():
    than = "\n".join(f"{i}. " + "nội dung khoản rất dài " * 20 for i in range(1, 12))
    ds = tach_mod.tach("Điều 7. Tên điều\n" + than)
    assert len(ds) > 1 and all(len(d["noi_dung"]) <= tach_mod.TOI_DA for d in ds)
    assert [d["phan"] for d in ds] == list(range(1, len(ds) + 1))
    assert all(d["noi_dung"].split("\n")[0][:1].isdigit() for d in ds)   # mỗi phần mở bằng một khoản, không cắt giữa khoản
    loi, _ = tach_mod.kiem(tach_mod.tach("Điều 1. A\nx.\nĐiều 1. B\ny."))
    assert loi and "trùng" in loi[0]


def test_tep_kho_luat_khop_danh_muc():
    """Mỗi tệp đã tách có trong danh-muc.json, đúng số hiệu, không trùng (điều, phần), phần không quá dài."""
    import json
    thu_muc = GOC / "bot" / "supabase" / "luat"
    dm = json.loads((thu_muc / "danh-muc.json").read_text(encoding="utf-8"))
    for vb in dm["van_ban"]:
        assert vb["loai"] in ("luat", "bo_luat", "nghi_dinh", "thong_tu", "nghi_quyet", "vbhn")
        assert vb["nguon_url"].startswith("https://")
        tep = thu_muc / vb["tep"]
        if not tep.exists():
            continue
        du = json.loads(tep.read_text(encoding="utf-8"))
        assert du["so_hieu"] == vb["so_hieu"]
        khoa = [(d["dieu"], d["phan"]) for d in du["dieu"]]
        assert len(khoa) == len(set(khoa))
        assert all(len(d["noi_dung"]) <= tach_mod.TOI_DA for d in du["dieu"])


def test_hop_nhat_bo_dieu_bai_bo_va_trich_luat_khac_luat_sua_doi_giu_trich():
    hn = ("Điều 22. Tên cũ\n1. Nội dung khoản một.\nĐiều 23.67 (được bãi bỏ)\nĐiều 23. Tư vấn lập quy hoạch cấp xã68\n1. Điều kiện tư vấn.\n"
          "Điều 24 và Điều 25 của Luật số 71/2025/QH15 quy định như sau:\n“Điều 24. Hiệu lực thi hành\n1. Luật này có hiệu lực.\n"
          "Điều 25. Chuyển tiếp\n1. Nội dung chuyển tiếp.”.\n")
    ds = tach_mod.tach(hn, hop_nhat=True)
    assert [d["dieu"] for d in ds] == ["22", "23"]
    assert ds[1]["tieu_de"] == "Điều 23. Tư vấn lập quy hoạch cấp xã" and "chuyển tiếp" not in ds[1]["noi_dung"]
    sua = "Điều 1. Sửa đổi khoản 1 Điều 7 như sau:\n“1. Cá nhân có doanh thu từ mức Chính phủ quy định trở xuống không phải nộp thuế.”.\nĐiều 2. Hiệu lực\nLuật này có hiệu lực."
    ds = tach_mod.tach(sua)
    assert [d["dieu"] for d in ds] == ["1", "2"] and "không phải nộp thuế" in ds[0]["noi_dung"]


def test_nguong_theo_so_do_28_10():
    """SRS-5.1zzzzzzz242 (chủ dự án 28/10: "a làm đi"): đo 12 câu thử trên kho thật — điều trả SAI cho câu đặt cọc / vi bằng / thừa kế có do_gan
    0,639 / 0,672 / 0,676, điều ĐÚNG thấp nhất 0,702 (đất nông nghiệp lên thổ cư). Ngưỡng phải chặn cả ba điều sai và giữ điều đúng thấp nhất.
    Đỏ khi ngưỡng trả về 0,62."""
    for sai in (0.639, 0.672, 0.676):
        assert TraGia([{**D45, "do_gan": sai}]).dieu_luat("đặt cọc rồi bên bán đổi ý") == []
    assert [d["dieu"] for d in TraGia([{**D45, "do_gan": 0.702}]).dieu_luat("đất nông nghiệp lên thổ cư")] == ["45"]
