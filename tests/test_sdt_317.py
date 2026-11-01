"""01/11/2026 (SRS-5.1zzzzzzz317, audit Đợt 1, AU-01). Bộ che SĐT một mẫu gốc (`aioi.sdt`).

Lớp lỗi: 6 bản regex SĐT viết tay, mỗi bản bắt một kiểu. Lưới che sổ đỏ chỉ bắt 10 số liền nên "0900 000 123" lọt; bản che tin gốc / tin nội
bộ `\\d[\\d .-]{7,}\\d` che cả giá "12.500.000.000". Bài đỏ khi gỡ bản sửa: mẫu về lại bản cũ thì ca có dấu cách / chấm / +84 lọt, hoặc ca giá bị
che; một chỗ dùng quay về regex riêng thì bài soát "không còn regex SĐT viết tay" đỏ. Phía SQL: `bun run doi-chieu:sdt` (cùng bảng ca)."""
import glob
import json
import os
import re

from aioi.engine import _redact_personal_data
from aioi.mua import giong_sdt_sai, tim_sdt
from aioi.prompts import khoi_cau_chuan
from aioi.sdt import MAU_SDT, che_sdt
from aioi.supabase_store import SupabaseConversationStore
from aioi.tin_goc import gom_tin_goc
from aioi.engine import Turn

GOC = os.path.join(os.path.dirname(__file__), "..")
CA = json.load(open(os.path.join(GOC, "bot", "tests", "luat", "sdt.json"), encoding="utf-8"))["ca"]
# Cách viết KHÔNG có trong bảng ca (nhóm 2-2-2-2-2, nhóm 4-6, +84 rồi chấm) — chặn kiểu "vá cho đúng bảng".
MOI = ["09 00 00 01 41", "0900 000141", "+84.900.000.142"]


def test_bang_ca_python():
    for c in CA:
        assert che_sdt(c["cau"]) == c["mong"], c


def test_cach_viet_moi_ngoai_bang_ca_van_bi_che():
    for s in MOI:
        assert not re.search(r"\d{4}", che_sdt(s).replace("0900", "")), s
        assert tim_sdt(f"số anh {s} nha") in ("0900000141", "0900000142"), s


def test_sql_chep_nguyen_mau_python():
    tep = sorted(t for t in glob.glob(os.path.join(GOC, "bot", "supabase", "migrations", "*.sql"))
                 if "function public.che_sdt(" in open(t, encoding="utf-8").read())[-1]
    assert f"regexp_replace(coalesce(p, ''), '{MAU_SDT}', '0\\2\\3\\4xxxxxx', 'g')" in open(tep, encoding="utf-8").read(), tep


def test_luoi_so_do_che_sdt_co_dau_cach_va_khong_dung_cccd():
    kq = _redact_personal_data("Liên hệ: 0900 000 143\nCCCD số 079200000001")
    assert "0900" not in kq and "143" not in kq and "079200000001" not in kq and kq.count("[đã ẩn]") == 2


def test_tin_goc_che_sdt_giu_gia():
    kq = gom_tin_goc([Turn("user", "giá 12.500.000.000, gọi 0900.000.144", 1_791_000_000.0)], 0, 1)
    assert "12.500.000.000" in kq and "0900" not in kq and "[số]" in kq


def test_cau_chuan_che_sdt_co_dau_cach():
    kq = khoi_cau_chuan([{"cau_bot": "ok", "cau_chuan": "Anh gọi em số 0900 000 145 nhé", "diem": 2, "ngu_canh": "khách: +84 900 000 146"}])
    assert "000 145" not in kq and "900 000 146" not in kq


class _Kho(SupabaseConversationStore):
    def __init__(self):
        super().__init__(url="https://x.supabase.co", key="k")
        self.goi = []
        self._seller_cache["u"] = "s1"
        self._conv_cache["s1"] = "c1"

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        return False if endpoint == "rpc/la_id_thu" else []


def test_tin_noi_bo_va_kho_rieng_che_sdt_giu_gia():
    kho = _Kho()
    kho.bao_can_nguoi("u", "gọi anh 0900 000 147, giá chốt 12.500.000.000", "Anh B.", "seller")
    kho._ghi_noi_bo("l1", {"gia_chot": "12.500.000.000", "lien_he": "+84 900 000 148"})
    kho.ghi_danh_gia("u", 1, "bot hỏi lại số 0900-000-149 hoài", "Anh B.")
    chu = json.dumps([d for _m, _e, d in kho.goi], ensure_ascii=False)
    for so in ("000 147", "900 000 148", "000-149"):
        assert so not in chu, so
    assert chu.count("12.500.000.000") == 2                     # giá không bị che như bản cũ `\d[\d .-]{7,}\d`
    assert chu.count("[số]") >= 3                                # ba đường đều đã ghi (che bằng "[số]")


def test_nhan_dien_giu_rieng_muc_dich():
    assert tim_sdt("sđt 0900 000 150") == "0900000150" and tim_sdt("+84 900 000 151") == "0900000151"
    assert tim_sdt("giá 12.500.000.000") is None
    assert giong_sdt_sai("số em 0900 00 015") and not giong_sdt_sai("0900 000 152") and not giong_sdt_sai("giá 12.500.000.000")


def test_khong_con_regex_sdt_viet_tay_ngoai_sdt_py():
    mau_cu = re.compile(r"""\\\+\?84\||\(\?:\\\+84\|84\|0\)|\\d\[\\d \.-\]\{7,\}\\d""")
    lot = [f"{os.path.basename(t)}:{i}" for t in glob.glob(os.path.join(GOC, "src", "aioi", "**", "*.py"), recursive=True)
           if not t.endswith(os.sep + "sdt.py")
           for i, d in enumerate(open(t, encoding="utf-8"), 1) if mau_cu.search(d)]
    assert not lot, lot
