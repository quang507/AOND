"""30/10/2026 (SRS-5.1zzzzzzz304). Bộ chấm kịch bản offline: phép chấm tất định phải bắt đúng lỗi đã gặp (bản tin ra muộn, ô sai, "Dạ",
hai câu hỏi một lượt) và tệp kịch bản phải hợp lệ. Không gọi model."""
import json
import os

from tests.kich_ban.cham import cham, chua, loi_pham

BO = os.path.join(os.path.dirname(__file__), "kich_ban", "ban.json")
KHOA = {"o", "o_khong", "o_khong_chua", "loai", "cho_thue", "so_can", "xin_nguoi", "nhap_truoc", "khong_nhap", "cam", "luot", "luot_khong", "trang_thai"}


def _kq(bots, o=None, **k):
    return {"luot": [{"bot": b, **loi_pham(b), "so_bia": []} for b in bots], "o": o or {}, **k}


def test_tep_kich_ban_hop_le():
    bo = json.load(open(BO, encoding="utf-8"))["kich_ban"]
    assert len(bo) >= 15 and len({k["id"] for k in bo}) == len(bo)
    for k in bo:
        assert k["cau"] and set(k["kiem"]) <= KHOA, k["id"]
        for so in {**k["kiem"].get("luot", {}), **k["kiem"].get("luot_khong", {})}:
            assert 1 <= int(so) <= len(k["cau"]), k["id"]


def test_so_khong_dau_va_dau_phay():
    assert chua("12.5 tỷ", "12,5") and chua("Đường Cao Lỗ", "cao lo") and not chua("ngang 5,2m", "5,0") and not chua("", "1")


def test_cham_bat_ban_tin_muon_o_sai_va_luat_cung():
    kb = {"kiem": {"o": {"gia": "8,5"}, "nhap_truoc": 2, "loai": "dat"}}
    tot = cham(kb, _kq(["Wow, hay quá. Giá bao nhiêu anh?", "📋 Em sẽ rao như vầy nhé"], {"gia": "8,5 tỷ"}, loai="dat_tho_cu"))
    assert all(ok for _, ok, _ in tot)
    xau = dict((t, ok) for t, ok, _ in cham(kb, _kq(["Dạ, giá bao nhiêu? Mấy tầng?", "ok", "📋 tin"], {"gia": "8 tỷ"}, loai="nha_pho")))
    assert not xau["ô gia ∋ 8,5"] and not xau["bản tin ở lượt ≤ 2"] and not xau["loại = dat"]
    assert not xau['không mở "Dạ"'] and not xau["tối đa 1 câu hỏi / lượt"]
