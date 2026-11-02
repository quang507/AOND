"""SRS-5.1zzzzzzz356: năm câu mẫu (`da_an_het`, `da_cap_nhat_ro`, `giu_nguyen_ro`, `nhap_bang_tinh`, `chua_co_ban_ve`) nói chữ "rổ" /
"rổ hàng" với khách. Câu mẫu không qua `_soat_hinh_thuc` nên lưới `tu_noi_bo` (SRS-343) không với tới. Bài này soi CHỮ GỬI KHÁCH của mọi
câu mẫu bằng ĐÚNG regex của lưới đó (một nguồn — không chép danh sách từ riêng). Cột mô tả / nguồn là chữ nội bộ, không soi."""
import pathlib
import re

from aioi import cau_mau
from aioi.engine import _TU_NOI_BO_RE

GOC = pathlib.Path(__file__).resolve().parents[1]


def test_moi_cau_mau_khong_co_tu_noi_bo():
    lo = {k: v[0] for k, v in cau_mau.MAC_DINH.items() if _TU_NOI_BO_RE.search(v[0])}
    assert not lo, f"câu mẫu nói từ nội bộ với khách: {lo}"


def test_cau_da_dien_cung_khong_co_tu_noi_bo():
    # Điền thử (chỗ trống thiếu thì điền "X") — chữ ghép vào lúc điền cũng không được mang từ nội bộ.
    for khoa, (mau, *_) in cau_mau.MAC_DINH.items():
        bien = {t: "X" for t in re.findall(r"\{(\w+)\}", mau) if t not in ("goi", "Goi")}
        cau = cau_mau.cau(khoa, "anh", **bien)
        assert not _TU_NOI_BO_RE.search(cau), f"{khoa}: {cau}"


def test_migration_moi_nhat_cua_cau_mau_khong_dua_lai_tu_noi_bo():
    # Migration là đường thứ hai đưa câu vào DB (dashboard đọc bảng `cau_mau`) — câu mới trong migration 356 cũng phải sạch.
    sql = (GOC / "bot/supabase/migrations/20261102d_cau_mau_bo_chu_ro.sql").read_text(encoding="utf-8")
    cau = re.findall(r"\('(\w+)', '((?:[^']|'')*)', '((?:[^']|'')*)'", sql)
    assert {k for k, *_ in cau} == {"da_an_het", "da_cap_nhat_ro", "giu_nguyen_ro", "nhap_bang_tinh", "chua_co_ban_ve"}
    for khoa, c, md in cau:
        assert c == md == cau_mau.MAC_DINH[khoa][0].replace("'", "''"), khoa
        assert not _TU_NOI_BO_RE.search(c), khoa
