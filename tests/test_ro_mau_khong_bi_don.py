"""SRS-5.1zzzzzzz179 mục 1 (25/10/2026): lịch `don-du-lieu-thu` xoá sạch rổ mẫu `seed_thu` 242 tin vì người bán mẫu `thu-seed-001` khớp `la_id_thu`
(`don_thu_lan_cuoi` = "2026-10-24 21:00: 242 tin · 1 người bán"). Đỏ khi migration `don_du_lieu_thu` không còn loại `seed_thu` ở cả hai bảng tạm
(`_nguoi_thu` và `_tin_thu`), hoặc nhánh nạp rổ mẫu đổi người bán sang tiền tố không còn là ID thử mà không ai biết (test ghim giả định)."""
import pathlib
import re

GOC = pathlib.Path(__file__).parents[1]


def _ham_moi_nhat() -> str:
    tep = sorted((GOC / "bot/supabase/migrations").glob("*_don_du_lieu_thu*.sql"))
    assert tep, "không có migration nào định nghĩa don_du_lieu_thu"
    return tep[-1].read_text(encoding="utf-8")


def test_nguoi_ban_giu_ro_mau_khong_bi_don():
    sql = _ham_moi_nhat()
    nguoi = re.search(r"_nguoi_thu on commit drop as(.*?);", sql, re.S).group(1)
    assert "seed_thu" in nguoi and "not exists" in nguoi


def test_tin_mau_khong_vao_bang_tam_xoa():
    sql = _ham_moi_nhat()
    tin = re.search(r"_tin_thu on commit drop as(.*?);", sql, re.S).group(1)
    assert "<> 'seed_thu'" in tin


def test_nap_ro_mau_van_dung_nguoi_ban_thu_seed():
    lib = (GOC / "bot/tests/tim-nha/nap-tin-mau-lib.mjs").read_text(encoding="utf-8")
    assert "'seed_thu'" in lib and "thu-seed-001" in lib          # đổi người bán / nguồn thì sửa cả migration dọn
